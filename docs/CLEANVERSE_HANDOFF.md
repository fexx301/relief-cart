# ReliefCart × Cleanverse handoff

This file is the shared working brief for every session working on ReliefCart.
Read it before making product, architecture or implementation decisions. Update
the session findings section with new evidence; do not delete prior findings.

## Current objective

Prepare ReliefCart for the Cleanverse Build: Trusted Assets Hackathon RWA track
without overstating Cleanverse support or claiming absolute novelty.

The target demo is one verifiable issuance-to-settlement slice:

```text
verified issuer → Recovery Benefit issued/allocated
→ verified traveller + merchant → policy/restriction check
→ compliant merchant settlement → rejection/replay tests → audit evidence
```

## Hackathon facts

- RWA track requires CVI and CVA to be core from the issuance stage.
- The track accepts tokenization platforms, secondary markets and settlement pipelines.
- The public schedule says registration closes Aug 7, 23:59 UTC; build period is Aug 8–9; submission deadline is Aug 9, 23:59 UTC; results are Aug 14.
- Submission requires a public GitHub repo with commits during the build window, a demo video, a one-page summary, and a live demo URL or testnet deployment where possible.
- Supported chains shown publicly include Monad, Base, BNB Chain, Ethereum, Polygon, HashKey and Arbitrum. We should implement one chain end-to-end, targeting Monad testnet unless the sandbox requires another network.

## Product position

ReliefCart is not being presented as the first blockchain travel-insurance
product. The defensible differentiation is the integrated workflow:

> ReliefCart converts an issuer-approved real-world recovery obligation into a single-use, policy-bound merchant settlement instrument. CVI verifies issuer, traveller and merchant roles; CVA represents the supported benefit/settlement asset; policy rules evaluate the actual purchase; invalid or replayed transfers are rejected; successful settlement produces audit evidence.

Use “issuer-approved programmable benefit authorization” until Cleanverse
confirms the exact asset model. Do not claim “tokenized insurance claim,”
“Cleanverse-supported,” “Travel Rule compliant,” or legal enforceability until
the documentation and sandbox prove those statements.

## What exists in this repository

- `src/policy/engine.ts`: deterministic incident parsing, policy citations, caps, category/size/stock checks and abstention.
- `src/agent/caseStore.ts`: case lifecycle, quote expiry, exact-total checks, idempotency, approval gating and mock checkout.
- `src/commerce/client.ts`: local sandbox commerce client used by the legacy checkout UI; no external commerce provider is connected.
- `public/`: polished light/dark UI, logo asset and mock approval flow.
- `test/`: workflow and policy tests currently cover the mock flow.
- The repository now includes locally tested vault, Factory and validator-adapter contracts plus guarded UAT deployment and read-only preflight tooling. Public UAT settlement evidence remains pending.
- Do not read or copy `.env` values into this file or chat.

## Cleanverse verification gates

Before implementing the RWA architecture, prove all three:

1. **Documentation:** versioned API/SDK/contract docs show custom CVA/A-Token issuance or an officially supported equivalent.
2. **Written eligibility:** a Cleanverse engineer confirms that the recovery-benefit instrument qualifies as an RWA settlement pipeline.
3. **Runtime:** sandbox transactions prove issuance, issuance-time restrictions, a valid settlement, invalid/revoked/expired/replayed rejection, and audit/Travel Rule output.

Critical questions:

- Can a team create and mint a custom CVA/A-Token for an issuer-approved single-use recovery benefit?
- Can beneficiary, amount, expiry, jurisdiction, merchant/category and revocation rules be bound at issuance?
- Are rules enforced at the authoritative API/contract boundary, including direct transfer attempts?
- If per-claim CVA issuance is unavailable, is an issuer-wide CVA plus a non-bypassable per-claim authorization contract accepted by the RWA track?
- What exact testnet, API version, contracts, ABIs, roles and Travel Rule schema are required?

## Decision status

- Stay on RWA for now. ReliefCart has a stronger risk-adjusted build and UX position than starting an unrelated project.
- Do not pivot to generic warranty tokenization solely for novelty; public warranty tokenization prior art exists.
- Do not begin a broad Cleanverse rewrite until the issuance proof gate passes.
- ServiceBound/warranty is a possible future vertical, not the primary concept.

## Score strategy

Cleanverse's public rubric is Concept 20, CVI/CVA depth 30, Build 25, UX/demo
15 and Scale 10. Current strengths are Build and UX. The decisive weakness is
that CVI/CVA depth is currently unimplemented. The submission must visibly show
issuance, restrictions, accepted settlement, rejected paths, transaction hash
and audit evidence.

## Build-window plan

### Before Aug 8

- Read the Cleanverse docs privately using the docs access code; never commit or repeat credentials.
- Capture nonsecret endpoint names, schemas, contract addresses, ABIs and sandbox rules in a separate redacted notes file.
- Prepare Git/GitHub and a baseline commit; keep feature commits during Aug 8–9 for the required history.
- Prepare the demo script, one-page summary and deployment plan.

### Aug 8–9

- Implement one chain and one issuance-to-settlement path.
- Demonstrate at least wrong merchant, over-cap/expired, revoked and replay rejection.
- Record transaction hashes, compliance decision IDs, Travel Rule/audit output and explorer links.
- Run tests, deploy the live demo, record the video and email the submission before the deadline.

## Multi-session protocol

- The repository is the shared memory; chat history is not.
- Every new session must read this file first.
- New findings go under the session findings section with source URL, date and confidence.
- Never place API keys, private keys, seed phrases, access codes or PII in the repository.
- Consult the advisor before the CVA issuance architecture, before changing core types/clients/contracts, and before final validation.

## Session findings

Append new documentation or sandbox discoveries here. Include only redacted,
non-secret evidence.

<!-- New session findings go below this line. -->

### 2026-08-02 — Cleanverse documentation observations

**Sources and confidence**

