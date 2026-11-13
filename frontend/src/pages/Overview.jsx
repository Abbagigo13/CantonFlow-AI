
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";

export default function Overview({ deals = [], ledgerConnected = false }) {
  const totalValue = deals.reduce(
    (total, deal) => total + (Number(deal.amount) || 0),
    0
  );

  const pending = deals.filter(
    (deal) => String(deal.status || "Pending").toLowerCase() === "pending"
  ).length;

  const currency = deals[0]?.currency || "USD";

  const value = (() => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(totalValue);
    } catch {
      return `${currency} ${totalValue.toLocaleString()}`;
    }
  })();

  return (
    <section>
      <PageHeader
        eyebrow="PRIVATE MARKET WORKFLOWS"
        title="Transaction overview"
        description="Monitor trade agreements, transaction values, and workflow progress."
      />

      <div className="demo-banner">
        <span className="demo-icon">◈</span>
        <div>
          <strong>Prototype workspace</strong>
          <span>These records are not verified Canton ledger transactions.</span>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          label="Total agreements"
          value={deals.length}
          detail="Records in this workspace"
          icon="▤"
          accent="purple"
        />
        <StatCard
          label="Aggregate value"
          value={value}
          detail="Displayed record values"
          icon="$"
          accent="blue"
        />
        <StatCard
          label="Awaiting action"
          value={pending}
          detail="Records marked pending"
          icon="◷"
          accent="amber"
        />
        <StatCard
          label="Canton ledger"
          value={ledgerConnected ? "Connected" : "Not connected"}
          detail="Integration status"
          icon="⌁"
          accent="green"
        />
      </div>
    </section>
  );
}
