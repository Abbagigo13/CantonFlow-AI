
# Testing Strategy

## 1. Purpose

Define how CantonFlow AI will be tested from the local prototype through Canton integration and eventual production readiness.

Tests must distinguish implemented functionality from planned functionality.

## 2. Testing layers

### A. Frontend tests

Verify:

- Dashboard renders when records are available.
- Loading, empty, and error states are understandable.
- Search matches agreement titles and participants.
- Status filters work correctly.
- Monetary values display appropriately.
- Invalid form values are rejected.
- Modal controls and responsive layouts work.
- Ledger and AI states are displayed accurately.

### B. Backend API tests

Verify:

- `GET /api/health` returns the expected health response.
- `GET /api/deals` returns a valid response.
- `POST /api/deals` accepts valid input.
- Missing required fields are rejected.
- Non-positive and non-finite amounts are rejected.
- Malformed JSON is handled safely.
- Unknown routes return an appropriate error.
- Integration status never falsely reports a configured service as connected.

### C. Contract tests

After installing the supported Daml toolchain, verify:

- A valid agreement can be created.
- Zero and negative amounts fail.
- Only the authorised buyer can approve.
- The seller cannot confirm before buyer approval.
- Only the authorised seller can confirm.
- Repeated approval attempts are rejected.
- Contract visibility matches the intended participant model.
- State transitions behave as expected.

### D. Integration tests

When a Canton development ledger is available, verify:

- The backend connects to the configured ledger.
- Valid commands are submitted with authorised credentials.
- Unauthorised commands fail.
- Ledger results are distinguished from request acceptance.
- Reconnection and timeout handling work.
- The UI reflects actual confirmed workflow state.

When an AI provider is configured, verify:

- Valid requests produce schema-compliant results.
- Missing credentials fail safely.
- Timeouts and provider errors are handled.
- Malicious document instructions do not override agent restrictions.
- Unsupported claims and incorrect findings are evaluated.

## 3. Initial manual checks

### Backend health

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

Expected: `ok` is true while the local API is running.

### Demo deals

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/deals
```

Expected: the endpoint returns demo records with an explicit demo warning.

### Integration status

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/integrations/status
```

Expected: unconfigured integrations are reported honestly.

### Frontend production build

Once dependencies are installed:

```powershell
cd "$HOME\CantonFlowAI\frontend"
npm run build
```

Expected: Vite creates a production build without compilation errors.

## 4. Acceptance criteria

The local prototype passes its initial acceptance checks when:

- The dashboard loads without a blank page.
- Demo records are clearly labelled.
- Search and filtering operate correctly.
- Valid demo agreements can be submitted through the backend.
- Invalid input receives a useful error.
- API failures do not appear as successful transactions.
- No secret credentials are included in frontend bundles.

Canton integration acceptance additionally requires compiled contracts and successful tests against an actual Canton development environment.

## 5. Test data

Use synthetic names, organisations, amounts, and agreement text. Do not use confidential business agreements or real credentials in ordinary development tests.

## 6. Regression testing

After changes to API schemas, contract logic, or frontend components:

- Re-run the affected tests.
- Check existing agreement creation and listing.
- Check error and empty states.
- Re-check integration status labels.
- Confirm demo mode has not been presented as production mode.

## 7. Defect severity

- **Critical:** unauthorised transaction execution, exposed signing keys, or false claims of ledger finality.
- **High:** broken permission checks, incorrect agreement state, or sensitive data exposure.
- **Medium:** core user journey fails or invalid records are accepted.
- **Low:** visual defects or minor usability issues.

## 8. Current testing status

The local backend health and demo-deal endpoints have been manually checked.

Automated frontend tests, contract compilation, contract tests, Canton integration tests, and AI evaluation remain outstanding.

Do not mark a test as passed until it has actually been executed.
