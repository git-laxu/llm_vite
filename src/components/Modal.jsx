export default function Modal({ open, title, children, onClose }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal" onMouseDown={event => event.stopPropagation()}>
        <div className="modal__header">
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  );
}
