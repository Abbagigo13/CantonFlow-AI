
# Security Design and Threat Model

## 1. Purpose

This document identifies key security risks and minimum controls for the CantonFlow AI prototype and its planned evolution.

The current prototype is for local development only. It is not production-ready.

## 2. Assets to protect

- Agreement terms and commercial information.
- Buyer and seller identities.
- Model-provider credentials.
- Canton participant credentials and signing authority.
- Transaction requests and results.
- Application configuration and logs.

## 3. Threat actors and risks

Potential risks include:

- Unauthorised users submitting or modifying agreements.
- Malicious requests exploiting weak validation.
- Leaked AI or ledger credentials.
- Prompt injection through uploaded agreement text.
- AI-generated false statements.
- Confusion between demo records and real ledger transactions.
- Cross-origin requests from untrusted websites.
- Duplicate submissions or replayed commands.
- Excessive disclosure of confidential contract information.

## 4. Authentication and authorisation

The current local prototype does not provide production authentication.

Before deployment:

- Authenticate users through an approved identity mechanism.
- Map verified identities to permitted application roles.
- Enforce authorisation on every protected backend operation.
- Do not trust a buyer, seller, or role supplied by the browser without verification.
- Enforce ledger permissions in contract and participant configuration.
- Require explicit approval for consequential operations.

## 5. Secrets management

- Keep model API keys and ledger credentials on the backend.
- Store local secrets in an untracked `.env` file or an appropriate secret manager.
- Commit only placeholder values in `.env.example`.
- Never place server secrets in `VITE_*` variables.
- Rotate credentials immediately if they are exposed.
- Avoid logging request headers or secret values.

## 6. Input validation

The backend must validate:

- Required fields and maximum lengths.
- Positive, finite monetary amounts.
- Supported currencies.
- Distinct buyer and seller identities.
- Allowed workflow transitions.
- JSON types and request sizes.

The frontend may provide early validation for usability, but it is not a security boundary.

## 7. API security

Before deployment:

- Use HTTPS.
- Restrict CORS to explicitly approved origins.
- Authenticate and authorise protected endpoints.
- Apply rate limits and request-size limits.
- Set request timeouts.
- Return safe error messages.
- Prevent duplicate commands where appropriate.
- Validate all external service responses.

## 8. Canton and contract security

- Compile and test contracts using the supported toolchain.
- Review signatories, observers, controllers, and disclosure implications.
- Ensure unauthorised participants cannot exercise choices.
- Test negative cases, including out-of-order approvals.
- Avoid storing unnecessary confidential data on shared infrastructure.
- Treat ledger command submission and final confirmation as distinct events.
- Obtain a security review before production use.

The initial Daml source is not yet compiled or audited.

## 9. AI security

- Treat model output as untrusted.
- Treat uploaded documents as data, not instructions.
- Do not grant AI direct signing authority.
- Validate model output against a schema.
- Require human review for consequential decisions.
- Minimise the sensitive information sent to providers.
- Document provider data-retention and processing terms before use.
- Never send secrets to a model prompt.

## 10. Privacy and logging

- Collect only information required for the workflow.
- Restrict access to agreement details.
- Avoid logging complete agreements by default.
- Redact sensitive fields in diagnostic logs.
- Define retention and deletion procedures before launch.

## 11. Demo-mode safeguards

- Clearly label demo records.
- Never display fabricated ledger confirmation.
- Keep integration state explicit.
- Prevent demo actions from silently becoming production commands.
- Use non-sensitive synthetic test data.

## 12. Incident response

If credentials or confidential data are exposed:

1. Disable or revoke the affected credential.
2. Investigate the scope of exposure.
3. Preserve necessary security logs.
4. Rotate related credentials where appropriate.
5. Notify affected parties when required.
6. Document corrective actions.

## 13. Release gate

Production release requires reviewed authentication, authorisation, contract permissions, secret handling, error handling, privacy controls, and security testing. Passing a local demo is not sufficient.
