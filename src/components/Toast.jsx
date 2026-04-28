import { useEffect, useState } from 'react';

export default function Toast({ toast }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast || !visible) return null;

  return (
    <div className={`toast toast--${toast.type}`}>
      {toast.message}
    </div>
  );
}
