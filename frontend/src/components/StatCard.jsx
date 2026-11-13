
export default function StatCard({
  label,
  value,
  detail,
  icon = "◈",
  accent = "purple",
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${accent}`}>{icon}</span>
      </div>
      <div className="stat-value">{value ?? "—"}</div>
      <div className="stat-bottom">
        <span className="stat-neutral">{detail}</span>
      </div>
    </article>
  );
}
