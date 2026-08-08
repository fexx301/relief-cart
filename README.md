# ReliefCart

**Policy-aware lost-luggage recovery agent** for the [Cleanverse Build: Trusted Assets Hackathon](https://cleanverse.com/hackathon).

```text
Incident report + airline policy
        ↓
Deterministic eligibility (SpecLock) + abstention
        ↓
Quote → sandbox transaction (exact total) → approval
        ↓
Checkout → order_id → claim-support packet
```

Not a personal shopper. **Pre-claim procurement**: the policy shapes the purchase *before* money leaves.

## Quick start

```bash
cd relief-cart
npm install
npm run dev
```

Open **http://127.0.0.1:4040**

```bash
npm test
```

## Demo path (local sandbox)

1. Click **Load demo report**
2. **Verify incident and build plan** → policy board + primary item + abstentions
3. **Request sandbox quote** → tax/shipping/exact total
4. **Create a sandbox approval session**
5. Open the local sandbox approval page (or use the in-app demo approval)
6. **Place approved order** → stable `order_id`
7. Download or print the **claim-support packet**

The interface includes **System**, **Light**, and **Dark** themes. An explicit
selection is saved for future visits, and the sandbox approval page follows the
same preference.

## What is novel

| Piece | Role |
|---|---|
| Incident + claim reference gate | No PIR number → no pay |
| Airline policy corpus | Cited eligibility, not vibes |
| SpecLock rules | Category / cap / size / already-have |
| Explicit abstention | Luxury & fashion blocked on purpose |
| Sandbox transaction | Exact-total approval before checkout |
| Claim pack | Evidence for later reimbursement filing |

Language used in UI: **potentially reimbursable** — never “guaranteed covered.”

## Safety contracts now covered

- No PIR / claim reference → no payment path
- No valid policy citation → no eligibility label
- Wrong category, unavailable size, out-of-stock item, or cap breach → abstain
- Tax or shipping pushing the total over the cap → abort
- Expired or changed quote → fresh quote and fresh approval
- Declined or pending approval → no checkout
- Duplicate payment / checkout requests → original session / order returned
- Claim packet includes source links, uncertainty, exact total, and order ID

See [docs/IMPLEMENTATION_AUDIT.md](docs/IMPLEMENTATION_AUDIT.md) for the requirement-by-requirement audit.

## Project layout

```text
src/
  policy/engine.ts     # parse + eligibility + plan
  agent/caseStore.ts   # case lifecycle
  agent/claimPack.ts   # evidence packet
  commerce/client.ts    # local sandbox quote and checkout behavior
  server/index.ts      # API + static UI
  data/                # policies, catalog, demo PIR
public/                # demo UI
docs/DEMO_SCRIPT.md
docs/CLEANVERSE_HANDOFF.md
- `docs/CLEANVERSE_UAT_EVIDENCE_TEMPLATE.md`
```

## Cleanverse integration and UAT guardrails

The Solidity integration boundary is implemented and locally tested. Public UAT deployment
evidence is recorded separately and must not be inferred from local mocks:

- `contracts/RecoveryBenefitVault.sol` implements the vendor-neutral one-benefit state machine.
- `contracts/RecoveryBenefitFactory.sol` models the CVI guide's atomic `registerV2` then
  `registerApass` Factory sequence against an injected validator address.
- `contracts/CleanverseComplianceGate.sol` maps the vault's beneficiary and merchant checks to
  the documented validator `complianceVerify` call.
- `contracts/mocks/MockComplianceValidator.sol` and the Foundry tests validate the expected
  ordering and rollback locally; they are not evidence of Cleanverse behavior.
- `npm run cleanverse:deploy` deploys only after an explicit mode and `--execute`, using the
  external encrypted admin keystore configured in `.env`.
- `npm run cleanverse:preflight -- --stage <stage>` performs RPC reads only and fails unless the
  requested `foundation`, `granted`, `registered`, `funded`, or `active` state is proven.

Run the local checks with:

```bash
npm test
npm run typecheck
forge test
npm run cleanverse:preflight -- --stage foundation
```

Validator grant and benefit-pool registration are checkpointed separately from deployment. No
script stores signatures or API credentials, and no stage is described as complete until public
chain reads and receipts support it.

## Commerce boundary

The current commerce layer is intentionally local and sandbox-only. It models exact-total
approval, idempotency, quote expiry, payment status, and order replay without claiming an
external commerce provider or persistent payment execution. Cleanverse issuance and settlement
work is documented separately in `docs/CLEANVERSE_HANDOFF.md`.

## Pre-existing vs hackathon

This repo is **new** for ReliefCart (not a rebrand of Runway).
Runway Cashflow ASP remains a separate product (affordability API). ReliefCart can later call Runway as an optional budget co-pilot; not required for MVP.

## License

MIT (add LICENSE if you publish).
