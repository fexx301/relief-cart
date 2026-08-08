export type ControlLayer = "sandbox-enforced" | "deterministically-verified" | "model-inferred";

export type CaseStatus =
  | "intake"
  | "planned"
  | "quoted"
  | "awaiting_payment"
  | "paid"
  | "checked_out"
  | "aborted"
  | "failed";

export interface PolicySource {
  id: string;
  title: string;
  url: string;
  excerpt: string;
}

export interface CategoryRule {
  id: string;
  label: string;
  maxItemUsd: number;
  reimbursableLanguage: string;
}

export interface BlockedCategory {
  id: string;
  label: string;
  reason: string;
}

export interface AirlinePolicy {
  id: string;
  name: string;
  incidentTypes: string[];
  dailyCapUsd: number;
  notes: string;
  sources: PolicySource[];
  eligibleCategories: CategoryRule[];
  blockedCategories: BlockedCategory[];
}

export interface CatalogProduct {
  id: string;
  variantId: string;
  title: string;
  merchant: string;
  category: string;
  size: string | null;
  unitPrice: string;
  currency: string;
  inStock: boolean;
  tags: string[];
  rationale: string;
}

export interface ExtractedIncident {
  airlineId: string;
  airlineName: string;
  claimReference: string | null;
  flight: string | null;
  passengerName: string | null;
  station: string | null;
  status: string;
  nightsUntilBagExpected: number;
  missingClaimReference: boolean;
  knownFacts: string[];
  inferences: string[];
  missingFacts: string[];
  reimbursementUncertainty: string;
}

export interface TravelerNeeds {
  size: string;
  urgentNeed: "clothing" | "toiletries" | "both";
  alreadyHas: string[];
  personalCapUsd: number;
  nights: number;
}

export interface EligibilityDecision {
  allowed: boolean;
  categoryId: string;
  layer: ControlLayer;
  reasons: string[];
  citations: PolicySource[];
  reimbursableLanguage?: string;
}

export interface PlanItem {
  product: CatalogProduct;
  decision: EligibilityDecision;
  unitPriceUsd: number;
  role: "primary" | "alternative" | "rejected";
}

export interface RecoveryPlan {
  remainingBudgetUsd: number;
  policyCapUsd: number;
  personalCapUsd: number;
  effectiveCapUsd: number;
  items: PlanItem[];
  primary: PlanItem | null;
  abstentions: Array<{ title: string; reason: string; layer: ControlLayer }>;
  board: {
    eligibleCategories: string[];
    blockedCategories: string[];
    dailyCapUsd: number;
  };
}

export interface QuoteResult {
  checkoutSessionId: string;
  variantId: string;
  merchantName: string;
  merchantUrl: string;
  merchantCountry: string;
  quantity: number;
  subtotal: string;
  shipping: string;
  tax: string;
  totalAmount: string;
  currency: string;
  addressId: string;
  expiresAt: string;
}

export interface PaymentSession {
  sessionId: string;
  paymentUrl: string;
  status: "pending" | "completed" | "failed";
  totalAmount: string;
  currency: string;
  expiresAt: string;
  merchantName: string;
}

export interface CheckoutResult {
  status: "placed" | "payment_not_approved" | "failed";
  orderId: string | null;
  amount: string | null;
  replayed?: boolean;
}

export interface ClaimPack {
  generatedAt: string;
  disclaimer: string;
  incident: ExtractedIncident;
  needs: TravelerNeeds;
  product: {
    title: string;
    category: string;
    rationale: string;
    unitPrice: string;
    merchantName: string;
    orderId: string | null;
  };
  policyCitations: PolicySource[];
  eligibilityLanguage: string;
  amounts: {
    quotedTotal: string;
    currency: string;
    remainingBudgetBefore: number;
    remainingBudgetAfter: number | null;
  };
  controlLayers: Array<{ control: string; layer: ControlLayer }>;
}

export interface ReliefCase {
  id: string;
  createdAt: string;
  status: CaseStatus;
  rawIncidentText: string;
  incident: ExtractedIncident;
  needs: TravelerNeeds;
  plan: RecoveryPlan | null;
  selectedVariantId: string | null;
  quote: QuoteResult | null;
  payment: PaymentSession | null;
  checkout: CheckoutResult | null;
  claimPack: ClaimPack | null;
  idempotencyKey: string;
  error: string | null;
}
