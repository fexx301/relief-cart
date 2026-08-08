import type {
  ClaimPack,
  ExtractedIncident,
  PlanItem,
  QuoteResult,
  TravelerNeeds,
} from "../types/index.js";

export function buildClaimPack(input: {
  incident: ExtractedIncident;
  needs: TravelerNeeds;
  primary: PlanItem;
  quote: QuoteResult;
  orderId: string | null;
  remainingBudgetBefore: number;
  remainingBudgetAfter: number | null;
}): ClaimPack {
  const { incident, needs, primary, quote, orderId, remainingBudgetBefore, remainingBudgetAfter } =
    input;

  return {
    generatedAt: new Date().toISOString(),
    disclaimer:
      "This packet supports a reimbursement claim. It does not guarantee airline approval. Amounts are actual purchase totals; keep original merchant receipts.",
    incident,
    needs,
    product: {
      title: primary.product.title,
      category: primary.product.category,
      rationale: primary.product.rationale,
      unitPrice: primary.product.unitPrice,
      merchantName: quote.merchantName,
      orderId,
    },
    policyCitations: primary.decision.citations,
    eligibilityLanguage:
      primary.decision.reimbursableLanguage ??
      "Supported as a reasonable delayed-baggage incidental purchase under cited policy language",
    amounts: {
      quotedTotal: quote.totalAmount,
      currency: quote.currency,
      remainingBudgetBefore,
      remainingBudgetAfter,
    },
    controlLayers: [
      { control: "Category allow/deny list", layer: "deterministically-verified" },
      { control: "Hard budget cap (min of policy daily cap and personal cap)", layer: "deterministically-verified" },
      { control: "Policy citation required before eligible label", layer: "deterministically-verified" },
      { control: "Exact-total sandbox transaction must match quote", layer: "sandbox-enforced" },
      { control: "Sandbox approval before checkout", layer: "sandbox-enforced" },
      { control: "Need prioritization (clothing vs toiletries)", layer: "model-inferred" },
    ],
  };
}
