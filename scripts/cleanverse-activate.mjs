import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

if (!process.argv.includes("--execute")) {
  throw new Error("Vault activation requires an explicit --execute flag");
}

const rpcUrl = requiredEnv("MONAD_RPC_URL");
const expectedChainId = BigInt(requiredEnv("MONAD_CHAIN_ID"));
const baseUrl = requiredEnv("CLEANVERSE_BASE_URL");
const apiId = requiredEnv("CLEANVERSE_API_ID");
const chain = requiredEnv("CLEANVERSE_CHAIN").toLowerCase();
const validator = address("CLEANVERSE_VALIDATOR_ADDRESS");
const cva = address("CLEANVERSE_ATOKEN_ADDRESS");
const vault = address("CLEANVERSE_VAULT_ADDRESS");
const admin = address("CLEANVERSE_ADMIN_ADDRESS");
const keystore = requiredEnv("CLEANVERSE_ADMIN_KEYSTORE_PATH");
const passwordFile = requiredEnv("CLEANVERSE_ADMIN_PASSWORD_FILE");

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
  const { stdout } = await execFileAsync("cast", commandArgs, { maxBuffer: 4_000_000 });
  return stdout.trim();
}

async function call(target, signature, ...callArgs) {
  return cast("call", target, signature, ...callArgs, "--rpc-url", rpcUrl);
}

function endpoint(path) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalized);
}

async function cleanverseRequest(path, body) {
  const response = await fetch(endpoint(path), {
    method: "POST",
    headers: { "content-type": "application/json", "api-id": apiId },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (response.status < 200 || response.status >= 300 || String(payload.code) !== "0000") {
    throw new Error(`${path} failed: HTTP ${response.status}, code ${payload.code}`);
  }
  return payload.data;
}

const chainId = BigInt(await rpc("eth_chainId", []));
assert(chainId === expectedChainId, `RPC chain ID ${chainId} does not match ${expectedChainId}`);
for (const [label, target] of [
  ["validator", validator],
  ["CVA", cva],
  ["vault", vault],
]) {
  assert((await rpc("eth_getCode", [target, "latest"])) !== "0x", `${label} has no runtime code`);
}

const signer = (await cast("wallet", "address", "--keystore", keystore, "--password-file", passwordFile)).toLowerCase();
assert(signer === admin, "Admin keystore address mismatch");
assert((await call(vault, "operator()(address)")).toLowerCase() === admin, "Admin is not the vault operator");
assert((await call(vault, "cva()(address)")).toLowerCase() === cva, "Vault CVA mismatch");

const status = BigInt(await call(vault, "status()(uint8)"));
assert(status === 0n, `Vault status ${status} is not Pending`);
assert((await call(vault, "registrationConfirmed()(bool)")) === "true", "Vault registration is not confirmed");
assert((await call(vault, "registrationRuleHash()(bytes32)")) !== `0x${"0".repeat(64)}`, "Registration rule hash is zero");
assert((await call(vault, "complianceGate()(address)")).toLowerCase() !== `0x${"0".repeat(40)}`, "Vault compliance gate is zero");

const amount = BigInt(await call(vault, "amount()(uint256)"));
const balance = BigInt(await call(cva, "balanceOf(address)(uint256)", vault));
assert(balance >= amount, `Vault balance ${balance} is below amount ${amount}`);

const pauseData = await cleanverseRequest("/atoken/is_paused", {
  chain,
  atoken_address: cva,
});
assert(typeof pauseData?.paused === "boolean", "/atoken/is_paused returned a malformed paused value");
assert(!pauseData.paused, "CVA is paused");

const beneficiary = (await call(vault, "beneficiary()(address)")).toLowerCase();
const merchant = (await call(vault, "merchant()(address)")).toLowerCase();
assert((await call(validator, "complianceVerify(address,address)(bool)", vault, beneficiary)) === "true", "Beneficiary failed live complianceVerify");
assert((await call(validator, "complianceVerify(address,address)(bool)", vault, merchant)) === "true", "Merchant failed live complianceVerify");

const ruleHash = (await call(vault, "registrationRuleHash()(bytes32)")).toLowerCase();
const encodedEvidence = await cast(
  "abi-encode",
  "f(uint256,address,address,uint256,bytes32)",
  chainId.toString(),
  vault,
  cva,
  amount.toString(),
  ruleHash
);
const evidenceHash = (await cast("keccak", encodedEvidence)).toLowerCase();
const activationSignature = "activate(bytes32)";

await cast("call", vault, activationSignature, evidenceHash, "--from", admin, "--rpc-url", rpcUrl);
const receiptText = await cast(
  "send",
  vault,
  activationSignature,
  evidenceHash,
  "--rpc-url",
  rpcUrl,
  "--keystore",
  keystore,
  "--password-file",
  passwordFile,
  "--confirmations",
  "1",
  "--json"
);
const receipt = JSON.parse(receiptText);
const txHash = String(receipt.transactionHash ?? receipt.transaction_hash ?? "").toLowerCase();
assert(/^0x[0-9a-f]{64}$/.test(txHash), "cast send did not return a transaction hash");
assert(BigInt(receipt.status) === 1n, "Vault activation transaction failed");
assert(BigInt(await call(vault, "status()(uint8)")) === 1n, "Vault is not Active after activation receipt");

console.log(`ACTIVATION_TX_HASH=${txHash}`);
console.log(`ACTIVATION_BLOCK_NUMBER=${BigInt(receipt.blockNumber)}`);
console.log(`ACTIVATION_EVIDENCE_HASH=${evidenceHash}`);
console.log(`ACTIVATED_AMOUNT=${amount}`);
console.log("ACTIVATION_RESULT=PASS");
