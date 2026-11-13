
# Product Requirements Document (PRD)

## Product

CantonFlow AI — AI-assisted trade agreement workflows.

## 1. Purpose

Build a demonstrable application that helps buyers, sellers, and operations teams organise commercial agreements, understand outstanding actions, and eventually coordinate approved workflows through Canton.

## 2. Problem statement

Commercial agreements can be fragmented across email, spreadsheets, documents, and messaging systems. Participants may find it difficult to understand the current status of an agreement, identify missing information, or determine who must act next.

CantonFlow AI proposes a shared workflow interface with structured agreement records, explicit status, and optional AI assistance.

This problem statement is a product hypothesis and requires validation through user interviews.

## 3. Target users

### Primary

- Buyers and sellers managing business-to-business agreements.
- Trade operations personnel coordinating approvals.
- Small and medium-sized businesses with recurring supply transactions.

### Secondary

- Developers exploring Canton-based commercial applications.
- Business teams evaluating private workflow infrastructure.

## 4. Goals

1. Provide one interface to inspect agreements.
2. Display counterparties, amounts, currencies, and workflow states.
3. Reduce confusion about pending actions.
4. Explore participant-authorised approval rules using Daml.
5. Add AI-assisted agreement review with traceable explanations.
6. Establish a truthful, testable path from prototype to Canton integration.

## 5. Non-goals for the first MVP

- Processing real payments.
- Custody of customer funds.
- Automatic legal advice or contract signing.
- Production identity verification.
- Unrestricted AI agent authority to approve transactions.
- Claiming ledger finality without confirmed ledger evidence.
- Supporting every contract type or jurisdiction.

## 6. Core user journey

1. An authorised user opens the dashboard.
2. The user searches existing agreement records.
3. The user opens or creates a proposed agreement.
4. The application validates required fields.
5. The relevant participants review terms.
6. The workflow indicates which action is outstanding.
7. When ledger integration is available, an authorised command is submitted.
8. The application reports the confirmed result or an explicit failure.

## 7. Functional requirements

### FR-01: Dashboard

Show agreement count, aggregate value, pending count, and integration state.

### FR-02: Agreement listing

Display agreement title, buyer, seller, value, currency, status, and reference.

### FR-03: Search and filtering

Allow users to search agreement records and filter by supported status.

### FR-04: Create agreement

Validate title, distinct buyer and seller, positive amount, and currency.

### FR-05: Participant approvals

The contract workflow must define who can propose, approve, and confirm an agreement. Permissions must be enforced by the contract and ledger, not just the UI.

### FR-06: AI-assisted review

Where enabled, AI may summarise supplied text, flag missing fields, and explain potential inconsistencies. Results must be labelled as AI-generated and must not be treated as authoritative legal conclusions.

### FR-07: Integration status

Report API availability, AI configuration, and ledger connectivity independently.

### FR-08: Error handling

Display actionable errors for validation failures, API failures, and unavailable integrations.

## 8. Non-functional requirements

- Responsive desktop and mobile layouts.
- Clear demo-versus-production labelling.
- No secrets embedded in frontend code.
- Server-side validation of untrusted input.
- Logs must avoid unnecessary sensitive commercial information.
- Critical workflow transitions must be testable.
- UI should remain understandable when integrations are unavailable.

## 9. Success criteria

The MVP is successful when:

- A user can view and search agreement records.
- Invalid agreement input is rejected.
- Workflow permission rules pass contract tests.
- AI output, when enabled, is clearly advisory.
- Ledger status is based on actual integration results.
- Setup and testing steps are documented and reproducible.

User interviews and usability tests will determine whether the workflow solves a meaningful business problem.

## 10. Risks and assumptions

- Prospective users may already have adequate workflow tools.
- Canton SDK and network access may add setup complexity.
- Real participant identities and permissions require careful design.
- AI may omit important details or produce incorrect interpretations.
- Demo data does not prove the workflow's production feasibility.

## 11. MVP phases

1. Local UI and demo API.
2. Daml compilation and contract tests.
3. Canton test-environment integration.
4. Backend identity and authorisation.
5. AI-assisted review with validation and evaluation.
6. User testing, documentation, and demo preparation.

## 12. Release rule

A capability may be described as implemented only after it has been exercised and tested. A drafted contract is not a deployed contract; an API response is not proof of a Canton transaction.
