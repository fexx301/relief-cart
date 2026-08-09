import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

if (!process.argv.includes("--execute")) {
  throw new Error("Vault redemption requires an explicit --execute flag");
}

const rpcUrl = requiredEnv("MONAD_RPC_URL");
const expectedChainId = BigInt(requiredEnv("MONAD_CHAIN_ID"));
const validator = address("CLEANVERSE_VALIDATOR_ADDRESS");
const cva = address("CLEANVERSE_ATOKEN_ADDRESS");
const vault = address("CLEANVERSE_VAULT_ADDRESS");
const admin = address("CLEANVERSE_ADMIN_ADDRESS");
const expectedMerchant = address("CLEANVERSE_VALID_MERCHANT_ADDRESS");
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
const beneficiary = (await call(vault, "beneficiary()(address)")).toLowerCase();
const merchant = (await call(vault, "merchant()(address)")).toLowerCase();
assert(beneficiary === admin, "Configured admin is not the vault beneficiary");
assert(merchant === expectedMerchant, "Configured merchant does not match the vault merchant");
assert((await call(validator, "complianceVerify(address,address)(bool)", vault, beneficiary)) === "true", "Beneficiary failed live complianceVerify");
assert((await call(validator, "complianceVerify(address,address)(bool)", vault, merchant)) === "true", "Merchant failed live complianceVerify");

const status = BigInt(await call(vault, "status()(uint8)"));
assert(status === 1n, `Vault status ${status} is not Active`);
const amount = BigInt(await call(vault, "amount()(uint256)"));
const vaultBalanceBefore = BigInt(await call(cva, "balanceOf(address)(uint256)", vault));
const merchantBalanceBefore = BigInt(await call(cva, "balanceOf(address)(uint256)", merchant));
assert(vaultBalanceBefore >= amount, `Vault balance ${vaultBalanceBefore} is below amount ${amount}`);

const redemptionSignature = "redeem(address)";
await cast("call", vault, redemptionSignature, merchant, "--from", beneficiary, "--rpc-url", rpcUrl);
const receiptText = await cast(
  "send",
  vault,
  redemptionSignature,
  merchant,
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
assert(BigInt(receipt.status) === 1n, "Vault redemption transaction failed");

const statusAfter = BigInt(await call(vault, "status()(uint8)"));
const vaultBalanceAfter = BigInt(await call(cva, "balanceOf(address)(uint256)", vault));
const merchantBalanceAfter = BigInt(await call(cva, "balanceOf(address)(uint256)", merchant));
assert(statusAfter === 4n, `Vault status ${statusAfter} is not Redeemed`);
assert(vaultBalanceAfter === vaultBalanceBefore - amount, "Vault CVA balance did not decrease by the benefit amount");
assert(merchantBalanceAfter === merchantBalanceBefore + amount, "Merchant CVA balance did not increase by the benefit amount");

console.log(`REDEMPTION_TX_HASH=${txHash}`);
console.log(`REDEMPTION_BLOCK_NUMBER=${BigInt(receipt.blockNumber)}`);
console.log(`REDEMPTION_LOG_COUNT=${receipt.logs?.length ?? "UNKNOWN"}`);
console.log(`REDEMPTION_AMOUNT=${amount}`);
console.log(`VAULT_CVA_BALANCE_BEFORE=${vaultBalanceBefore}`);
console.log(`VAULT_CVA_BALANCE_AFTER=${vaultBalanceAfter}`);
console.log(`MERCHANT_CVA_BALANCE_BEFORE=${merchantBalanceBefore}`);
console.log(`MERCHANT_CVA_BALANCE_AFTER=${merchantBalanceAfter}`);
console.log("REDEMPTION_RESULT=PASS");
