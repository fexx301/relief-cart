# ReliefCart implementation audit

This audit covers the current local sandbox workflow and the Cleanverse integration boundary.

## Implemented in this repository

| Requirement | Current implementation | Verification |
|---|---|---|
| One delayed-baggage case, one urgent item | Planner selects one primary variant only | Workflow tests |
| Claim reference required | Missing PIR reference aborts the case before quote | Unit test + UI state |
| Known facts / inferences / missing facts / uncertainty | Shown as separate evidence columns | Browser-verified |
| Cited policy evidence before eligibility | Empty or invalid source set forces abstention | Unit test |
| Category, need, size, stock, and budget rules | Deterministic SpecLock checks | Unit tests |
| Excessive or unrelated products rejected | Camera and fashion sneakers are explicit refusals | Unit test + evidence UI |
| Sandbox fulfillment assumption | Local commerce client uses a disclosed San Francisco demo address | UI + sandbox client |
| Fresh quote includes tax and shipping | Quote receipt shows subtotal, shipping, tax, total, and expiry | Browser-verified |
| Exact-total approval | Transaction and quote currency/total must match before checkout | Workflow tests |
| No approval means no checkout | Pending or declined transactions return no order | Workflow tests |
| Price drift / new quote means new approval | Re-quote clears the previous transaction | Workflow test |
| Quote expiry recovery | Expired quote resets the case to a fresh-quote state | Workflow test |
| Process-local idempotency | Duplicate requests return the original session and order during the process | Workflow test |
| Sandbox order ID | Successful local checkout generates and displays an order ID | Workflow test + browser flow |
| Claim-support artifact | Printable view and JSON export include citations, uncertainty, totals, controls, and order ID | Browser-verified |
| Sandbox disclosure | Header, button copy, approval page, README, and docs identify local behavior | Visual audit |
| Vendor-neutral benefit vault | Fixed parties, amount, expiry, lifecycle, registration-bound activation, fail-closed compliance and exact token deltas | 24 focused Foundry tests |
| Cleanverse compliance adapter | Immutable mapping to validator `isRegistered`, `getRulesV2` and `complianceVerify` with restrictive readiness | 6 focused Foundry tests |
| Factory integration | Owner-only atomic registration, restrictive-rule/readback checks and vault callback | 7 focused Foundry tests |
| Adversarial token handling | No-return accepted with exact deltas; false, malformed and reentrant transfers roll back | Foundry tests |
| Staged UAT preflight | Asserts foundation, grant, registration, funding and active-state wiring without mutations | Script rejects `--execute` |
| Guarded UAT deployment | Verifies chain, signer, gas, bytecode and constructor wiring for foundation/vault modes | Requires explicit mode + `--execute` |
| Redacted UAT evidence schema | Defines public transaction/state evidence without credentials, signatures, PII or raw responses | Documentation |

## Cleanverse go/no-go gates still required

These remain separate from the local commerce sandbox and require Cleanverse deployment
artifacts, UAT access, and on-chain evidence:

1. **Validator authorization:** submit the documented Factory-owner grant once using disposable
   UAT ownership, then prove the deployed Factory holds `REGISTER_ROLE`.
2. **Pool registration:** prove the Factory's documented `registerV2(vault, rule)` then
   `registerApass(vault, cva, address(0))` sequence on UAT and identify the separate policy deployment.
3. **Rule replacement:** remove or replace the unrestricted rule before claiming restrictive
   compliance behavior.
4. **Settlement proof:** deploy and test the Recovery Benefit Vault for funding, redemption,
   expiry, revocation, refund, replay and failed-CVI paths.
5. **CVA behavior:** prove mint, vault-to-merchant and refund-recipient transfer-hook behavior
   with the selected issued CVA.
6. **Evidence:** retain only redacted transaction and audit evidence in the repository.

The application has no external commerce-provider mode and does not silently present its local
sandbox transaction as a production payment or Cleanverse settlement.
