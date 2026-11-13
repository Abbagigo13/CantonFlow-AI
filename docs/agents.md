
# AI Agents and Responsibilities

## 1. Purpose

This document defines the proposed AI-assisted roles in CantonFlow AI and the boundaries that prevent model output from bypassing participant authority.

These are design specifications. The agents described here are not currently implemented.

## 2. Design principle

AI may help users understand information and prepare work. It must not become the source of truth for transaction status, participant identity, permissions, or ledger finality.

All consequential actions must be validated by deterministic backend rules and, where applicable, the Canton ledger.

## 3. Proposed agents

### Agent A: Agreement Review Agent

Purpose:
Help users understand proposed agreement terms.

Inputs:

- User-authorised agreement text.
- Structured agreement fields.
- Explicit review instructions.

Tasks:

- Summarise important terms.
- Identify missing fields.
- Flag inconsistent amounts, dates, parties, or references.
- Highlight ambiguous wording for human review.
- Cite the relevant supplied text where possible.

Outputs:

- Structured summary.
- List of possible issues.
- Explanations and confidence limitations.

Restrictions:

- Does not provide definitive legal advice.
- Does not invent terms absent from the supplied material.
- Does not approve agreements or execute transactions.

### Agent B: Workflow Guidance Agent

Purpose:
Explain the current workflow and identify the next permitted step.

Inputs:

- Backend-provided agreement state.
- Authorised user's available actions.
- Deterministic workflow rules.

Tasks:

- Explain why an agreement is pending.
- Identify the participant expected to act next.
- Explain validation failures.
- Direct users to the appropriate workflow action.

Restrictions:

- Does not determine permissions solely from natural-language reasoning.
- Does not override a backend or ledger rejection.
- Does not fabricate missing workflow events.

### Agent C: Risk and Consistency Assistant

Purpose:
Flag potentially inconsistent information before a user submits an agreement.

Checks may include:

- Missing counterparty information.
- Non-positive transaction amounts.
- Inconsistent currency fields.
- Duplicate reference numbers.
- Conflicting terms within supplied text.

Restrictions:

- Flags are advisory, not authoritative risk scores.
- Deterministic checks must be implemented in ordinary code where possible.
- High-impact decisions require human review and explicit rules.

## 4. Tool permissions

Agents should receive only the tools necessary for their assigned task.

Default permissions:

- Read authorised agreement fields.
- Produce summaries and structured findings.
- Request clarification from the user.

Not permitted by default:

- Sign or approve an agreement.
- Transfer funds.
- Change participant permissions.
- Exfiltrate secrets.
- Submit arbitrary ledger commands.
- Modify production configuration.

## 5. Human approval

Before any consequential transaction action:

1. Display the exact proposed action.
2. Identify the agreement and relevant parties.
3. Validate the caller's permissions.
4. Obtain required participant approval.
5. Submit through the authorised backend integration.
6. Report the result returned by the trusted system.

## 6. Prompt-injection handling

Agreement documents may contain malicious or irrelevant instructions. Treat document text as data, not as instructions to the agent.

Agents must not follow document-embedded commands to reveal secrets, alter their role, bypass policy, or execute unrelated tools.

## 7. Output format

AI review responses should use a validated schema such as:

- `summary`: concise explanation.
- `findings`: array of issues.
- `evidence`: supplied text supporting each finding.
- `limitations`: uncertainty or missing information.
- `requires_human_review`: boolean.

Invalid or malformed model output must be handled safely.

## 8. Evaluation

Measure:

- Accuracy of extracted fields.
- Precision and recall of issue detection.
- Unsupported-claim rate.
- Correct handling of missing information.
- Resistance to prompt injection.
- Whether users understand that output is advisory.

## 9. Current status

No AI agent is currently configured. This document describes the planned design only.
