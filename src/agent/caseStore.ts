import { nanoid } from "nanoid";
import { buildPlan, parseIncidentText } from "../policy/engine.js";
import { buildClaimPack } from "./claimPack.js";
import type { CommerceClient } from "../commerce/client.js";
import type { ReliefCase, TravelerNeeds } from "../types/index.js";

const cases = new Map<string, ReliefCase>();

export function getCase(id: string): ReliefCase | undefined {
  return cases.get(id);
}

export function getCaseByPaymentSession(sessionId: string): ReliefCase | undefined {
  return [...cases.values()].find((item) => item.payment?.sessionId === sessionId);
}

export function createCase(input: {
  rawIncidentText: string;
  needs: TravelerNeeds;
  airlineHint?: string;
}): ReliefCase {
  const incident = parseIncidentText(input.rawIncidentText, input.airlineHint);
  const plan = buildPlan(incident, input.needs);

  let status: ReliefCase["status"] = "planned";
  let error: string | null = null;

  if (incident.missingClaimReference) {
    status = "aborted";
    error = "Missing claim/PIR reference — agent will not purchase until provided.";
  } else if (!plan.primary) {
    status = "aborted";
    error = "No eligible item under policy + budget + size constraints (fail-closed).";
  }

  const c: ReliefCase = {
    id: `case_${nanoid(8)}`,
    createdAt: new Date().toISOString(),
    status,
    rawIncidentText: input.rawIncidentText,
    incident,
    needs: input.needs,
    plan,
    selectedVariantId: plan.primary?.product.variantId ?? null,
    quote: null,
    payment: null,
    checkout: null,
    claimPack: null,
    idempotencyKey: `relief_${nanoid(12)}`,
    error,
  };
  cases.set(c.id, c);
  return c;
}

export async function quoteCase(c: ReliefCase, commerce: CommerceClient): Promise<ReliefCase> {
  if (c.status === "aborted") return c;
  if (c.status === "checked_out") return c;
  if (!c.selectedVariantId || !c.plan?.primary) {
    c.status = "failed";
    c.error = "No selected variant";
    cases.set(c.id, c);
    return c;
  }
  const addresses = await commerce.listAddresses();
  const addressId = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id;
  if (!addressId) {
    c.status = "failed";
    c.error = "No permitted US delivery address is available for quoting.";
    cases.set(c.id, c);
    return c;
  }

  const previousQuote = c.quote;
  const quote = await commerce.quote({
    variantId: c.selectedVariantId,
    quantity: 1,
    addressId,
  });

  // SpecLock: quote total must still fit effective cap (tax/shipping may push over)
  const total = Number(quote.totalAmount);
  if (total > c.plan.effectiveCapUsd) {
    c.status = "aborted";
    c.error = `Quoted total $${quote.totalAmount} exceeds effective cap $${c.plan.effectiveCapUsd} (tax/shipping). Fail-closed.`;
    c.quote = quote;
    c.payment = null;
    c.checkout = null;
    c.claimPack = null;
    cases.set(c.id, c);
    return c;
  }

  if (previousQuote && previousQuote.checkoutSessionId !== quote.checkoutSessionId) {
    c.payment = null;
    c.checkout = null;
    c.claimPack = null;
  }

  c.quote = quote;
  c.idempotencyKey = `relief_${c.id}_${quote.checkoutSessionId}`;
  c.status = "quoted";
  c.error = null;
  cases.set(c.id, c);
  return c;
}

export async function startPayment(c: ReliefCase, commerce: CommerceClient): Promise<ReliefCase> {
  if (!c.quote || !c.plan?.primary) {
    c.status = "failed";
    c.error = "Quote required before payment";
    cases.set(c.id, c);
    return c;
  }

  if (new Date(c.quote.expiresAt).getTime() <= Date.now()) {
    c.status = "planned";
    c.quote = null;
    c.payment = null;
    c.error = "Quote expired. Request a fresh quote before approval.";
    cases.set(c.id, c);
    return c;
  }

  if (
    c.payment &&
    c.payment.status !== "failed" &&
    c.payment.totalAmount === c.quote.totalAmount &&
    c.payment.currency === c.quote.currency
  ) {
    c.status = c.payment.status === "completed" ? "paid" : "awaiting_payment";
    cases.set(c.id, c);
    return c;
  }

  if (c.payment?.status === "failed") {
    c.idempotencyKey = `relief_${c.id}_${c.quote.checkoutSessionId}_retry_${nanoid(6)}`;
  }

  const payment = await commerce.createPaymentSession({
    totalAmount: c.quote.totalAmount,
    currency: c.quote.currency,
    merchantName: c.quote.merchantName,
    merchantUrl: c.quote.merchantUrl,
    merchantCountry: c.quote.merchantCountry,
    products: [
      {
        description: c.plan.primary.product.title,
        unit_price: c.plan.primary.product.unitPrice,
        quantity: 1,
      },
    ],
    idempotencyKey: c.idempotencyKey,
  });
  c.payment = payment;
  c.status = "awaiting_payment";
  cases.set(c.id, c);
  return c;
}

