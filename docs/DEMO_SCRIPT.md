# ReliefCart 2-minute demo script

## Setup
```bash
cd relief-cart
npm install
npm run dev
# open http://127.0.0.1:4040
```

## Narration

> Most agents shop when you're bored. ReliefCart shops when you're stranded.

1. **Load demo PIR** — United delayed bag, claim `UA-PIR-2026-784421`, meeting tomorrow.
2. **Policy board** — $150 airline cap, essentials yes, luxury/sneakers no, citations shown.
3. **Build plan** — primary: essential tee under cap. Abstain: camera + fashion sneakers with reasons.
4. **Quote** — tax + shipping → exact total (session amount will match).
5. **Create sandbox approval session** — local approval URL.
6. **Simulate sandbox approval** → **Checkout** → show the generated sandbox order ID.
7. **Claim pack** — policy excerpts, eligibility language, control layers, order id.

## Failure path (30s)

Reload with personal cap `$20` → plan aborts (fail-closed).
Or strip claim reference from PIR → no purchase until claim number present.

## Closing line

> We don't guarantee reimbursement. We enforce policy before money moves, then hand you the evidence packet.
