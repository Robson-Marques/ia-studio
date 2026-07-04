import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Fecha o drawer mobile ao trocar de rota.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Trava o scroll do body enquanto o drawer mobile esta aberto.
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  function handleToggle() {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  }

  return (
    <div
      // 100dvh recalcula quando a URL bar do Safari iOS some/aparece.
      className="flex h-[100dvh] overflow-hidden transition-colors duration-200"
      style={{ backgroundColor: 'var(--ap-bg)' }}
    >
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header onToggleSidebar={handleToggle} />
        <main
          className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 transition-colors duration-200"
          style={{
            backgroundColor: 'var(--ap-bg-page)',
            paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
