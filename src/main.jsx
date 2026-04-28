import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

import './styles/base.css';
import './styles/components.css';
import './styles/pages/knowledge.css';
import './styles/pages/strategy.css';
import './styles/pages/projects.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
