
export default function StatusBadge({ status = "Pending" }) {
  const normalized = String(status).toLowerCase();

  let variant = "pending";
  if (normalized.includes("complete")) variant = "complete";
  else if (normalized.includes("approv")) variant = "approved";
  else if (normalized.includes("reject") || normalized.includes("fail")) {
    variant = "rejected";
  }

  return (
    <span className={`status-pill status-${variant}`}>
      <span />
      {status}
    </span>
  );
}
