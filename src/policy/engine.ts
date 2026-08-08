import policiesJson from "../data/policies.json" with { type: "json" };
import catalogJson from "../data/catalog.json" with { type: "json" };
import type {
  AirlinePolicy,
  CatalogProduct,
  EligibilityDecision,
  ExtractedIncident,
  PlanItem,
  RecoveryPlan,
  TravelerNeeds,
} from "../types/index.js";

const airlines = policiesJson.airlines as AirlinePolicy[];
const products = catalogJson.products as CatalogProduct[];
const merchant = catalogJson.merchant;

export function listAirlines(): Array<{ id: string; name: string; dailyCapUsd: number }> {
  return airlines.map((a) => ({ id: a.id, name: a.name, dailyCapUsd: a.dailyCapUsd }));
}

export function getAirline(id: string): AirlinePolicy | undefined {
  return airlines.find((a) => a.id === id);
}

export function getMerchant() {
  return merchant;
}

export function getCatalog(): CatalogProduct[] {
  return products;
}

export function getProductByVariant(variantId: string): CatalogProduct | undefined {
  return products.find((p) => p.variantId === variantId);
}

/** Deterministic incident parse from PIR text (no model required). */
export function parseIncidentText(raw: string, airlineHint?: string): ExtractedIncident {
  const text = raw.trim();
  const upper = text.toUpperCase();

  let airlineId = airlineHint ?? "united";
  if (/DELTA/.test(upper)) airlineId = "delta";
  else if (/AMERICAN\s+AIRLINES|\bAA\b/.test(upper)) airlineId = "aa";
  else if (/UNITED/.test(upper)) airlineId = "united";

  const airline = getAirline(airlineId) ?? airlines[0];

  const claimMatch =
    text.match(/Claim reference:\s*([A-Z0-9-]+)/i) ||
    text.match(/PIR\s*\/\s*Claim reference:\s*([A-Z0-9-]+)/i) ||
    text.match(/\b(UA-PIR-\d+|DL-PIR-\d+|AA-PIR-\d+|[A-Z]{2}-PIR-\d+)\b/i);

  const flightMatch = text.match(/Flight:\s*([^\r\n]+)/i);
  const passengerMatch = text.match(/Passenger:\s*([^\n]+)/i);
  const stationMatch = text.match(/Station:\s*([^\n]+)/i);

  const claimReference = claimMatch?.[1]?.trim() ?? null;
  const missingClaimReference = !claimReference;

  const knownFacts: string[] = [];
  if (claimReference) knownFacts.push(`Claim/PIR reference: ${claimReference}`);
  if (flightMatch) knownFacts.push(`Flight: ${flightMatch[1].trim()}`);
  if (stationMatch) knownFacts.push(`Station: ${stationMatch[1].trim()}`);
  knownFacts.push(`Airline policy corpus: ${airline.name}`);
  knownFacts.push("Baggage status reported as delayed (demo parser)");

  const inferences = [
    "Traveler may need one essential clothing item and/or toiletries until bag delivery",
    "Purchases should stay within delayed-bag incidental categories",
  ];

  const missingFacts: string[] = [];
  if (missingClaimReference) missingFacts.push("Airline claim / PIR reference number");
  if (!passengerMatch) missingFacts.push("Passenger full name confirmation");
  missingFacts.push("Exact bag delivery ETA (unknown until airline updates)");

  return {
    airlineId: airline.id,
    airlineName: airline.name,
    claimReference,
    flight: flightMatch?.[1]?.trim() ?? null,
    passengerName: passengerMatch?.[1]?.trim() ?? null,
    station: stationMatch?.[1]?.trim() ?? null,
    status: "delayed_baggage",
    nightsUntilBagExpected: 1,
    missingClaimReference,
    knownFacts,
    inferences,
    missingFacts,
    reimbursementUncertainty:
      "Airline evaluates each claim. Items labeled eligible are 'potentially reimbursable' based on cited policy language — not guaranteed coverage.",
  };
}

