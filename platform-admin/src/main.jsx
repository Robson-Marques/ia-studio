import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Studio UX (piloto de adoção) — só define variáveis --su-* e classes .su* (escopadas).
// Não afeta as telas existentes; usado apenas pela rota /studio-ux-demo.
import '@studio-ux-ds/tokens/tokens.css';
import '@studio-ux-ds/components/components.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
