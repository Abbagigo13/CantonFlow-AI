
# CantonFlow AI

**AI-assisted trade agreement workflows for the Canton ecosystem.**

> Current status: local prototype. The backend, demo records, frontend, and initial Daml source are under development. A real Canton ledger connection and AI integration have not yet been verified.

## 1. What are we building?

CantonFlow AI is a proposed workspace for organisations that need to create, review, and coordinate private business agreements.

The product combines a transaction dashboard, structured trade agreement data, participant approval workflows, and an AI assistant designed to help people understand agreement terms and identify issues before they proceed.

The long-term goal is to connect these workflows to the Canton Network, subject to successful contract validation, ledger integration, and appropriate participant permissions.

## 2. The problem

Businesses frequently coordinate transactions across emails, spreadsheets, PDFs, messaging applications, and separate internal systems.

This can create several problems:

- Agreement details become scattered across different tools.
- Buyers and sellers can lose track of who needs to act next.
- Reviewing long agreement documents takes time.
- Teams may struggle to maintain a clear record of workflow progress.
- Sensitive commercial information needs appropriate access controls.
- A dashboard can show a transaction's status without proving that it was committed to an authoritative ledger.

These are the problems CantonFlow AI is designed to investigate and address. Their prevalence and the product's effectiveness must be validated with prospective users.

## 3. Who is it for?

### Primary users

- Small and medium-sized businesses coordinating supply agreements.
- Buyers and sellers managing recurring commercial transactions.
- Trade operations teams tracking agreement status.
- Organisations exploring private, participant-aware workflows.
- Developers and ecosystem teams evaluating business applications for Canton.

### Example use case

An agricultural equipment buyer agrees to purchase equipment from a supplier.

1. The seller prepares the agreement terms.
2. The buyer reviews the proposed terms.
3. The required participants approve the agreement.
4. The workflow records its current state.
5. An AI assistant may explain terms or flag inconsistencies for human review.
6. Once a real Canton integration is implemented, the appropriate contract workflow can be executed on the ledger.

The current prototype demonstrates only parts of this journey. It does not yet execute step 6.

## 4. The proposed solution

CantonFlow AI aims to provide:

- **One workspace:** View and search trade agreement records.
- **Clear workflow states:** Identify pending, approved, completed, or rejected records.
- **Participant-aware contracts:** Explore buyer and seller permissions through Daml.
- **AI-assisted review:** Summarise terms and flag missing or inconsistent information.
- **Integration transparency:** Clearly report whether Canton and AI services are actually configured.
- **Auditable workflow design:** Build toward verifiable transaction states rather than relying only on interface labels.

AI recommendations are advisory. Authorised participants and deterministic contract rules remain responsible for approvals.

## 5. Why Canton?

Canton is relevant to applications that require coordination between participants while respecting privacy and permissions.

CantonFlow AI explores whether commercial agreement workflows can benefit from participant-controlled visibility and contract-enforced actions. The actual privacy and authorisation guarantees will depend on the implemented contracts, topology, and deployment configuration.

## 6. Technology

- Frontend: React, Vite, JavaScript, CSS.
- Backend: Node.js HTTP API.
- Contract language: Daml.
- Target ledger: Canton Network.
- AI: Configurable backend model provider, not yet enabled.
- Development: Windows, PowerShell, VS Code.

The frontend currently uses local API records. Daml source has been drafted but has not yet been compiled or deployed.

## 7. Current project status

| Capability | Status |
| --- | --- |
| Local API | Working |
| Demo agreement records | Working |
| React dashboard | Under development |
| Create demo agreement | Implemented in local API flow |
| Daml source | Drafted, not validated |
| Canton ledger integration | Not connected |
| AI agreement analysis | Not configured |
| Authentication and production permissions | Not implemented |
| Automated tests | To be added |

## 8. Run locally

### Backend

```powershell
cd "$HOME\CantonFlowAI\backend"
npm start
```

### Frontend

After the required frontend packages are installed:

```powershell
cd "$HOME\CantonFlowAI\frontend"
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

### API health check

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

## 9. Project structure

```text
CantonFlowAI/
├── backend/
│   ├── src/
│   │   └── server.js
│   ├── .env.example
│   └── package.json
├── contracts/
│   └── CantonFlow.daml
├── frontend/
│   ├── index.html
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── services/
│       └── service/
├── docs/
│   ├── prd.md
│   ├── architecture.md
│   ├── agents.md
│   ├── security.md
│   └── testing.md
└── README.md
```

## 10. Development principles

1. Do not label demo data as real ledger data.
2. Never expose AI keys or other secrets in browser code.
3. Validate transaction inputs on the backend.
4. Enforce critical permissions in the contract and ledger, not only in the UI.
5. Clearly distinguish implemented features from planned features.
6. Prefer small, testable changes and free development tools where possible.

## 11. Project vision

CantonFlow AI aims to make private commercial workflows easier to understand, coordinate, and verify. Its success depends on delivering a working integration, enforcing permissions correctly, and demonstrating value to actual business users—not merely producing an attractive dashboard.
