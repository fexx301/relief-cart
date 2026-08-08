const baseUrl = requiredEnv("CLEANVERSE_BASE_URL");
const apiId = requiredEnv("CLEANVERSE_API_ID");
const chain = requiredEnv("CLEANVERSE_CHAIN").toLowerCase();
const cva = address("CLEANVERSE_ATOKEN_ADDRESS");
const subjects = [
  ["BENEFICIARY", address("CLEANVERSE_TRAVELLER_ADDRESS")],
  ["MERCHANT", address("CLEANVERSE_VALID_MERCHANT_ADDRESS")],
];

const parsedBase = new URL(baseUrl);
if (parsedBase.protocol !== "https:" || parsedBase.hostname !== "uatapi.cleanverse.com") {
  throw new Error("A-Pass preflight is restricted to the Cleanverse UAT host");
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

function endpoint(path) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalized);
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

function bounded(value) {
  if (value === undefined || value === null || value === "") return "UNSPECIFIED";
  if (Array.isArray(value)) return value.map(String).join(",") || "UNSPECIFIED";
  if (typeof value === "object") return "PRESENT_REDACTED";
  const text = String(value);
  return text.length <= 32 ? text : "PRESENT_REDACTED";
}

async function post(path, body) {
  const response = await fetch(endpoint(path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-id": apiId,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path} returned non-JSON HTTP ${response.status}`);
  }
  const code = findValue(payload, ["code"]);
  if (response.status < 200 || response.status >= 300 || String(code) !== "0000") {
    const message = findValue(payload, ["message", "msg", "error"]);
    throw new Error(`${path} failed: HTTP ${response.status}, code=${String(code)}, message=${String(message)}`);
  }
  return payload;
}

const now = Math.floor(Date.now() / 1000);
const tiers = [];

for (const [label, subject] of subjects) {
  const query = await post("/query_apass", { chain, address: subject });
  const status = Number(findValue(query, ["status"]));
  const expirationTime = Number(findValue(query, ["expirationTime", "expiration_time"]));
  const tier = Number(findValue(query, ["tier"]));
  const subTier = Number(findValue(query, ["subTier", "sub_tier"]));
  const group = findValue(query, ["group", "groupCode", "group_code"]);
  const subGroup = findValue(query, ["subGroup", "sub_group", "subGroupCode", "sub_group_code"]);
  const countries = findValue(query, ["countries", "countryList", "country_list", "country"]);

  if (status !== 1) throw new Error(`${label} A-Pass is not active`);
  if (!Number.isFinite(expirationTime) || expirationTime <= now) throw new Error(`${label} A-Pass is expired or malformed`);
  if (!Number.isInteger(tier) || tier < 0 || tier > 255) throw new Error(`${label} tier is malformed`);

  const verification = await post("/verify_apass", { chain, atoken: cva, address: subject });
  const verificationData = verification?.data && typeof verification.data === "object" ? verification.data : undefined;
  const verificationCode = Number(findValue(verificationData, ["code"]));
  if (verificationCode !== 4) throw new Error(`${label} verify_apass returned code ${verificationCode}`);

  tiers.push(tier);
  console.log(`${label}_ADDRESS=${subject}`);
  console.log(`${label}_APASS_STATUS=${status}`);
  console.log(`${label}_APASS_EXPIRES_AT=${expirationTime}`);
  console.log(`${label}_TIER=${tier}`);
  console.log(`${label}_SUB_TIER=${Number.isInteger(subTier) ? subTier : "UNSPECIFIED"}`);
  console.log(`${label}_GROUP=${bounded(group)}`);
  console.log(`${label}_SUB_GROUP=${bounded(subGroup)}`);
  console.log(`${label}_COUNTRIES=${bounded(countries)}`);
  console.log(`${label}_VERIFY_APASS_CODE=${verificationCode}`);
}

console.log(`SAFE_SHARED_MIN_TIER=${Math.min(...tiers)}`);
console.log("APASS_PREFLIGHT=PASS");
