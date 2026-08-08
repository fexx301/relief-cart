import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  approveMockPayment,
  completeCheckout,
  createCase,
  declineMockPayment,
  quoteCase,
  startPayment,
} from "../src/agent/caseStore.js";
import { createSandboxCommerceClient } from "../src/commerce/client.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoPir = readFileSync(path.join(root, "src/data/demo-incident.txt"), "utf8");

function newCase() {
  return createCase({
    rawIncidentText: demoPir,
    airlineHint: "united",
    needs: {
      size: "M",
      urgentNeed: "clothing",
      alreadyHas: ["phone", "laptop", "charger"],
      personalCapUsd: 150,
      nights: 1,
    },
  });
}

describe("ReliefCart transaction workflow", () => {
  it("returns the same payment session and order for duplicate submissions", async () => {
    const commerce = createSandboxCommerceClient();
    const reliefCase = newCase();

    await quoteCase(reliefCase, commerce);
    await startPayment(reliefCase, commerce);
    const firstSessionId = reliefCase.payment?.sessionId;
    await startPayment(reliefCase, commerce);
    assert.equal(reliefCase.payment?.sessionId, firstSessionId);

    await approveMockPayment(reliefCase, commerce);
    await completeCheckout(reliefCase, commerce);
    const firstOrderId = reliefCase.checkout?.orderId;
    await completeCheckout(reliefCase, commerce);

    assert.ok(firstOrderId);
    assert.equal(reliefCase.checkout?.orderId, firstOrderId);
  });

  it("never checks out before approval and preserves a declined no-order state", async () => {
    const commerce = createSandboxCommerceClient();
    const reliefCase = newCase();

    await quoteCase(reliefCase, commerce);
    await startPayment(reliefCase, commerce);
    await completeCheckout(reliefCase, commerce);
    assert.equal(reliefCase.checkout?.orderId, null);
    assert.equal(reliefCase.status, "awaiting_payment");

    await declineMockPayment(reliefCase, commerce);
    await completeCheckout(reliefCase, commerce);
    assert.equal(reliefCase.checkout?.orderId, null);
    assert.equal(reliefCase.status, "quoted");
    assert.match(reliefCase.error ?? "", /no order was placed/i);
  });

  it("invalidates approval after a fresh quote changes the total", async () => {
    const commerce = createSandboxCommerceClient();
    const baseQuote = commerce.quote.bind(commerce);
    let quoteCount = 0;
    commerce.quote = async (input) => {
      const quote = await baseQuote(input);
      quoteCount += 1;
      if (quoteCount === 2) {
        quote.totalAmount = (Number(quote.totalAmount) + 3.25).toFixed(2);
      }
      return quote;
    };

    const reliefCase = newCase();
    await quoteCase(reliefCase, commerce);
    await startPayment(reliefCase, commerce);
    const originalSession = reliefCase.payment?.sessionId;
    const originalTotal = reliefCase.payment?.totalAmount;

    await quoteCase(reliefCase, commerce);
    assert.equal(reliefCase.payment, null);
    assert.notEqual(reliefCase.quote?.totalAmount, originalTotal);

    const refreshedCase = await startPayment(reliefCase, commerce);
    assert.notEqual(refreshedCase.payment?.sessionId, originalSession);
    assert.equal(refreshedCase.payment?.totalAmount, refreshedCase.quote?.totalAmount);
  });

  it("requires a fresh quote when the current quote has expired", async () => {
    const commerce = createSandboxCommerceClient();
    const reliefCase = newCase();
    await quoteCase(reliefCase, commerce);
    assert.ok(reliefCase.quote);
    reliefCase.quote.expiresAt = new Date(Date.now() - 1_000).toISOString();

    await startPayment(reliefCase, commerce);
    assert.equal(reliefCase.status, "planned");
    assert.equal(reliefCase.quote, null);
    assert.equal(reliefCase.payment, null);
    assert.match(reliefCase.error ?? "", /quote expired/i);
  });

  it("generates a claim packet with citations, uncertainty, and order id", async () => {
    const commerce = createSandboxCommerceClient();
    const reliefCase = newCase();

    await quoteCase(reliefCase, commerce);
    await startPayment(reliefCase, commerce);
    assert.equal(reliefCase.payment?.totalAmount, reliefCase.quote?.totalAmount);
    await approveMockPayment(reliefCase, commerce);
    await completeCheckout(reliefCase, commerce);

    assert.ok(reliefCase.claimPack?.product.orderId);
    assert.ok(reliefCase.claimPack?.policyCitations.every((source) => source.url.startsWith("http")));
    assert.match(
      reliefCase.claimPack?.incident.reimbursementUncertainty ?? "",
      /not guaranteed/i,
    );
  });
});
