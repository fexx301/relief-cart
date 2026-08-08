# UAT evidence manifest (redacted template)

This file is a schema only. Do not commit private keys, API credentials, signatures,
raw Travel Rule files, PII, or raw vendor responses.

```json
{
  "chainId": "10143",
  "network": "monad",
  "validator": {
    "address": "0x...",
    "implementation": "0x...",
    "grant": {
      "endpoint": "/api/validator/grant",
      "factory": "0x...",
      "transactionHash": "0x...",
      "blockNumber": "0x...",
      "role": "REGISTER_ROLE",
      "roleProof": "0x..."
    }
  },
  "factory": {
    "address": "0x...",
    "owner": "0x..."
  },
  "benefitVault": {
    "address": "0x...",
    "cva": "0x...",
    "beneficiary": "0x...",
    "merchant": "0x...",
    "refundRecipient": "0x...",
    "amountBaseUnits": "...",
    "expiresAt": "...",
    "registration": {
      "registerV2Tx": "0x...",
      "registerApassTx": "0x...",
      "isRegistered": true,
      "rulesReadSha256": "...",
      "restrictiveRuleReplaced": true
    },
    "funding": {
      "transferTx": "0x...",
      "from": "0x...",
      "to": "0x...",
      "amountBaseUnits": "...",
      "blockNumber": "0x..."
    },
    "activation": {
      "transactionHash": "0x...",
      "evidenceHash": "0x..."
    }
  },
  "cases": [
    {
      "name": "successful redemption",
      "transactionHash": "0x...",
      "result": "pass"
    },
    {
      "name": "wrong merchant",
      "transactionHash": "0x...",
      "result": "reverted",
      "revertSelector": "0x..."
    },
    {
      "name": "expired redemption",
      "transactionHash": "0x...",
      "result": "reverted",
      "revertSelector": "0x..."
    },
    {
      "name": "duplicate redemption",
      "transactionHash": "0x...",
      "result": "reverted",
      "revertSelector": "0x..."
    },
    {
      "name": "refund",
      "transactionHash": "0x...",
      "recipient": "0x...",
      "result": "pass_or_reverted"
    }
  ]
}
```

The local preflight only reads public chain state and prints bounded summaries. It does not
create this manifest automatically and it does not submit any Cleanverse mutation.
