
// 1. PageShell 没有 title / description / actions 时，不再渲染空白标题面板；
// 2. PageShell 支持右侧 actions，可以把“项目”按钮自然放到标题面板右侧。

export default function PageShell({
  title,
  description,
  actions,
  children,
  className = ''
}) {
  return (
    <main className={`page-shell ${className}`}>
      {(title || description || actions) && (
        <section className="page-title-card">
          <div className="page-title-card__text">
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>

          {actions && (
            <div className="page-title-card__actions">
              {actions}
            </div>
          )}
        </section>
      )}

      {children}
    </main>
  );
}