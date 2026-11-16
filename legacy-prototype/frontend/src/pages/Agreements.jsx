
import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";

function formatMoney(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
  } catch {
    return `${currency} ${Number(amount || 0).toLocaleString()}`;
  }
}

export default function Agreements({ deals = [], onCreate }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return deals.filter((deal) => {
      const currentStatus = deal.status || "Pending";
      const content = [
        deal.id,
        deal.title,
        deal.buyer,
        deal.seller,
      ].join(" ").toLowerCase();

      return (
        (!query || content.includes(query)) &&
        (status === "All" || currentStatus.toLowerCase() === status.toLowerCase())
      );
    });
  }, [deals, search, status]);

  return (
    <section>
      <PageHeader
        eyebrow="WORKSPACE"
        title="Trade agreements"
        description="Find and review agreements and their current workflow status."
        action={
          onCreate ? (
            <button className="primary-button" onClick={onCreate}>
              + New agreement
            </button>
          ) : null
        }
      />

      <div className="content-card">
        <div className="table-toolbar">
          <label className="search-box">
            <span className="icon">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search agreements..."
            />
          </label>

          <div className="filter-wrap">
            <select
              aria-label="Filter agreements by status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option>All</option>
              <option>Pending</option>
              <option>Approved</option>
              <option>Completed</option>
              <option>Rejected</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No matching agreements"
            description="Try another search or create a demonstration agreement."
          />
        ) : (
          <div className="table-scroll">
            <table className="deals-table">
              <thead>
                <tr>
                  <th>AGREEMENT</th>
                  <th>BUYER</th>
                  <th>SELLER</th>
                  <th>VALUE</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((deal, index) => (
                  <tr key={deal.id || `${deal.title}-${index}`}>
                    <td>
                      <div className="agreement-cell">
                        <span className="agreement-icon">◈</span>
                        <span>
                          <strong>{deal.title || "Untitled agreement"}</strong>
                          <small>{deal.id || "Local demo record"}</small>
                        </span>
                      </div>
                    </td>
                    <td>{deal.buyer || "—"}</td>
                    <td>{deal.seller || "—"}</td>
                    <td className="amount-cell">
                      {formatMoney(deal.amount, deal.currency)}
                    </td>
                    <td><StatusBadge status={deal.status || "Pending"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="table-footer">
          Showing <strong>{filtered.length}</strong> of <strong>{deals.length}</strong> records
        </div>
      </div>
    </section>
  );
}
