# Cleanverse UAT evidence

Captured on Monad UAT, chain ID `10143`, on 2026-08-09. This manifest contains public
contract state, documented API read results and transaction receipts only. It contains no API
credentials, signatures, keystores, private keys, password files, seed phrases or personal data.

## End-to-end result

ReliefCart has a verified UAT slice from project CVA issuance through CVI participant checks,
Factory pool registration, CVA funding, vault activation and one-time merchant redemption.
The deployed chain is Monad UAT only; this is not a mainnet, production, real-payment or
institutional settlement claim.

## Public demo deployment

- **URL:** https://relief-cart.vercel.app
- **Verified endpoints:** `GET /api/health`, `GET /api/demo/incident`, `POST /api/cases`,
  `POST /api/cases/:id/quote`, `POST /api/payments/:sessionId/mock-approve`, and
  `POST /api/cases/:id/checkout`.
- **Smoke result:** synthetic create → quote → approval → checkout completed with a placed order;
  repeated checkout returned the same order. The payment URL was same-origin
  (`/mock-pay/:sessionId`).
- **Confidence:** high for the hosted sandbox behavior observed on 2026-08-09. Commerce state is
  in-memory and single-demo oriented; no real or personal incident data should be used.

## Evidence status

| Level | Meaning |
|---|---|
| **Verified UAT** | Successful public receipt or reproducible current-chain read |
| **Locally tested** | Foundry or application test; not a Cleanverse runtime claim |
| **Not claimed** | Deliberately outside the verified UAT boundary |

## Verified UAT receipts

