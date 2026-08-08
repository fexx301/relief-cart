import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const execute = process.argv.includes("--execute");

const required = [
  "MONAD_RPC_URL",
  "CLEANVERSE_ATOKEN_ADDRESS",
  "CLEANVERSE_ADMIN_ADDRESS",
  "CLEANVERSE_MINTER_ADDRESS",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const rpcUrl = process.env.MONAD_RPC_URL;
const token = process.env.CLEANVERSE_ATOKEN_ADDRESS;
const admin = process.env.CLEANVERSE_ADMIN_ADDRESS;
const minter = process.env.CLEANVERSE_MINTER_ADDRESS;
const recipient = process.env.CLEANVERSE_MINT_RECIPIENT_ADDRESS || admin;
const configuredChainId = process.env.MONAD_CHAIN_ID;

function assertAddress(name, value) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be a 20-byte EVM address`);
  }
}

assertAddress("CLEANVERSE_ATOKEN_ADDRESS", token);
assertAddress("CLEANVERSE_ADMIN_ADDRESS", admin);
assertAddress("CLEANVERSE_MINTER_ADDRESS", minter);
assertAddress("CLEANVERSE_MINT_RECIPIENT_ADDRESS", recipient);
if (normalized(admin) === normalized(minter)) {
  throw new Error("CLEANVERSE_MINTER_ADDRESS must be a dedicated account, separate from the admin");
}

function short(value) {
  const text = String(value);
  return text.length > 18 ? `${text.slice(0, 10)}…${text.slice(-6)}` : text;
}

function normalized(value) {
  return String(value).toLowerCase();
}

function addressTopic(value) {
  return `0x${"0".repeat(24)}${value.slice(2).toLowerCase()}`;
}

function parseUint(output, label) {
  const value = String(output).trim().split(/\s+/).at(-1);
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Could not parse ${label} from cast output: ${String(output).slice(0, 160)}`);
  }
}

function parseBool(output, label) {
  const value = String(output).trim().toLowerCase();
  if (value === "true" || value === "1" || value === "0x1") return true;
  if (value === "false" || value === "0" || value === "0x0") return false;
  throw new Error(`Could not parse ${label} from cast output: ${String(output).slice(0, 160)}`);
}

async function cast(args, { allowFailure = false } = {}) {
  try {
    const result = await execFileAsync("cast", args, {
      maxBuffer: 2 * 1024 * 1024,
    });
    return {
      ok: true,
      stdout: String(result.stdout).trim(),
      stderr: String(result.stderr).trim(),
    };
  } catch (error) {
    const result = {
      ok: false,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message ?? "").trim(),
      exitCode: error.code,
    };
    if (!allowFailure) {
      throw new Error(`cast ${args[0]} failed: ${result.stderr || result.stdout}`);
    }
    return result;
  }
}

function rpcArgs() {
  return ["--rpc-url", rpcUrl, "--no-proxy"];
}

async function keccak(value) {
  const result = await cast(["keccak", value]);
  return result.stdout.split(/\s+/).at(-1);
}

async function call(signature, args = [], from) {
  const command = ["call", ...rpcArgs()];
  if (from) command.push("--from", from);
  command.push(token, signature, ...args);
  return cast(command);
}

async function estimate(signature, args = [], from) {
  const command = ["estimate", ...rpcArgs(), "--from", from, token, signature, ...args];
  return cast(command, { allowFailure: true });
}

async function send(signature, args, keystorePath, passwordFile) {
  const command = [
    "send",
    ...rpcArgs(),
    "--confirmations",
    "1",
    "--keystore",
    keystorePath,
    "--password-file",
    passwordFile,
    "--json",
    token,
    signature,
    ...args,
  ];
  const result = await cast(command);
  let txHash;
  try {
    const payload = JSON.parse(result.stdout);
    txHash = payload?.transactionHash ?? payload?.transaction_hash;
  } catch {
    // Fall back to a plain hash response for cast versions without JSON receipts.
    txHash = result.stdout.match(/(?:^|\s)(0x[0-9a-fA-F]{64})(?:\s|$)/)?.[1];
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash ?? ""))) {
    txHash = result.stdout.match(/"transactionHash"\s*:\s*"(0x[0-9a-fA-F]{64})"/)?.[1];
  }
  if (!txHash) throw new Error(`cast send returned no transaction hash: ${result.stdout.slice(0, 240)}`);
  return txHash;
}

async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(`${method} failed: ${payload.error.message}`);
  return payload.result;
}

