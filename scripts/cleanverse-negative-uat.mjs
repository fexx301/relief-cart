import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

if (!process.argv.includes("--execute")) {
  throw new Error("Negative UAT evidence requires an explicit --execute flag");
}

const rpcUrl = requiredEnv("MONAD_RPC_URL");
const expectedChainId = BigInt(requiredEnv("MONAD_CHAIN_ID"));
const baseUrl = requiredEnv("CLEANVERSE_BASE_URL");
const apiId = requiredEnv("CLEANVERSE_API_ID");
const chain = requiredEnv("CLEANVERSE_CHAIN").toLowerCase();
const validator = address("CLEANVERSE_VALIDATOR_ADDRESS");
const gate = address("CLEANVERSE_COMPLIANCE_GATE_ADDRESS");
const factory = address("CLEANVERSE_FACTORY_ADDRESS");
const cva = address("CLEANVERSE_ATOKEN_ADDRESS");
const successVault = address("CLEANVERSE_VAULT_ADDRESS");
const admin = address("CLEANVERSE_ADMIN_ADDRESS");
const beneficiary = address("CLEANVERSE_TRAVELLER_ADDRESS");
const merchant = address("CLEANVERSE_VALID_MERCHANT_ADDRESS");
const invalidMerchant = address("CLEANVERSE_INVALID_MERCHANT_ADDRESS");
const refundRecipient = address("CLEANVERSE_TREASURY_ADDRESS");
const adminKeystore = requiredEnv("CLEANVERSE_ADMIN_KEYSTORE_PATH");
const adminPasswordFile = requiredEnv("CLEANVERSE_ADMIN_PASSWORD_FILE");
const minter = address("CLEANVERSE_MINTER_ADDRESS");
const minterKeystore = requiredEnv("CLEANVERSE_MINTER_KEYSTORE_PATH");
const minterPasswordFile = requiredEnv("CLEANVERSE_MINTER_PASSWORD_FILE");
const rule = {
  allowedGroup: bytes2("CLEANVERSE_RULE_ALLOWED_GROUP"),
  allowedSubGroup: bytes2("CLEANVERSE_RULE_ALLOWED_SUB_GROUP"),
  minTier: uint8("CLEANVERSE_RULE_MIN_TIER"),
  minSubTier: uint8("CLEANVERSE_RULE_MIN_SUB_TIER"),
  isBlackList: boolean("CLEANVERSE_RULE_IS_BLACK_LIST"),
  countryBitmap: uint("CLEANVERSE_RULE_COUNTRY_BITMAP"),
};

await Promise.all([access(adminKeystore), access(adminPasswordFile), access(minterKeystore), access(minterPasswordFile)]);

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

function boolean(name) {
  const value = requiredEnv(name).toLowerCase();
  if (value !== "true" && value !== "false") throw new Error(`${name} must be true or false`);
  return value === "true";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function run(command, args) {
  try {
    const result = await execFileAsync(command, args, { maxBuffer: 4_000_000 });
    return { ok: true, stdout: String(result.stdout).trim(), stderr: String(result.stderr).trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message ?? "").trim(),
    };
  }
}

async function cast(args) {
  const result = await run("cast", args);
  if (!result.ok) throw new Error(`cast ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function call(target, signature, ...args) {
  return cast(["call", target, signature, ...args, "--rpc-url", rpcUrl]);
}

async function simulateSuccess(label, target, signature, args, from) {
  const command = ["call", target, signature, ...args, "--rpc-url", rpcUrl];
  if (from) command.push("--from", from);
  const result = await run("cast", command);
  if (!result.ok) throw new Error(`${label} simulation failed: ${result.stderr || result.stdout}`);
  console.log(`${label}_SIMULATION=PASS`);
}

async function simulateRevert(label, target, signature, args, from) {
  const command = ["call", target, signature, ...args, "--rpc-url", rpcUrl];
  if (from) command.push("--from", from);
  const result = await run("cast", command);
  const text = `${result.stderr}\n${result.stdout}`.toLowerCase();
  if (result.ok || !text.includes("revert")) {
    throw new Error(`${label} did not produce a simulated EVM revert`);
  }
  console.log(`${label}_SIMULATION=EXPECTED_REVERT`);
}

async function waitForReceipt(txHash) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (receipt) return receipt;
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for receipt ${txHash}`);
}

function receiptStatus(receipt) {
  return BigInt(receipt.status);
}

function receiptSummary(receipt) {
  return {
    block: BigInt(receipt.blockNumber).toString(),
    status: receiptStatus(receipt).toString(),
    logs: receipt.logs?.length ?? 0,
  };
}

