import crypto from "node:crypto";

const args = process.argv.slice(2);
const modes = [
  "--offline",
  "--check-registration",
  "--prepare-grant",
  "--prepare-register",
].filter((mode) => args.includes(mode));

if (args.includes("--execute")) {
  throw new Error(
    "Live validator mutations are intentionally disabled until Cleanverse confirms signer and registration semantics."
  );
}

if (modes.length > 1) throw new Error(`Choose one mode, received: ${modes.join(", ")}`);
const mode = modes[0] ?? "--offline";

function option(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assertAddress(name, value) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be a 20-byte EVM address`);
  }
  return value.toLowerCase();
}

function assertChain(value) {
  if (!/^[a-z0-9_-]+$/i.test(value)) throw new Error("CLEANVERSE_CHAIN contains unsupported characters");
  return value.toLowerCase();
}

const chain = assertChain(requiredEnv("CLEANVERSE_CHAIN"));
const needsEncryption = mode === "--offline";
const aesKey = needsEncryption ? Buffer.from(requiredEnv("CLEANVERSE_API_KEY"), "base64") : undefined;
if (needsEncryption && ![16, 24, 32].includes(aesKey.length)) {
  throw new Error("CLEANVERSE_API_KEY did not decode to a valid AES key length");
}

const baseUrl = process.env.CLEANVERSE_BASE_URL;
if (mode === "--check-registration" && !baseUrl) throw new Error("Missing CLEANVERSE_BASE_URL");

function encryptMutation(payload) {
  if (!aesKey) throw new Error("AES key is unavailable in this mode");
  const cipher = crypto.createCipheriv(`aes-${aesKey.length * 8}-cbc`, aesKey, Buffer.alloc(16));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]).toString("base64");
  return { data: ciphertext };
}

function decryptLocal(envelope) {
  if (!aesKey) throw new Error("AES key is unavailable in this mode");
  const decipher = crypto.createDecipheriv(`aes-${aesKey.length * 8}-cbc`, aesKey, Buffer.alloc(16));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]).toString("utf8"));
}

function canonicalMessage(address) {
  // This is the candidate documented by Cleanverse. It is deliberately not
  // signed here until Cleanverse confirms the exact EIP-191 variant and bytes.
  return `${chain}${address}`.toLowerCase();
}

function digest(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function validateRule(raw) {
  const rule = JSON.parse(raw);
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    throw new Error("--rule must be a JSON object");
  }
  const allowedKeys = new Set([
    "allowed_group",
    "allowed_sub_group",
    "min_tier",
    "min_sub_tier",
    "is_black_list",
    "countries",
  ]);
  for (const key of Object.keys(rule)) {
    if (!allowedKeys.has(key)) throw new Error(`Unsupported rule field: ${key}`);
  }
  for (const key of ["allowed_group", "allowed_sub_group"]) {
    if (rule[key] !== undefined && typeof rule[key] !== "string") {
      throw new Error(`${key} must be a string`);
    }
  }
  for (const key of ["min_tier", "min_sub_tier"]) {
    if (rule[key] !== undefined && (!Number.isInteger(rule[key]) || rule[key] < 0 || rule[key] > 99)) {
      throw new Error(`${key} must be an integer from 0 through 99`);
    }
  }
  if (rule.is_black_list !== undefined && typeof rule.is_black_list !== "boolean") {
    throw new Error("is_black_list must be boolean");
  }
  if (rule.countries !== undefined) {
    if (!Array.isArray(rule.countries) || rule.countries.some((country) => !/^[A-Za-z]{2}$/.test(country))) {
      throw new Error("countries must be an array of ISO alpha-2 strings");
    }
  }
  return rule;
}

function summarizeValue(value, names) {
  if (!value || typeof value !== "object") return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(value, name)) return value[name];
  }
  for (const child of Object.values(value)) {
    const found = summarizeValue(child, names);
    if (found !== undefined) return found;
  }
  return undefined;
}

function endpoint(path) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalized);
}

async function checkRegistration(target) {
  const apiId = requiredEnv("CLEANVERSE_API_ID");
  const response = await fetch(endpoint("/validator/is_register"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-id": apiId,
    },
    body: JSON.stringify({ chain, contract_address: target }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Registration check returned non-JSON HTTP ${response.status}`);
  }
  const code = summarizeValue(payload, ["code"]);
  const registered = summarizeValue(payload, ["registered", "is_register", "isRegistered"]);
  if (response.status < 200 || response.status >= 300 || String(code) !== "0000") {
    throw new Error(`Registration check failed: HTTP ${response.status}, code=${String(code)}`);
  }
  console.log(`REGISTRATION_TARGET=${target}`);
  console.log(`REGISTERED=${String(registered)}`);
  console.log("READ_ONLY_RESULT=PASS");
}

function localCodecSelfTest() {
  const sample = {
    chain,
    address: "0x0000000000000000000000000000000000000001",
    owner_signature: "0x00",
  };
  const envelope = encryptMutation(sample);
  const recovered = decryptLocal(envelope);
  if (JSON.stringify(recovered) !== JSON.stringify(sample)) {
    throw new Error("Local AES-CBC round-trip failed");
  }
  console.log("LOCAL_AES_CBC_ROUND_TRIP=PASS");
  console.log("LOCAL_CODEC_RESULT=PASS_LOCAL_ONLY");
  console.log("VENDOR_COMPATIBILITY=UNPROVEN_NEEDS_TEST_VECTOR");
  console.log("LIVE_MUTATIONS=DISABLED");
}

if (mode === "--offline") {
  localCodecSelfTest();
} else if (mode === "--check-registration") {
  const target = assertAddress("--target", option("--target"));
  await checkRegistration(target);
} else if (mode === "--prepare-grant") {
  const address = assertAddress("--address", option("--address"));
  console.log(`GRANT_ADDRESS=${address}`);
  console.log(`CANDIDATE_MESSAGE_SHA256=${digest(canonicalMessage(address))}`);
  console.log("SIGNATURE=NOT_GENERATED");
  console.log("REASON=vendor must confirm exact EIP-191 bytes and signer");
  console.log("MUTATION=DISABLED");
} else if (mode === "--prepare-register") {
  const contractAddress = assertAddress("--contract", option("--contract"));
  const rule = validateRule(option("--rule") ?? "{}");
  console.log(`REGISTER_CONTRACT=${contractAddress}`);
  console.log(`CANDIDATE_MESSAGE_SHA256=${digest(canonicalMessage(contractAddress))}`);
  console.log(`RULE_FIELDS=${Object.keys(rule).sort().join(",") || "none"}`);
  console.log("SIGNATURE=NOT_GENERATED");
  console.log("REASON=vendor must confirm exact EIP-191 bytes, signer, and target");
  console.log("MUTATION=DISABLED");
}