async function waitForReceipt(txHash) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for receipt ${txHash}`);
}

function requireSuccessfulReceipt(receipt, label) {
  if (receipt.status !== "0x1") {
    throw new Error(`${label} mined unsuccessfully: status=${receipt.status}`);
  }
}

function hasEvent(receipt, topic, expectedTopics = []) {
  return receipt.logs.some((log) => {
    if (normalized(log.address) !== normalized(token)) return false;
    if (normalized(log.topics?.[0]) !== normalized(topic)) return false;
    return expectedTopics.every((expected, index) => normalized(log.topics?.[index + 1]) === normalized(expected));
  });
}

function hasMintTransfer(receipt, transferTopic, amount) {
  const matches = receipt.logs.filter((log) => {
    if (normalized(log.address) !== normalized(token)) return false;
    if (normalized(log.topics?.[0]) !== normalized(transferTopic)) return false;
    if (normalized(log.topics?.[1]) !== normalized(addressTopic("0x0000000000000000000000000000000000000000"))) return false;
    if (normalized(log.topics?.[2]) !== normalized(addressTopic(recipient))) return false;
    return BigInt(log.data) === amount;
  });
  return matches.length === 1;
}

async function hasRole(role, address) {
  const result = await call("hasRole(bytes32,address)(bool)", [role, address]);
  return parseBool(result.stdout, `hasRole(${short(address)})`);
}

async function totalSupply() {
  const result = await call("totalSupply()(uint256)");
  return parseUint(result.stdout, "totalSupply");
}

async function balanceOf(address) {
  const result = await call("balanceOf(address)(uint256)", [address]);
  return parseUint(result.stdout, `balanceOf(${short(address)})`);
}

async function requireEstimate(label, signature, args, from) {
  const result = await estimate(signature, args, from);
  if (!result.ok) throw new Error(`${label} simulation failed: ${result.stderr || result.stdout}`);
  console.log(`${label}_SIMULATION=PASS`);
}

async function requireFailedEstimate(label, signature, args, from) {
  const result = await estimate(signature, args, from);
  if (result.ok) throw new Error(`${label} unexpectedly simulated successfully`);
  console.log(`${label}_SIMULATION=EXPECTED_REVERT`);
}

async function configuredWalletAddress(keystorePath, passwordFile, expected, label) {
  const result = await cast([
    "wallet",
    "address",
    "--keystore",
    keystorePath,
    "--password-file",
    passwordFile,
  ]);
  const actual = result.stdout.match(/0x[0-9a-fA-F]{40}/)?.[0];
  if (!actual || normalized(actual) !== normalized(expected)) {
    throw new Error(`${label} keystore address does not match configured address`);
  }
  return actual;
}

const [minterRole, roleGrantedTopic, roleRevokedTopic, transferTopic] = await Promise.all([
  keccak("MINTER_ROLE"),
  keccak("RoleGranted(bytes32,address,address)"),
  keccak("RoleRevoked(bytes32,address,address)"),
  keccak("Transfer(address,address,uint256)"),
]);

if (process.env.CLEANVERSE_MINTER_ROLE && normalized(process.env.CLEANVERSE_MINTER_ROLE) !== normalized(minterRole)) {
  throw new Error("CLEANVERSE_MINTER_ROLE does not match keccak256(\"MINTER_ROLE\")");
}

const chainId = await rpc("eth_chainId", []);
if (configuredChainId && BigInt(chainId) !== BigInt(configuredChainId)) {
  throw new Error(`RPC chain ID ${BigInt(chainId)} does not match MONAD_CHAIN_ID ${configuredChainId}`);
}

const code = await rpc("eth_getCode", [token, "latest"]);
if (!code || code === "0x") throw new Error("CLEANVERSE_ATOKEN_ADDRESS has no runtime bytecode");

const defaultAdmin = await hasRole(`0x${"0".repeat(64)}`, admin);
if (!defaultAdmin) throw new Error("Configured admin does not hold DEFAULT_ADMIN_ROLE on the CVA proxy");

const initialMinterRole = await hasRole(minterRole, minter);
if (initialMinterRole) throw new Error("Configured minter already has MINTER_ROLE; refusing to run a non-clean smoke test");

const supplyBefore = await totalSupply();
const balanceBefore = await balanceOf(recipient);

console.log(`CLEANVERSE_ROLE_SMOKE=${execute ? "EXECUTE" : "DRY_RUN"}`);
console.log(`CHAIN_ID=${BigInt(chainId)}`);
console.log(`CVA_PROXY=${short(token)}`);
console.log(`ADMIN=${short(admin)}`);
console.log(`MINTER=${short(minter)}`);
console.log(`RECIPIENT=${short(recipient)}`);
console.log(`SUPPLY_BEFORE=${supplyBefore}`);
console.log(`BALANCE_BEFORE=${balanceBefore}`);

await requireEstimate("GRANT_ROLE", "grantRole(bytes32,address)", [minterRole, minter], admin);
await requireEstimate("REVOKE_ROLE", "revokeRole(bytes32,address)", [minterRole, minter], admin);

if (!execute) {
  await requireFailedEstimate("MINT_WITHOUT_ROLE", "mint(address,uint256)", [recipient, "1"], minter);
  console.log("DRY_RUN_RESULT=PASS_NO_STATE_CHANGED");
  process.exit(0);
}

const adminKeystore = process.env.CLEANVERSE_ADMIN_KEYSTORE_PATH;
const adminPasswordFile = process.env.CLEANVERSE_ADMIN_PASSWORD_FILE;
const minterKeystore = process.env.CLEANVERSE_MINTER_KEYSTORE_PATH;
const minterPasswordFile = process.env.CLEANVERSE_MINTER_PASSWORD_FILE;
for (const [name, value] of Object.entries({
  CLEANVERSE_ADMIN_KEYSTORE_PATH: adminKeystore,
  CLEANVERSE_ADMIN_PASSWORD_FILE: adminPasswordFile,
  CLEANVERSE_MINTER_KEYSTORE_PATH: minterKeystore,
  CLEANVERSE_MINTER_PASSWORD_FILE: minterPasswordFile,
})) {
  if (!value) throw new Error(`Missing ${name}; keep signer material outside the repository`);
  await access(value).catch(() => {
    throw new Error(`${name} path is not readable: ${value}`);
  });
}

await configuredWalletAddress(adminKeystore, adminPasswordFile, admin, "Admin");
await configuredWalletAddress(minterKeystore, minterPasswordFile, minter, "Minter");

let granted = false;
let revoked = false;
try {
  const grantTx = await send("grantRole(bytes32,address)", [minterRole, minter], adminKeystore, adminPasswordFile);
  const grantReceipt = await waitForReceipt(grantTx);
  requireSuccessfulReceipt(grantReceipt, "grantRole");
  if (!hasEvent(grantReceipt, roleGrantedTopic, [minterRole, addressTopic(minter), addressTopic(admin)])) {
    throw new Error("grantRole receipt did not contain the expected RoleGranted event");
  }
  granted = await hasRole(minterRole, minter);
  if (!granted) throw new Error("MINTER_ROLE was not observed after grantRole");
  console.log(`GRANT_TX=${grantTx}`);

  await requireEstimate("MINT", "mint(address,uint256)", [recipient, "1"], minter);
  const mintTx = await send("mint(address,uint256)", [recipient, "1"], minterKeystore, minterPasswordFile);
  const mintReceipt = await waitForReceipt(mintTx);
  requireSuccessfulReceipt(mintReceipt, "mint");
  if (!hasMintTransfer(mintReceipt, transferTopic, 1n)) {
    throw new Error("mint receipt did not contain exactly one expected zero-address Transfer of one base unit");
  }
  const supplyAfterMint = await totalSupply();
  const balanceAfterMint = await balanceOf(recipient);
  if (supplyAfterMint !== supplyBefore + 1n || balanceAfterMint !== balanceBefore + 1n) {
    throw new Error(`Unexpected mint deltas: supply ${supplyBefore}→${supplyAfterMint}, balance ${balanceBefore}→${balanceAfterMint}`);
  }
  console.log(`MINT_TX=${mintTx}`);
  console.log("MINT_DELTA=PASS_ONE_BASE_UNIT");

  await requireEstimate("REVOKE_ROLE", "revokeRole(bytes32,address)", [minterRole, minter], admin);
  const revokeTx = await send("revokeRole(bytes32,address)", [minterRole, minter], adminKeystore, adminPasswordFile);
  const revokeReceipt = await waitForReceipt(revokeTx);
  requireSuccessfulReceipt(revokeReceipt, "revokeRole");
  if (!hasEvent(revokeReceipt, roleRevokedTopic, [minterRole, addressTopic(minter), addressTopic(admin)])) {
    throw new Error("revokeRole receipt did not contain the expected RoleRevoked event");
  }
  revoked = !(await hasRole(minterRole, minter));
  if (!revoked) throw new Error("MINTER_ROLE was still present after revokeRole");
  console.log(`REVOKE_TX=${revokeTx}`);

  await requireFailedEstimate("MINT_AFTER_REVOKE", "mint(address,uint256)", [recipient, "1"], minter);
  console.log("ROLE_SMOKE_RESULT=PASS");
} finally {
  if (granted && !revoked) {
    console.error("Cleanup required: MINTER_ROLE may still be granted; attempting immediate revoke.");
    try {
      const cleanupTx = await send("revokeRole(bytes32,address)", [minterRole, minter], adminKeystore, adminPasswordFile);
      console.error(`CLEANUP_REVOKE_TX=${cleanupTx}`);
    } catch (error) {
      console.error(`CLEANUP_REVOKE_FAILED=${error.message}`);
    }
  }
}
