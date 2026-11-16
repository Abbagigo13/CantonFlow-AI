
export default function PageHeader({
  eyebrow = "CANTONFLOW AI",
  title,
  description,
  action,
}) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">
          <span className="eyebrow-line" />
          {eyebrow}
        </div>
        <h1>{title}<span className="title-period">.</span></h1>
        {description && <p className="page-subtitle">{description}</p>}
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </header>
  );
}
