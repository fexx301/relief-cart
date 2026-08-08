import crypto from "node:crypto";

if (!process.argv.includes("--execute")) {
  throw new Error("A-Pass issuance requires an explicit --execute flag");
}

const baseUrl = requiredEnv("CLEANVERSE_BASE_URL");
const apiId = requiredEnv("CLEANVERSE_API_ID");
const apiKey = Buffer.from(requiredEnv("CLEANVERSE_API_KEY"), "base64");
const chain = requiredEnv("CLEANVERSE_CHAIN").toLowerCase();
const merchant = address("CLEANVERSE_VALID_MERCHANT_ADDRESS");
const cva = address("CLEANVERSE_ATOKEN_ADDRESS");

if (![16, 24, 32].includes(apiKey.length)) {
  throw new Error("CLEANVERSE_API_KEY did not decode to a valid AES key length");
}
const parsedBase = new URL(baseUrl);
if (parsedBase.protocol !== "https:" || parsedBase.hostname !== "uatapi.cleanverse.com") {
  throw new Error("A-Pass issuance is restricted to the Cleanverse UAT host");
}
if (chain !== "monad") throw new Error("A-Pass issuance is restricted to CLEANVERSE_CHAIN=monad");

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

function encryptMutation(payload) {
  const cipher = crypto.createCipheriv(`aes-${apiKey.length * 8}-cbc`, apiKey, Buffer.alloc(16));
  return {
    data: Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload), "utf8")), cipher.final()]).toString(
      "base64"
    ),
  };
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

async function post(path, body, encrypted = false) {
  const response = await fetch(endpoint(path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-id": apiId,
    },
    body: JSON.stringify(encrypted ? encryptMutation(body) : body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path} returned non-JSON HTTP ${response.status}`);
  }
  const code = findValue(payload, ["code"]);
  return { response, payload, code };
}

function requireSuccess(label, result) {
  if (result.response.status < 200 || result.response.status >= 300 || String(result.code) !== "0000") {
    const message = findValue(result.payload, ["message", "msg", "error"]);
    throw new Error(
      `${label} failed: HTTP ${result.response.status}, code=${String(result.code)}, message=${String(message)}`
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function query() {
  return post("/query_apass", { chain, address: merchant });
}

const existing = await query();
if (String(existing.code) === "0000") {
  console.log("APASS_ISSUE_RESULT=ALREADY_EXISTS");
} else {
  const expirationTime = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const customerId = `RELIEFCARTMERCHANT${Date.now()}`;
  const issued = await post(
    "/generate_apass",
    {
      customerId,
      expirationTime,
      wallet: { address: merchant, chain },
    },
    true
  );
  requireSuccess("generate_apass", issued);
  const txCandidate = findValue(issued.payload, ["txHash", "tx_hash", "transactionHash", "transaction_hash"]);
  if (typeof txCandidate === "string" && /^0x[0-9a-fA-F]{64}$/.test(txCandidate)) {
    console.log(`APASS_ISSUANCE_TX=${txCandidate.toLowerCase()}`);
  } else {
    console.log("APASS_ISSUANCE_TX=UNAVAILABLE_FROM_BOUNDED_RESPONSE");
  }
  console.log(`REQUEST_SUMMARY_SHA256=${crypto.createHash("sha256").update(`${chain}:${merchant}`).digest("hex")}`);
}

let active;
for (let attempt = 0; attempt < 30; attempt += 1) {
  const result = await query();
  if (String(result.code) === "0000") {
    const status = Number(findValue(result.payload, ["status"]));
    const expirationTime = Number(findValue(result.payload, ["expirationTime", "expiration_time"]));
    const tier = Number(findValue(result.payload, ["tier"]));
    if (status === 1 && Number.isFinite(expirationTime) && expirationTime > Date.now() / 1000) {
      active = { status, expirationTime, tier };
      break;
    }
  }
  await sleep(3_000);
}
if (!active) throw new Error("Merchant A-Pass did not become active within 90 seconds");

const verification = await post("/verify_apass", { chain, atoken: cva, address: merchant });
requireSuccess("verify_apass", verification);
const verificationData =
  verification.payload?.data && typeof verification.payload.data === "object" ? verification.payload.data : undefined;
const verificationCode = Number(findValue(verificationData, ["code"]));
if (verificationCode !== 4) throw new Error(`Merchant verify_apass returned code ${verificationCode}`);

console.log(`MERCHANT_ADDRESS=${merchant}`);
console.log(`MERCHANT_APASS_STATUS=${active.status}`);
console.log(`MERCHANT_APASS_EXPIRES_AT=${active.expirationTime}`);
console.log(`MERCHANT_TIER=${active.tier}`);
console.log(`MERCHANT_VERIFY_APASS_CODE=${verificationCode}`);
console.log("APASS_ISSUE_RESULT=PASS");
