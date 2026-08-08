import crypto from "node:crypto";
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

if (!process.argv.includes("--execute")) {
  throw new Error("Validator authorization requires an explicit --execute flag");
}

const baseUrl = requiredEnv("CLEANVERSE_BASE_URL");
const apiId = requiredEnv("CLEANVERSE_API_ID");
const apiKey = Buffer.from(requiredEnv("CLEANVERSE_API_KEY"), "base64");
const chain = requiredEnv("CLEANVERSE_CHAIN").toLowerCase();
const rpcUrl = requiredEnv("MONAD_RPC_URL");
const expectedChainId = BigInt(requiredEnv("MONAD_CHAIN_ID"));
const validator = address("CLEANVERSE_VALIDATOR_ADDRESS");
const factory = address("CLEANVERSE_FACTORY_ADDRESS");
const admin = address("CLEANVERSE_ADMIN_ADDRESS");
const keystore = requiredEnv("CLEANVERSE_ADMIN_KEYSTORE_PATH");
const passwordFile = requiredEnv("CLEANVERSE_ADMIN_PASSWORD_FILE");

if (![16, 24, 32].includes(apiKey.length)) {
  throw new Error("CLEANVERSE_API_KEY did not decode to a valid AES key length");
}
const parsedBase = new URL(baseUrl);
if (parsedBase.protocol !== "https:" || parsedBase.hostname !== "uatapi.cleanverse.com") {
  throw new Error("Grant execution is restricted to the Cleanverse UAT host");
}
if (chain !== "monad") throw new Error("Grant execution is restricted to CLEANVERSE_CHAIN=monad");
await Promise.all([access(keystore), access(passwordFile)]);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function address(name) {
  const value = requiredEnv(name);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} must be a 20-byte EVM address`);
  return value.toLowerCase();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function endpoint(path) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalized);
}

function encryptMutation(payload) {
  const cipher = crypto.createCipheriv(`aes-${apiKey.length * 8}-cbc`, apiKey, Buffer.alloc(16));
  return {
    data: Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload), "utf8")), cipher.final()]).toString(
      "base64"
    ),
  };
}

function findValue(value, names) {
  if (!value || typeof value !== "object") return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(value, name)) return value[name];
  }
  for (const child of Object.values(value)) {
    const found = findValue(child, names);
    if (found !== undefined) return found;
  }
  return undefined;
}

function word(value) {
  return value.slice(2).padStart(64, "0");
}

async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(`${method} failed: ${payload.error.message}`);
  return payload.result;
}

async function cast(...commandArgs) {
  const { stdout } = await execFileAsync("cast", commandArgs, { maxBuffer: 2_000_000 });
  return stdout.trim();
}

async function hasRegisterRole() {
  const [selector, role] = await Promise.all([
    cast("sig", "hasRole(bytes32,address)"),
    cast("keccak", "REGISTER_ROLE"),
  ]);
  const data = `${selector}${word(role)}${word(factory)}`;
  const result = await rpc("eth_call", [{ to: validator, data }, "latest"]);
  if (!/^0x[0-9a-fA-F]{64}$/.test(result)) throw new Error("hasRole returned malformed ABI data");
  return BigInt(result) === 1n;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const chainId = BigInt(await rpc("eth_chainId", []));
assert(chainId === expectedChainId, `RPC chain ID ${chainId} does not match ${expectedChainId}`);
for (const [label, target] of [
  ["validator", validator],
  ["factory", factory],
]) {
  assert((await rpc("eth_getCode", [target, "latest"])) !== "0x", `${label} has no runtime code`);
}

const signer = (await cast("wallet", "address", "--keystore", keystore, "--password-file", passwordFile)).toLowerCase();
assert(signer === admin, "Admin keystore address does not match the Factory owner");
const factoryOwner = (await cast("call", factory, "owner()(address)", "--rpc-url", rpcUrl)).toLowerCase();
assert(factoryOwner === admin, "Configured admin is not the deployed Factory owner");

if (await hasRegisterRole()) {
  console.log("GRANT_RESULT=ALREADY_GRANTED");
  console.log("FACTORY_HAS_REGISTER_ROLE=true");
  process.exit(0);
}

const message = `${chain}${factory}`.toLowerCase();
const signature = await cast(
  "wallet",
  "sign",
  "--keystore",
  keystore,
  "--password-file",
  passwordFile,
  message
);
assert(/^0x[0-9a-fA-F]{130}$/.test(signature), "cast returned a malformed EIP-191 signature");
await cast("wallet", "verify", "--address", admin, message, signature);

const response = await fetch(endpoint("/validator/grant"), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "api-id": apiId,
  },
  body: JSON.stringify(encryptMutation({ chain, address: factory, owner_signature: signature })),
  signal: AbortSignal.timeout(30_000),
});
const responseText = await response.text();
let payload;
try {
  payload = responseText ? JSON.parse(responseText) : null;
} catch {
  throw new Error(`Grant returned non-JSON HTTP ${response.status}`);
}
const code = findValue(payload, ["code"]);
const messageText = findValue(payload, ["message", "msg", "error"]);
if (response.status < 200 || response.status >= 300 || String(code) !== "0000") {
  throw new Error(`Grant failed: HTTP ${response.status}, code=${String(code)}, message=${String(messageText)}`);
}

const txCandidate = findValue(payload, ["txHash", "tx_hash", "transactionHash", "transaction_hash"]);
const txHash = typeof txCandidate === "string" && /^0x[0-9a-fA-F]{64}$/.test(txCandidate) ? txCandidate : undefined;

let granted = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  if (await hasRegisterRole()) {
    granted = true;
    break;
  }
  await sleep(3_000);
}
assert(granted, "Grant API succeeded but Factory did not receive REGISTER_ROLE within 90 seconds");

if (txHash) {
  const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
  assert(receipt && BigInt(receipt.status) === 1n, "Grant transaction receipt is missing or failed");
  console.log(`GRANT_TX_HASH=${txHash.toLowerCase()}`);
  console.log(`GRANT_BLOCK_NUMBER=${BigInt(receipt.blockNumber)}`);
} else {
  console.log("GRANT_TX_HASH=UNAVAILABLE_FROM_BOUNDED_RESPONSE");
}
console.log(`REQUEST_SUMMARY_SHA256=${crypto.createHash("sha256").update(`${chain}:${factory}`).digest("hex")}`);
console.log("FACTORY_HAS_REGISTER_ROLE=true");
console.log("GRANT_RESULT=PASS");

// The replayable owner signature exists only in process memory and is never printed or persisted.