export async function approveMockPayment(c: ReliefCase, commerce: CommerceClient): Promise<ReliefCase> {
  if (!c.payment) throw new Error("No payment session");
  if (!commerce.approvePayment) throw new Error("Approve only available in sandbox mode");
  c.payment = await commerce.approvePayment(c.payment.sessionId);
  c.status = "paid";
  c.error = null;
  cases.set(c.id, c);
  return c;
}

export async function declineMockPayment(c: ReliefCase, commerce: CommerceClient): Promise<ReliefCase> {
  if (!c.payment) throw new Error("No payment session");
  if (!commerce.declinePayment) throw new Error("Decline only available in sandbox mode");
  c.payment = await commerce.declinePayment(c.payment.sessionId);
  c.status = "quoted";
  c.error = "Payment declined. No order was placed.";
  cases.set(c.id, c);
  return c;
}

export async function refreshPayment(c: ReliefCase, commerce: CommerceClient): Promise<ReliefCase> {
  if (!c.payment) return c;
  const status = await commerce.getPaymentStatus(c.payment.sessionId);
  c.payment.status = status;
  if (status === "completed") {
    c.status = "paid";
    c.error = null;
  } else if (status === "failed") {
    c.status = "quoted";
    c.error = "Payment declined or failed. No order was placed.";
  } else {
    c.status = "awaiting_payment";
  }
  cases.set(c.id, c);
  return c;
}

export async function completeCheckout(c: ReliefCase, commerce: CommerceClient): Promise<ReliefCase> {
  if (c.status === "checked_out" && c.checkout?.orderId) return c;
  if (!c.quote || !c.payment || !c.plan?.primary) {
    c.status = "failed";
    c.error = "Missing quote/payment/plan";
    cases.set(c.id, c);
    return c;
  }

  if (new Date(c.quote.expiresAt).getTime() <= Date.now()) {
    c.status = "planned";
    c.quote = null;
    c.payment = null;
    c.error = "Quote expired. Re-quote and approve the new total before checkout.";
    cases.set(c.id, c);
    return c;
  }

  if (
    c.payment.totalAmount !== c.quote.totalAmount ||
    c.payment.currency !== c.quote.currency
  ) {
    c.status = "quoted";
    c.payment = null;
    c.error = "The approved amount no longer matches the quote. Fresh approval is required.";
    cases.set(c.id, c);
    return c;
  }

  const status = await commerce.getPaymentStatus(c.payment.sessionId);
  c.payment.status = status;
  if (status !== "completed") {
    c.checkout = { status: "payment_not_approved", orderId: null, amount: null };
    c.status = status === "failed" ? "quoted" : "awaiting_payment";
    c.error =
      status === "failed"
        ? "Payment declined or failed. No order was placed."
        : "Payment not approved yet — use the secure approval link first.";
    cases.set(c.id, c);
    return c;
  }

  const result = await commerce.checkout({
    checkoutSessionId: c.quote.checkoutSessionId,
    paymentSessionId: c.payment.sessionId,
  });
  c.checkout = result;

  if (result.status === "placed" && result.orderId) {
    c.status = "checked_out";
    c.error = null;
    const remainingBefore = c.plan.effectiveCapUsd;
    const remainingAfter = Math.max(0, remainingBefore - Number(c.quote.totalAmount));
    c.claimPack = buildClaimPack({
      incident: c.incident,
      needs: c.needs,
      primary: c.plan.primary,
      quote: c.quote,
      orderId: result.orderId,
      remainingBudgetBefore: remainingBefore,
      remainingBudgetAfter: remainingAfter,
    });
  } else {
    c.status = "failed";
    c.error = "Checkout did not return order_id";
  }
  cases.set(c.id, c);
  return c;
}
