# Submission email draft

**To:** isaac@cleanverse.com  
**Subject:** ReliefCart — Track 1 RWA submission

Hi Isaac,

I’m submitting ReliefCart for Track 1 (RWA) of the Cleanverse Build: Trusted Assets Hackathon.

ReliefCart turns an issuer-approved delayed-baggage recovery obligation into one bounded merchant
settlement. A Cleanverse CVA supplies the compliant settlement asset, CVI verifies the traveller
and merchant, and a one-benefit vault enforces the fixed merchant, amount, expiry, revocation and
single-use lifecycle. The application checks policy evidence before preparing a purchase and
produces a claim-support record afterward.

Submission links:

- Public repository: https://github.com/fexx301/relief-cart
- Build-window commit history: https://github.com/fexx301/relief-cart/commits/main
- Demo video: **[PASTE VIDEO URL]**
- Live demo: **[PASTE LIVE URL OR WRITE “Local demo; setup in README”]**
- One-page summary: https://github.com/fexx301/relief-cart/blob/main/docs/ONE_PAGE_SUMMARY.md
- UAT evidence: https://github.com/fexx301/relief-cart/blob/main/docs/CLEANVERSE_UAT_EVIDENCE.md

Deployed chain: Monad UAT/testnet, chain ID 10143.

The repository contains public evidence for the project-controlled CVA mint, participant
A-Passes, deployed compliance adapter and Factory, Factory `REGISTER_ROLE`, and the candidate
vault. It also clearly discloses the supplied validator ABI mismatch that prevented the documented
`registerV2` registration call from being broadcast; registration, funding and settlement are not
presented as complete.

Updated project description:

> ReliefCart is a policy-aware recovery-benefit rail for delayed baggage. It converts an
> issuer-approved real-world obligation into one bounded merchant purchase: a Cleanverse CVA is
> the compliant settlement unit, CVI verifies the participants, and a one-benefit vault enforces
> the beneficiary, merchant, amount, expiry and single-use state. ReliefCart refuses unsupported
> purchases before money moves and produces an auditable claim-support packet afterward.

Thank you for reviewing ReliefCart.

Best,  
Femi
