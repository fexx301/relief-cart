# Cleanverse UAT evidence

Captured from Monad UAT (chain ID `10143`) on 2026-08-08/09. This manifest contains public
contract state and transaction receipts only. It contains no API credentials, signatures,
keystores, private keys, password files, seed phrases, or personal data.

## Public demo deployment

- **URL:** https://relief-cart.vercel.app
- **Source commit:** `a8bdd53` (`fix(deploy): pin Vercel to Express framework`), deployed on 2026-08-09.
- **Verified endpoints:** `GET /api/health`, `GET /api/demo/incident`, `POST /api/cases`,
  `POST /api/cases/:id/quote`, `POST /api/cases/:id/pay`,
  `POST /api/payments/:sessionId/mock-approve`, and `POST /api/cases/:id/checkout`.
- **Smoke result:** synthetic create → quote → approval → checkout completed with a placed order;
  a repeated checkout returned the same order. The payment URL was same-origin (`/mock-pay/:sessionId`).
- **Confidence:** high for the hosted sandbox behavior observed on 2026-08-09; this is not Cleanverse
  settlement evidence. The hosted commerce state is in-memory and single-demo oriented, and no real
  payment or personal incident data should be used.

## Evidence status

| Level | Meaning |
|---|---|
| **Verified UAT** | Successful public receipt or reproducible current-chain read |
| **Locally tested** | Foundry or application test; not a Cleanverse runtime claim |
| **Blocked / not attempted** | No successful UAT transaction and no claim of completion |

## Verified UAT

| Proof | Public evidence | Result |
|---|---|---|
| Project CVA mint | [transaction `0x54150d…e3b4`](https://testnet.monadexplorer.com/tx/0x54150db03d020116120e75ee1f17b69335464bac8087838087113119bc49e3b4) | Status 1; `Transfer` from the zero address for exactly one base unit |
| Merchant A-Pass issuance | [transaction `0xb3704f…d073`](https://testnet.monadexplorer.com/tx/0xb3704fb8d3e0a09fe41b31024f58ef363111422a462c8af5cdb7bb081c67d073) | Active tier-50 A-Pass; verification code 4 |
| Compliance adapter deployment | [transaction `0x5cd4fc…b66c`](https://testnet.monadexplorer.com/tx/0x5cd4fc5533880ac6e5b3591f546b0d14634c3f06ef5401d79dd04303fcc4b66c) | Status 1; validator wiring read back |
| Recovery Factory deployment | [transaction `0xc1269d…c4fe`](https://testnet.monadexplorer.com/tx/0xc1269d09801a6fe116ca62a4cbc2c1dda6c5d2e83631dc110986ca205585c4fe) | Status 1; owner and validator read back |
| Factory authorization | [transaction `0xa9d994…a568`](https://testnet.monadexplorer.com/tx/0xa9d994f293b78181c16e42979cd3e1fb69875a758460845d3a966bca7051a568) | Status 1; on-chain `hasRole(REGISTER_ROLE, Factory) == true` |
| Candidate vault deployment | [transaction `0xfa1933…6cf`](https://testnet.monadexplorer.com/tx/0xfa1933e73de749c1d8a7151e155c887829f3ae8368356234095803de0dd8d6cf) | Status 1; immutable constructor wiring read back |

The traveller and merchant both have active tier-50 A-Passes and return documented Cleanverse
verification code 4 for the issued CVA. Participant wallet addresses are intentionally omitted
from this public manifest; the public receipts and redacted preflight output are retained by the
project owner.

## Reproducible state reads

| Artifact | Address / state |
|---|---|
| Cleanverse validator proxy | `0xaC7e5179C2C7f03f209136886c172eb34F161792` |
| Validator implementation | `0x68ce853d660444ffd98d6d5d98ac8ad58241d5a9` |
| Validator implementation code hash | `0xd5c90e870c31cf2defda286452cef39f19df9e3086b1d8ea44832147e01501d6` |
| ReliefCart standard CVA | `0x43ad32d181b0b673cb782d8e379b3dfff4dacfdc`; 6 decimals; total supply 1 |
| Compliance adapter | `0xff89697eb9ceb2351621210e48857a48f43d8e79`; code hash `0xf12e1d7edd7fb6c86a86ebc0a1a72e045e8a14fcb02189bcfc7e34fda80bd8dc` |
| Recovery Factory | `0x16915850950752fc0cefe100a2a03a9c4419811b`; code hash `0xe2f0eccdeadaab164037d8f4e0a48a7e5db6b81ff71f639a9215b74eb00d6f09` |
| Candidate vault | `0xf5bd05f8fb844a524074a57120b12715e2035496`; code hash `0x43770c71579e40a7edc97a8724ab0e1d1846be21ec85460f9d6727264bbc6e68` |
| Factory registration role | `REGISTER_ROLE = 0xd1f21ec03a6eb050fba156f5316dad461735df521fb446dd42c5a4728e9c70fe`; Factory readback is `true` |
| Candidate vault registration | `isRegistered == false`; vault confirmation is `false` |

Run the non-mutating checks with:

```bash
npm run cleanverse:preflight -- --stage granted
npm run cleanverse:preflight -- --stage registered
```

The first command must pass. The second currently must fail closed at `Vault is not registered`.

## Blocked UAT boundary

The official CVI Factory sequence requires:

```text
registerV2(pool, restrictiveRule)
registerApass(pool, cva, address(0))
```

The supplied validator implementation does not expose the required `registerV2` selector
`0xba62f533`. A mandatory `eth_call` simulation reached the implementation and reverted with empty
data for both minimum tier 50 and tier 1. A direct pre-registration `registerApass` simulation
reverted with `PoolNotRegistered()`.

No registration transaction was broadcast. No gas was spent on the incompatible call. The
candidate vault remains unfunded and inactive.

## Locally tested

Foundry: **48 passing tests** across the adapter, Factory, vault lifecycle, replay protection,
expiry, revocation, wrong merchant, failed CVI, exact token deltas, malformed tokens and
reentrancy, plus the undeployed single-contract fallback's atomic association and adversarial
rule-transition checks. Application: **11 passing tests** for policy eligibility, abstention, quote validity,
approval, checkout idempotency and claim-pack evidence.

## Claims deliberately not made

- No successful vault pool registration or CVA association
- No restrictive RuleV2 rejection on the supplied UAT validator
- No UAT vault funding, activation, redemption, refund, or replay receipt
- No automatic CVA transfer-hook settlement proof
- No production, mainnet, or real-payment claim

This boundary is intentional: ReliefCart presents verified issuance, identity, deployment and
authorization evidence while refusing to represent a failed simulation as a completed
Cleanverse settlement.
