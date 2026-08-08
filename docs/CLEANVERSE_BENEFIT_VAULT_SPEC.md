# ReliefCart Recovery Benefit Vault — proposed architecture

Status: vendor-neutral local prototype plus architecture review. No contract
has been deployed from this specification, and no end-to-end settlement claim
is made.

## Purpose

ReliefCart needs a bounded authorization for one recovery purchase. Cleanverse
CVA supplies the fungible compliant settlement asset. ReliefCart supplies the
benefit semantics that a fungible token does not provide by itself:

- one beneficiary;
- one fixed merchant;
- one fixed amount and CVA token;
- an expiry time;
- revocation before redemption; and
- one successful redemption only.

The CVA must not be described as merchant-bound, expiring, or single-use.

## Proposed composition

Use one `RecoveryBenefitVault` instance per demo benefit. A per-benefit vault
keeps the accounting and replay boundary explicit and avoids pooled-balance
reservation bugs during the first settlement proof. A later factory can create
the same vault shape at scale.

```text
issuer / minter operator
        │ mints exact CVA amount
        ▼
RecoveryBenefitVault ── CVA transfer ──▶ fixed merchant
        │
        ├─ beneficiary identity check through CVI
        ├─ merchant identity check through CVI
        ├─ expiry / revocation / single-use checks
        └─ audit events
```

The benefit vault must not hold `MINTER_ROLE`. The dedicated issuer minter
operator remains separate from the vault.

## Proposed state

```solidity
enum BenefitStatus { Pending, Active, Revoked, Cancelled, Redeemed, Refunded }

struct Benefit {
    address beneficiary;
    address merchant;
    address cva;
    address refundRecipient;
    uint256 amount;
    uint64 expiresAt;
    BenefitStatus status;
}
```

The deployed contract may store one immutable `Benefit` rather than a mapping
because the demo uses one vault per benefit. Wallet addresses are public,
pseudonymous and linkable; no direct identifiers or raw PII should be stored
on-chain. A redacted off-chain evidence record can link the benefit to the app
case.

`refundRecipient`, the revocation authority, and the activation authority must
be fixed at deployment or controlled by the documented vault operator policy.
The core vault should depend on an immutable vendor-neutral compliance gate
interface. A later Cleanverse adapter can translate the confirmed validator
ABI and pool semantics into that interface; the vault must not guess or embed
Cleanverse-specific calls before those details are confirmed.

## State transitions

```text
Pending ── registration + restrictive rule + funding confirmed ──▶ Active
Active ── successful redemption ──▶ Redeemed
Active ── authorized revocation ──▶ Revoked
Pending ── authorized cancellation ──▶ Cancelled
Pending/Active ── expiry or Revoked/Cancelled ── authorized recovery ──▶ Refunded
Redeemed ── surplus recovery ──▶ Redeemed
```

Expiry is a time condition, not a separate status: redemption is valid only
when `block.timestamp < expiresAt`. A revoked or expired vault must have a
fixed-destination recovery path so funds cannot become permanently trapped.

## Proposed lifecycle

1. The issuer and beneficiary have valid A-Pass records in the target Cleanverse
   environment.
2. ReliefCart deploys the vault with the beneficiary, fixed merchant, CVA,
   amount, and future expiry. Deployment must reject zero addresses, zero amount,
   and an expiry that is not in the future.
3. The issuer minter mints exactly `amount` base units to the vault. The vault
   never receives `MINTER_ROLE`; the CVA `Transfer` event is the mint evidence.
4. The vault is registered as a CVI pool using the vendor-approved
   `registerV2` and CVA registration path. The exact registrar, policy address,
   permissions, and fee behavior are still unconfirmed.
5. After registration, restrictive-rule replacement, and funding are evidenced,
   the activation authority changes the vault from `Pending` to `Active`.
   Activation must require `balanceOf(vault) >= amount`, not equality, so an
   unsolicited dust transfer cannot disable redemption.
