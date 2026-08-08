import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { redirectToCanonicalHost } from './lib/canonicalHost';

// Se o Console tem endereço dedicado e estamos no caminho antigo (/console/ do
// domínio principal), manda o navegador pra lá ANTES de montar a aplicação —
// evita piscar a tela e perder tempo carregando algo que vai sair.
// Qualquer falha, ou `?stay=1`, cai direto no render normal.
redirectToCanonicalHost().then((redirecionou) => {
  if (redirecionou) return;
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