export function evaluateProduct(
  product: CatalogProduct,
  policy: AirlinePolicy,
  needs: TravelerNeeds,
  remainingBudgetUsd: number,
): EligibilityDecision {
  const citations = policy.sources.filter(
    (source) =>
      source.id.trim() &&
      source.title.trim() &&
      source.url.startsWith("http") &&
      source.excerpt.trim(),
  );

  if (citations.length === 0) {
    return {
      allowed: false,
      categoryId: product.category,
      layer: "deterministically-verified",
      reasons: ["No authoritative policy evidence is available — abstain before payment"],
      citations: [],
    };
  }

  const blocked = policy.blockedCategories.find((b) => b.id === product.category);
  if (blocked) {
    return {
      allowed: false,
      categoryId: product.category,
      layer: "deterministically-verified",
      reasons: [`Category blocked: ${blocked.label}. ${blocked.reason}`],
      citations,
    };
  }

  const requestedCategories =
    needs.urgentNeed === "clothing"
      ? ["clothing_essentials", "underwear"]
      : needs.urgentNeed === "toiletries"
        ? ["toiletries"]
        : ["clothing_essentials", "underwear", "toiletries"];

  if (!requestedCategories.includes(product.category)) {
    return {
      allowed: false,
      categoryId: product.category,
      layer: "deterministically-verified",
      reasons: [`Category "${product.category}" does not match the traveller's stated urgent need`],
      citations,
    };
  }

  const cat = policy.eligibleCategories.find((c) => c.id === product.category);
  if (!cat) {
    return {
      allowed: false,
      categoryId: product.category,
      layer: "deterministically-verified",
      reasons: [`Category "${product.category}" is not in the airline eligible essentials list`],
      citations,
    };
  }

  const price = Number(product.unitPrice);
  if (Number.isNaN(price)) {
    return {
      allowed: false,
      categoryId: product.category,
      layer: "deterministically-verified",
      reasons: ["Unparseable price"],
      citations,
    };
  }

  if (price > cat.maxItemUsd) {
    return {
      allowed: false,
      categoryId: product.category,
      layer: "deterministically-verified",
      reasons: [`Item $${price} exceeds category max $${cat.maxItemUsd} for ${cat.label}`],
      citations,
    };
  }

  if (price > remainingBudgetUsd) {
    return {
      allowed: false,
      categoryId: product.category,
      layer: "deterministically-verified",
      reasons: [`Item $${price} exceeds remaining budget $${remainingBudgetUsd.toFixed(2)}`],
      citations,
    };
  }

  if (product.size && needs.size && product.size.toUpperCase() !== needs.size.toUpperCase()) {
    return {
      allowed: false,
      categoryId: product.category,
      layer: "deterministically-verified",
      reasons: [`Size ${product.size} does not match requested ${needs.size}`],
      citations,
    };
  }

  if (!product.inStock) {
    return {
      allowed: false,
      categoryId: product.category,
      layer: "deterministically-verified",
      reasons: ["Variant out of stock"],
      citations,
    };
  }

  // "Already has" skip
  const already = needs.alreadyHas.map((s) => s.toLowerCase());
  if (
    product.category === "phone_accessory" &&
    already.some((a) => a.includes("charger") || a.includes("cable"))
  ) {
    return {
      allowed: false,
      categoryId: product.category,
      layer: "deterministically-verified",
      reasons: ["Traveler already has a charger — skip accessory"],
      citations,
    };
  }

  return {
    allowed: true,
    categoryId: product.category,
    layer: "deterministically-verified",
    reasons: [
      `${cat.label} within policy`,
      `Item ≤ category max $${cat.maxItemUsd}`,
      `Item ≤ remaining budget $${remainingBudgetUsd.toFixed(2)}`,
      cat.reimbursableLanguage,
    ],
    citations,
    reimbursableLanguage: cat.reimbursableLanguage,
  };
}

export function buildPlan(incident: ExtractedIncident, needs: TravelerNeeds): RecoveryPlan {
  const policy = getAirline(incident.airlineId);
  if (!policy) {
    throw new Error(`Unknown airline policy: ${incident.airlineId}`);
  }

  const policyCapUsd = policy.dailyCapUsd;
  const personalCapUsd = needs.personalCapUsd;
  const effectiveCapUsd = Math.min(policyCapUsd, personalCapUsd);
  let remaining = effectiveCapUsd;

  const preferredCategories =
    needs.urgentNeed === "toiletries"
      ? ["toiletries", "underwear", "clothing_essentials"]
      : needs.urgentNeed === "clothing"
        ? ["clothing_essentials", "underwear", "toiletries"]
        : ["clothing_essentials", "toiletries", "underwear", "phone_accessory"];

  const scored = [...products].sort((a, b) => {
    const ai = preferredCategories.indexOf(a.category);
    const bi = preferredCategories.indexOf(b.category);
    const ar = ai === -1 ? 99 : ai;
    const br = bi === -1 ? 99 : bi;
    if (ar !== br) return ar - br;
    return Number(a.unitPrice) - Number(b.unitPrice);
  });

  const items: PlanItem[] = [];
  const abstentions: RecoveryPlan["abstentions"] = [];
  let primary: PlanItem | null = null;

  for (const product of scored) {
    const decision = evaluateProduct(product, policy, needs, remaining);
    if (!decision.allowed) {
      if (
        product.category === "electronics_luxury" ||
        product.category === "sneakers_fashion" ||
        product.tags.includes("blocked-demo")
      ) {
        abstentions.push({
          title: product.title,
          reason: decision.reasons.join("; "),
          layer: decision.layer,
        });
      }
      items.push({ product, decision, unitPriceUsd: Number(product.unitPrice), role: "rejected" });
      continue;
    }

    // MVP: single primary purchase (judge: one urgent item)
    if (!primary) {
      const item: PlanItem = {
        product,
        decision,
        unitPriceUsd: Number(product.unitPrice),
        role: "primary",
      };
      primary = item;
      items.push(item);
      remaining = Math.max(0, remaining - Number(product.unitPrice));
    } else {
      items.push({
        product,
        decision,
        unitPriceUsd: Number(product.unitPrice),
        role: "alternative",
      });
    }
  }

  return {
    remainingBudgetUsd: remaining,
    policyCapUsd,
    personalCapUsd,
    effectiveCapUsd,
    items,
    primary,
    abstentions,
    board: {
      eligibleCategories: policy.eligibleCategories.map((c) => c.label),
      blockedCategories: policy.blockedCategories.map((c) => c.label),
      dailyCapUsd: policy.dailyCapUsd,
    },
  };
}
