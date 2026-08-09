import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  buildPlan,
  evaluateProduct,
  getAirline,
  getCatalog,
  parseIncidentText,
} from "../src/policy/engine.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoPir = readFileSync(path.join(root, "src/data/demo-incident.txt"), "utf8");

describe("ReliefCart policy engine", () => {
  it("extracts claim reference and United policy", () => {
    const incident = parseIncidentText(demoPir);
    assert.equal(incident.airlineId, "united");
    assert.equal(incident.claimReference, "UA-PIR-2026-784421");
    assert.equal(incident.missingClaimReference, false);
    assert.equal(incident.flight, "UA 1841  SFO ← EWR");
  });

  it("aborts purchase path when claim reference missing", () => {
    const incident = parseIncidentText("Delayed bag. Airline: United. No claim number provided.");
    assert.equal(incident.missingClaimReference, true);
  });

  it("selects essential clothing and abstains on luxury camera", () => {
    const incident = parseIncidentText(demoPir);
    const plan = buildPlan(incident, {
      size: "M",
      urgentNeed: "clothing",
      alreadyHas: ["charger"],
      personalCapUsd: 150,
      nights: 1,
    });
    assert.ok(plan.primary);
    assert.equal(plan.primary?.product.category, "clothing_essentials");
    assert.ok(plan.abstentions.some((a) => /camera|sneaker/i.test(a.title)));
  });

  it("rejects over personal cap", () => {
    const incident = parseIncidentText(demoPir);
    const plan = buildPlan(incident, {
      size: "M",
      urgentNeed: "clothing",
      alreadyHas: [],
      personalCapUsd: 20,
      nights: 1,
    });
    assert.equal(plan.primary, null);
  });

  it("does not substitute an unrelated category when the requested size is unavailable", () => {
    const incident = parseIncidentText(demoPir);
    const plan = buildPlan(incident, {
      size: "XXL",
      urgentNeed: "clothing",
      alreadyHas: [],
      personalCapUsd: 150,
      nights: 1,
    });
    assert.equal(plan.primary, null);
  });

  it("abstains when authoritative policy evidence is missing", () => {
    const policy = getAirline("united");
    const product = getCatalog().find((item) => item.category === "clothing_essentials");
    assert.ok(policy);
    assert.ok(product);

    const decision = evaluateProduct(
      product,
      { ...policy, sources: [] },
      {
        size: "M",
        urgentNeed: "clothing",
        alreadyHas: [],
        personalCapUsd: 150,
        nights: 1,
      },
      150,
    );

    assert.equal(decision.allowed, false);
    assert.match(decision.reasons.join(" "), /no authoritative policy evidence/i);
  });
});
