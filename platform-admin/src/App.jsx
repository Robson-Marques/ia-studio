import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import ProtectedRoute, { PermissionRoute } from './components/ProtectedRoute';
import Layout from './components/Layout/Layout';
import UIToastContainer from './components/ui/UIToastContainer';

import Login from './pages/Login';
import AcceptInvite from './pages/AcceptInvite';
import Dashboard from './pages/Dashboard';
import Usuarios from './pages/Usuarios';
import PerfisAcesso from './pages/PerfisAcesso';
import Workspaces from './pages/Workspaces';
import Auditoria from './pages/Auditoria';
import MinhaConta from './pages/MinhaConta';
import Marketplace from './pages/Integracoes/Marketplace';
import Conexoes from './pages/Integracoes/Conexoes';
import Segredos from './pages/Integracoes/Segredos';
import Conversas from './pages/WhatsApp/Conversas';
import Templates from './pages/WhatsApp/Templates';
import EquipesFilas from './pages/WhatsApp/EquipesFilas';
import Numeros from './pages/WhatsApp/Numeros';
import Fluxos from './pages/Automacao/Fluxos';
import FluxoEditor from './pages/Automacao/FluxoEditor';
import FluxoCanvas from './pages/Automacao/FluxoCanvas';
import Agendamentos from './pages/Automacao/Agendamentos';
import Execucoes from './pages/Automacao/Execucoes';
import TemplatesAutomacao from './pages/Automacao/TemplatesAutomacao';
import Eventos from './pages/Automacao/Eventos';
import Notificacoes from './pages/Automacao/Notificacoes';
import Agentes from './pages/IA/Agentes';
import BasesConhecimento from './pages/IA/BasesConhecimento';
import Memoria from './pages/IA/Memoria';
import Ferramentas from './pages/IA/Ferramentas';
import Aprovacoes from './pages/IA/Aprovacoes';
import Custos from './pages/IA/Custos';
import Incidentes from './pages/ISP/Incidentes';
import Mapeamentos from './pages/Recursos/Mapeamentos';
import Explorer from './pages/Recursos/Explorer';
import ConsoleDev from './pages/Desenvolvedor/Console';
import ApiKeys from './pages/Desenvolvedor/ApiKeys';

const WHATSAPP_VIEW_PERMS = [
  'comm.whatsapp.view.assigned',
  'comm.whatsapp.view.unassigned',
  'comm.whatsapp.view.team',
  'comm.whatsapp.view.all',
];

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <BrowserRouter>
            <UIToastContainer />
            <Routes>
              {/* Publicas */}
              <Route path="/login" element={<Login />} />
              <Route path="/convite/:token" element={<AcceptInvite />} />

              {/* Autenticadas */}
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Dashboard />} />
                <Route path="/usuarios" element={<PermissionRoute perm="core.users.read"><Usuarios /></PermissionRoute>} />
                <Route path="/perfis" element={<PermissionRoute perm="core.profiles.read"><PerfisAcesso /></PermissionRoute>} />
                <Route path="/workspaces" element={<PermissionRoute perm="core.workspaces.read"><Workspaces /></PermissionRoute>} />
                <Route path="/auditoria" element={<PermissionRoute perm="core.audit.read"><Auditoria /></PermissionRoute>} />
                <Route path="/minha-conta" element={<MinhaConta />} />
                <Route path="/integracoes/marketplace" element={<PermissionRoute perm="integrations.marketplace.read"><Marketplace /></PermissionRoute>} />
                <Route path="/integracoes/conexoes" element={<PermissionRoute perm="integrations.connections.read"><Conexoes /></PermissionRoute>} />
                <Route path="/integracoes/segredos" element={<PermissionRoute perm="integrations.secrets.read"><Segredos /></PermissionRoute>} />
                <Route path="/whatsapp/conversas" element={<PermissionRoute perm={WHATSAPP_VIEW_PERMS}><Conversas /></PermissionRoute>} />
                <Route path="/whatsapp/templates" element={<PermissionRoute perm="comm.whatsapp.templates.read"><Templates /></PermissionRoute>} />
                <Route path="/whatsapp/equipes" element={<PermissionRoute perm="comm.whatsapp.teams.read"><EquipesFilas /></PermissionRoute>} />
                <Route path="/whatsapp/numeros" element={<PermissionRoute perm="comm.whatsapp.numbers.read"><Numeros /></PermissionRoute>} />
                <Route path="/automacao/fluxos" element={<PermissionRoute perm="automation.workflows.read"><Fluxos /></PermissionRoute>} />
                <Route path="/automacao/fluxos/:id" element={<PermissionRoute perm="automation.workflows.read"><FluxoCanvas /></PermissionRoute>} />
                <Route path="/automacao/fluxos/:id/lista" element={<PermissionRoute perm="automation.workflows.read"><FluxoEditor /></PermissionRoute>} />
                <Route path="/automacao/agendamentos" element={<PermissionRoute perm="automation.workflows.read"><Agendamentos /></PermissionRoute>} />
                <Route path="/automacao/execucoes" element={<PermissionRoute perm="automation.executions.read"><Execucoes /></PermissionRoute>} />
                <Route path="/automacao/templates" element={<PermissionRoute perm="automation.templates.read"><TemplatesAutomacao /></PermissionRoute>} />
                <Route path="/automacao/eventos" element={<PermissionRoute perm="automation.events.read"><Eventos /></PermissionRoute>} />
                <Route path="/automacao/notificacoes" element={<PermissionRoute perm="automation.notifications.read"><Notificacoes /></PermissionRoute>} />
                <Route path="/ia/agentes" element={<PermissionRoute perm="ai.agents.read"><Agentes /></PermissionRoute>} />
                <Route path="/ia/conhecimento" element={<PermissionRoute perm="ai.knowledge.read"><BasesConhecimento /></PermissionRoute>} />
                <Route path="/ia/memoria" element={<PermissionRoute perm="ai.memory.read"><Memoria /></PermissionRoute>} />
                <Route path="/ia/ferramentas" element={<PermissionRoute perm="ai.tools.read"><Ferramentas /></PermissionRoute>} />
                <Route path="/ia/aprovacoes" element={<PermissionRoute perm="ai.approvals.read"><Aprovacoes /></PermissionRoute>} />
                <Route path="/ia/custos" element={<PermissionRoute perm="ai.costs.read"><Custos /></PermissionRoute>} />
                <Route path="/isp/incidentes" element={<PermissionRoute perm="isp.incidents.read"><Incidentes /></PermissionRoute>} />
                <Route path="/recursos/mapeamentos" element={<PermissionRoute perm="resource.mappings.read"><Mapeamentos /></PermissionRoute>} />
                <Route path="/recursos/explorer" element={<PermissionRoute perm="resource.explore.read"><Explorer /></PermissionRoute>} />
                <Route path="/desenvolvedor/console" element={<PermissionRoute perm="devtools.use"><ConsoleDev /></PermissionRoute>} />
                <Route path="/desenvolvedor/api-keys" element={<PermissionRoute perm="developer.apikeys.read"><ApiKeys /></PermissionRoute>} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
