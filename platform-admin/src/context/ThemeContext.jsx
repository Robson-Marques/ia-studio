import React, { createContext, useContext, useEffect, useState } from 'react';
import { isDark as dsIsDark, setTheme as dsSetTheme } from '@studio-ux-ds/react';

// ThemeContext — wrapper fino do mecanismo de tema do @studio-ux-ds/react.
// A partir da adoção v2 (2026-07-24), o DS é a fonte única do tema (chaves
// namespaçadas `ia-studio_su_theme` via configureTheme() no main.jsx). Este
// contexto:
//   1) Reflete o estado atual em `theme` ('dark' | 'light') para consumidores existentes;
//   2) Sincroniza a classe `.dark` do <html> (usada pelas telas Tailwind com `dark:`);
//   3) Escuta mudanças em <html data-theme> (quando o quick-toggle do AppShell ou o
//      painel Customize mudam o tema) e mantém tudo alinhado — sem drift.
// API pública (`useTheme` → { theme, toggle, isDark }) preservada.

const ThemeContext = createContext(null);

function syncDarkClass() {
  const html = document.documentElement;
  if (dsIsDark()) html.classList.add('dark'); else html.classList.remove('dark');
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => (dsIsDark() ? 'dark' : 'light'));

  useEffect(() => {
    // Espelha .dark class conforme o estado atual do DS no boot.
    syncDarkClass();
  }, []);

  useEffect(() => {
    // Observa mudanças externas em <html data-theme>. Se o AppShell trocar o tema
    // via quick-toggle ou Customize, este observer atualiza `theme` local + .dark.
    const html = document.documentElement;
    const obs = new MutationObserver(() => {
      const next = dsIsDark() ? 'dark' : 'light';
      setThemeState((prev) => (prev === next ? prev : next));
      syncDarkClass();
    });
    obs.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    // Também reage à preferência do SO quando o tema é "Sistema" (data-theme ausente).
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSys = () => {
      const next = dsIsDark() ? 'dark' : 'light';
      setThemeState((prev) => (prev === next ? prev : next));
      syncDarkClass();
    };
    mq?.addEventListener?.('change', onSys);
    return () => {
      obs.disconnect();
      mq?.removeEventListener?.('change', onSys);
    };
  }, []);

  const toggle = () => {
    const nextIsDark = !dsIsDark();
    dsSetTheme(nextIsDark ? 'dark' : 'light');
    setThemeState(nextIsDark ? 'dark' : 'light');
    syncDarkClass();
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
