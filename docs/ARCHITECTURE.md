
# System Architecture

## 1. Overview

CantonFlow AI is structured as a React frontend, a Node.js backend, a Daml contract layer, and optional AI and Canton integrations.

The architecture separates the presentation layer from privileged operations and external services.

## 2. Logical architecture

```text
User
 |
 v
React + Vite Frontend
 |  - Dashboard
 |  - Agreement pages
 |  - Form validation for usability
 v
Node.js Backend API
 |  - Input validation
 |  - Authentication/authorisation (future)
 |  - Workflow orchestration
 |  - Integration status
 |
 +----------------------+
 |                      |
 v                      v
Canton Adapter       AI Provider Adapter
(future)             (future)
 |                      |
 v                      v
Canton Ledger        Configured Model API

Daml contracts define the permitted ledger actions.
```

The diagram represents the intended architecture. The Canton and AI adapters are not yet implemented.

## 3. Frontend

Technology: React, Vite, JavaScript, CSS.

Responsibilities:

- Render the dashboard and agreement records.
- Provide search, filters, and forms.
- Show clear errors and connection status.
- Never store privileged API keys.
- Never independently claim a transaction has been committed.

The frontend calls the local API through `src/services/api.js`. Reusable UI modules reside in `src/components`, and page-level modules reside in `src/pages`.

## 4. Backend

Technology: Node.js HTTP server.

Current responsibilities:

- Expose health, demo-deal, and integration-status endpoints.
- Validate basic create-deal input.
- Return JSON responses for the frontend.

Planned responsibilities:

- Authenticate users.
- Authorise actions based on trusted identity and role.
- Validate workflow transitions.
- Call the Canton integration through a server-side adapter.
- Call the AI provider through a server-side adapter.
- Apply timeouts, error handling, and audit controls.

The current in-memory API is not persistent and is not suitable for production.

## 5. Contract layer

`contracts/CantonFlow.daml` contains a draft `TradeAgreement` template.

The source is intended to explore agreement creation and participant approval. It must be compiled, tested, and reviewed before it can be treated as executable contract logic.

Contract design must carefully distinguish:

- Parties who authorise an action.
- Parties who can observe contract data.
- The party responsible for creating a contract.
- The conditions required for a state transition.
- The disclosure and privacy consequences of each choice.

The initial draft is a learning scaffold, not a final production permission model.

## 6. API design

Current local endpoints:

- `GET /api/health`
- `GET /api/deals`
- `POST /api/deals`
- `GET /api/integrations/status`

These currently support local development and demo records.

Future ledger commands should use explicit request schemas and return a clear command result. A successful HTTP response must not be treated as ledger confirmation unless the integration provides evidence of the relevant result.

## 7. AI integration

The AI provider must be accessed from the backend.

Proposed flow:

1. An authorised user submits agreement text or structured fields.
2. The backend removes unnecessary sensitive information where feasible.
3. The model analyses the permitted input.
4. The backend validates the response format.
5. The UI displays the output as advisory.
6. A human reviews the result before any consequential action.

AI does not receive unrestricted authority to approve or execute agreements.

## 8. Data flow and trust boundaries

- Browser input is untrusted.
- The API validates all incoming requests.
- Model output is untrusted and may be incorrect.
- Contract commands must be authorised by the ledger's participant rules.
- Secrets stay in server-side configuration.
- Integration status must come from actual health checks.

## 9. Configuration

Development configuration is provided through environment variables and `.env.example`.

Secret-bearing `.env` files must not be committed to version control. Frontend environment variables must not contain server-side secrets.

## 10. Deployment evolution

### Current

Local development server, in-memory demo data, unverified Daml source.

### Next

Compile and test Daml, then integrate with an approved Canton development environment.

### Later

Add identity, durable storage where required, monitoring, deployment controls, and production security review.

## 11. Architecture decisions

- Use a small frontend stack to minimise installation overhead.
- Keep external API calls behind the backend.
- Treat AI as an assistant, not an authority.
- Keep demo mode visibly separate from ledger mode.
- Prefer explicit integration errors over fabricated success states.
