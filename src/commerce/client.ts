import { nanoid } from "nanoid";
import { getMerchant, getProductByVariant } from "../policy/engine.js";
import type { CheckoutResult, PaymentSession, QuoteResult } from "../types/index.js";

export interface CommerceClient {
  listAddresses(): Promise<Array<{ id: string; label: string; summary: string; isDefault: boolean }>>;
  quote(input: {
    variantId: string;
    quantity?: number;
    addressId?: string;
  }): Promise<QuoteResult>;
  createPaymentSession(input: {
    totalAmount: string;
    currency: string;
    merchantName: string;
    merchantUrl: string;
    merchantCountry: string;
    products: Array<{ description: string; unit_price: string; quantity?: number }>;
    idempotencyKey: string;
  }): Promise<PaymentSession>;
  getPaymentStatus(sessionId: string): Promise<PaymentSession["status"]>;
  /** Sandbox helper: approve a local transaction without an external provider. */
  approvePayment?(sessionId: string): Promise<PaymentSession>;
  /** Sandbox helper: decline a local transaction without creating an order. */
  declinePayment?(sessionId: string): Promise<PaymentSession>;
  checkout(input: {
    checkoutSessionId: string;
    paymentSessionId: string;
  }): Promise<CheckoutResult>;
}

const sandboxPayments = new Map<string, PaymentSession>();
const sandboxQuotes = new Map<string, QuoteResult>();
const sandboxPaymentIdempotency = new Map<string, string>();
const sandboxOrders = new Map<string, CheckoutResult>();

export function createSandboxCommerceClient(): CommerceClient {
  return {
    async listAddresses() {
      return [
        {
          id: "addr_demo_sf",
          label: "Demo US (San Francisco)",
          summary: "Hotel Zetta area · San Francisco, CA · US",
          isDefault: true,
        },
      ];
    },
    async quote({ variantId, quantity = 1, addressId }) {
      const product = getProductByVariant(variantId);
      if (!product) throw new Error(`Unknown variant ${variantId}`);
      const merchant = getMerchant();
      const unit = Number(product.unitPrice);
      const subtotal = unit * quantity;
      const shipping = subtotal >= 50 ? 0 : 5.99;
      const tax = Math.round(subtotal * 0.0875 * 100) / 100;
      const total = Math.round((subtotal + shipping + tax) * 100) / 100;
      const checkoutSessionId = `chk_${nanoid(10)}`;
      const quote: QuoteResult = {
        checkoutSessionId,
        variantId,
        merchantName: merchant.name,
        merchantUrl: merchant.url,
        merchantCountry: merchant.country,
        quantity,
        subtotal: subtotal.toFixed(2),
        shipping: shipping.toFixed(2),
        tax: tax.toFixed(2),
        totalAmount: total.toFixed(2),
        currency: product.currency,
        addressId: addressId ?? "addr_demo_sf",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
      sandboxQuotes.set(checkoutSessionId, quote);
      return quote;
    },
    async createPaymentSession(input) {
      const existingSessionId = sandboxPaymentIdempotency.get(input.idempotencyKey);
      if (existingSessionId) {
        const existing = sandboxPayments.get(existingSessionId);
        if (existing) return existing;
      }

      const sessionId = `pay_${nanoid(10)}`;
      const session: PaymentSession = {
        sessionId,
        paymentUrl: `/mock-pay/${sessionId}`,
        status: "pending",
        totalAmount: input.totalAmount,
        currency: input.currency,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        merchantName: input.merchantName,
      };
      sandboxPayments.set(sessionId, session);
      sandboxPaymentIdempotency.set(input.idempotencyKey, sessionId);
      return session;
    },
    async getPaymentStatus(sessionId) {
      return sandboxPayments.get(sessionId)?.status ?? "failed";
    },
    async approvePayment(sessionId) {
      const session = sandboxPayments.get(sessionId);
      if (!session) throw new Error("Payment session not found");
      session.status = "completed";
      sandboxPayments.set(sessionId, session);
      return session;
    },
    async declinePayment(sessionId) {
      const session = sandboxPayments.get(sessionId);
      if (!session) throw new Error("Payment session not found");
      session.status = "failed";
      sandboxPayments.set(sessionId, session);
      return session;
    },
    async checkout({ checkoutSessionId, paymentSessionId }) {
      const existingOrder = sandboxOrders.get(paymentSessionId);
      if (existingOrder) return { ...existingOrder, replayed: true };

      const quote = sandboxQuotes.get(checkoutSessionId);
      const payment = sandboxPayments.get(paymentSessionId);
      if (!quote) throw new Error("Checkout session not found / expired");
      if (!payment) throw new Error("Payment session not found");
      if (payment.status !== "completed") {
        return { status: "payment_not_approved", orderId: null, amount: null };
      }
      if (payment.totalAmount !== quote.totalAmount) {
        throw new Error(
          `Amount mismatch: payment ${payment.totalAmount} vs quote ${quote.totalAmount}`,
        );
      }
      const order: CheckoutResult = {
        status: "placed",
        orderId: `ord_sandbox_${nanoid(8)}`,
        amount: quote.totalAmount,
        replayed: false,
      };
      sandboxOrders.set(paymentSessionId, order);
      return order;
    },
  };
}
