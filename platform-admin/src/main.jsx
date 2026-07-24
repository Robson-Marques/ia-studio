import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Studio UX (adoção — passo 1 da expansão v2, 2026-07-24):
// tokens.css define --su-*; components.css define .su*. configureTheme namespaça as
// chaves de storage do DS (não colide com AquaPark/Finanças) e applyTheme espelha
// accent+tema salvos ANTES do 1º render (evita flash). ToastProvider passa a existir
// no topo do app — os callsites vão migrar de `lib/toast` para `useToast()` no passo 5.
import '@studio-ux-ds/tokens/tokens.css';
import '@studio-ux-ds/components/components.css';
import { configureTheme, applyTheme, ToastProvider } from '@studio-ux-ds/react';

configureTheme({ namespace: 'ia-studio' });
applyTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
