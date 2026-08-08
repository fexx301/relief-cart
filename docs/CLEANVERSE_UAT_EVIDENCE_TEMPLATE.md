# UAT evidence manifest (redacted template)

This file is a schema only. Record public chain evidence and bounded state summaries. Do not
commit private keys, API credentials, signatures, raw Travel Rule files, PII, raw vendor
responses, or time-limited download URLs.

One Factory transaction calls both `registerV2` and `registerApass` atomically. A failed
transaction receipt normally does not contain a decoded revert selector, so each negative case
records the status-0 receipt plus a same-block `eth_call` or trace used to recover the reason.
Mutually exclusive terminal cases use separate one-benefit vaults.

```json
{
  "schemaVersion": 1,
  "chainId": "10143",
  "network": "monad-uat",
  "capturedAt": "ISO-8601 UTC timestamp",
  "artifacts": {
    "validator": {
      "address": "0x...",
      "implementation": "0x...",
      "runtimeCodeHash": "0x..."
    },
    "cva": {
      "address": "0x...",
      "implementation": "0x...",
      "runtimeCodeHash": "0x...",
      "issuanceTransactionHash": "0x...",
      "decimals": "...",
      "roleLifecycle": {
        "minterGrantTransactionHash": "0x...",
        "proofMintTransactionHash": "0x...",
        "minterRevokeTransactionHash": "0x...",
        "postRevokeMintResult": "reverted"
      }
    },
    "complianceGate": {
      "address": "0x...",
      "deploymentTransactionHash": "0x...",
      "runtimeCodeHash": "0x...",
      "validatorReadback": "0x..."
    },
    "factory": {
      "address": "0x...",
      "deploymentTransactionHash": "0x...",
      "runtimeCodeHash": "0x...",
      "ownerReadback": "0x...",
      "validatorReadback": "0x..."
    }
  },
  "validatorGrant": {
    "endpoint": "/validator/grant",
    "factory": "0x...",
    "requestBodySha256": "...",
    "transactionHash": "0x...",
    "blockNumber": "...",
    "role": "REGISTER_ROLE",
    "hasRoleAfter": true
  },
  "subjects": {
    "beneficiary": {
      "address": "0x...",
      "apassStatus": "active",
      "apassExpiresAt": "...",
      "querySummarySha256": "..."
    },
    "merchant": {
      "address": "0x...",
      "apassStatus": "active",
      "apassExpiresAt": "...",
      "querySummarySha256": "..."
    }
  },
  "successVault": {
    "address": "0x...",
    "deploymentTransactionHash": "0x...",
    "runtimeCodeHash": "0x...",
    "cva": "0x...",
    "complianceGate": "0x...",
    "registrationAuthority": "0x...",
    "beneficiary": "0x...",
    "merchant": "0x...",
    "refundRecipient": "0x...",
    "amountBaseUnits": "...",
    "expiresAt": "...",
    "registration": {
      "transactionHash": "0x...",
      "factoryInternalCalls": ["registerV2", "registerApass"],
      "factoryEventLogIndex": "...",
      "isRegisteredAfter": true,
      "ruleCountAfter": 1,
      "ruleReadbackSha256": "...",
      "containsUnrestrictedRule": false,
      "vaultRegistrationConfirmed": true,
      "vaultRegistrationRuleHash": "0x..."
    },
    "funding": {
      "transactionHash": "0x...",
      "from": "0x...",
      "to": "0x...",
      "amountBaseUnits": "...",
      "transferLogIndex": "...",
      "vaultBalanceAfter": "..."
    },
    "activation": {
      "transactionHash": "0x...",
      "evidenceHash": "0x...",
      "statusAfter": "Active"
    },
    "compliance": {
      "blockNumber": "...",
      "beneficiaryAllowed": true,
      "merchantAllowed": true
    },
    "redemption": {
      "transactionHash": "0x...",
      "receiptStatus": 1,
      "benefitRedeemedLogIndex": "...",
      "cvaTransferLogIndex": "...",
      "vaultBalanceDelta": "...",
      "merchantBalanceDelta": "...",
      "statusAfter": "Redeemed"
    }
  },
  "negativeCases": [
    {
      "name": "wrong-presented-merchant",
      "vault": "0x...",
      "transactionHash": "0x...",
      "receiptStatus": 0,
      "revertEvidence": {
        "method": "same-block eth_call or trace",
        "blockNumber": "...",
        "selector": "0x...",
        "expectedError": "MerchantMismatch"
      }
    },
    {
      "name": "duplicate-redemption",
      "vault": "0x...",
      "transactionHash": "0x...",
      "receiptStatus": 0,
      "revertEvidence": {
        "method": "same-block eth_call or trace",
        "blockNumber": "...",
        "selector": "0x...",
        "expectedError": "InvalidStatus"
      }
    },
    {
      "name": "expired-redemption",
      "vault": "0x... separate expiry fixture",
      "transactionHash": "0x...",
      "receiptStatus": 0,
      "recoveryTransactionHash": "0x...",
      "refundResult": "pass_or_fail_closed"
    },
    {
      "name": "revoked-redemption",
      "vault": "0x... separate revocation fixture",
      "revocationTransactionHash": "0x...",
      "redemptionTransactionHash": "0x...",
      "receiptStatus": 0,
      "recoveryTransactionHash": "0x...",
      "refundResult": "pass_or_fail_closed"
    },
    {
      "name": "failed-cvi",
      "vault": "0x... separate failed-CVI fixture",
      "subject": "beneficiary_or_merchant",
      "complianceAtBlock": false,
      "transactionHash": "0x...",
      "receiptStatus": 0,
      "expectedError": "ComplianceRejected"
    }
  ],
  "audit": {
    "queryTransactionsSha256": "...",
    "travelRuleReportSha256": "... or not_applicable_with_reason",
    "explorerBaseUrl": "https://testnet.monadexplorer.com"
  }
}
```

Global CVA pause testing is optional and should not be performed against a shared token unless
the project controls the token and can safely restore it. The local preflight reads public state
only; it does not build this manifest or submit Cleanverse mutations.
