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
CVA mint, participant A-Passes, Factory authorization, atomic pool registration, funding,
activation, merchant redemption and separate negative-case/refund receipts. It also shows the
remaining UAT-only boundary without presenting it as a production payment rail.

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
| Fail-closed UAT preflight | No broadcast until the corrected validator ABI, rule and live state read back |

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

See [docs/CLEANVERSE_UAT_EVIDENCE.md](docs/CLEANVERSE_UAT_EVIDENCE.md) for the public requirement
and evidence boundary.

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
| Traveller and merchant CVI | Both have active tier-50 A-Passes and verification code 4; [merchant issuance receipt](https://testnet.monadexplorer.com/tx/0xb3704fb8d3e0a09fe41b31024f58ef363111422a462c8af5cdb7bb081c67d073) and [beneficiary renewal receipt](https://testnet.monadexplorer.com/tx/0xa952fcbd1818edb3f081510c00a6871dd62f3c0c3d05ab4bf654435fd2ade1c3) |
| Cleanverse compliance gate | [Deployment receipt](https://testnet.monadexplorer.com/tx/0x137d57504cb6de73ea9ca2e6971912f180f092eb69025ac906b9e812f30f3254) |
| Recovery Benefit Factory | [Deployment receipt](https://testnet.monadexplorer.com/tx/0x99395c320e7410768aca3056baebc84be00f43ed719ae90cd7f5cbf230e5a24e) |
| Factory `REGISTER_ROLE` | [Grant receipt](https://testnet.monadexplorer.com/tx/0xbc5248d9b6ff43ae2078be3ddb01c3b5031ec6e9062a0da431a5944004120eb0) plus live `hasRole == true` |
| Registered vault | [Deployment receipt](https://testnet.monadexplorer.com/tx/0xbcb2efdb7c9e3f9ee6c0ed07b8b55f54f1de5309fd44ecf704a14ee5e13d34a1) and constructor readback |
| Atomic pool registration | [Registration receipt](https://testnet.monadexplorer.com/tx/0xee4056ea83875c9048490aed344803c811e8092bed1ca42ffef681b94dfa911a); corrected six-field RuleV2, CVA association and vault confirmation |
| Funding, activation and redemption | [Funding](https://testnet.monadexplorer.com/tx/0x6f07e9c65fd17126d6a4fab7cdcca961a323a28d9c7a1e295c8ebfea14a4c4de) → [activation](https://testnet.monadexplorer.com/tx/0x64376e1aff996abb2e0fe80ab53101b6f5ca385e02308a75f134d358fad87a8f) → [merchant settlement](https://testnet.monadexplorer.com/tx/0x2e09397e9bcd1468b9d4369301e5ea77e2389a4e4935158dcbdd2621c986db49) |
| Negative UAT and refund evidence | [wrong merchant](https://testnet.monadexplorer.com/tx/0x3361ce0b17d3460b36b71e2253c91f1c4cbf8a138d84ec4e40b4c76e132370f3), [replay](https://testnet.monadexplorer.com/tx/0xaf2dc864c56b7606860911a3c06720112d7a91c85d0f06a47c80877f26fa1e2b), [expired redemption](https://testnet.monadexplorer.com/tx/0x91f70680fc05f56f4a0989eb44bd763ad16e3ca069b3e8b5a4fb68ebef72da59), [revocation refund](https://testnet.monadexplorer.com/tx/0x8a6fe9e52fad51e57c03ef1d49853b965e2fb3b252dc44a3048574b34213b4ba) and [expiry refund](https://testnet.monadexplorer.com/tx/0xed0bf4c7c3aeb33315f0d1653d58b2909cfd10124963e6c06c6992e34951e896) |

The complete public record is in
[docs/CLEANVERSE_UAT_EVIDENCE.md](docs/CLEANVERSE_UAT_EVIDENCE.md).

### Corrected and verified UAT boundary

The official Factory flow requires `registerV2` followed by `registerApass`. The first preflight
used an incomplete five-field RuleV2 ABI; Cleanverse supplied the complete six-field schema, and
the corrected `registerV2` selector `0x7b6c63cb` is present in the validator implementation.
ReliefCart then simulated and broadcast the corrected Factory call. The registration receipt
proves `registerV2`, `registerApass`, the exact restrictive rule readback and vault confirmation.
The subsequent funding, activation and redemption receipts prove the live settlement slice.

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
- `npm run cleanverse:preflight -- --stage <stage>` performs RPC/API reads only and fails unless
  the requested `foundation`, `granted`, `registered`, `funded`, `active`, or `redeemed` state is
  proven.
- `npm run cleanverse:activate -- --execute` and `npm run cleanverse:redeem -- --execute` guard,
  simulate, broadcast and receipt-check the two lifecycle transitions.
- `npm run cleanverse:negative -- --execute` captures disposable UAT receipts for CVA hook
  rejection, wrong merchant, revocation, expiry, replay and both refund paths. It is intentionally
  stateful and should only be rerun when a fresh evidence set is wanted.

Run the local checks with:

```bash
npm test
npm run typecheck
forge test
npm run cleanverse:preflight -- --stage foundation
```

Validator grant and benefit-pool registration are checkpointed separately from deployment. No
script stores signatures or API credentials, and no stage is described as complete until public
chain reads and receipts support it. UAT evidence, including the exact final state, is in
[docs/CLEANVERSE_UAT_EVIDENCE.md](docs/CLEANVERSE_UAT_EVIDENCE.md).

Current test status: **11 application tests + 48 Foundry tests passing**.

## Commerce boundary

The current commerce layer is intentionally local and sandbox-only. It models exact-total
approval, idempotency, quote expiry, payment status, and order replay without claiming an
external commerce provider or persistent payment execution. The public Vercel demo uses the same
synthetic in-memory state and should be treated as a short single-user demonstration; do not enter
real or personal incident data. Cleanverse issuance and settlement work is documented separately in
`docs/CLEANVERSE_UAT_EVIDENCE.md`.

## Pre-existing vs hackathon

This repo is **new** for ReliefCart. It is not a rebrand or continuation of a previous hackathon
integration.

## License

MIT
