
export default function EmptyState({
  title = "Nothing to show yet",
  description = "Records will appear here when they become available.",
}) {
  return (
    <div className="empty-panel">
      <div className="empty-panel-icon">◈</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
