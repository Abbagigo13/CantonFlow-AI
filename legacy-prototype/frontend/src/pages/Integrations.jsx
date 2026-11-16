
import PageHeader from "../components/PageHeader";

export default function Integrations({ health, integrations }) {
  const ledgerConnected = health?.cantonLedger === "connected";
  const aiStatus = integrations?.ai || health?.ai || "not-configured";

  return (
    <section>
      <PageHeader
        eyebrow="SYSTEM CONFIGURATION"
        title="Integrations"
        description="Inspect the services that CantonFlow AI will depend on."
      />

      <div className="integration-page-grid">
        <article className="content-card integration-card">
          <div className="mini-card-heading">
            <span className="integration-symbol canton-symbol">◈</span>
            <div>
              <h3>Canton Network</h3>
              <p>Private transaction ledger</p>
            </div>
          </div>
          <p className="integration-description">
            The ledger adapter is not configured. No transaction in this interface
            should be treated as committed to Canton.
          </p>
          <div className="integration-meta">
            <span>CONNECTION</span>
            <strong>{ledgerConnected ? "Connected" : "Not connected"}</strong>
          </div>
          <div className="integration-meta">
            <span>CONTRACT</span>
            <strong>Source pending validation</strong>
          </div>
        </article>

        <article className="content-card integration-card">
          <div className="mini-card-heading">
            <span className="integration-symbol ai-symbol">✳</span>
            <div>
              <h3>AI model provider</h3>
              <p>Agreement assistance</p>
            </div>
          </div>
          <p className="integration-description">
            AI assistance is disabled until a model endpoint is configured and
            tested. Secret keys must remain on the backend.
          </p>
          <div className="integration-meta">
            <span>MODEL STATUS</span>
            <strong>{String(aiStatus)}</strong>
          </div>
          <div className="integration-meta">
            <span>SECRET STORAGE</span>
            <strong>Backend environment only</strong>
          </div>
        </article>
      </div>
    </section>
  );
}
