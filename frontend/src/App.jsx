
import { useState } from "react";

const initialDeals = [
  {
    id: "CF-2026-001",
    title: "Agricultural Equipment Supply",
    buyer: "Northstar Trading",
    seller: "Greenfield Industries",
    amount: 24500,
    currency: "USD",
    status: "Awaiting approval",
    progress: 66,
    date: "Oct 19, 2026",
    initials: "AE",
  },
  {
    id: "CF-2026-002",
    title: "Commercial Solar Equipment",
    buyer: "Helio Partners",
    seller: "Volt Systems",
    amount: 18200,
    currency: "USD",
    status: "Evidence review",
    progress: 45,
    date: "Oct 18, 2026",
    initials: "SE",
  },
  {
    id: "CF-2026-003",
    title: "Raw Material Purchase",
    buyer: "Meridian Group",
    seller: "Atlas Materials",
    amount: 9600,
    currency: "USD",
    status: "Completed",
    progress: 100,
    date: "Oct 17, 2026",
    initials: "RM",
  },
];

const navigation = [
  { id: "Overview", icon: "◫" },
  { id: "Transactions", icon: "⇄" },
  { id: "Approvals", icon: "✓" },
  { id: "AI Insights", icon: "✳" },
];

function money(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function Status({ status }) {
  const className = status.toLowerCase().replaceAll(" ", "-");

  return (
    <span className={`status ${className}`}>
      <span className="status-dot" />
      {status}
    </span>
  );
}

function Sidebar({ page, setPage }) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#" onClick={(e) => {
        e.preventDefault();
        setPage("Overview");
      }}>
        <span className="brand-mark">C</span>
        <span>
          <strong>CantonFlow</strong>
          <small>AI SETTLEMENT NETWORK</small>
        </span>
      </a>

      <div className="workspace">
        <div className="workspace-icon">N</div>
        <div className="workspace-text">
          <strong>Northstar Workspace</strong>
          <small>Development environment</small>
        </div>
        <span className="muted">⌄</span>
      </div>

      <div className="nav-label">WORKSPACE</div>

      <nav className="nav">
        {navigation.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.id}
            {item.id === "Approvals" && (
              <span className="nav-count">2</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="network-card">
          <div className="network-heading">
            <span className="network-pulse" />
            <span>Application status</span>
          </div>
          <strong>Demo environment</strong>
          <p>
            The interface is ready. Live Canton ledger connectivity has not
            been configured yet.
          </p>
        </div>

        <button className="profile">
          <div className="avatar">A</div>
          <span className="profile-text">
            <strong>Workspace Admin</strong>
            <small>Administrator</small>
          </span>
          <span className="muted">•••</span>
        </button>
      </div>
    </aside>
  );
}

function Header({ page, setShowCreate }) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>Workspace</span>
        <span className="muted">/</span>
        <strong>{page}</strong>
      </div>

      <div className="topbar-actions">
        <div className="environment">
          <span className="environment-dot" />
          Local preview
        </div>
        <button
          className="icon-button"
          aria-label="Notifications"
          title="Notifications"
        >
          ♧
        </button>
        <button className="primary-button" onClick={setShowCreate}>
          <span>＋</span> New transaction
        </button>
      </div>
    </header>
  );
}

function MetricCard({ label, value, note, icon, color }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <span className={`metric-icon ${color}`}>{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </article>
  );
}

function Overview({ deals, setSelectedDeal, setShowCreate, setPage }) {
  const activeDeals = deals.filter((d) => d.status !== "Completed");
  const totalValue = deals.reduce((sum, d) => sum + d.amount, 0);
  const pending = deals.filter((d) => d.status !== "Completed").length;

  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            PRIVATE BUSINESS SETTLEMENTS
          </div>
          <h1>Settlement overview</h1>
          <p className="subtitle">
            Coordinate business transactions, evidence and approvals in one
            workspace.
          </p>
        </div>

        <button className="secondary-button" onClick={() => setPage("AI Insights")}>
          <span>✳</span> Explore AI insights
        </button>
      </section>

      <section className="metrics-grid">
        <MetricCard
          label="Total deal value"
          value={money(totalValue)}
          note="Across deals in this preview"
          icon="↗"
          color="purple"
        />
        <MetricCard
          label="Active transactions"
          value={String(activeDeals.length).padStart(2, "0")}
          note="Currently in progress"
          icon="⇄"
          color="blue"
        />
        <MetricCard
          label="Awaiting approval"
          value="02"
          note="Illustrative approval queue"
          icon="◷"
          color="orange"
        />
        <MetricCard
          label="Completed deals"
          value={String(deals.filter((d) => d.status === "Completed").length).padStart(2, "0")}
          note="Completed in this preview"
          icon="✓"
          color="green"
        />
      </section>

      <section className="hero-panel">
        <div className="hero-copy">
          <div className="hero-label">
            <span className="sparkle">✳</span>
            BUILT FOR MULTI-PARTY FINANCE
          </div>
          <h2>Every party aligned.<br />Every step accounted for.</h2>
          <p>
            Coordinate deal terms, review evidence and track approvals.
            Canton integration will provide the ledger-backed workflow.
          </p>
          <button className="hero-button" onClick={setShowCreate}>
            Create a transaction <span>→</span>
          </button>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="orbit-core">
            <span>C</span>
          </div>
          <div className="orbit-node node-one">✓</div>
          <div className="orbit-node node-two">⇄</div>
          <div className="orbit-node node-three">✳</div>
          <div className="orbit-node node-four">◇</div>
        </div>
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent transactions</h2>
            <p>Your latest business settlement activity</p>
          </div>
          <button
            className="text-button"
            onClick={() => setPage("Transactions")}
          >
            View all transactions <span>→</span>
          </button>
        </div>

        <DealsTable deals={deals} onSelect={setSelectedDeal} />
      </section>

      <div className="footer-note">
        <span className="footer-dot" />
        Preview data only · No funds are transferred by this interface.
      </div>
    </>
  );
}

