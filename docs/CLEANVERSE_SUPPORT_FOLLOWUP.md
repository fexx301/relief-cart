# Cleanverse support follow-up

## Support response received — 2026-08-06

The following answers were supplied by Cleanverse support:

- Current UAT authorization endpoint: `/validator/grant`.
- Grant signer: the project's Factory contract owner.
- Factory contracts are supported; follow the CVI Compliance Validator integration guide.
- UAT `IAPassComplianceValidator`: `0xaC7e5179C2C7f03f209136886c172eb34F161792`.
- Refund-recipient A-Pass requirement depends on the CVA design.
- Cleanverse does not provide a CVA for `CWRS03`; the project should use a CVA issued by another developer.
- The transaction workflow and evidence sequence should follow the CVI Compliance Validator integration guide.

## What this resolves

- Use `/validator/grant` for the current UAT authorization request, despite the supplied PDF referring to `/api/cooperate/validator/apply` in its generic Factory authorization section.
- A ReliefCart Factory is an accepted architecture direction.
- The validator address is available for UAT integration work.
- `CWRS03` means the project must bring or issue its own CVA; Cleanverse is not supplying that asset.

## Still required before live mutation

Support's response does not provide enough deployment-specific detail to send a safe registration transaction. Confirm these exact values and calls from the guide or a redacted vendor test vector:

1. Is the `/validator/grant` request `address` the Factory contract address, and does it receive `REGISTER_ROLE`? The current response identifies the Factory owner as signer but does not explicitly state the role recipient.
2. What exact bytes and EIP-191 variant must the Factory owner sign? Confirm whether the message is lowercase `chain + factory_address`, and identify the expected recovered signer.
3. Which account or contract is the transaction sender for `/validator/grant`, and what retry/idempotency behavior applies?
4. For a one-benefit vault, confirm the exact sequence and arguments:
   `registerV2(vault, restrictiveRule)` then `registerApass(vault, cva, address(0))`.
5. Confirm the Factory's required validator role and whether one Factory can register both the vault pool and its CVA association.
6. Confirm the separate policy contract, deployed implementation/code identity, upgrade authority, and the read expected from `isRegistered(vault)` after registration.
7. Confirm whether the standard CVA hook checks both the vault and merchant on the vault-to-merchant transfer, including minting from the zero address and refunds to the fixed recipient.
8. Confirm which actors need A-Pass in this design, especially the refund recipient.
9. Confirm the evidence fields to retain: grant, registration, rule replacement, CVA registration, mint/funding, activation, compliance checks, redemption, negative cases, refund, transaction hashes, logs, block numbers, and audit/Travel Rule identifiers.

Do not store API credentials, signatures, private keys, raw Travel Rule files, raw response bodies, or PII in this repository.

---

Hi Cleanverse support,

Thanks for the clarification. I reviewed the CVA and CVI integration guides and want to confirm the deployment-specific UAT details before sending any transaction.

For chain ID 10143 and a standard CVA plus a RecoveryBenefitVault, could you please confirm:

1. The guide describes Factory Mode as `registerV2(vault, rule)` followed by `registerApass(vault, cva, fee)`. Is this the correct flow for my project, with `address(0)` as the fee address?
2. Which current UAT authorization endpoint should I use: `/validator/grant` or the guide's `/validator/apply`? Who signs `owner_signature`, what exact bytes are signed, and which account should receive `REGISTER_ROLE`?
3. May a ReliefCart factory/operator call both `registerV2` and `registerApass`, and what exact caller, role and transaction target should I use?
4. Does the registered CVA hook check both the vault and merchant on the vault-to-merchant transfer, while the vault separately calls `complianceVerify(vault, beneficiary)` during redemption?
5. Which actors need A-Pass in this flow: vault, beneficiary, merchant, issuer/operator and refund recipient? In particular, can a refund be sent to the fixed refund recipient without a CVI failure?
6. Should the restrictive RuleV2 rule use the on-chain `{bytes2 allowedGroup, bytes2 allowedSubGroup, uint8 minTier, uint8 minSubTier, uint256 poolCountryBitmap}` fields, and should I use the replace operation so the unrestricted rule is removed?
7. What does “CWRS03 requires your own mint” mean exactly, and which part of this standard-CVA flow satisfies it?
8. Please provide the deployment-specific validator/policy addresses, role permissions, expected registration checks and transaction evidence fields for UAT.
9. Please map the complete supported flow in order: authorization, registration, restrictive-rule setup, CVA funding, vault activation, beneficiary redemption, merchant settlement, expiry/revocation and refund. Please identify the caller, contract/API call and expected evidence for each step.

The validator is deployed on Monad UAT, but my read-only registration check currently reports the issued CVA as unregistered. I will keep live grant and registration calls paused until the exact target, signer and sequence are confirmed.

Thanks.
