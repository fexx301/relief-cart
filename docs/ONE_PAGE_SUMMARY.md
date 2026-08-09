# ReliefCart — programmable recovery benefits

**Track:** RWA  
**Deployed chain:** Monad UAT / testnet, chain ID `10143`  
**Repository:** https://github.com/fexx301/relief-cart
**Live demo:** https://relief-cart.vercel.app (synthetic data; sandbox-only commerce)

## Problem

When baggage is delayed, a traveller must buy essentials immediately and hope an airline or
insurer reimburses the purchase later. The institution cannot enforce its policy at checkout, the
merchant cannot verify that the benefit is legitimate, and the traveller carries the cash-flow
and documentation burden. Existing reimbursements discover misuse after money has moved.

## Solution

ReliefCart turns an issuer-approved recovery obligation into one bounded merchant settlement.
The app reads a delayed-baggage report, requires a claim reference, cites the applicable policy,
and deterministically selects one justified essential. It abstains when evidence, category, size,
stock or budget fails.

The on-chain design separates the asset from the obligation:

```text
Cleanverse CVA                 Recovery Benefit Vault
compliant settlement unit  +  beneficiary · merchant · amount · expiry · one use
              │
              └── CVI A-Passes + CCP RuleV2 gate settlement
```

The CVA remains fungible and compliance-aware. The vault enforces the claim-specific business
rules: fixed parties, exact amount, expiry, revocation, refund destination and replay protection.
A successful purchase produces both a merchant settlement receipt and a claim-support packet.

## Cleanverse integration points

1. **CVA issuance:** ReliefCart launched a standard CVA through the Cleanverse API. A
   project-controlled mint succeeded on Monad UAT and emitted
   [`Transfer(0x0, recipient, 1)`](https://testnet.monadexplorer.com/tx/0x54150db03d020116120e75ee1f17b69335464bac8087838087113119bc49e3b4).
2. **CVI identity:** The traveller and synthetic merchant hold active tier-50 A-Passes and return
   Cleanverse verification code 4. The merchant issuance and beneficiary renewal are
   [public](https://testnet.monadexplorer.com/tx/0xb3704fb8d3e0a09fe41b31024f58ef363111422a462c8af5cdb7bb081c67d073) and
   [public](https://testnet.monadexplorer.com/tx/0xa952fcbd1818edb3f081510c00a6871dd62f3c0c3d05ab4bf654435fd2ade1c3).
3. **CCP adapter:** `CleanverseComplianceGate` maps vault readiness and participant checks to the
   supplied validator's `isRegistered`, `getRulesV2` and `complianceVerify` interfaces.
4. **Factory authorization:** The deployed ReliefCart Factory received `REGISTER_ROLE`; the
   [grant receipt](https://testnet.monadexplorer.com/tx/0xbc5248d9b6ff43ae2078be3ddb01c3b5031ec6e9062a0da431a5944004120eb0)
   and current `hasRole == true` are independently reproducible.
5. **Pool registration:** Cleanverse supplied the complete six-field RuleV2 schema after the
   initial incomplete-ABI preflight. The corrected Factory call registered one vault, associated
   the CVA and recorded the exact restrictive rule in one receipt:
   [registration receipt](https://testnet.monadexplorer.com/tx/0xee4056ea83875c9048490aed344803c811e8092bed1ca42ffef681b94dfa911a).
6. **Settlement:** The vault was funded, activated and redeemed to the verified merchant. The
   public [funding](https://testnet.monadexplorer.com/tx/0x6f07e9c65fd17126d6a4fab7cdcca961a323a28d9c7a1e295c8ebfea14a4c4de),
   [activation](https://testnet.monadexplorer.com/tx/0x64376e1aff996abb2e0fe80ab53101b6f5ca385e02308a75f134d358fad87a8f) and
   [redemption](https://testnet.monadexplorer.com/tx/0x2e09397e9bcd1468b9d4369301e5ea77e2389a4e4935158dcbdd2621c986db49)
   receipts show exact one-unit movement and terminal `Redeemed` state.

## Build quality and demo

- **48 Foundry tests** cover registration ordering, exact rule readback, redemption, wrong
  merchant, duplicate use, expiry, revocation, failed CVI, refunds, token edge cases and
  reentrancy, including adversarial no-op/wrong rule mutations in the undeployed fallback.
- **11 application tests** cover policy evidence, abstention, quote changes/expiry, exact-total
  approval, checkout idempotency and claim-pack generation.
- Guarded deployment, registration, activation and redemption scripts require explicit execution,
  encrypted external keystores, simulation, receipt validation and staged read-only preflights.
- The UI shows verified UAT receipts separately from local sandbox commerce and clearly labels the
  remaining UAT-only boundary.

## Institutional and scalable path

The same rail can issue bounded benefits for insurers, airlines, employers, disaster-response
programs and public agencies. Each program supplies its policy and approved merchant scope while
the shared adapter enforces CVI/RuleV2 identity. One-benefit vaults isolate liabilities and make
retries, revocations and audits deterministic. Chain-specific deployment is kept behind scripts
and immutable interfaces so the policy and evidence model can extend beyond Monad without
rewriting the product workflow.

Full receipts and state reads:
[Cleanverse UAT evidence](CLEANVERSE_UAT_EVIDENCE.md).
