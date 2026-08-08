import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

if (!process.argv.includes("--execute")) {
  throw new Error("Benefit registration requires an explicit --execute flag");
}

const rpcUrl = requiredEnv("MONAD_RPC_URL");
const expectedChainId = BigInt(requiredEnv("MONAD_CHAIN_ID"));
const validator = address("CLEANVERSE_VALIDATOR_ADDRESS");
const factory = address("CLEANVERSE_FACTORY_ADDRESS");
const vault = address("CLEANVERSE_VAULT_ADDRESS");
const cva = address("CLEANVERSE_ATOKEN_ADDRESS");
const admin = address("CLEANVERSE_ADMIN_ADDRESS");
const keystore = requiredEnv("CLEANVERSE_ADMIN_KEYSTORE_PATH");
const passwordFile = requiredEnv("CLEANVERSE_ADMIN_PASSWORD_FILE");
const rule = {
  allowedGroup: bytes2("CLEANVERSE_RULE_ALLOWED_GROUP"),
  allowedSubGroup: bytes2("CLEANVERSE_RULE_ALLOWED_SUB_GROUP"),
  minTier: uint8("CLEANVERSE_RULE_MIN_TIER"),
  minSubTier: uint8("CLEANVERSE_RULE_MIN_SUB_TIER"),
  poolCountryBitmap: uint("CLEANVERSE_RULE_COUNTRY_BITMAP"),
};

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

function bytes2(name) {
  const value = requiredEnv(name);
  if (!/^0x[0-9a-fA-F]{4}$/.test(value)) throw new Error(`${name} must be exactly two bytes`);
  return value.toLowerCase();
}

function uint(name) {
  const value = requiredEnv(name);
  if (!/^[0-9]+$/.test(value)) throw new Error(`${name} must be an unsigned decimal integer`);
  return BigInt(value);
}

function uint8(name) {
  const value = uint(name);
  if (value > 255n) throw new Error(`${name} exceeds uint8`);
  return value;
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

const chainId = BigInt(await rpc("eth_chainId", []));
assert(chainId === expectedChainId, `RPC chain ID ${chainId} does not match ${expectedChainId}`);
for (const [label, target] of [
  ["validator", validator],
  ["factory", factory],
  ["vault", vault],
  ["CVA", cva],
]) {
  assert((await rpc("eth_getCode", [target, "latest"])) !== "0x", `${label} has no runtime code`);
}

const signer = (await cast("wallet", "address", "--keystore", keystore, "--password-file", passwordFile)).toLowerCase();
assert(signer === admin, "Admin keystore address mismatch");
assert((await call(factory, "owner()(address)")).toLowerCase() === admin, "Admin is not the Factory owner");
assert(
  (await call(vault, "registrationAuthority()(address)")).toLowerCase() === factory,
  "Vault registration authority is not the Factory"
);
assert((await call(vault, "cva()(address)")).toLowerCase() === cva, "Vault CVA mismatch");

const registerRole = await cast("keccak", "REGISTER_ROLE");
assert(
  (await call(validator, "hasRole(bytes32,address)(bool)", registerRole, factory)) === "true",
  "Factory does not hold REGISTER_ROLE"
);

const registeredBefore = await call(validator, "isRegistered(address)(bool)", vault);
const confirmedBefore = await call(vault, "registrationConfirmed()(bool)");
if (registeredBefore === "true" || confirmedBefore === "true") {
  assert(registeredBefore === "true" && confirmedBefore === "true", "Registration is in an unexpected partial state");
  console.log("REGISTRATION_RESULT=ALREADY_REGISTERED");
  process.exit(0);
}

const unrestricted =
  rule.allowedGroup === "0x0000" &&
  rule.allowedSubGroup === "0x0000" &&
  rule.minTier === 0n &&
  rule.minSubTier === 0n &&
  rule.poolCountryBitmap === 0n;
assert(!unrestricted, "Refusing to register an unrestricted RuleV2");

const signature = "registerBenefitPool(address,address,address,(bytes2,bytes2,uint8,uint8,uint256))";
const feeAddress = "0x0000000000000000000000000000000000000000";
const tuple = `(${rule.allowedGroup},${rule.allowedSubGroup},${rule.minTier},${rule.minSubTier},${rule.poolCountryBitmap})`;

await cast("call", factory, signature, vault, cva, feeAddress, tuple, "--from", admin, "--rpc-url", rpcUrl);

const receiptText = await cast(
  "send",
  factory,
  signature,
  vault,
  cva,
  feeAddress,
  tuple,
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
assert(BigInt(receipt.status) === 1n, "Benefit registration transaction failed");

assert((await call(validator, "isRegistered(address)(bool)", vault)) === "true", "Vault is not registered after receipt");
assert(
  (await call(vault, "registrationConfirmed()(bool)")) === "true",
  "Vault did not record Factory registration confirmation"
);
const ruleHash = (await call(vault, "registrationRuleHash()(bytes32)")).toLowerCase();
assert(/^0x[0-9a-f]{64}$/.test(ruleHash) && BigInt(ruleHash) !== 0n, "Vault registration rule hash is invalid");

console.log(`REGISTRATION_TX_HASH=${txHash}`);
console.log(`REGISTRATION_BLOCK_NUMBER=${BigInt(receipt.blockNumber)}`);
console.log(`VAULT_REGISTRATION_RULE_HASH=${ruleHash}`);
console.log("FACTORY_INTERNAL_CALLS=registerV2,registerApass,confirmRegistration");
console.log("REGISTRATION_RESULT=PASS");