function extractHash(text) {
  const hashes = String(text).match(/0x[0-9a-fA-F]{64}/g) ?? [];
  return hashes.at(-1)?.toLowerCase();
}

async function sendAsync(label, target, signature, args, keystore, passwordFile, gasLimit = "600000") {
  const result = await run("cast", [
    "send",
    "--async",
    "--rpc-url",
    rpcUrl,
    "--keystore",
    keystore,
    "--password-file",
    passwordFile,
    "--gas-limit",
    gasLimit,
    target,
    signature,
    ...args,
  ]);
  const txHash = extractHash(`${result.stdout}\n${result.stderr}`);
  if (!txHash) throw new Error(`${label} broadcast returned no transaction hash`);
  const receipt = await waitForReceipt(txHash);
  return { txHash, receipt };
}

async function sendSuccess(label, target, signature, args, keystore = adminKeystore, passwordFile = adminPasswordFile) {
  const result = await sendAsync(label, target, signature, args, keystore, passwordFile);
  assert(receiptStatus(result.receipt) === 1n, `${label} transaction failed`);
  console.log(`${label}_TX=${result.txHash}`);
  return result;
}

async function sendExpectedRevert(label, target, signature, args) {
  const result = await sendAsync(label, target, signature, args, adminKeystore, adminPasswordFile);
  assert(receiptStatus(result.receipt) === 0n, `${label} transaction unexpectedly succeeded`);
  console.log(`${label}_TX=${result.txHash}`);
  return result;
}

async function latestTimestamp() {
  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  return BigInt(block.timestamp);
}

async function requireCode(label, target) {
  const code = await rpc("eth_getCode", [target, "latest"]);
  assert(code !== "0x", `${label} has no runtime bytecode`);
}

async function balanceOf(target) {
  return BigInt(await call(cva, "balanceOf(address)(uint256)", target));
}

async function statusOf(target) {
  return BigInt(await call(target, "status()(uint8)"));
}