6. The beneficiary calls `redeem(address presentedMerchant)` before expiry. The
   vault checks:
   - caller is the stored beneficiary;
   - status is `Active`;
   - `block.timestamp < expiresAt`;
   - `presentedMerchant` equals the immutable merchant;
   - the vault holds at least the fixed amount; and
   - `complianceVerify(vault, beneficiary)` and
     `complianceVerify(vault, merchant)` both return `true`, unless Cleanverse
     confirms that the registered CVA hook is the authoritative equivalent.
   A failed validator call or malformed response must fail closed.
7. The vault sets status to `Redeemed` before the external token transfer, then
   transfers the exact CVA amount to the stored merchant. EVM atomicity rolls
   back the status if the transfer fails.
8. The revocation authority can move an `Active` benefit to `Revoked` before
   redemption. After revocation or expiry, the recovery authority transfers the
   entire remaining CVA balance to the fixed `refundRecipient` and marks the
   vault `Refunded`.
9. The operator can cancel a `Pending` benefit, including one that was funded
   but could not be registered. Cancellation recovers the full remaining
   balance to the fixed refund recipient. After successful redemption, any
   unsolicited CVA surplus can be recovered only to that same recipient.
10. A second redemption, a revoked or expired benefit, an unauthorized caller,
   a wrong merchant, a failed CVI check, or a paused CVA transfer must revert.

## Required events

The final ABI should emit enough non-PII evidence to connect the lifecycle:

```solidity
event BenefitCreated(address indexed vault, address indexed cva, uint256 amount, uint64 expiresAt);
event BenefitActivated(address indexed vault, uint256 fundedBalance);
event BenefitRevoked(address indexed vault);
event BenefitCancelled(address indexed vault);
event BenefitRedeemed(address indexed vault, address indexed merchant, uint256 amount);
event BenefitRefunded(address indexed vault, address indexed refundRecipient, uint256 amount);
event SurplusRecovered(address indexed vault, address indexed refundRecipient, uint256 amount);
```

The implementation should avoid emitting personal data or arbitrary free-form
claim text. Transaction hashes and event logs belong in the redacted evidence
manifest, not in this specification.

The direct CVA mint cannot emit `BenefitFunded` from the vault. Funding evidence
is the CVA `Transfer` event; `BenefitActivated` is the explicit balance and
registration confirmation boundary.

## Cleanverse registration questions that still block deployment

Support has confirmed that Factory contracts are permitted, the current UAT
authorization endpoint is `/validator/grant`, the Factory owner signs the grant,
and the Monad UAT `IAPassComplianceValidator` is
`0xaC7e5179C2C7f03f209136886c172eb34F161792`. Read-only RPC inspection confirms
that address is a deployed EIP-1967 proxy on chain ID 10143. The supplied guide
also defines Factory Mode as `registerV2(pool, rule)` followed by
`registerApass(pool, cva, fee)`, with `address(0)` skipping fee registration.

The following deployment-specific questions remain:

1. Is the `/validator/grant` request `address` exactly the deployed Factory
   contract, does that Factory receive `REGISTER_ROLE`, and what exact EIP-191
   bytes/variant must its owner sign?
2. May the authorized ReliefCart Factory call both `registerV2(vault, rule)` and
   `registerApass(vault, cva, address(0))` on the supplied validator, and what
   receipt events or state reads prove both registrations?
3. What is the separate policy contract address, and what are the validator and
   policy implementation identities, upgrade authorities and role inventories?
4. Does the registered standard CVA hook enforce both vault and merchant
   compliance on a vault-to-merchant transfer, and how does it treat minting
   from the zero address and refunds to the fixed recipient?
5. Which actors require A-Pass for this design? Support said the refund
   recipient requirement depends on the CVA design, so refund behavior must be
   tested rather than assumed.
6. Is a one-benefit merchant-bound vault accepted for the RWA track, or must the
   pool represent an issuer-wide asset with a separate authorization layer?
7. How is the existing unrestricted RuleV2 rule removed or replaced? Adding a
   restrictive rule is insufficient when rules are OR-combined.
