import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute, { PermissionRoute } from './components/ProtectedRoute';
import Layout from './components/Layout/Layout';
import UIToastContainer from './components/ui/UIToastContainer';

import Login from './pages/Login';
import Clientes from './pages/Clientes';
import ClienteDetalhe from './pages/ClienteDetalhe';
import Planos from './pages/Planos';
import Marketplace from './pages/Marketplace';
import Flags from './pages/Flags';
import Consumo from './pages/Consumo';
import Auditoria from './pages/Auditoria';
import DashboardConsolidado from './pages/DashboardConsolidado';
import Atualizacao from './pages/Atualizacao';
import Dominios from './pages/Dominios';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <UIToastContainer />
          <Routes>
            {/* Publica */}
            <Route path="/login" element={<Login />} />

            {/* Autenticadas (platform admin) */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Navigate to="/clientes" replace />} />
              <Route path="/dashboard" element={<PermissionRoute perm="console.usage.read"><DashboardConsolidado /></PermissionRoute>} />
              <Route path="/clientes" element={<PermissionRoute perm="console.organizations.read"><Clientes /></PermissionRoute>} />
              <Route path="/clientes/:id" element={<PermissionRoute perm="console.organizations.read"><ClienteDetalhe /></PermissionRoute>} />
              <Route path="/planos" element={<PermissionRoute perm="console.plans.read"><Planos /></PermissionRoute>} />
              <Route path="/marketplace" element={<PermissionRoute perm="console.marketplace.read"><Marketplace /></PermissionRoute>} />
              <Route path="/flags" element={<PermissionRoute perm="console.flags.read"><Flags /></PermissionRoute>} />
              <Route path="/consumo" element={<PermissionRoute perm="console.usage.read"><Consumo /></PermissionRoute>} />
              <Route path="/auditoria" element={<PermissionRoute perm="console.audit.read"><Auditoria /></PermissionRoute>} />
              <Route path="/dominios" element={<PermissionRoute perm="console.organizations.read"><Dominios /></PermissionRoute>} />
              <Route path="/atualizacao" element={<PermissionRoute perm="system.upgrade"><Atualizacao /></PermissionRoute>} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/clientes" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