async function apiRequest(path, body) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const response = await fetch(new URL(path.replace(/^\/+/, ""), normalized), {
    method: "POST",
    headers: { "content-type": "application/json", "api-id": apiId },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json();
  return { response, payload };
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

async function assertApassState(label, subject, expectedActive) {
  const result = await apiRequest("/query_apass", { chain, address: subject });
  const status = Number(findValue(result.payload, ["status"]));
  const expiration = Number(findValue(result.payload, ["expirationTime", "expiration_time"]));
  const active = String(findValue(result.payload, ["code"])) === "0000" && status === 1 && expiration > Number(await latestTimestamp());
  assert(active === expectedActive, `${label} A-Pass active state did not match expectation`);
}

async function deployVault(expiresAt) {
  const result = await run("forge", [
    "create",
    "contracts/RecoveryBenefitVault.sol:RecoveryBenefitVault",
    "--rpc-url",
    rpcUrl,
    "--keystore",
    adminKeystore,
    "--password-file",
    adminPasswordFile,
    "--broadcast",
    "--json",
    "--constructor-args",
    cva,
    gate,
    beneficiary,
    merchant,
    "1",
    expiresAt.toString(),
    refundRecipient,
    admin,
    factory,
  ]);
  if (!result.ok) throw new Error(`vault deployment failed: ${result.stderr || result.stdout}`);
  const payload = JSON.parse(result.stdout);
  const vault = String(payload.deployedTo ?? payload.deployed_to ?? "").toLowerCase();
  const txHash = String(payload.transactionHash ?? payload.transaction_hash ?? "").toLowerCase();
  assert(/^0x[0-9a-f]{40}$/.test(vault), "forge create returned no vault address");
  assert(/^0x[0-9a-f]{64}$/.test(txHash), "forge create returned no deployment transaction hash");
  const receipt = await waitForReceipt(txHash);
  assert(receiptStatus(receipt) === 1n, "vault deployment transaction failed");
  await requireCode("vault", vault);
  assert((await call(vault, "registrationAuthority()(address)")).toLowerCase() === factory, "vault Factory mismatch");
  return { vault, txHash };
}

const registrationSignature = "registerBenefitPool(address,address,address,(bytes2,bytes2,uint8,uint8,bool,uint256))";
const ruleTuple = `(${rule.allowedGroup},${rule.allowedSubGroup},${rule.minTier},${rule.minSubTier},${rule.isBlackList},${rule.countryBitmap})`;
const zeroAddress = "0x0000000000000000000000000000000000000000";

async function registerVault(vault) {
  await simulateSuccess("REGISTRATION", factory, registrationSignature, [vault, cva, zeroAddress, ruleTuple], admin);
  const result = await sendSuccess("REGISTRATION", factory, registrationSignature, [vault, cva, zeroAddress, ruleTuple]);
  assert((await call(validator, "isRegistered(address)(bool)", vault)) === "true", "fixture vault is not registered");
  assert((await call(vault, "registrationConfirmed()(bool)")) === "true", "fixture registration was not confirmed");
  assert((await call(gate, "isPoolReady(address)(bool)", vault)) === "true", "fixture pool is not ready");
  return result;
}

async function fundVault(vault) {
  await simulateSuccess("FUNDING", cva, "transfer(address,uint256)(bool)", [vault, "1"], admin);
  const result = await sendSuccess("FUNDING", cva, "transfer(address,uint256)(bool)", [vault, "1"]);
  assert((await balanceOf(vault)) === 1n, "fixture vault was not funded");
  return result;
}

async function activateVault(vault) {
  const ruleHash = (await call(vault, "registrationRuleHash()(bytes32)")).toLowerCase();
  const encoded = await cast([
    "abi-encode",
    "f(uint256,address,address,uint256,bytes32)",
    expectedChainId.toString(),
    vault,
    cva,
    "1",
    ruleHash,
  ]);
  const evidenceHash = (await cast(["keccak", encoded])).toLowerCase();
  await simulateSuccess("ACTIVATION", vault, "activate(bytes32)", [evidenceHash], admin);
  const result = await sendSuccess("ACTIVATION", vault, "activate(bytes32)", [evidenceHash]);
  assert((await statusOf(vault)) === 1n, "fixture vault did not become active");
  return { ...result, evidenceHash };
}

async function createActiveFixture(expiresAt) {
  const deployed = await deployVault(expiresAt);
  console.log(`FIXTURE_VAULT=${deployed.vault}`);
  console.log(`FIXTURE_DEPLOYMENT_TX=${deployed.txHash}`);
  const registration = await registerVault(deployed.vault);
  const funding = await fundVault(deployed.vault);
  const activation = await activateVault(deployed.vault);
  return { ...deployed, registration, funding, activation };
}

async function mintTwoUnits() {
  const minterRole = await cast(["keccak", "MINTER_ROLE"]);
  assert((await call(cva, "hasRole(bytes32,address)(bool)", minterRole, minter)) === "false", "minter role is already granted; refusing non-clean mint setup");
  await simulateSuccess("MINTER_GRANT", cva, "grantRole(bytes32,address)", [minterRole, minter], admin);
  const grant = await sendSuccess("MINTER_GRANT", cva, "grantRole(bytes32,address)", [minterRole, minter]);
  await simulateSuccess("MINT_TWO_UNITS", cva, "mint(address,uint256)", [admin, "2"], minter);
  const mint = await sendSuccess("MINT_TWO_UNITS", cva, "mint(address,uint256)", [admin, "2"], minterKeystore, minterPasswordFile);
  await simulateSuccess("MINTER_REVOKE", cva, "revokeRole(bytes32,address)", [minterRole, minter], admin);
  const revoke = await sendSuccess("MINTER_REVOKE", cva, "revokeRole(bytes32,address)", [minterRole, minter]);
  assert((await call(cva, "hasRole(bytes32,address)(bool)", minterRole, minter)) === "false", "minter role cleanup failed");
  return { grant, mint, revoke };
}

await requireCode("validator", validator);
await requireCode("gate", gate);
await requireCode("factory", factory);
await requireCode("CVA", cva);
assert((await call(factory, "owner()(address)")).toLowerCase() === admin, "admin is not Factory owner");
assert(beneficiary === admin, "negative fixture requires the configured admin keystore to be the beneficiary");
assert(invalidMerchant !== merchant, "invalid merchant must differ from the configured valid merchant");
assert((await call(successVault, "status()(uint8)")) === "4", "configured success vault is not Redeemed; replay fixture is unsafe");
await assertApassState("refund recipient", refundRecipient, true);
await assertApassState("invalid merchant", invalidMerchant, false);

const evidence = {
  chainId: Number(expectedChainId),
  minter: await mintTwoUnits(),
};

await simulateRevert("CVA_INVALID_MERCHANT_TRANSFER", cva, "transfer(address,uint256)(bool)", [invalidMerchant, "1"], admin);
const invalidTransfer = await sendExpectedRevert("CVA_INVALID_MERCHANT_TRANSFER", cva, "transfer(address,uint256)(bool)", [invalidMerchant, "1"]);
evidence.cvaInvalidMerchantTransfer = { tx: invalidTransfer.txHash, ...receiptSummary(invalidTransfer.receipt) };

await simulateRevert("REPLAY_REDEMPTION", successVault, "redeem(address)", [merchant], beneficiary);
const replay = await sendExpectedRevert("REPLAY_REDEMPTION", successVault, "redeem(address)", [merchant]);
evidence.replay = { tx: replay.txHash, ...receiptSummary(replay.receipt) };

const wrongFixtureExpiry = (await latestTimestamp()) + 3_600n;
const wrongFixture = await createActiveFixture(wrongFixtureExpiry);
evidence.wrongMerchantFixture = { vault: wrongFixture.vault, deploymentTx: wrongFixture.txHash };

await simulateRevert("WRONG_MERCHANT_REDEMPTION", wrongFixture.vault, "redeem(address)", [invalidMerchant], beneficiary);
const wrongMerchant = await sendExpectedRevert("WRONG_MERCHANT_REDEMPTION", wrongFixture.vault, "redeem(address)", [invalidMerchant]);
evidence.wrongMerchant = { tx: wrongMerchant.txHash, ...receiptSummary(wrongMerchant.receipt) };

await simulateSuccess("REVOCATION", wrongFixture.vault, "revoke()", [], admin);
const revocation = await sendSuccess("REVOCATION", wrongFixture.vault, "revoke()", []);
evidence.revocation = { tx: revocation.txHash, ...receiptSummary(revocation.receipt) };

await simulateRevert("REVOKED_REDEMPTION", wrongFixture.vault, "redeem(address)", [merchant], beneficiary);
const revokedRedemption = await sendExpectedRevert("REVOKED_REDEMPTION", wrongFixture.vault, "redeem(address)", [merchant]);
evidence.revokedRedemption = { tx: revokedRedemption.txHash, ...receiptSummary(revokedRedemption.receipt) };

const wrongRefundBefore = await balanceOf(refundRecipient);
await simulateSuccess("REVOCATION_REFUND", wrongFixture.vault, "recover()", [], admin);
const wrongRefund = await sendSuccess("REVOCATION_REFUND", wrongFixture.vault, "recover()", []);
assert((await statusOf(wrongFixture.vault)) === 5n, "revoked fixture did not become Refunded");
assert((await balanceOf(wrongFixture.vault)) === 0n, "revoked fixture retained CVA");
assert((await balanceOf(refundRecipient)) === wrongRefundBefore + 1n, "revocation refund delta was incorrect");
evidence.revocationRefund = { tx: wrongRefund.txHash, ...receiptSummary(wrongRefund.receipt) };

const expiryFixtureExpiry = (await latestTimestamp()) + 600n;
const expiryFixture = await createActiveFixture(expiryFixtureExpiry);
evidence.expiryFixture = { vault: expiryFixture.vault, deploymentTx: expiryFixture.txHash, expiresAt: expiryFixtureExpiry.toString() };

let remaining;
while ((remaining = expiryFixtureExpiry - (await latestTimestamp())) >= 0n) {
  console.log(`WAITING_FOR_EXPIRY_SECONDS=${remaining + 1n}`);
  await sleep(Math.min(30_000, Number((remaining + 1n) * 1_000n)));
}

await simulateRevert("EXPIRED_REDEMPTION", expiryFixture.vault, "redeem(address)", [merchant], beneficiary);
const expiredRedemption = await sendExpectedRevert("EXPIRED_REDEMPTION", expiryFixture.vault, "redeem(address)", [merchant]);
evidence.expiredRedemption = { tx: expiredRedemption.txHash, ...receiptSummary(expiredRedemption.receipt) };

const expiryRefundBefore = await balanceOf(refundRecipient);
await simulateSuccess("EXPIRY_REFUND", expiryFixture.vault, "recover()", [], admin);
const expiryRefund = await sendSuccess("EXPIRY_REFUND", expiryFixture.vault, "recover()", []);
assert((await statusOf(expiryFixture.vault)) === 5n, "expired fixture did not become Refunded");
assert((await balanceOf(expiryFixture.vault)) === 0n, "expired fixture retained CVA");
assert((await balanceOf(refundRecipient)) === expiryRefundBefore + 1n, "expiry refund delta was incorrect");
evidence.expiryRefund = { tx: expiryRefund.txHash, ...receiptSummary(expiryRefund.receipt) };

console.log("NEGATIVE_UAT_RESULT=PASS");
console.log(JSON.stringify(evidence, null, 2));