8. What exact negative-case responses, events and evidence should the demo
   retain for expired, revoked, wrong-merchant, duplicate, paused, failed-CVI
   and refund attempts?

## Validator API evidence and boundary

Cleanverse support confirmed on 2026-08-05 that the UAT API exposes validator
authorization and rule-management operations. The documented encrypted
mutation shapes are:

- `POST /validator/grant`: `{ chain, address, owner_signature }`. The address
  receives `REGISTER_ROLE`; the documented EIP-191 message is the lowercase
  concatenation of `chain` and `address`.
- `POST /validator/register`: `{ chain, contract_address, rule,
  owner_signature }`. This registers a compliance pool and its initial rule.
- `POST /validator/set_rule`: `{ chain, contract_address, rule }`, replacing
  the rules for a registered pool. Add/remove rule and pause operations are
  also documented.
- `POST /validator/is_register`: `{ chain, contract_address }` as a plain
  JSON read. The exact response and on-chain state must still be checked.

These endpoints do not, by themselves, prove that a vault holding a standard
CVA is registered for CVA transfer-hook enforcement. Support has identified the
Factory owner as grant signer and confirmed `/validator/grant`, but the exact
signed bytes, `REGISTER_ROLE` recipient and resulting on-chain grant still need
proof. The relationship between Factory authorization, `registerV2`,
`registerApass`, the separate policy contract and refund-path compliance also
remains unresolved. The implementation must therefore keep API authorization
separate from vault activation and must not mark a benefit `Active` from an API
success response alone.

## Security and implementation gates

- Use `SafeERC20`-style transfer handling and check the CVA token address. The
  vendor-neutral vault must also verify exact vault and recipient balance
  deltas, or explicitly restrict support to a trusted non-fee, non-rebasing CVA
  and prove that restriction in the integration tests.
- Keep the compliance dependency behind an immutable interface that separately
  verifies beneficiary and merchant subjects with the vault as pool context.
- Add a reentrancy guard even though the current CVA is expected to be a
  contract call.
- Mark the benefit consumed before the transfer; rely on transaction atomicity
  for rollback on transfer failure.
- Keep admin, issuer minter, vault operator, beneficiary, and merchant roles
  distinct and document the revocation and fixed-destination recovery
  authorities.
- Do not add a vault mint function or grant the vault `MINTER_ROLE`.
- Use base units explicitly and verify decimals before funding.
- Define custom errors for `NotActive`, `Expired`, `Unauthorized`,
  `MerchantMismatch`, `ComplianceRejected`, `InsufficientBalance`,
  `AlreadyConsumed`, `RecoveryNotAllowed`, `TokenCallFailed`,
  `TransferInvariantFailed` and transfer failure so the UI can show
  deterministic rejection reasons.
- Use one RuleV2 policy context for beneficiary and merchant in the first demo
  unless Cleanverse requires separate pool contexts; do not assume they can be
  configured independently.
- Treat Cleanverse preflight as time-sensitive; the on-chain redemption check is
  the authoritative boundary once the vendor confirms the registration path.
- Test exact expiry, cancellation, surplus/dust recovery, compliance false and
  revert, malformed/no-return token behavior, fee-on-transfer rejection,
  refund failure rollback, reentrancy and every authorization boundary.
- Do not deploy until the registration and unrestricted-rule questions above are
  answered and reviewed by the advisor.

## Current decision

Proceed with the vendor-neutral vault mechanics and local mocks only. Support
has cleared Factory Mode as a permitted direction and supplied the Monad UAT
validator address, so the next safe implementation step is an unprivileged
Factory prototype plus read-only/on-fork validation of the documented
`registerV2` and `registerApass` interfaces. Do not enable `/validator/grant`,
deploy a live integration, activate a vault, or claim settlement compliance
until the exact grant signature/role target, policy deployment, restrictive-rule
state, CVA transfer-hook behavior and refund-path A-Pass requirements are proven
on UAT. The verified UAT role lifecycle is evidence for the CVA issuance leg
only; it does not clear the settlement gate.
