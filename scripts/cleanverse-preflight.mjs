import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

if (process.argv.includes("--execute")) {
  throw new Error("This preflight is read-only and does not support --execute");
}

const required = [
  "MONAD_RPC_URL",
  "CLEANVERSE_VALIDATOR_ADDRESS",
  "CLEANVERSE_FACTORY_ADDRESS",
  "CLEANVERSE_VAULT_ADDRESS",
  "CLEANVERSE_ATOKEN_ADDRESS",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const rpcUrl = process.env.MONAD_RPC_URL;
const validator = address("CLEANVERSE_VALIDATOR_ADDRESS");
const factory = address("CLEANVERSE_FACTORY_ADDRESS");
const vault = address("CLEANVERSE_VAULT_ADDRESS");
const cva = address("CLEANVERSE_ATOKEN_ADDRESS");
const expectedChainId = process.env.MONAD_CHAIN_ID;

function address(name) {
  const value = process.env[name];
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} must be a 20-byte EVM address`);
  return value.toLowerCase();
}

function short(value) {
  const text = String(value);
  return text.length > 18 ? `${text.slice(0, 10)}...${text.slice(-6)}` : text;
}

function word(value) {
  return value.slice(2).padStart(64, "0");
}

function addressWord(value) {
  return word(value.toLowerCase());
}

function boolResult(value, label) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} returned malformed bool data`);
  return BigInt(value) !== 0n;
}

function uintResult(value, label) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} returned malformed uint data`);
  return BigInt(value);
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
  if (!Number.isSafeInteger(length) || words.length !== 2 + length * 5) {
    throw new Error("getRulesV2 returned an unexpected RuleV2 array length");
  }
  return Array.from({ length }, (_, index) => {
    const start = 2 + index * 5;
    const allowedGroup = `0x${words[start].slice(0, 4)}`;
    const allowedSubGroup = `0x${words[start + 1].slice(0, 4)}`;
    const minTier = BigInt(`0x${words[start + 2]}`);
    const minSubTier = BigInt(`0x${words[start + 3]}`);
    const poolCountryBitmap = BigInt(`0x${words[start + 4]}`);
    return {
      allowedGroup,
      allowedSubGroup,
      minTier,
      minSubTier,
      poolCountryBitmap,
      unrestricted:
        allowedGroup === "0x0000" &&
        allowedSubGroup === "0x0000" &&
        minTier === 0n &&
        minSubTier === 0n &&
        poolCountryBitmap === 0n,
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

async function call(to, data, label, { optional = false } = {}) {
  try {
    return await rpc("eth_call", [{ to, data }, "latest"]);
  } catch (error) {
    if (optional) {
      console.log(`${label}=UNAVAILABLE`);
      return undefined;
    }
    throw error;
  }
}

async function requireCode(label, target) {
  const code = await rpc("eth_getCode", [target, "latest"]);
  const bytes = Math.max(0, (code.length - 2) / 2);
  console.log(`${label}_ADDRESS=${target}`);
  console.log(`${label}_BYTECODE_BYTES=${bytes}`);
  if (bytes === 0) throw new Error(`${label} has no runtime bytecode`);
}

async function selector(signature) {
  const { stdout } = await execFileAsync("cast", ["sig", signature]);
  return stdout.trim();
}

async function roleId(name) {
  const { stdout } = await execFileAsync("cast", ["keccak", name]);
  return stdout.trim();
}

const chainId = BigInt(await rpc("eth_chainId", []));
console.log(`CHAIN_ID=${chainId}`);
if (expectedChainId && chainId !== BigInt(expectedChainId)) {
  throw new Error(`RPC chain ID ${chainId} does not match MONAD_CHAIN_ID ${expectedChainId}`);
}

await Promise.all([
  requireCode("VALIDATOR", validator),
  requireCode("FACTORY", factory),
  requireCode("VAULT", vault),
  requireCode("CVA", cva),
]);

const implementationSlot =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const implementationWord = await rpc("eth_getStorageAt", [validator, implementationSlot, "latest"]);
const implementation = `0x${implementationWord.slice(-40)}`.toLowerCase();
console.log(`VALIDATOR_IMPLEMENTATION=${implementation}`);
if (BigInt(implementation) === 0n) throw new Error("Validator EIP-1967 implementation is zero");
await requireCode("VALIDATOR_IMPLEMENTATION", implementation);

const [hasRoleSelector, registeredSelector, rulesSelector, decimalsSelector, supplySelector, pausedSelector] =
  await Promise.all([
    selector("hasRole(bytes32,address)"),
    selector("isRegistered(address)"),
    selector("getRulesV2(address)"),
    selector("decimals()"),
    selector("totalSupply()"),
    selector("paused()"),
  ]);
const registerRole = await roleId("REGISTER_ROLE");

const roleData = `${hasRoleSelector}${word(registerRole)}${addressWord(factory)}`;
const hasRegisterRole = boolResult(await call(validator, roleData, "FACTORY_REGISTER_ROLE"), "hasRole");
console.log(`REGISTER_ROLE=${registerRole}`);
console.log(`FACTORY_HAS_REGISTER_ROLE=${hasRegisterRole}`);

const registrationData = `${registeredSelector}${addressWord(vault)}`;
const registered = boolResult(await call(validator, registrationData, "VAULT_REGISTERED"), "isRegistered");
console.log(`VAULT_REGISTERED=${registered}`);

const rulesData = `${rulesSelector}${addressWord(vault)}`;
const encodedRules = await call(validator, rulesData, "VAULT_RULES", { optional: true });
if (encodedRules !== undefined) {
  const rules = decodeRulesV2(encodedRules);
  console.log(`VAULT_RULE_COUNT=${rules.length}`);
  rules.forEach((rule, index) => {
    console.log(
      `VAULT_RULE_${index}=${[
        rule.allowedGroup,
        rule.allowedSubGroup,
        rule.minTier,
        rule.minSubTier,
        `0x${rule.poolCountryBitmap.toString(16)}`,
      ].join(",")}`
    );
  });
  console.log(`VAULT_HAS_UNRESTRICTED_RULE=${rules.some((rule) => rule.unrestricted)}`);
  console.log(`VAULT_RULES_SHA256=${await sha256(encodedRules)}`);
}

const decimals = uintResult(await call(cva, decimalsSelector, "CVA_DECIMALS"), "decimals");
const totalSupply = uintResult(await call(cva, supplySelector, "CVA_TOTAL_SUPPLY"), "totalSupply");
console.log(`CVA_DECIMALS=${decimals}`);
console.log(`CVA_TOTAL_SUPPLY=${totalSupply}`);

const pausedData = await call(cva, pausedSelector, "CVA_PAUSED", { optional: true });
if (pausedData !== undefined) console.log(`CVA_PAUSED=${boolResult(pausedData, "paused")}`);

console.log(`PREFLIGHT_TARGETS=${[validator, factory, vault, cva].map(short).join(",")}`);
console.log("READ_ONLY_PREFLIGHT=PASS");
console.log("LIVE_MUTATIONS=DISABLED");

async function sha256(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}