- Primary source: [Cleanverse API documentation](https://docs.cleanverse.com/), reviewed in the authenticated documentation portal on 2026-08-02.
- Track/rubric context: [Cleanverse hackathon page](https://cleanverse.com/hackathon), reviewed on 2026-08-02.
- Confidence is high for the endpoint names, field names and response states transcribed below because they were read directly in the documentation. Confidence is not established for UAT runtime behavior, Monad testnet compatibility, deployed contracts, permissions, or full lifecycle semantics until sandbox transactions prove them.
- The documentation portal content showed a v5.6 API heading while a public resource label referenced v3. Treat the exact version/compatibility as unresolved until Cleanverse confirms the target version.

**Service, transport and response handling**

- Documented UAT base URL: `https://uatapi.cleanverse.com/api/cooperate`.
- Documented production base URL: `https://api.cleanverse.com/api/cooperate`.
- Requests require an `api-id` header. The documentation describes an `api-key` as Base64-decoded AES key material used by the client; no credential value is stored here.
- For the reviewed mutation endpoints, the request body is encrypted with vendor-mandated AES/CBC/PKCS5Padding using a fixed 16-byte zero IV, then Base64-encoded and wrapped as `{"data":"<ciphertext>"}`. This is a protocol requirement, not a security guarantee; fixed-IV unauthenticated CBC has confidentiality/integrity risks.
- A-Pass query/verification and the reviewed Fiat Ramp endpoints use plain JSON payloads over HTTPS. The reviewed endpoint documentation requires checking the business response, not merely HTTP status: use top-level `code === "0000"` where documented, interpret `/verify_apass` using its separate `data.code`, and require `applyStatus === "ISSUED"` for A-Token issuance.
- The documented chain identifier list includes `monad`, `base`, `ethereum`, `polygon`, `arbitrum`, `bsc`, `solana` and others. `monad` being listed does not prove support for the intended Monad testnet chain ID, deployed contracts, permissions or a complete issuance-to-settlement lifecycle.

**CVI / A-Pass endpoints and schemas**

- `POST /generate_apass` — encrypted request. Required fields shown: `customerId` (at least 12 alphanumeric characters), `expirationTime` (Unix seconds), and `wallet: { address, chain }`. Optional identity, bank, KYC, tier and group fields are documented. `identityDataList[].issuingCountryISO2` can produce country tags. The response includes a `cvRecordId`, tier, wallet information and `txHash`.
- `POST /query_apass` — plain JSON request `{ chain, address }`. The documented response includes `cvRecordId`, tier, `status` (`1` active, `2` frozen), `expirationTime`, KYC hash, group/sub-group and country information.
- `POST /update_status` — encrypted request to set A-Pass status to active (`1`) or frozen (`2`); the documented response includes a `txHash`.
- `POST /verify_apass` — plain JSON request `{ chain, atoken, address }`. Documented `data.code` meanings are `4` valid A-Pass / transfer allowed, `1` A-Token not found, `2` user has no A-Pass, and `3` A-Pass expired or frozen. This is a Cleanverse compliance preflight, not proof that settlement occurred or that the decision remains true at settlement time.
- Runtime behavior still needs proof for expiration boundaries, status changes between preflight and settlement, retries, rate limits, idempotency and UAT/production parity.

**CVA / standard A-Token issuance and rules**

- `POST /atoken/launch` — encrypted request. Required fields shown: `chain`, `token_name`, `token_symbol`, `decimals`, `admin_address`, `rule` and `icon`; `callback_url` is optional. The documented `rule` supports `allowed_group`, `allowed_sub_group`, `min_tier`, `min_sub_tier`, optional `is_black_list` and `countries`.
- Launch is asynchronous. The response returns `requestId` and `issueAssetId`; `GET /atoken/query_apply_status/{requestId}` must be polled until `applyStatus === "ISSUED"`. The issued response is documented to include an A-Token address, issuance transaction hash and timestamps. `PENDING`, `APPROVED`, `REJECTED` and `ISSUE_FAILED` are also documented states.
- After issuance, the documentation says the admin wallet must grant `MINTER_ROLE` to the token minter before minting. The reviewed material did not provide an authoritative ABI, role identifier, mint endpoint, minting transaction schema or proof that the issued token is compatible with an assumed ERC-20 settlement contract. `ISSUED` therefore proves neither mintability nor settlement compatibility.
- `POST /atoken/add_rule` — encrypted, create-only rule addition; duplicate rules are rejected. `POST /atoken/rules` — plain query. `POST /atoken/set_paused` — encrypted, token-wide pause. These endpoints do not document per-benefit expiry, per-benefit revocation, one-time replay prevention or an arbitrary merchant allowlist. Direct-transfer enforcement, rule immutability and rule update/removal behavior remain unproven.
- Wrapped A-Token issuance is a separate, more constrained flow involving an origin token, `access_core`, a deposit address and an institution source whitelist. The reviewed documentation does not establish that a wrapped or custom token is the correct Cleanverse-supported representation for ReliefCart.

**Transaction and audit evidence**

- `POST /query_txs` — plain JSON query supporting chain, address, symbol, time, transaction hash and type filters. Documented transaction records include transaction hash, from/to, amount, fee, type, block number/time and status.
- `POST /query_institution_txs` — plain JSON query supporting institution address, user address, symbol and deposit/withdraw type. A deposit may be represented as grouped transfer-plus-mint evidence.
- `POST /download_travel_rule` — plain JSON request using a withdraw or transfer transaction hash; the response returns a time-limited `downloadUrl` and `fileName`. Raw reports, temporary URLs, ciphertext, identifiers and linkable identity metadata must not be committed to this repository; any download requires an approved secure destination and retention policy.

**Runtime proof gates still open**

1. **Vendor-artifact gate:** obtain the authoritative ABI/source, deployed-bytecode match, role definitions, supported mint flow and exact environment/chain identifiers.
2. **API lifecycle gate:** prove A-Pass create/query/verify and A-Token launch/poll behavior in UAT, including failure and retry semantics.
3. **On-chain gate:** prove role grant, mint, balance change, ERC-20 transfer event and negative authorization behavior from receipts/logs, not only API responses.
4. **Settlement gate:** prove allowance/role behavior, atomicity, merchant/amount/expiry/revocation/replay enforcement and valid/invalid compliance cases.
5. **Evidence gate:** retain only a redacted repository manifest; keep raw artifacts in an approved secure location and download time-limited reports immediately when needed.

**Architecture decisions requiring advisor review before implementation**

- Standard A-Token versus wrapped/custom token representation, including whether customization preserves Cleanverse-recognized policy and transfer semantics.
- Token-versus-benefit granularity: issuer-wide asset with separate claim authorization versus one asset per recovery benefit; schema for beneficiary, fixed merchant, amount, expiry, revocation and single-use state.
- Enforcement boundary and preflight time-of-check/time-of-use risk: which restrictions Cleanverse guarantees, which a ReliefCart contract enforces, and whether settlement can be atomic.
- Admin/minter/treasury role ownership, allowance model, key custody, rotation, recovery and failure handling.
- Encrypted API-client trust boundary, secret management and acceptance/mitigation of the vendor-mandated fixed-IV CBC protocol.
- Evidence privacy, retention and the wording of compliance, backing, legal-enforceability and Travel Rule claims.
- Track 1 continuation versus Track 2 pivot, with stop conditions for missing ABI/mint support, failed Monad lifecycle proof, or incompatible transfer enforcement.

No architecture choice is made by this documentation update. These findings are documentation observations reviewed 2026-08-02; runtime validation is pending.

### 2026-08-02 — Redacted UAT capability probe

- Source: Cleanverse UAT base URL `https://uatapi.cleanverse.com/api/cooperate`; probe implementation: `scripts/cleanverse-smoke.mjs`.
- Date: 2026-08-02. Confidence: high for the observed HTTP/business responses; medium for end-to-end lifecycle conclusions because on-chain receipts, deployed bytecode, ABI and role state were not independently inspected.
- The probe used synthetic customer data and one disposable testnet address. Credentials and raw response bodies were not written to the repository or printed.
- UAT authentication and the vendor encryption/plain-JSON request paths succeeded. The relevant calls returned HTTP 200 with top-level `code === "0000"`.
- `generate_apass` succeeded and returned a Cleanverse record identifier and transaction hash. `query_apass` succeeded for the same disposable address.
- `atoken/launch` succeeded and returned an asynchronous request identifier and issue-asset identifier. Polling observed `ISSUING` followed by `ISSUED`; the response included an A-Token contract address and issuance transaction hash. Those identifiers are intentionally omitted here.
- `verify_apass` succeeded with documented `data.code === 4` for the issued token/address pair. This proves Cleanverse compliance preflight for the observed state, not minting, transfer, redemption or settlement.
- Gates 1–3 are provisionally passed: UAT/API behavior, A-Pass lifecycle and issuance-status evidence. Gates 4–5 remain open: authoritative ABI/bytecode/role procedure, minting, balance/event proof, settlement behavior and negative cases.
- No contract, core application type, UI flow or Track decision was changed as a result of this probe. The next action is read-only contract/receipt/ABI validation or obtaining the authoritative Cleanverse artifacts before any mint or settlement transaction.

### 2026-08-02 — Read-only A-Token contract inspection

- Sources: [Cleanverse API documentation](https://docs.cleanverse.com/) and the [Monad testnet explorer](https://testnet.monadexplorer.com/); Monad JSON-RPC reads were performed against the configured testnet RPC. Date: 2026-08-02. Confidence is high for the observed chain/API responses and bytecode measurements; confidence is not established for ABI semantics, upgrade authority or mint authorization.
- The v5.6 documentation adds `GET /atoken/list_my_atokens`, which recovered the ReliefCart probe’s `LAUNCH` row without issuing another token. It also explicitly says that, after `ISSUED`, the admin wallet should grant `MINTER_ROLE` to a token minter. The reviewed docs still do not provide a deployment-bound ABI, implementation source/code hash, exact role constant, mint procedure, amount-unit rules, expected mint events, or upgrade-control procedure.
- The issued token has a 122-byte proxy runtime. The standard EIP-1967 implementation slot resolves to an implementation with 6,749 bytes of runtime code. The issuance receipt succeeded and emitted role/initialization-related logs; `totalSupply` and the admin balance are currently zero.
- Bytecode inspection found selectors consistent with ERC-20 metadata, balances, transfers, allowances, AccessControl (`hasRole`, `grantRole`, `revokeRole`) and `mint(address,uint256)`. Selector presence is only compatibility evidence; it does not prove function behavior, authorization, units, caps, upgrade safety or that the proxy is the correct transaction target.
- Read-only role calls show the supplied admin currently has `DEFAULT_ADMIN_ROLE`. The candidate `keccak256("MINTER_ROLE")` value is not held by that admin, and its role-admin relationship resolves to the default admin role. This does not establish that the candidate hash is the role actually enforced by `mint`.
- Cleanverse rule query returned one unrestricted default rule for the probe token; pause query returned `paused: false`. These observations do not establish benefit-level expiry, revocation, replay prevention, merchant restrictions or redemption.
- The explorer page for the implementation did not expose verified source or a usable ABI. No role grant, mint, transfer, settlement or other state-changing transaction was attempted.

**Decision after review:** Stop state mutation. Keep Track 1 conditional. Before creating a minter wallet or sending a role grant, obtain from Cleanverse the exact deployment-bound ABI/source or code hash, proxy-versus-implementation transaction target, exact `MINTER_ROLE` value/getter, mint signature and units, restrictions/events, proxy upgrade model, and minter custody/rotation/revocation procedure. Local-fork simulation may proceed, but it cannot replace Cleanverse confirmation.

### 2026-08-04 — Official CCP/CVI/CVA integration guides supplied locally

- Source URL: [Cleanverse documentation portal](https://docs.cleanverse.com/). Source artifacts supplied locally on 2026-08-04: the CCP CVI Compliance Validator V2 integration guide and the CCP CVA integration guide. Confidence is high for the documented interfaces and templates; deployment-specific and business-specific behavior remains to be bound and tested.
- The CVI V2 guide defines `RuleV2` as `allowedGroup`, `allowedSubGroup`, `minTier`, `minSubTier` and `poolCountryBitmap`. Fields inside one rule use AND semantics; multiple rules use OR semantics.
- The CVI validator interface documents `registerV2`, `registerApass(pool,aToken)`, `registerApass(pool,aToken,fee)`, `setRuleV2FromRegistrar`, `isRegistered`, business-contract rule management, and permissionless `complianceVerify(poolAddress,userAddress)`.
- CVI integration has two relevant modes: factory mode for multiple pools, requiring `REGISTER_ROLE`; and single-contract mode, where a business contract is registered through `/validator/register` and calls `complianceVerify` in its own business methods. The CVI guide’s automatic CVA path registers a pool plus A-Token (and optional fee) so the CVA transfer hook verifies both sender and recipient.
- The CVA guide describes CVA as a native compliant ERC-20 standard with direct issuance, built-in CVI/RuleV2 transfer checks, pause/resume and whitelist controls, Travel Rule reporting, an API Launch path and a Custom Contract Template path.
- The CVA Method A guide explicitly documents an optional post-verification `grantRole(bytes32 role, address account)` call on the CVA contract. It defines `MINTER_ROLE` as `keccak256(\"MINTER_ROLE\")`, and states that an issuer may skip the grant when its own MINTER_ROLE holder mints directly.
- The CVA Method B template requires the custom token to bind a policy contract, call `policy.canTransfer(token,from,to,amount)` before transfers, support mint/burn and Ownable or AccessControl, and register the contract with Cleanverse before policy configuration and activation. The upgradeable template includes `mint(address,uint256)`, `burn(address,uint256)`, `MINTER_ROLE` and RuleV2 management wrappers.
- These guides materially clear the earlier generic ABI/role-label gap. They do not yet prove the exact UAT proxy’s implementation/source hash, policy address, validator address, pool-registration permission, proxy upgrade authority, or the merchant-bound expiry/replay/single-use semantics ReliefCart needs.
- Architecture implication: a standard CVA can provide Cleanverse-governed CVI transfer compliance, while a separate ReliefCart business/pool contract must enforce benefit identity, fixed merchant, amount, expiry and replay state. Whether that contract should use automatic CVA registration or single-contract `complianceVerify` still requires deployment-specific validation and advisor approval.

### 2026-08-04 — Advisor re-review after official CCP guides

- Verdict: **REVISE**. The official guides clear the generic `grantRole` ABI and `MINTER_ROLE` label gap, but only partially clear minting and do not clear settlement architecture.
- Conditional next gate: run one tightly bounded UAT grant–mint–revoke smoke test. Require simulation/estimate first, exact one-base-unit supply and balance deltas, expected events, role verification, immediate role revocation, and a subsequent unauthorized-mint failure. Stop on target mismatch, unexpected behavior, or inability to revoke.
- Continue to block settlement deployment and public claims until the Monad UAT validator/policy addresses, implementation/code identity, upgrade authority, pool registration permissions, `registerApass` procedure, and Cleanverse acceptance of a merchant-bound Recovery Benefit vault are confirmed.
- Keep the architecture layered: standard CVA is the fungible compliant settlement asset; ReliefCart’s registered benefit vault owns `{beneficiary, merchant, amount, expiresAt, status}` and enforces fixed merchant/amount, expiry and single-use state; CVI/RuleV2 supplies identity compliance. Do not call the CVA itself merchant-bound or single-use.
- If the vault holds CVA, validate both registration paths: `registerV2` for its RuleV2 pool policy and `registerApass(vault,cva,address(0))` for CVA holding/transfer compliance. Use direct `complianceVerify` in the vault where the business action needs an explicit identity check.
- RuleV2 is an identity policy, not a benefit lifecycle policy. Because multiple rules are ORed, the existing unrestricted rule must be replaced/removed or the token relaunched before meaningful negative compliance tests can be claimed.
- Keep a dedicated issuer minter operator separate from the benefit vault. At that review stage, no settlement contract, minter wallet, role grant, mint or transfer transaction had been created.

### 2026-08-04 — UAT grant–mint–revoke proof

- Sources: [Cleanverse documentation portal](https://docs.cleanverse.com/), the supplied CCP CVA/CVI integration guides, the Monad JSON-RPC endpoint, and `scripts/cleanverse-role-smoke.mjs`. Date: 2026-08-04. Confidence is high for the observed UAT receipts, event logs, role reads and balance deltas on this issued standard CVA deployment; it is not evidence for other deployments or production.
- The harness first simulated `grantRole(bytes32,address)` and `revokeRole(bytes32,address)` from the configured admin. It then broadcast a grant using `keccak256("MINTER_ROLE")`; the receipt succeeded, emitted the expected `RoleGranted` event, and a subsequent `hasRole` read returned true.
- The authorized minter simulated and broadcast `mint(address,uint256)` for exactly one base unit to a wallet that had already passed the A-Pass compliance preflight. The receipt succeeded, emitted exactly one zero-address `Transfer`, and both `totalSupply` and the recipient balance increased by exactly one.
- The admin immediately broadcast `revokeRole`. The receipt succeeded, emitted `RoleRevoked`, `hasRole` returned false, and a post-revocation mint estimate reverted. The clean run therefore proves the documented role lifecycle and basic mint accounting, not settlement or benefit semantics.
- An initial harness parser selected an event topic instead of the JSON receipt’s transaction hash. The transaction was independently confirmed as a successful grant, immediately revoked, and verified not to mint; the parser was corrected before the clean run. No private key, password, raw API credential or personal data was written to the repository.
- Advisor verdict: **PASS** for the conditional grant–mint–revoke gate. The remaining claims are not cleared: CVI-gated transfer rejection, merchant binding, expiry, revocation, single-use redemption, pause behavior and end-to-end settlement.
- Next architecture gate: approve the standard CVA / ReliefCart benefit-vault boundary, exact `registerV2` and `registerApass` wiring, validator/policy addresses and permissions, replacement of the unrestricted RuleV2 rule, and the redemption state machine before deploying a vault or making end-to-end compliance claims.

### 2026-08-04 — Recovery Benefit Vault architecture review

- Source: [Cleanverse documentation portal](https://docs.cleanverse.com/), the supplied CCP CVA/CVI guides, and the proposed non-deployed specification at `docs/CLEANVERSE_BENEFIT_VAULT_SPEC.md`. Date: 2026-08-04. Confidence is high for the documented composition and security corrections; deployment readiness remains unproven.
- Advisor verdict: **REVISE**. The layered boundary is sound for the demo: standard CVA remains the fungible compliant settlement asset, while ReliefCart owns the fixed beneficiary, merchant, amount, expiry, revocation and replay state in a separate vault.
- The state machine was revised to `Pending → Active → Redeemed/Revoked → Refunded`. Activation now follows registration, restrictive-rule replacement and funding confirmation. Expiry is strict: redemption requires `block.timestamp < expiresAt`.
- Redemption will require a presented merchant value equal to the immutable merchant so wrong-merchant rejection is directly demonstrable. It will require `balanceOf(vault) >= amount`, not equality, and will fail closed on validator errors or false responses.
- Recovery is required after revocation or expiry and must send the remaining CVA balance to a fixed refund recipient. Direct minting is evidenced by the CVA `Transfer` event; vault activation emits the app-specific activation event after confirmation.
- Implementation remains blocked until Cleanverse confirms validator/policy addresses, registration permissions, `registerApass` fee behavior, transfer-hook semantics, unrestricted-rule replacement, upgrade authority, and negative-case behavior. No vault contract or settlement transaction has been created.

### 2026-08-04 — Cleanverse-supplied validator artifact and registration probe

- Source: Cleanverse Labs admin message supplied as a screenshot on 2026-08-04 and read-only Monad JSON-RPC checks against `https://testnet-rpc.monad.xyz`. The validator address is stored only in local configuration, not in this handoff. Confidence is high that the supplied validator is deployed on the configured UAT chain; registration and policy semantics remain unconfirmed.
- The supplied validator has 122 bytes of proxy runtime and a nonzero standard EIP-1967 implementation slot. The issued CVA also has 122 bytes of proxy runtime, with a different implementation slot, confirming that the validator and CVA are distinct deployed proxy contracts.
- `isRegistered(issuedCVA)` returned `false`. The prior UAT mint proof therefore does not imply that the CVA or a future Recovery Benefit Vault is registered for CVI transfer enforcement.
- The next vendor question is narrowed to the registration transaction path: exact `registerV2`/`registerApass` caller and arguments, policy/RuleV2 configuration, role permissions, and the procedure for replacing the unrestricted rule before activation.

### 2026-08-05 — Cleanverse support confirms validator authorization path

- Sources: [Cleanverse API documentation](https://docs.cleanverse.com/) and a Cleanverse Labs support response supplied as a screenshot on 2026-08-05. Confidence is high for the support statements and documented request shapes; confidence is medium for the resulting registration architecture until the exact UAT signer, policy and pool-registration behavior are demonstrated on-chain.
- Support confirmed that the API documentation covers validator rule addition, rule removal and pausing. Support also stated that `CWRS03` requires the project to mint its own asset. `CWRS03` is retained as vendor terminology only; its exact expansion and applicability to the ReliefCart flow remain unresolved.
- The documented authorization mutation is encrypted `POST /validator/grant` with plaintext fields `{ chain, address, owner_signature }`. The `address` receives the validator registration role, and the documented EIP-191 signing message is the lowercase concatenation of `chain` and `address`. The documentation describes `owner_signature` as a contract-owner signature; it does not establish whether the signer is the ReliefCart admin or the Cleanverse validator owner.
- The documented pool-registration mutation is encrypted `POST /validator/register` with `{ chain, contract_address, rule, owner_signature }`. The rule supports the documented RuleV2-derived fields for group, subgroup, minimum tier and country constraints. Read-only `POST /validator/is_register` accepts `{ chain, contract_address }`; encrypted `POST /validator/set_rule` replaces the rules for a registered pool, while add/remove mutations are also documented. Support said a rule can be replaced by adding a new rule or deleting the old rule. Because RuleV2 rules are OR-combined, an existing unrestricted rule must not remain when the demo claims restrictive rejection.
- Contract evidence remains deployment-specific: the validator supplied by Cleanverse is a live Monad UAT proxy, but the issued CVA currently returns `false` for the validator's registration check. The validator address, API credentials and raw response bodies remain outside this handoff. No new grant or registration mutation was sent from this finding.
- Architecture consequence: prepare a repository-secret-free helper for codec validation, candidate signing-message preparation and read-only registration checks. Live mutations are currently disabled, not merely hidden behind a flag. Before enabling a future guarded mutation path, obtain written confirmation of (1) who signs `owner_signature`, (2) which ReliefCart account should receive `REGISTER_ROLE`, (3) whether `/validator/register` binds a standard CVA, a ReliefCart vault, or only a single-contract policy pool, (4) whether `registerApass` is separately required for a vault holding the CVA, (5) the exact policy contract and rule-replacement procedure, and (6) the meaning of `CWRS03`.

### 2026-08-05 — Advisor review of validator API and vault boundary

- Advisor verdict: **REVISE**. Proceed with only offline codec/signature preparation and a read-only registration check. Do not enable live `/validator/grant` or `/validator/register` mutations yet.
- The repository helper may validate the documented AES-CBC envelope, prepare candidate lowercase signing messages, validate RuleV2-shaped input, and perform the plain-JSON registration read. A local AES round trip is not proof of vendor compatibility; request a literal vendor test vector before treating the codec as interoperable.
- `--execute` alone is not a sufficient safety boundary while the signer, target address, registration target, and EIP-191 variant are unresolved. No reusable signature, decrypted keystore, password, API key, plaintext payload, ciphertext or raw response should be logged.
- Before any mutation, Cleanverse must map the complete sequence for Monad chain ID 10143: literal bytes-to-sign, EIP-191 variant, canonical chain value, expected recovered signer, meaning of every address field, resulting on-chain calls, transaction sender, role revocation, retry/idempotency behavior, and a redacted known-good request/response for both validator mutations.
- Cleanverse must also confirm whether the issued CVA, issuer/operator, or benefit vault receives `REGISTER_ROLE`; whether the registration target is the CVA or vault; whether separate `registerApass` is required; which actors need A-Pass; and the exact meaning and enforcement of `CWRS03`.
- Keep the one-vault-per-benefit architecture provisionally. The vault remains unprivileged and separate from `MINTER_ROLE`, but activation must wait for verified on-chain registration, final restrictive rules, funding and tested contract-held-CVA redemption/refund behavior. If a vault cannot hold or transfer the CVA compliantly, revise the escrow boundary rather than claiming end-to-end compliance.

### 2026-08-05 — Vendor-neutral Recovery Benefit Vault prototype

- Sources: the local prototype at `contracts/RecoveryBenefitVault.sol`, its generic interfaces and mocks, the local Foundry suite at `solidity-test/RecoveryBenefitVault.t.sol`, and the revised architecture specification. Date: 2026-08-05. Confidence is high for the tested local state-machine and token-invariant behavior; confidence is zero for Cleanverse deployment or compliance semantics because no vendor adapter or chain deployment was used.
- The prototype uses an immutable generic `IComplianceGate` with separate beneficiary and merchant checks. It does not embed `complianceVerify`, `registerV2`, `registerApass`, `/validator/grant`, or any other unconfirmed Cleanverse ABI.
- The prototype keeps the CVA token, gate, beneficiary, merchant, amount, expiry, refund recipient and operator immutable; has no mint function and no `MINTER_ROLE`; and uses `Pending`, `Active`, `Revoked`, `Cancelled`, `Redeemed` and `Refunded` states.
- Local safeguards include strict expiry, activation only after operator attestation and sufficient funding, cancellation/refund for funded Pending benefits, fail-closed compliance calls, consume-before-transfer, reentrancy protection, exact vault/recipient balance-delta checks, fixed-destination recovery and post-redemption surplus recovery.
- Foundry result on 2026-08-05: 15 tests passed, covering valid redemption and the principal local negative paths. These tests are prototype evidence only; they do not prove a Cleanverse CVA can hold, transfer, register or settle through this vault.
- Deployment remains blocked on Cleanverse confirmation of the validator adapter, registration target and permissions, RuleV2 replacement, CVA transfer-hook semantics, and `CWRS03`. No deployment script or live mutation path was added.

### 2026-08-05 — Official guides clarify CVA and CVI registration modes

- Sources: [Cleanverse documentation portal](https://docs.cleanverse.com/) and the locally supplied CCP CVA and CCP CVI integration guides, reviewed on 2026-08-05. Confidence is high for the documented interfaces and workflows; UAT endpoint/version, deployed permissions and project-specific acceptance remain unverified.
- The CVI guide defines `RuleV2` as `{ bytes2 allowedGroup, bytes2 allowedSubGroup, uint8 minTier, uint8 minSubTier, uint256 poolCountryBitmap }`. Fields within one rule are ANDed; multiple rules are ORed. `setRuleV2FromContract` replaces all rules, while add/remove manage the rule list incrementally.
- The CVI guide's Factory Mode requires an authorized Factory holding `REGISTER_ROLE`. The Factory calls `registerV2(poolAddress, rule)` and then `registerApass(poolAddress, aTokenAddress, feeAddress)` for a CVA vault. A zero fee address skips the Fee CVI registration. The guide says the CVA then automatically checks CVI on transfers, and the pool business contract can call `complianceVerify(poolAddress, userAddress)` for business-level checks without a permission requirement.
- The CVI guide's Single-Contract Mode does not require Factory authorization: deploy the business contract, register its address through the API, manage rules through owner-protected contract wrappers, and call `complianceVerify` inside business methods. The API registration binds the contract address; it does not itself perform the business-contract compliance checks.
- The CVA guide's standard API Launch path is: launch CVA, Cleanverse review, optionally grant `MINTER_ROLE`, then mint through an issuer-controlled holder. The custom-CVA path is different: it registers a custom token using an `atoken_address`, requires the contract owner's EIP-191 personal signature over lowercase `(chain + atoken_address)`, and does not take a RuleV2 in the registration request; rules are configured after registration. This custom-CVA signature rule must not be substituted for the standard-vault API without confirming the selected path.
- Architecture consequence: the current standard-CVA-plus-vault design should be validated against Factory Mode first: authorize the factory/operator, call `registerV2(vault, restrictiveRule)`, call `registerApass(vault, cva, address(0))`, call the validator for the beneficiary at redemption, and rely on the registered CVA hook to check the vault-to-merchant transfer if Cleanverse confirms that behavior. The refund recipient's CVI requirement and the exact treatment of the vault during minting/refunding still need confirmation.
- Remaining vendor questions are now narrower: current UAT authorization endpoint (`/validator/grant` versus the guide's `/validator/apply`), exact signer and address semantics, whether a ReliefCart factory/operator may call both registration functions, the deployment-specific policy/validator addresses and roles, whether the standard CVA hook checks the vault and merchant as expected, whether the beneficiary and refund recipient need A-Pass, and the meaning of `CWRS03`.

### 2026-08-06 — Cleanverse support response to validator follow-up

- Source: Cleanverse support response supplied by the project owner on 2026-08-06. Confidence is high for the literal endpoint and capability statements; confidence is medium or low for deployment-specific execution because the response points back to the guide and does not provide transaction-level details.
- Support confirmed the current UAT authorization endpoint is `/validator/grant`, resolving the `/validator/grant` versus `/validator/apply` question.
- Support said the grant is signed by the project's Factory contract owner. This identifies the responsible owner role, but does not yet establish the exact EIP-191 bytes/variant, whether the owner is an EOA or controlled signer, which address is submitted in the `address` field, or which address receives `REGISTER_ROLE`.
- Support confirmed that the project may use a Factory contract and referred the project to the CVI Compliance Validator integration guide. This supports the provisional Factory Mode architecture, but does not prove the exact UAT caller, role holder, transaction target, or permissions for `registerV2` and `registerApass`.
- Support supplied `IAPassComplianceValidator` at `0xaC7e5179C2C7f03f209136886c172eb34F161792`. A read-only Monad UAT check confirmed chain ID `10143`, 122 bytes of proxy runtime, and a nonzero EIP-1967 implementation at `0x68ce853d660444ffd98d6d5d98ac8ad58241d5a9`. This establishes that the supplied validator address is a deployed proxy on the configured chain; no separate policy address, verified implementation/source identity, upgrade authority, or role inventory was supplied. A read-only `/validator/is_register` request against the validator address itself returned `false`, which is only an endpoint sanity check because the validator is not expected to be its own registered pool.
- Support said whether the refund recipient needs A-Pass depends on the CVA design. The vault must therefore keep the refund path unclaimed until the selected CVA/registration design is tested. Do not assume refunds are exempt from CVI.
- Support clarified that Cleanverse does not provide a CVA for `CWRS03`; the project should use a CVA issued by another developer. This resolves the immediate meaning of the support shorthand, but does not prove whether the intended standard CVA, custom CVA, or another issued asset is accepted for this flow.
- For the evidence sequence, support referred to the CVI Compliance Validator integration guide rather than providing a deployment-specific sequence or evidence schema. The required runtime proof remains: Factory authorization, restrictive registration/rule replacement, CVA registration, funding receipt, activation evidence, beneficiary and merchant compliance results, successful redemption receipt, and negative/replay/refund receipts.

**Updated gate status**

- Resolved or materially narrowed: current endpoint (`/validator/grant`), Factory usage is permitted, validator address supplied, and `CWRS03` requires a project/third-party-issued CVA rather than a Cleanverse-provided CVA.
- Still open: exact signer and signed bytes, `REGISTER_ROLE` recipient, Factory and validator role permissions, separate policy address and deployment identity, exact `registerV2`/`registerApass` caller and argument sequence, refund-recipient A-Pass behavior, transfer-hook semantics, and transaction evidence schema.
- Decision: continue with the vendor-neutral vault and prepare only guarded/read-only integration tooling. Do not add a Cleanverse adapter, send registration mutations, activate a live benefit, or claim end-to-end Cleanverse settlement until the remaining gates are proven on Monad UAT.

### 2026-08-08 — Build-window integration hardening and public history

- Sources: the local Solidity contracts, Foundry suites, guarded Node tooling and the public
  [ReliefCart repository](https://github.com/fexx301/relief-cart). Date: 2026-08-08. Confidence is
  high for local contract behavior and Git history; confidence remains unestablished for UAT
  registration, transfer-hook behavior and settlement until public transactions prove them.
- The repository was initialized during the official build window. The root commit is explicitly
  labelled as the pre-hackathon baseline through Aug 7; subsequent Cleanverse adapter,
  registration-hardening and UAT-tooling changes are separate build-window commits. No history
  was backdated or squashed.
- `CleanverseComplianceGate` now maps ReliefCart checks to the documented validator
  `complianceVerify` call and treats a pool as ready only when it is registered with exactly one
  nonzero RuleV2 rule.
- The Factory now rejects an unrestricted rule, atomically calls `registerV2` and
  `registerApass`, reads back exact registration/rule state, and confirms that transaction into
  the intended vault. The vault cannot activate from an evidence hash alone: it requires the
  Factory callback and live restrictive readiness in addition to funding.
- Foundry result: 37 tests pass across the adapter, Factory, vault and adversarial-token suites.
  TypeScript type-checking and script syntax checks also pass. These are local proofs only.
- Guarded deployment now has separate foundation and vault modes, requires external encrypted
  keystore files plus an explicit `--execute`, verifies chain ID and constructor wiring, and does
  not persist signatures or credentials. The read-only preflight has explicit `foundation`,
  `granted`, `registered`, `funded` and `active` assertions.
- Advisor verdict: **REVISE**, then proceed with a disposable, staged Monad UAT attempt rather
  than waiting indefinitely. Final compliance claims remain blocked until runtime evidence is
  captured.
- Next gate: deploy the compliance adapter and Factory, prove `REGISTER_ROLE`, then deploy and
  register a success vault using RuleV2 values derived from the actual UAT A-Pass subjects. No
  UAT deployment or registration transaction is claimed by this finding.

### 2026-08-08 — Monad UAT foundation, Factory grant and validator ABI mismatch

- Sources: [Cleanverse documentation portal](https://docs.cleanverse.com/), the locally supplied
  CCP CVI integration guide, Cleanverse UAT API responses, and read-only Monad RPC calls and
  traces against chain ID 10143. Date: 2026-08-08. Confidence is high for transaction receipts,
  role state, deployed bytecode selectors and the failed-call trace; the vendor-supported
  compatibility path remains unknown.
- ReliefCart deployed `CleanverseComplianceGate` at
  `0xff89697eb9ceb2351621210e48857a48f43d8e79` in transaction
  `0x5cd4fc5533880ac6e5b3591f546b0d14634c3f06ef5401d79dd04303fcc4b66c` and
  `RecoveryBenefitFactory` at `0x16915850950752fc0cefe100a2a03a9c4419811b` in transaction
  `0xc1269d09801a6fe116ca62a4cbc2c1dda6c5d2e83631dc110986ca205585c4fe`.
  Read-only foundation checks verified runtime code, validator wiring and the Factory owner.
- Encrypted `/validator/grant` succeeded for the deployed Factory in transaction
  `0xa9d994f293b78181c16e42979cd3e1fb69875a758460845d3a966bca7051a568`
  at block 52069090. Independent RPC reads prove the Factory holds the validator's on-chain
  `REGISTER_ROLE`. The replayable EIP-191 signature was neither logged nor persisted.
- The configured beneficiary has an existing active tier-50 A-Pass. A separate synthetic merchant
  A-Pass was issued in transaction
  `0xb3704fb8d3e0a09fe41b31024f58ef363111422a462c8af5cdb7bb081c67d073`;
  both subjects are active and return documented `verify_apass` code 4 for the issued CVA.
- A success-vault candidate was deployed at `0xf5bd05f8fb844a524074a57120b12715e2035496`
  in transaction `0xfa1933e73de749c1d8a7151e155c887829f3ae8368356234095803de0dd8d6cf`.
  No registration, funding, activation or redemption transaction was sent for this vault.
- The mandatory pre-broadcast simulation of the documented Factory sequence reverted inside
  `registerV2`. A local trace shows selector `0xba62f533` reaching the supplied validator proxy and
  implementation, then immediately reverting with empty data. Simulations with minimum tier 50
  and 1 fail identically, ruling out the chosen tier as the immediate cause.
- Bytecode selector extraction from implementation
  `0x68ce853d660444ffd98d6d5d98ac8ad58241d5a9` proves that `registerV2` selector
  `0xba62f533` is absent. The deployment does contain the documented selectors for both
  `registerApass` overloads, `getRulesV2`, `isRegistered`, `complianceVerify` and
  `removeRuleV2FromContract`, plus legacy rule-management selectors. The on-chain
  `REGISTER_ROLE()` value matches the granted role, so the failure is not a role-hash mismatch.
- Visual and text review of the official CVI guide confirms that Factory Mode explicitly requires
  `registerV2(pool, RuleV2)` followed by `registerApass(pool, cva, fee)`. The supplied UAT
  deployment therefore does not implement the guide's complete Factory ABI. The API and RPC
  registration reads both remain false for the vault after the simulation.
- Decision: do not guess legacy selectors and do not broadcast the incompatible Factory call.
  Request either a corrected/upgraded UAT validator or written confirmation that
  `/validator/register` is the supported compatibility path for this exact proxy. Continue only
  with bounded read-only checks and advisor-reviewed alternatives until that path is established.

### 2026-08-08 — Support confirms signing, CVA pool and A-Pass semantics

- Sources: [Cleanverse documentation portal](https://docs.cleanverse.com/) and a written Cleanverse
  support response relayed by the project owner on 2026-08-08. Confidence is high for the stated
  vendor semantics, but the response did not resolve the deployed validator's missing Factory
  selector or provide a deployment-specific evidence checklist.
- Support confirmed that the deployed project Factory is submitted to `/validator/grant` and that
  exact Factory receives `REGISTER_ROLE`.
- The Factory owner signs the lowercase string concatenation of chain and Factory address with
  EIP-191 `personal_sign`. The chain value is `monad` on both mainnet and testnet. Wallet libraries
  perform the personal-sign prefixing and hashing; the project must not pre-hash the message as an
  extra application step. The provided sample was only illustrative, not a complete redacted test
  vector with signer and recovered-address output.
- Support confirmed that a project may launch its own CVA. The previously issued ReliefCart probe
  is an API-launched standard CVA, so this clarification does not by itself require a second asset
  deployment.
- `registerApass(pool, cva, address(0))` registers the pool as the CVA pool and permits that pool to
  hold and transfer the CVA. On mint, the CVA checks the receiving pool. On refund, the recipient is
  checked. Every address sending or receiving CVA therefore requires an active A-Pass in this flow.
- Support identified `POST /validator/set_rule` as the rule-replacement operation. The resulting
  rules can be read through `POST /validator/rules` or on-chain `getRulesV2(pool)`. This confirms
  the replacement and proof surfaces, but does not establish initial pool registration when the
  deployed implementation lacks the guide's `registerV2` entrypoint.
- Still unresolved: the complete current `/validator/grant` request contract and redacted working
  signature vector, the supported initial-registration path for this exact validator deployment,
  the API launch/review details that judges should treat as issuance evidence, and the required UAT
  evidence list. The current candidate vault remains frozen and unfunded pending that resolution.

### 2026-08-08 — Project CVA mint receipt recovered from historical state

- Source: read-only historical Monad RPC state and logs for the configured ReliefCart API-launched
  standard CVA on chain ID 10143. Date: 2026-08-08. Confidence is high: the successful public
  receipt, event topics, amount, supply and recipient balance agree.
- Historical balance binary search located the first nonzero recipient balance at block 50901711.
  The corresponding successful transaction is
  `0x54150db03d020116120e75ee1f17b69335464bac8087838087113119bc49e3b4`.
- The receipt contains one CVA `Transfer` event from the zero address for exactly one base unit. The
  transaction sender is the dedicated project minter used by the earlier grant–mint–revoke proof;
  current token `totalSupply` and recipient `balanceOf` both remain exactly one base unit.
- This clears the public evidence gap for a project-controlled standard-CVA issuance event. It does
  not clear vault registration, CVA pool association, restrictive rule enforcement, funding,
  activation or settlement; those remain explicitly unclaimed.
