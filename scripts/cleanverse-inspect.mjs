const required = ["CLEANVERSE_BASE_URL", "CLEANVERSE_API_ID", "CLEANVERSE_CHAIN", "MONAD_RPC_URL"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const baseUrl = process.env.CLEANVERSE_BASE_URL;
const apiId = process.env.CLEANVERSE_API_ID;
const chain = process.env.CLEANVERSE_CHAIN;
const rpcUrl = process.env.MONAD_RPC_URL;

function endpoint(path) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase);
}

async function cleanverseRequest(method, path, body) {
  const response = await fetch(endpoint(path), {
    method,
    headers: {
      "content-type": "application/json",
      "api-id": apiId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  return response.json();
}

function hexToBigInt(hex) {
  return BigInt(hex || "0x0");
}

function decodeString(hex) {
  if (!hex || hex === "0x") return null;
  const bytes = Buffer.from(hex.slice(2), "hex");
  if (bytes.length === 32) {
    return bytes.toString("utf8").replaceAll("\0", "") || null;
  }
  if (bytes.length < 64) return null;
  const offset = Number(hexToBigInt(`0x${bytes.subarray(0, 32).toString("hex")}`));
  if (offset + 32 > bytes.length) return null;
  const length = Number(hexToBigInt(`0x${bytes.subarray(offset, offset + 32).toString("hex")}`));
  return bytes.subarray(offset + 32, offset + 32 + length).toString("utf8");
}

async function readCall(address, data) {
  const result = await rpc("eth_call", [{ to: address, data }, "latest"]);
  return result.error ? { error: result.error.message ?? "RPC error" } : result.result;
}

const listUrl = new URL(endpoint("/atoken/list_my_atokens"));
listUrl.searchParams.set("page", "1");
listUrl.searchParams.set("page_size", "20");
listUrl.searchParams.set("chain", chain);
listUrl.searchParams.set("apply_status", "ISSUED");
listUrl.searchParams.set("flow_type", "LAUNCH");

const listResponse = await fetch(listUrl, { headers: { "api-id": apiId } });
const listPayload = await listResponse.json();
if (listResponse.status < 200 || listResponse.status >= 300 || String(listPayload.code) !== "0000") {
  throw new Error(`list_my_atokens failed: HTTP ${listResponse.status}, code ${listPayload.code}`);
}

const items = (listPayload.data?.items ?? listPayload.items ?? [])
  .filter((item) => String(item.tokenName ?? "").startsWith("ReliefCart Probe"));
console.log(`ISSUED_TOKENS=${items.length}`);

for (const item of items) {
  const address = item.atokenAddress ?? item.atoken_address;
  const txHash = item.txHash ?? item.tx_hash;
  const row = {
    requestId: item.requestId,
    flowType: item.flowType,
    applyStatus: item.applyStatus,
    chain: item.chain,
    atokenAddress: address,
    tokenSymbol: item.tokenSymbol,
    tokenName: item.tokenName,
    txHash,
    issuedAt: item.issuedAt,
  };

  if (address) {
    const [code, name, symbol, decimals, totalSupply, rules, paused] = await Promise.all([
      rpc("eth_getCode", [address, "latest"]),
      readCall(address, "0x06fdde03"),
      readCall(address, "0x95d89b41"),
      readCall(address, "0x313ce567"),
      readCall(address, "0x18160ddd"),
      cleanverseRequest("POST", "/atoken/rules", { chain, atoken_address: address }),
      cleanverseRequest("POST", "/atoken/is_paused", { chain, atoken_address: address }),
    ]);

    row.bytecodeBytes = code.error ? null : Math.max(0, ((code.result?.length ?? 2) - 2) / 2);
    row.contractMetadata = {
      name: typeof name === "string" && name.startsWith("0x") ? decodeString(name) : name,
      symbol: typeof symbol === "string" && symbol.startsWith("0x") ? decodeString(symbol) : symbol,
      decimals: typeof decimals === "string" && decimals.startsWith("0x") ? Number(hexToBigInt(decimals)) : decimals,
      totalSupply: typeof totalSupply === "string" && totalSupply.startsWith("0x") ? hexToBigInt(totalSupply).toString() : totalSupply,
    };
    row.rulesResponse = { httpStatus: rules.status, code: rules.payload?.code, data: rules.payload?.data };
    row.pausedResponse = { httpStatus: paused.status, code: paused.payload?.code, data: paused.payload?.data };
  }

  if (txHash) {
    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    row.receipt = receipt.error ? { error: receipt.error.message } : receipt.result ? {
      status: receipt.result.status,
      blockNumber: receipt.result.blockNumber,
      transactionIndex: receipt.result.transactionIndex,
      contractAddress: receipt.result.contractAddress,
      logCount: receipt.result.logs?.length ?? 0,
    } : null;
  }

  console.log(JSON.stringify(row, null, 2));
}
