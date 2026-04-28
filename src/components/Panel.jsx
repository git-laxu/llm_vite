export default function Panel({ title, description, actions, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel__header">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="panel__actions">{actions}</div>}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}
