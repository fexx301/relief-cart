import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const modes = ["--foundation", "--vault"].filter((mode) => args.includes(mode));

if (!args.includes("--execute")) {
  throw new Error("Deployment requires an explicit --execute flag");
}
if (modes.length !== 1) throw new Error("Choose exactly one mode: --foundation or --vault");

const mode = modes[0];
const rpcUrl = requiredEnv("MONAD_RPC_URL");
const expectedChainId = BigInt(requiredEnv("MONAD_CHAIN_ID"));
const validator = address("CLEANVERSE_VALIDATOR_ADDRESS");
const cva = address("CLEANVERSE_ATOKEN_ADDRESS");
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

function uint(name) {
  const value = requiredEnv(name);
  if (!/^[0-9]+$/.test(value)) throw new Error(`${name} must be an unsigned decimal integer`);
  return BigInt(value);
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

async function requireCode(label, target) {
  const code = await rpc("eth_getCode", [target, "latest"]);
  assert(code !== "0x", `${label} has no runtime bytecode`);
}

async function cast(...commandArgs) {
  const { stdout } = await execFileAsync("cast", commandArgs, { maxBuffer: 2_000_000 });
  return stdout.trim();
}

async function callAddress(target, signature) {
  return (await cast("call", target, signature, "--rpc-url", rpcUrl)).toLowerCase();
}

async function deploy(contract, constructorArgs) {
  const command = [
    "create",
    contract,
    "--constructor-args",
    ...constructorArgs.map(String),
    "--rpc-url",
    rpcUrl,
    "--keystore",
    keystore,
    "--password-file",
    passwordFile,
    "--broadcast",
    "--json",
  ];
  const { stdout } = await execFileAsync("forge", command, { maxBuffer: 4_000_000 });
  const payload = JSON.parse(stdout.trim());
  const deployedTo = String(payload.deployedTo ?? payload.deployed_to ?? "").toLowerCase();
  const transactionHash = String(payload.transactionHash ?? payload.transaction_hash ?? "").toLowerCase();
  assert(/^0x[0-9a-f]{40}$/.test(deployedTo), "forge create did not return a deployed address");
  assert(/^0x[0-9a-f]{64}$/.test(transactionHash), "forge create did not return a transaction hash");
  await requireCode(contract, deployedTo);
  return { deployedTo, transactionHash };
}

const chainId = BigInt(await rpc("eth_chainId", []));
assert(chainId === expectedChainId, `RPC chain ID ${chainId} does not match ${expectedChainId}`);
await Promise.all([requireCode("validator", validator), requireCode("CVA", cva)]);

const signer = (await cast("wallet", "address", "--keystore", keystore, "--password-file", passwordFile)).toLowerCase();
assert(signer === admin, "Admin keystore address does not match CLEANVERSE_ADMIN_ADDRESS");
const nativeBalance = BigInt(await rpc("eth_getBalance", [admin, "latest"]));
assert(nativeBalance > 0n, "Admin wallet has no native token for deployment gas");

console.log(`DEPLOYMENT_MODE=${mode.slice(2)}`);
console.log(`CHAIN_ID=${chainId}`);
console.log(`DEPLOYER=${admin}`);

if (mode === "--foundation") {
  const gate = await deploy("contracts/CleanverseComplianceGate.sol:CleanverseComplianceGate", [validator]);
  assert((await callAddress(gate.deployedTo, "validator()(address)")) === validator, "Gate validator mismatch");

  const factory = await deploy("contracts/RecoveryBenefitFactory.sol:RecoveryBenefitFactory", [validator, admin]);
  assert((await callAddress(factory.deployedTo, "validator()(address)")) === validator, "Factory validator mismatch");
  assert((await callAddress(factory.deployedTo, "owner()(address)")) === admin, "Factory owner mismatch");

  console.log(`CLEANVERSE_COMPLIANCE_GATE_ADDRESS=${gate.deployedTo}`);
  console.log(`COMPLIANCE_GATE_DEPLOY_TX=${gate.transactionHash}`);
  console.log(`CLEANVERSE_FACTORY_ADDRESS=${factory.deployedTo}`);
  console.log(`FACTORY_DEPLOY_TX=${factory.transactionHash}`);
  console.log("NEXT_STAGE=validator_grant");
} else {
  const gate = address("CLEANVERSE_COMPLIANCE_GATE_ADDRESS");
  const factory = address("CLEANVERSE_FACTORY_ADDRESS");
  const beneficiary = address("CLEANVERSE_TRAVELLER_ADDRESS");
  const merchant = address("CLEANVERSE_VALID_MERCHANT_ADDRESS");
  const refundRecipient = address("CLEANVERSE_TREASURY_ADDRESS");
  const amount = uint("CLEANVERSE_BENEFIT_AMOUNT_BASE_UNITS");
  const expiresAt = uint("CLEANVERSE_BENEFIT_EXPIRES_AT");
  assert(amount > 0n, "Benefit amount must be positive");
  assert(expiresAt > BigInt(Math.floor(Date.now() / 1000)), "Benefit expiry must be in the future");
  await Promise.all([requireCode("gate", gate), requireCode("factory", factory)]);

  const vault = await deploy("contracts/RecoveryBenefitVault.sol:RecoveryBenefitVault", [
    cva,
    gate,
    beneficiary,
    merchant,
    amount,
    expiresAt,
    refundRecipient,
    admin,
    factory,
  ]);

  for (const [signature, expected] of [
    ["cva()(address)", cva],
    ["complianceGate()(address)", gate],
    ["beneficiary()(address)", beneficiary],
    ["merchant()(address)", merchant],
    ["refundRecipient()(address)", refundRecipient],
    ["operator()(address)", admin],
    ["registrationAuthority()(address)", factory],
  ]) {
    assert((await callAddress(vault.deployedTo, signature)) === expected, `${signature} mismatch`);
  }

  console.log(`CLEANVERSE_VAULT_ADDRESS=${vault.deployedTo}`);
  console.log(`VAULT_DEPLOY_TX=${vault.transactionHash}`);
  console.log("NEXT_STAGE=register_benefit_pool");
}