| Proof | Public evidence | Result |
|---|---|---|
| Project CVA mint | [transaction `0x54150d…e3b4`](https://testnet.monadexplorer.com/tx/0x54150db03d020116120e75ee1f17b69335464bac8087838087113119bc49e3b4) | Status 1; `Transfer` from the zero address for exactly one base unit |
| Merchant A-Pass issuance | [transaction `0xb3704f…d073`](https://testnet.monadexplorer.com/tx/0xb3704fb8d3e0a09fe41b31024f58ef363111422a462c8af5cdb7bb081c67d073) | Active tier-50 A-Pass; verification code 4 |
| Beneficiary A-Pass renewal | [transaction `0xa952fc…e1c3`](https://testnet.monadexplorer.com/tx/0xa952fcbd1818edb3f081510c00a6871dd62f3c0c3d05ab4bf654435fd2ade1c3) | Active tier-50 A-Pass; verification code 4 |
| Compliance gate deployment | [transaction `0x137d57…3254`](https://testnet.monadexplorer.com/tx/0x137d57504cb6de73ea9ca2e6971912f180f092eb69025ac906b9e812f30f3254) | Status 1; validator wiring read back |
| Recovery Factory deployment | [transaction `0x99395c…5a24`](https://testnet.monadexplorer.com/tx/0x99395c320e7410768aca3056baebc84be00f43ed719ae90cd7f5cbf230e5a24e) | Status 1; owner and validator read back |
| Factory authorization | [transaction `0xbc5248…0eb0`](https://testnet.monadexplorer.com/tx/0xbc5248d9b6ff43ae2078be3ddb01c3b5031ec6e9062a0da431a5944004120eb0) | Status 1; `hasRole(REGISTER_ROLE, Factory) == true` |
| Registered vault deployment | [transaction `0xbcb2ef…d34a`](https://testnet.monadexplorer.com/tx/0xbcb2efdb7c9e3f9ee6c0ed07b8b55f54f1de5309fd44ecf704a14ee5e13d34a1) | Status 1; immutable CVA, gate and Factory wiring read back |
| Atomic pool registration | [transaction `0xee4056…911a`](https://testnet.monadexplorer.com/tx/0xee4056ea83875c9048490aed344803c811e8092bed1ca42ffef681b94dfa911a) | Status 1; Factory executed `registerV2`, `registerApass`, and vault confirmation |
| Vault CVA funding | [transaction `0x6f07e9…c4de`](https://testnet.monadexplorer.com/tx/0x6f07e9c65fd17126d6a4fab7cdcca961a323a28d9c7a1e295c8ebfea14a4c4de) | Status 1; one CVA moved into the registered vault |
| Vault activation | [transaction `0x64376e…7a8f`](https://testnet.monadexplorer.com/tx/0x64376e1aff996abb2e0fe80ab53101b6f5ca385e02308a75f134d358fad87a8f) | Status 1; vault entered `Active`, amount 1 |
| Merchant redemption | [transaction `0x2e0939…db49`](https://testnet.monadexplorer.com/tx/0x2e09397e9bcd1468b9d4369301e5ea77e2389a4e4935158dcbdd2621c986db49) | Status 1; two logs; vault CVA balance `1 → 0`, merchant balance `0 → 1`, vault entered `Redeemed` |

## Reproducible final state

| Artifact | Address / state |
|---|---|
| Cleanverse validator proxy | `0xaC7e5179C2C7f03f209136886c172eb34F161792` |
| Validator implementation | `0x68ce853d660444ffd98d6d5d98ac8ad58241d5a9` |
| Validator implementation code hash | `0xd5c90e870c31cf2defda286452cef39f19df9e3086b1d8ea44832147e01501d6` |
| ReliefCart standard CVA | `0x43ad32d181b0b673cb782d8e379b3dfff4dacfdc`; 6 decimals; total supply 1 |
| ReliefCart compliance gate | `0xe39ad59a7c81a7119738624e5dcd1627e0950e4a` |
| ReliefCart Recovery Factory | `0xc987d9f3d66bf0810d74417ce0b4f3341ddc885b` |
| Registered Recovery Benefit Vault | `0x0e3b4d76e22d044d62e2f6cc2de1dca6203f153c` |
| Factory registration role | `REGISTER_ROLE = 0xd1f21ec03a6eb050fba156f5316dad461735df521fb446dd42c5a4728e9c70fe`; Factory readback is `true` |
| Pool registration | `isRegistered == true`; vault confirmation is `true`; `GATE_POOL_READY == true` |
| RuleV2 readback | `allowedGroup=0x0000`, `allowedSubGroup=0x0000`, `minTier=50`, `minSubTier=0`, `isBlackList=false`, `countryBitmap=0x0` |
| Registration rule hash | `0x635e76c251944264c0362700fc0eb61a940c7cdc3dab32048bc73a0e851e06fa` |
| Final vault status | `Redeemed` (`4`); vault CVA balance `0`; merchant CVA balance `1` |
| Wrong-merchant/revocation fixture | `0xe43e73cd5e1ee55ea1839df9b0d89a9a5e7df089`; final status `Refunded` (`5`); vault CVA balance `0` |
| Expiry fixture | `0x2fcf2263407dd0dde04f0d4d6e66d4ca02b7c705`; expiry `1786281714`; final status `Refunded` (`5`); vault CVA balance `0` |

The funded and final checks use Cleanverse’s documented read-only endpoint
`POST /atoken/is_paused` from [docs.cleanverse.com](https://docs.cleanverse.com); the observed
result for the project CVA was `paused=false`.

## Corrected RuleV2 boundary

The initial preflight used an incomplete five-field ABI and computed the wrong `registerV2`
selector, `0xba62f533`. Cleanverse supplied the complete schema on 2026-08-09:

```solidity
struct RuleV2 {
    bytes2 allowedGroup;
    bytes2 allowedSubGroup;
    uint8 minTier;
    uint8 minSubTier;
    bool isBlackList;
    uint256 countryBitmap;
}
```

The corrected `registerV2(address,(bytes2,bytes2,uint8,uint8,bool,uint256))` selector is
`0x7b6c63cb`. The corrected Factory call
`registerBenefitPool(address,address,address,(bytes2,bytes2,uint8,uint8,bool,uint256))` uses
selector `0xd78aa9c1`. The implementation bytecode contains the corrected validator selector,
the exact six-field calldata simulated successfully, and the registration receipt above proves
the resulting pool association and rule readback.

## Additional negative UAT receipts

A second, disposable UAT pass exercised the failure and recovery paths against fresh registered
vaults. Failed transactions are retained as public Monad receipts with status `0`; successful
revocation and refund transactions are status `1`. The fixtures were recovered after each case,
so neither disposable vault retains CVA.

| Case | Public evidence | Result |
|---|---|---|
| CVA transfer-hook rejection | [failed transfer receipt `0x645369…b05e`](https://testnet.monadexplorer.com/tx/0x645369564ef12ecfbc8cfd93e0c054f984faede491fd4d43f8419332d779b05e) | Status `0`; transfer to a recipient without an active A-Pass was rejected |
| Replay protection | [failed redemption receipt `0xaf2dc8…1e2b`](https://testnet.monadexplorer.com/tx/0xaf2dc864c56b7606860911a3c06720112d7a91c85d0f06a47c80877f26fa1e2b) | Status `0`; a second redemption against the already-`Redeemed` success vault was rejected |
| Wrong merchant | [failed redemption receipt `0x3361ce…70f3`](https://testnet.monadexplorer.com/tx/0x3361ce0b17d3460b36b71e2253c91f1c4cbf8a138d84ec4e40b4c76e132370f3) | Status `0`; the wrong-merchant redemption was rejected for fixture `0xe43e73cd5e1ee55ea1839df9b0d89a9a5e7df089` |
| Revocation | [revocation receipt `0x8b6b3f…d7ab`](https://testnet.monadexplorer.com/tx/0x8b6b3f0846f854a7e798f95b71dd089b1d118191288d65f1f649884c4fc4d7ab) | Status `1`; fixture entered the revoked state |
| Revoked redemption | [failed redemption receipt `0xed2c2b…0ed0`](https://testnet.monadexplorer.com/tx/0xed2c2bd8daf9924e0502beebf7895983f2bb24c64ae1e6b17fea3346eefe0ed0) | Status `0`; redemption after revocation was rejected |
| Revocation refund | [refund receipt `0x8a6fe9…b4ba`](https://testnet.monadexplorer.com/tx/0x8a6fe9e52fad51e57c03ef1d49853b965e2fb3b252dc44a3048574b34213b4ba) | Status `1`; exactly one CVA unit was recovered and the fixture ended `Refunded` |
| Expired redemption | [failed redemption receipt `0x91f706…da59`](https://testnet.monadexplorer.com/tx/0x91f70680fc05f56f4a0989eb44bd763ad16e3ca069b3e8b5a4fb68ebef72da59) | Status `0`; redemption after fixture expiry `1786281714` was rejected for fixture `0x2fcf2263407dd0dde04f0d4d6e66d4ca02b7c705` |
| Expiry refund | [refund receipt `0xed0bf4…e896`](https://testnet.monadexplorer.com/tx/0xed0bf4c7c3aeb33315f0d1653d58b2909cfd10124963e6c06c6992e34951e896) | Status `1`; exactly one CVA unit was recovered and the fixture ended `Refunded` |

The failed receipts prove the on-chain rejection boundary; local Foundry tests continue to cover
the same branches with decoded revert assertions. The public transaction set does not claim
mainnet behavior, real payments or an independent trace-level decode of the Cleanverse hook.

## Reproduce the final read-only check

With the local UAT environment configured, these checks are non-mutating:

```bash
npm run cleanverse:preflight -- --stage foundation
npm run cleanverse:preflight -- --stage granted
npm run cleanverse:preflight -- --stage registered
npm run cleanverse:preflight -- --stage redeemed
```

The mutation scripts are separately guarded by `--execute` and use an encrypted external
keystore. They do not print or persist API credentials, signatures or passwords:

```bash
npm run cleanverse:activate -- --execute
npm run cleanverse:redeem -- --execute
# Creates fresh disposable UAT fixtures and publishes new negative receipts; do not rerun
# against an existing evidence set unless a new evidence pass is intended.
npm run cleanverse:negative -- --execute
```

## Locally tested

Foundry: **48 passing tests** across the adapter, Factory, vault lifecycle, replay protection,
expiry, revocation, wrong merchant, failed CVI, exact token deltas, malformed tokens and
reentrancy, plus the undeployed single-contract fallback’s atomic association and adversarial
rule-transition checks. Application: **11 passing tests** for policy eligibility, abstention,
quote validity, approval, checkout idempotency and claim-pack evidence.

## Remaining boundary

- Monad UAT is the only deployed chain; no production or mainnet claim is made.
- Commerce remains synthetic and sandbox-only; no real payment provider is claimed.
- The successful redemption and the separate negative receipts prove the live UAT transfer,
  rejection and recovery paths. A trace-level decode of the Cleanverse hook is not claimed.

This boundary is intentional: the primary Cleanverse issuance → identity → registration →
funding → activation → redemption slice and its disposable negative-case evidence are verified,
while unsupported production and real-payment claims remain clearly labeled.
