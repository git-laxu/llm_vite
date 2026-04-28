export function Field({ label, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props) {
  return <input className="input" {...props} />;
}

export function NumberInput(props) {
  return <input className="input" type="number" {...props} />;
}

export function SelectInput({ children, ...props }) {
  return (
    <select className="input" {...props}>
      {children}
    </select>
  );
}

export function TextArea(props) {
  return <textarea className="textarea" {...props} />;
}
