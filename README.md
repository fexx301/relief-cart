# ReliefCart

**Policy-aware lost-luggage recovery agent** for the [Cleanverse Build: Trusted Assets Hackathon](https://cleanverse.com/hackathon).

**Production demo:** https://relief-cart.vercel.app — synthetic incident data and sandbox-only commerce.

```text
Issuer launches + mints a Cleanverse CVA
        ↓
CVI verifies traveller, merchant and CVA-holding pool
        ↓
Incident + policy → deterministic benefit decision
        ↓
One registered vault → one merchant settlement → audit evidence
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

## Demo path

Start at the **Live compliance rail**. It links the public Monad UAT receipts for the ReliefCart
CVA mint, merchant A-Pass, Factory authorization and deployed integration contracts. It also
shows the fail-closed registration boundary without presenting it as a completed settlement.

Then run the purchase flow on the [production demo](https://relief-cart.vercel.app) or locally:

1. Click **Load demo report**
2. **Verify incident and build plan** → policy board + primary item + abstentions
3. **Request sandbox quote** → tax/shipping/exact total
4. **Create a sandbox approval session**
5. Open the sandbox approval page (or use the in-app demo approval)
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
| Cleanverse CVA | Project-issued compliant settlement asset |
| CVI A-Passes | Identity status for the recovery participants |
| Recovery Benefit Vault | Fixed beneficiary, merchant, amount, expiry and one-time state |
| Fail-closed UAT preflight | No broadcast when the supplied validator ABI cannot execute the guide |

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
docs/CLEANVERSE_UAT_EVIDENCE.md
docs/CLEANVERSE_UAT_EVIDENCE_TEMPLATE.md
```

## Cleanverse integration

ReliefCart uses a standard CVA launched through the Cleanverse API and a separate one-benefit
vault. The CVA supplies the compliant fungible asset; the vault supplies the business obligation:
one beneficiary, one merchant, one amount, one expiry and one terminal redemption.

### Verified on Monad UAT

| Milestone | Evidence |
|---|---|
| Project-controlled CVA mint | [Status-1 mint receipt with `Transfer(0x0, recipient, 1)`](https://testnet.monadexplorer.com/tx/0x54150db03d020116120e75ee1f17b69335464bac8087838087113119bc49e3b4) |
| Traveller and merchant CVI | Both have active tier-50 A-Passes and verification code 4; [merchant issuance receipt](https://testnet.monadexplorer.com/tx/0xb3704fb8d3e0a09fe41b31024f58ef363111422a462c8af5cdb7bb081c67d073) |
| Cleanverse compliance adapter | [Deployment receipt](https://testnet.monadexplorer.com/tx/0x5cd4fc5533880ac6e5b3591f546b0d14634c3f06ef5401d79dd04303fcc4b66c) |
| Recovery Benefit Factory | [Deployment receipt](https://testnet.monadexplorer.com/tx/0xc1269d09801a6fe116ca62a4cbc2c1dda6c5d2e83631dc110986ca205585c4fe) |
| Factory `REGISTER_ROLE` | [Grant receipt](https://testnet.monadexplorer.com/tx/0xa9d994f293b78181c16e42979cd3e1fb69875a758460845d3a966bca7051a568) plus live `hasRole == true` |
| Candidate vault | [Deployment receipt](https://testnet.monadexplorer.com/tx/0xfa1933e73de749c1d8a7151e155c887829f3ae8368356234095803de0dd8d6cf) and constructor readback |

The complete public record is in
[docs/CLEANVERSE_UAT_EVIDENCE.md](docs/CLEANVERSE_UAT_EVIDENCE.md).

### Fail-closed boundary

The official Factory flow requires `registerV2` followed by `registerApass`. The supplied UAT
validator implementation lacks the documented `registerV2` selector. ReliefCart detected that
in the mandatory pre-broadcast simulation and refused to send the transaction. The candidate
vault is therefore intentionally unregistered, unfunded and inactive; this repo does not claim
UAT redemption or automatic transfer-hook settlement.

### Implementation and guardrails

The Solidity boundary is implemented and locally tested:

- `contracts/RecoveryBenefitVault.sol` implements the vendor-neutral one-benefit state machine.
- `contracts/RecoveryBenefitFactory.sol` models the CVI guide's atomic `registerV2` then
  `registerApass` Factory sequence against an injected validator address.
- `contracts/CleanverseComplianceGate.sol` maps the vault's beneficiary and merchant checks to
  the documented validator `complianceVerify` call.
- `contracts/SingleContractRecoveryBenefitVault.sol` and `contracts/CvaAssociationCoordinator.sol`
  provide an undeployed, vendor-gated fallback with atomic CVA association and exact rule-transition
  readback. They must not be deployed until Cleanverse confirms the API registration path and the
  coordinator role.
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

Current test status: **11 application tests + 48 Foundry tests passing**.

## Commerce boundary

The current commerce layer is intentionally local and sandbox-only. It models exact-total
approval, idempotency, quote expiry, payment status, and order replay without claiming an
external commerce provider or persistent payment execution. The public Vercel demo uses the same
synthetic in-memory state and should be treated as a short single-user demonstration; do not enter
real or personal incident data. Cleanverse issuance and settlement work is documented separately in
`docs/CLEANVERSE_HANDOFF.md`.

## Pre-existing vs hackathon

This repo is **new** for ReliefCart. It is not a rebrand or continuation of a previous hackathon
integration.

## License

MIT
