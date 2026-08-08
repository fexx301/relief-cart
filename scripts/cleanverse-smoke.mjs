import crypto from "node:crypto";

const required = [
  "CLEANVERSE_BASE_URL",
  "CLEANVERSE_API_ID",
  "CLEANVERSE_API_KEY",
  "CLEANVERSE_CHAIN",
  "CLEANVERSE_ADMIN_ADDRESS",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const baseUrl = process.env.CLEANVERSE_BASE_URL;
const apiId = process.env.CLEANVERSE_API_ID;
const apiKey = process.env.CLEANVERSE_API_KEY;
const chain = process.env.CLEANVERSE_CHAIN;
const probeAddress = process.env.CLEANVERSE_ADMIN_ADDRESS;

if (!/^0x[0-9a-fA-F]{40}$/.test(probeAddress)) {
  throw new Error("CLEANVERSE_ADMIN_ADDRESS must be a 20-byte EVM address");
}

const key = Buffer.from(apiKey, "base64");
if (![16, 24, 32].includes(key.length)) {
  throw new Error("CLEANVERSE_API_KEY did not decode to a valid AES key length");
}

function encryptMutation(payload) {
  const cipher = crypto.createCipheriv(`aes-${key.length * 8}-cbc`, key, Buffer.alloc(16));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]).toString("base64");
  return { data: ciphertext };
}

function endpoint(path) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase);
}

async function request(method, path, body, encrypted) {
  const response = await fetch(endpoint(path), {
    method,
    headers: {
      "content-type": "application/json",
      "api-id": apiId,
    },
    body: body === undefined ? undefined : JSON.stringify(encrypted ? encryptMutation(body) : body),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { rawType: "non_json_response", rawLength: text.length };
  }

  return { status: response.status, payload };
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

function short(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  return text.length > 18 ? `${text.slice(0, 10)}…${text.slice(-6)}` : text;
}

function summary(result) {
  const { payload } = result;
  return {
    httpStatus: result.status,
    topLevelCode: short(findValue(payload, ["code"])),
    businessCode: short(payload?.data && typeof payload.data === "object" ? payload.data.code : undefined),
    message: findValue(payload, ["message", "msg", "error"]),
    cvRecordId: short(findValue(payload, ["cvRecordId", "cv_record_id"])),
    requestId: short(findValue(payload, ["requestId", "request_id"])),
    issueAssetId: short(findValue(payload, ["issueAssetId", "issue_asset_id"])),
    applyStatus: findValue(payload, ["applyStatus", "apply_status"]),
    atokenAddress: short(findValue(payload, ["atokenAddress", "atoken_address"])),
    txHash: short(findValue(payload, ["txHash", "tx_hash"])),
  };
}

function requireTopLevelSuccess(label, result) {
  const code = findValue(result.payload, ["code"]);
  if (result.status < 200 || result.status >= 300 || String(code) !== "0000") {
    throw new Error(`${label} failed: ${JSON.stringify(summary(result))}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

console.log(`Cleanverse UAT probe: chain=${chain}, address=${short(probeAddress)}`);

const customerId = `RELIEFCART${Date.now()}TEST`;
const expirationTime = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

const apass = await request("POST", "/generate_apass", {
  customerId,
  expirationTime,
  wallet: { address: probeAddress, chain },
}, true);
console.log("generate_apass", JSON.stringify(summary(apass)));
requireTopLevelSuccess("generate_apass", apass);

const queried = await request("POST", "/query_apass", {
  chain,
  address: probeAddress,
}, false);
console.log("query_apass", JSON.stringify(summary(queried)));
requireTopLevelSuccess("query_apass", queried);

const tokenName = `ReliefCart Probe ${Date.now()}`;
const tokenSymbol = `RCP${String(Date.now()).slice(-6)}`;
const launch = await request("POST", "/atoken/launch", {
  chain,
  token_name: tokenName,
  token_symbol: tokenSymbol,
  decimals: 6,
  admin_address: probeAddress,
  rule: {},
  icon: "https://cleanverse.com/favicon.ico",
}, true);
console.log("atoken_launch", JSON.stringify(summary(launch)));
requireTopLevelSuccess("atoken_launch", launch);

const requestId = findValue(launch.payload, ["requestId", "request_id"]);
if (!requestId) throw new Error("atoken_launch returned no requestId");

let issued;
for (let attempt = 1; attempt <= 6; attempt += 1) {
  const status = await request("GET", `/atoken/query_apply_status/${encodeURIComponent(requestId)}`);
  console.log(`atoken_status_${attempt}`, JSON.stringify(summary(status)));
  requireTopLevelSuccess(`query_apply_status_${attempt}`, status);
  issued = status;
  const applyStatus = findValue(status.payload, ["applyStatus", "apply_status"]);
  if (["ISSUED", "REJECTED", "ISSUE_FAILED"].includes(String(applyStatus))) break;
  await sleep(5000);
}

const applyStatus = findValue(issued.payload, ["applyStatus", "apply_status"]);
if (String(applyStatus) !== "ISSUED") {
  throw new Error(`A-Token did not reach ISSUED: ${JSON.stringify(summary(issued))}`);
}

const atokenAddress = findValue(issued.payload, ["atokenAddress", "atoken_address"]);
if (!atokenAddress) throw new Error("ISSUED response returned no A-Token address");

const verification = await request("POST", "/verify_apass", {
  chain,
  atoken: atokenAddress,
  address: probeAddress,
}, false);
console.log("verify_apass", JSON.stringify(summary(verification)));
requireTopLevelSuccess("verify_apass", verification);

const verifyCode = findValue(verification.payload?.data, ["code"]);
console.log(`PROBE_RESULT=${String(verifyCode) === "4" ? "PASS_COMPLIANCE_PREFLIGHT" : "ISSUANCE_SUCCESS_VERIFY_NONPASS"}`);
