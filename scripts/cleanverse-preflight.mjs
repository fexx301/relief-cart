import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

if (process.argv.includes("--execute")) {
  throw new Error("This preflight is read-only and does not support --execute");
}

const stage = option("--stage") ?? "foundation";
const stages = ["foundation", "granted", "registered", "funded", "active"];
const stageIndex = stages.indexOf(stage);
if (stageIndex === -1) throw new Error(`Unsupported --stage: ${stage}`);

const baseRequired = [
  "MONAD_RPC_URL",
  "MONAD_CHAIN_ID",
  "CLEANVERSE_VALIDATOR_ADDRESS",
  "CLEANVERSE_COMPLIANCE_GATE_ADDRESS",
  "CLEANVERSE_FACTORY_ADDRESS",
  "CLEANVERSE_ATOKEN_ADDRESS",
];
const vaultRequired = ["CLEANVERSE_VAULT_ADDRESS"];
for (const name of stageIndex >= 2 ? [...baseRequired, ...vaultRequired] : baseRequired) requiredEnv(name);

const rpcUrl = requiredEnv("MONAD_RPC_URL");
const expectedChainId = BigInt(requiredEnv("MONAD_CHAIN_ID"));
const validator = address("CLEANVERSE_VALIDATOR_ADDRESS");
const gate = address("CLEANVERSE_COMPLIANCE_GATE_ADDRESS");
const factory = address("CLEANVERSE_FACTORY_ADDRESS");
const cva = address("CLEANVERSE_ATOKEN_ADDRESS");
const vault = stageIndex >= 2 ? address("CLEANVERSE_VAULT_ADDRESS") : undefined;

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

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

function optionalAddress(name) {
  return process.env[name] ? address(name) : undefined;
}

function assert(condition, message) {
  if (!condition) throw new Error(`PREFLIGHT_ASSERTION_FAILED: ${message}`);
}

function word(value) {
  return value.slice(2).padStart(64, "0");
}

function addressWord(value) {
  return word(value.toLowerCase());
}

