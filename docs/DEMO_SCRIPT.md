# ReliefCart demo script

Target length: 3–4 minutes. Keep the browser, public evidence manifest and terminal ready before
recording.

## Setup

```bash
cd relief-cart
npm install
npm run dev
# open http://127.0.0.1:4040
```

Optional proof terminal:

```bash
npm run cleanverse:preflight -- --stage granted
forge test
npm test
```

## 0:00–0:25 — Problem and promise

> A delayed-baggage reimbursement starts too late. The traveller pays first, the institution
> reviews later, and policy violations are discovered after money moves. ReliefCart turns an
> approved recovery obligation into one policy-shaped merchant settlement.

Show the hero and the line: **Policy before purchase. Proof after checkout.**

## 0:25–1:10 — Real Cleanverse UAT evidence

Scroll to **Cleanverse proof, not promises**.

1. Open the **CVA mint receipt**. Point to the successful transaction and the one-base-unit
   `Transfer` from the zero address.
2. Open the **merchant A-Pass issuance**. State that both traveller and merchant have active
   tier-50 A-Passes and return verification code 4.
3. Open the **Factory role grant**. State that the deployed Factory currently holds
   `REGISTER_ROLE` on the supplied validator.
4. Point to **Fail-closed**. Explain that the supplied validator implementation lacks the guide's
   `registerV2` selector, so the simulation was stopped before broadcast. Do not say that the
   vault is registered, funded or settled.

> The UAT proof is deliberately split into verified, locally tested and blocked states. A failed
> simulation is evidence of a safe boundary, not evidence of settlement.

## 1:10–2:35 — Recovery workflow

1. Click **Load demo report** — United delayed bag, claim `UA-PIR-2026-784421`, meeting tomorrow.
2. Click **Verify incident and build plan**.
3. Show the evidence board: known facts, inferences, missing facts and linked policy citations.
4. Show the one supported essential and the deliberate camera/fashion refusals.
5. Request a fresh quote. Point to subtotal, tax, shipping, exact total and expiry.
6. Create the sandbox approval session and approve it.
7. Place the order. Show the stable sandbox order ID and claim-support packet.

> The commerce step is clearly labelled sandbox. The product proof here is the deterministic
> policy and evidence workflow; the blockchain proof remains in the separate UAT rail.

## 2:35–3:05 — Negative cases

Run one visible application rejection:

- Set the personal cap to `$20`, or remove the claim reference, then rebuild the plan.

Show the terminal test summary and name the on-chain cases covered locally: wrong merchant,
expired benefit, revoked benefit, duplicate redemption and failed CVI.

## 3:05–3:30 — Architecture and close

Open [ONE_PAGE_SUMMARY.md](ONE_PAGE_SUMMARY.md) or the repository diagram.

> Cleanverse CVA is the compliant fungible asset. The ReliefCart vault is the real-world
> obligation: one beneficiary, one merchant, one amount, one expiry and one use. CVI and RuleV2
> gate the participants; ReliefCart gates the purchase itself. The same rail can serve airlines,
> insurers, employers and bounded public-benefit programs.

Closing line:

> ReliefCart does not promise reimbursement after the fact. It makes the benefit enforceable
> before money moves and preserves the evidence institutions need afterward.

## Recording checklist

- Hide `.env`, terminal history, keystore paths and any support/API response bodies.
- Use only synthetic incident data.
- Keep transaction hashes visible long enough to pause the video.
- Never call the candidate vault registered, funded, active or redeemed unless new successful
  receipts are added to the evidence manifest first.
- End on the public repository and its build-window commit history.