function DealsTable({ deals, onSelect }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>TRANSACTION</th>
            <th>PARTICIPANTS</th>
            <th>AMOUNT</th>
            <th>STATUS</th>
            <th>UPDATED</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => (
            <tr key={deal.id}>
              <td>
                <button className="deal-title" onClick={() => onSelect(deal)}>
                  <span className="deal-icon">{deal.initials}</span>
                  <span className="deal-title-text">
                    <strong>{deal.title}</strong>
                    <small>{deal.id}</small>
                  </span>
                </button>
              </td>
              <td>
                <div className="participant-names">
                  <span>{deal.buyer}</span>
                  <span className="muted">→</span>
                  <span>{deal.seller}</span>
                </div>
              </td>
              <td className="amount">{money(deal.amount, deal.currency)}</td>
              <td><Status status={deal.status} /></td>
              <td className="date-cell">{deal.date}</td>
              <td>
                <button
                  className="row-action"
                  onClick={() => onSelect(deal)}
                  aria-label={`View ${deal.title}`}
                >
                  →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Transactions({ deals, setSelectedDeal, setShowCreate }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const filtered = deals.filter((deal) => {
    const text = `${deal.title} ${deal.id} ${deal.buyer} ${deal.seller}`
      .toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase());
    const matchesFilter = filter === "All" || deal.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <section className="content-panel page-panel">
      <div className="panel-heading">
        <div>
          <h2>Transactions</h2>
          <p>Review and manage your business settlement deals.</p>
        </div>
        <button className="primary-button" onClick={setShowCreate}>
          ＋ New transaction
        </button>
      </div>

      <div className="filters">
        <input
          className="search-input"
          placeholder="Search transactions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>All</option>
          <option>Awaiting approval</option>
          <option>Evidence review</option>
          <option>Completed</option>
        </select>
      </div>

      <DealsTable deals={filtered} onSelect={setSelectedDeal} />

      {filtered.length === 0 && (
        <p className="empty-state">No transactions match your search.</p>
      )}
    </section>
  );
}

function Approvals({ deals, setSelectedDeal }) {
  const pending = deals.filter((deal) => deal.status === "Awaiting approval");

  return (
    <section className="content-panel page-panel">
      <div className="panel-heading">
        <div>
          <h2>Approval queue</h2>
          <p>Transactions that need a decision before they can proceed.</p>
        </div>
        <span className="queue-count">{pending.length} pending</span>
      </div>

      {pending.length === 0 ? (
        <p className="empty-state">No transactions are awaiting approval.</p>
      ) : pending.map((deal) => (
        <button
          className="approval-card"
          key={deal.id}
          onClick={() => setSelectedDeal(deal)}
        >
          <span className="deal-icon">{deal.initials}</span>
          <span className="approval-copy">
            <strong>{deal.title}</strong>
            <small>{deal.id} · {deal.buyer}</small>
          </span>
          <span className="amount">{money(deal.amount)}</span>
          <span className="text-button">Review →</span>
        </button>
      ))}
    </section>
  );
}

function AIInsights({ deals }) {
  return (
    <section className="content-panel page-panel">
      <div className="ai-header">
        <div className="ai-symbol">✳</div>
        <div>
          <div className="eyebrow">CANTONFLOW INTELLIGENCE</div>
          <h2>AI insights</h2>
          <p className="subtitle">
            An evidence-review assistant for multi-party transactions.
          </p>
        </div>
      </div>

      <div className="notice">
        <span>ⓘ</span>
        <div>
          <strong>AI is not connected yet</strong>
          <p>
            These are setup notes, not generated AI findings. We will connect
            your Alibaba model API through the backend after the core workflow
            is working.
          </p>
        </div>
      </div>

      <h3 className="section-subtitle">Planned capabilities</h3>
      <div className="insights-grid">
        <article className="insight-card">
          <span className="insight-icon purple">⌕</span>
          <h3>Evidence review</h3>
          <p>Summarize uploaded evidence and highlight missing information.</p>
          <span className="planned-label">PLANNED</span>
        </article>
        <article className="insight-card">
          <span className="insight-icon orange">⚑</span>
          <h3>Discrepancy detection</h3>
          <p>Identify differences between submitted records for human review.</p>
          <span className="planned-label">PLANNED</span>
        </article>
        <article className="insight-card">
          <span className="insight-icon blue">↗</span>
          <h3>Workflow summaries</h3>
          <p>Explain outstanding steps, approvals, and transaction history.</p>
          <span className="planned-label">PLANNED</span>
        </article>
      </div>

      <div className="content-panel nested-panel">
        <h3>Transaction portfolio</h3>
        <p className="subtitle">
          {deals.length} example records are currently displayed. They are
          not live Canton ledger data.
        </p>
      </div>
    </section>
  );
}

function CreateDealModal({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [buyer, setBuyer] = useState("");
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  function submit(e) {
    e.preventDefault();

    if (!title.trim() || !buyer.trim() || !seller.trim()) {
      setError("Please fill in the transaction and participant fields.");
      return;
    }

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }

    onCreate({
      id: `CF-${Date.now().toString().slice(-7)}`,
      title: title.trim(),
      buyer: buyer.trim(),
      seller: seller.trim(),
      amount: value,
      currency: "USD",
      status: "Awaiting approval",
      progress: 10,
      date: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }),
      initials: title.trim().slice(0, 2).toUpperCase(),
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <section className="modal" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <div>
            <div className="eyebrow">NEW WORKFLOW</div>
            <h2>Create transaction</h2>
            <p>This currently creates a local preview record only.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={submit}>
          <label>
            Transaction name
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Equipment purchase"
              autoFocus
            />
          </label>

          <div className="form-row">
            <label>
              Buyer / initiating party
              <input
                value={buyer}
                onChange={(e) => setBuyer(e.target.value)}
                placeholder="Buyer name"
              />
            </label>
            <label>
              Seller / counterparty
              <input
                value={seller}
                onChange={(e) => setSeller(e.target.value)}
                placeholder="Seller name"
              />
            </label>
          </div>

          <label>
            Deal amount (USD)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10000"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">
              Create preview transaction →
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DealModal({ deal, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <section className="modal" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <div>
            <div className="eyebrow">{deal.id}</div>
            <h2>{deal.title}</h2>
            <p>Transaction details</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="detail-amount">{money(deal.amount, deal.currency)}</div>
        <Status status={deal.status} />

        <div className="detail-list">
          <div><span>Buyer</span><strong>{deal.buyer}</strong></div>
          <div><span>Seller</span><strong>{deal.seller}</strong></div>
          <div><span>Last updated</span><strong>{deal.date}</strong></div>
          <div><span>Workflow progress</span><strong>{deal.progress}%</strong></div>
        </div>

        <div className="notice">
          <span>ⓘ</span>
          <div>
            <strong>Preview record</strong>
            <p>
              This record has not been submitted to Canton. Ledger-backed
              approvals will be enabled after contract integration.
            </p>
          </div>
        </div>

        <button className="primary-button full-button" onClick={onClose}>
          Close details
        </button>
      </section>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("Overview");
  const [deals, setDeals] = useState(initialDeals);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);

  function createDeal(deal) {
    setDeals((previous) => [deal, ...previous]);
    setShowCreate(false);
    setPage("Transactions");
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} />

      <main className="main-area">
        <Header page={page} setShowCreate={() => setShowCreate(true)} />

        <div className="page-content">
          {page === "Overview" && (
            <Overview
              deals={deals}
              setSelectedDeal={setSelectedDeal}
              setShowCreate={() => setShowCreate(true)}
              setPage={setPage}
            />
          )}

          {page === "Transactions" && (
            <Transactions
              deals={deals}
              setSelectedDeal={setSelectedDeal}
              setShowCreate={() => setShowCreate(true)}
            />
          )}

          {page === "Approvals" && (
            <Approvals deals={deals} setSelectedDeal={setSelectedDeal} />
          )}

          {page === "AI Insights" && <AIInsights deals={deals} />}
        </div>
      </main>

      {showCreate && (
        <CreateDealModal
          onClose={() => setShowCreate(false)}
          onCreate={createDeal}
        />
      )}

      {selectedDeal && (
        <DealModal
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
        />
      )}
    </div>
  );
}