function requireWord(value, label) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} returned malformed ABI data`);
  return value.toLowerCase();
}

function boolResult(value, label) {
  const decoded = BigInt(requireWord(value, label));
  if (decoded !== 0n && decoded !== 1n) throw new Error(`${label} returned a non-boolean word`);
  return decoded === 1n;
}

function uintResult(value, label) {
  return BigInt(requireWord(value, label));
}

function addressResult(value, label) {
  return `0x${requireWord(value, label).slice(-40)}`;
}

function bytes32Result(value, label) {
  return requireWord(value, label);
}

function decodeRulesV2(value) {
  if (!/^0x[0-9a-fA-F]*$/.test(value) || (value.length - 2) % 64 !== 0) {
    throw new Error("getRulesV2 returned malformed ABI data");
  }
  const words = value.slice(2).match(/.{64}/g) ?? [];
  if (words.length < 2 || BigInt(`0x${words[0]}`) !== 32n) {
    throw new Error("getRulesV2 returned an unexpected ABI offset");
  }
  const length = Number(BigInt(`0x${words[1]}`));
  if (!Number.isSafeInteger(length) || words.length !== 2 + length * 6) {
    throw new Error("getRulesV2 returned an unexpected RuleV2 array length");
  }
  return Array.from({ length }, (_, index) => {
    const start = 2 + index * 6;
    const isBlackListWord = BigInt(`0x${words[start + 4]}`);
    if (isBlackListWord !== 0n && isBlackListWord !== 1n) {
      throw new Error("getRulesV2 returned a non-boolean isBlackList field");
    }
    const rule = {
      allowedGroup: `0x${words[start].slice(0, 4)}`,
      allowedSubGroup: `0x${words[start + 1].slice(0, 4)}`,
      minTier: BigInt(`0x${words[start + 2]}`),
      minSubTier: BigInt(`0x${words[start + 3]}`),
      isBlackList: isBlackListWord === 1n,
      countryBitmap: BigInt(`0x${words[start + 5]}`),
    };
    return {
      ...rule,
      unrestricted:
        rule.allowedGroup === "0x0000" &&
        rule.allowedSubGroup === "0x0000" &&
        rule.minTier === 0n &&
        rule.minSubTier === 0n &&
        !rule.isBlackList &&
        rule.countryBitmap === 0n,
    };
  });
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

async function selector(signature) {
  const { stdout } = await execFileAsync("cast", ["sig", signature]);
  return stdout.trim();
}

async function roleId(name) {
  const { stdout } = await execFileAsync("cast", ["keccak", name]);
  return stdout.trim();
}

async function call(to, signature, encodedArgs = "", label = signature) {
  const data = `${await selector(signature)}${encodedArgs}`;
  return rpc("eth_call", [{ to, data }, "latest"]);
}

async function requireCode(label, target) {
  const code = await rpc("eth_getCode", [target, "latest"]);
  const bytes = Math.max(0, (code.length - 2) / 2);
  const { stdout } = await execFileAsync("cast", ["keccak", code]);
  console.log(`${label}_ADDRESS=${target}`);
  console.log(`${label}_BYTECODE_BYTES=${bytes}`);
  console.log(`${label}_RUNTIME_HASH=${stdout.trim()}`);
  assert(bytes > 0, `${label} has no runtime bytecode`);
  return code;
}

async function assertAddressGetter(target, signature, expected, label) {
  const actual = addressResult(await call(target, signature, "", label), label);
  console.log(`${label}=${actual}`);
  assert(actual === expected, `${label} expected ${expected}, received ${actual}`);
}

const chainId = BigInt(await rpc("eth_chainId", []));
console.log(`PREFLIGHT_STAGE=${stage}`);
console.log(`CHAIN_ID=${chainId}`);
assert(chainId === expectedChainId, `RPC chain ID ${chainId} does not match ${expectedChainId}`);

await Promise.all([
  requireCode("VALIDATOR", validator),
  requireCode("COMPLIANCE_GATE", gate),
  requireCode("FACTORY", factory),
  requireCode("CVA", cva),
]);

await Promise.all([
  assertAddressGetter(gate, "validator()", validator, "GATE_VALIDATOR"),
  assertAddressGetter(factory, "validator()", validator, "FACTORY_VALIDATOR"),
]);

const expectedOwner = optionalAddress("CLEANVERSE_ADMIN_ADDRESS");
const factoryOwner = addressResult(await call(factory, "owner()", "", "FACTORY_OWNER"), "FACTORY_OWNER");
console.log(`FACTORY_OWNER=${factoryOwner}`);
if (expectedOwner) assert(factoryOwner === expectedOwner, "Factory owner does not match CLEANVERSE_ADMIN_ADDRESS");

const implementationSlot =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const implementationWord = await rpc("eth_getStorageAt", [validator, implementationSlot, "latest"]);
const implementation = `0x${implementationWord.slice(-40)}`.toLowerCase();
console.log(`VALIDATOR_IMPLEMENTATION=${implementation}`);
assert(BigInt(implementation) !== 0n, "Validator EIP-1967 implementation is zero");
await requireCode("VALIDATOR_IMPLEMENTATION", implementation);

const decimals = uintResult(await call(cva, "decimals()", "", "CVA_DECIMALS"), "CVA_DECIMALS");
const supply = uintResult(await call(cva, "totalSupply()", "", "CVA_TOTAL_SUPPLY"), "CVA_TOTAL_SUPPLY");
console.log(`CVA_DECIMALS=${decimals}`);
console.log(`CVA_TOTAL_SUPPLY=${supply}`);

if (stageIndex >= 1) {
  const registerRole = await roleId("REGISTER_ROLE");
  const roleArgs = `${word(registerRole)}${addressWord(factory)}`;
  const hasRole = boolResult(await call(validator, "hasRole(bytes32,address)", roleArgs, "FACTORY_REGISTER_ROLE"), "FACTORY_REGISTER_ROLE");
  console.log(`REGISTER_ROLE=${registerRole}`);
  console.log(`FACTORY_HAS_REGISTER_ROLE=${hasRole}`);
  assert(hasRole, "Factory does not hold REGISTER_ROLE");
}

if (stageIndex >= 2) {
  await requireCode("VAULT", vault);
  await Promise.all([
    assertAddressGetter(vault, "cva()", cva, "VAULT_CVA"),
    assertAddressGetter(vault, "complianceGate()", gate, "VAULT_COMPLIANCE_GATE"),
    assertAddressGetter(vault, "registrationAuthority()", factory, "VAULT_REGISTRATION_AUTHORITY"),
  ]);

  for (const [envName, signature, label] of [
    ["CLEANVERSE_ADMIN_ADDRESS", "operator()", "VAULT_OPERATOR"],
    ["CLEANVERSE_TRAVELLER_ADDRESS", "beneficiary()", "VAULT_BENEFICIARY"],
    ["CLEANVERSE_VALID_MERCHANT_ADDRESS", "merchant()", "VAULT_MERCHANT"],
    ["CLEANVERSE_TREASURY_ADDRESS", "refundRecipient()", "VAULT_REFUND_RECIPIENT"],
  ]) {
    const expected = optionalAddress(envName);
    if (expected) await assertAddressGetter(vault, signature, expected, label);
  }

  const registered = boolResult(
    await call(validator, "isRegistered(address)", addressWord(vault), "VAULT_REGISTERED"),
    "VAULT_REGISTERED"
  );
  console.log(`VAULT_REGISTERED=${registered}`);
  assert(registered, "Vault is not registered");

  const encodedRules = await call(validator, "getRulesV2(address)", addressWord(vault), "VAULT_RULES");
  const rules = decodeRulesV2(encodedRules);
  console.log(`VAULT_RULE_COUNT=${rules.length}`);
  assert(rules.length === 1, `Expected exactly one RuleV2, received ${rules.length}`);
  assert(!rules[0].unrestricted, "Vault RuleV2 is unrestricted");
  console.log(
    `VAULT_RULE=${[
      rules[0].allowedGroup,
      rules[0].allowedSubGroup,
      rules[0].minTier,
      rules[0].minSubTier,
      rules[0].isBlackList,
      `0x${rules[0].countryBitmap.toString(16)}`,
    ].join(",")}`
  );
  console.log(`VAULT_RULES_SHA256=${await sha256(encodedRules)}`);

  const confirmed = boolResult(
    await call(vault, "registrationConfirmed()", "", "VAULT_REGISTRATION_CONFIRMED"),
    "VAULT_REGISTRATION_CONFIRMED"
  );
  const ruleHash = bytes32Result(
    await call(vault, "registrationRuleHash()", "", "VAULT_REGISTRATION_RULE_HASH"),
    "VAULT_REGISTRATION_RULE_HASH"
  );
  const gateReady = boolResult(
    await call(gate, "isPoolReady(address)", addressWord(vault), "GATE_POOL_READY"),
    "GATE_POOL_READY"
  );
  console.log(`VAULT_REGISTRATION_CONFIRMED=${confirmed}`);
  console.log(`VAULT_REGISTRATION_RULE_HASH=${ruleHash}`);
  console.log(`GATE_POOL_READY=${gateReady}`);
  assert(confirmed, "Vault did not record the Factory registration callback");
  assert(BigInt(ruleHash) !== 0n, "Vault registration rule hash is zero");
  assert(gateReady, "Compliance gate reports the vault is not ready");
}

if (stageIndex >= 3) {
  const amount = uintResult(await call(vault, "amount()", "", "VAULT_AMOUNT"), "VAULT_AMOUNT");
  const balance = uintResult(
    await call(cva, "balanceOf(address)", addressWord(vault), "VAULT_CVA_BALANCE"),
    "VAULT_CVA_BALANCE"
  );
  const paused = boolResult(await call(cva, "paused()", "", "CVA_PAUSED"), "CVA_PAUSED");
  console.log(`VAULT_AMOUNT=${amount}`);
  console.log(`VAULT_CVA_BALANCE=${balance}`);
  console.log(`CVA_PAUSED=${paused}`);
  assert(balance >= amount, `Vault balance ${balance} is below amount ${amount}`);
  assert(!paused, "CVA is paused");
}

if (stageIndex >= 4) {
  const status = uintResult(await call(vault, "status()", "", "VAULT_STATUS"), "VAULT_STATUS");
  const beneficiary = addressResult(
    await call(vault, "beneficiary()", "", "VAULT_BENEFICIARY"),
    "VAULT_BENEFICIARY"
  );
  const merchant = addressResult(await call(vault, "merchant()", "", "VAULT_MERCHANT"), "VAULT_MERCHANT");
  const beneficiaryAllowed = boolResult(
    await call(
      validator,
      "complianceVerify(address,address)",
      `${addressWord(vault)}${addressWord(beneficiary)}`,
      "BENEFICIARY_COMPLIANCE"
    ),
    "BENEFICIARY_COMPLIANCE"
  );
  const merchantAllowed = boolResult(
    await call(
      validator,
      "complianceVerify(address,address)",
      `${addressWord(vault)}${addressWord(merchant)}`,
      "MERCHANT_COMPLIANCE"
    ),
    "MERCHANT_COMPLIANCE"
  );
  console.log(`VAULT_STATUS=${status}`);
  console.log(`BENEFICIARY_COMPLIANCE=${beneficiaryAllowed}`);
  console.log(`MERCHANT_COMPLIANCE=${merchantAllowed}`);
  assert(status === 1n, `Vault status ${status} is not Active`);
  assert(beneficiaryAllowed, "Beneficiary failed live complianceVerify");
  assert(merchantAllowed, "Merchant failed live complianceVerify");
}

console.log("READ_ONLY_PREFLIGHT=PASS");

async function sha256(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}
