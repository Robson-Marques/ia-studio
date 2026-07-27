import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import ProtectedRoute, { PermissionRoute } from './components/ProtectedRoute';
import Layout from './components/Layout/Layout';

import Login from './pages/Login';
import AcceptInvite from './pages/AcceptInvite';
import PaginaPagamento from './pages/PaginaPagamento';
import Dashboard from './pages/Dashboard';
import ContaSenha from './pages/ContaSenha';
import Usuarios from './pages/Usuarios';
import PerfisAcesso from './pages/PerfisAcesso';
import Workspaces from './pages/Workspaces';
import Auditoria from './pages/Auditoria';
import MinhaConta from './pages/MinhaConta';
import Marketplace from './pages/Integracoes/Marketplace';
import Conexoes from './pages/Integracoes/Conexoes';
import ConexaoNova from './pages/Integracoes/ConexaoNova';
import ConexaoDetalhe from './pages/Integracoes/ConexaoDetalhe';
import ConexaoEditar from './pages/Integracoes/ConexaoEditar';
import Segredos from './pages/Integracoes/Segredos';
import Conversas from './pages/WhatsApp/Conversas';
import Templates from './pages/WhatsApp/Templates';
import TemplateNovo from './pages/WhatsApp/TemplateNovo';
import EquipesFilas from './pages/WhatsApp/EquipesFilas';
import EquipeEditor from './pages/WhatsApp/EquipeEditor';
import FilaEditor from './pages/WhatsApp/FilaEditor';
import Numeros from './pages/WhatsApp/Numeros';
import AtendimentoIA from './pages/WhatsApp/AtendimentoIA';
import Fluxos from './pages/Automacao/Fluxos';
import FluxoNovo from './pages/Automacao/FluxoNovo';
import FluxoImportar from './pages/Automacao/FluxoImportar';
import FluxoEditor from './pages/Automacao/FluxoEditor';
import FluxoCanvas from './pages/Automacao/FluxoCanvas';
import Agendamentos from './pages/Automacao/Agendamentos';
import CalendarioEditor from './pages/Automacao/CalendarioEditor';
import Execucoes from './pages/Automacao/Execucoes';
import ExecucaoDetalhe from './pages/Automacao/ExecucaoDetalhe';
import TemplatesAutomacao from './pages/Automacao/TemplatesAutomacao';
import TemplateEditor from './pages/Automacao/TemplateEditor';
import Eventos from './pages/Automacao/Eventos';
import Notificacoes from './pages/Automacao/Notificacoes';
import Agentes from './pages/IA/Agentes';
import AgenteEditor from './pages/IA/AgenteEditor';
import AgenteImportar from './pages/IA/AgenteImportar';
import BasesConhecimento from './pages/IA/BasesConhecimento';
import BaseConhecimentoEditor from './pages/IA/BaseConhecimentoEditor';
import BaseConhecimentoDetalhe from './pages/IA/BaseConhecimentoDetalhe';
import BaseDocumentoEditor from './pages/IA/BaseDocumentoEditor';
import Memoria from './pages/IA/Memoria';
import MemoriaEntradas from './pages/IA/MemoriaEntradas';
import MemoriaPerfilEditor from './pages/IA/MemoriaPerfilEditor';
import Ferramentas from './pages/IA/Ferramentas';
import FerramentaEditor from './pages/IA/FerramentaEditor';
import Aprovacoes from './pages/IA/Aprovacoes';
import AprovacaoDetalhe from './pages/IA/AprovacaoDetalhe';
import AprovacaoPoliticaEditor from './pages/IA/AprovacaoPoliticaEditor';
import Custos from './pages/IA/Custos';
import Incidentes from './pages/ISP/Incidentes';
import IncidenteEditor from './pages/ISP/IncidenteEditor';
import AberturaChamado from './pages/ISP/AberturaChamado';
import Mapeamentos from './pages/Recursos/Mapeamentos';
import MapeamentoEditor from './pages/Recursos/MapeamentoEditor';
import Explorer from './pages/Recursos/Explorer';
import ConsoleDev from './pages/Desenvolvedor/Console';
import ApiKeys from './pages/Desenvolvedor/ApiKeys';
import StudioUxDemo from './pages/StudioUxDemo';

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
            <Routes>
              {/* Publicas */}
              <Route path="/login" element={<Login />} />
              <Route path="/convite/:token" element={<AcceptInvite />} />
              <Route path="/pagar/:token" element={<PaginaPagamento />} />

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
                <Route path="/conta/senha" element={<ContaSenha />} />
                <Route path="/integracoes/marketplace" element={<PermissionRoute perm="integrations.marketplace.read"><Marketplace /></PermissionRoute>} />
                <Route path="/integracoes/conexoes" element={<PermissionRoute perm="integrations.connections.read"><Conexoes /></PermissionRoute>} />
                {/* `nova` antes de `:id` — senão a rota dinâmica casa primeiro e trata "nova" como um id. */}
                <Route path="/integracoes/conexoes/nova" element={<PermissionRoute perm="integrations.connections.write"><ConexaoNova /></PermissionRoute>} />
                <Route path="/integracoes/conexoes/:id" element={<PermissionRoute perm="integrations.connections.read"><ConexaoDetalhe /></PermissionRoute>} />
                <Route path="/integracoes/conexoes/:id/editar" element={<PermissionRoute perm="integrations.connections.write"><ConexaoEditar /></PermissionRoute>} />
                <Route path="/integracoes/segredos" element={<PermissionRoute perm="integrations.secrets.read"><Segredos /></PermissionRoute>} />
                <Route path="/whatsapp/conversas" element={<PermissionRoute perm={WHATSAPP_VIEW_PERMS}><Conversas /></PermissionRoute>} />
                <Route path="/whatsapp/templates" element={<PermissionRoute perm="comm.whatsapp.templates.read"><Templates /></PermissionRoute>} />
                <Route path="/whatsapp/templates/novo" element={<PermissionRoute perm="comm.whatsapp.templates.manage"><TemplateNovo /></PermissionRoute>} />
                <Route path="/whatsapp/equipes" element={<PermissionRoute perm="comm.whatsapp.teams.read"><EquipesFilas /></PermissionRoute>} />
                {/* `nova` antes de `:id` — senão a rota dinâmica casa primeiro. */}
                <Route path="/whatsapp/equipes/nova" element={<PermissionRoute perm="comm.whatsapp.teams.manage"><EquipeEditor /></PermissionRoute>} />
                <Route path="/whatsapp/equipes/:id" element={<PermissionRoute perm="comm.whatsapp.teams.read"><EquipeEditor /></PermissionRoute>} />
                <Route path="/whatsapp/filas/nova" element={<PermissionRoute perm="comm.whatsapp.queues.manage"><FilaEditor /></PermissionRoute>} />
                <Route path="/whatsapp/filas/:id" element={<PermissionRoute perm="comm.whatsapp.queues.read"><FilaEditor /></PermissionRoute>} />
                <Route path="/whatsapp/numeros" element={<PermissionRoute perm="comm.whatsapp.numbers.read"><Numeros /></PermissionRoute>} />
                <Route path="/whatsapp/atendimento-ia" element={<PermissionRoute perm="automation.workflows.read"><AtendimentoIA /></PermissionRoute>} />
                <Route path="/automacao/fluxos" element={<PermissionRoute perm="automation.workflows.read"><Fluxos /></PermissionRoute>} />
                {/* `novo` e `importar` vêm ANTES de `:id` — senão o React Router
                    casa a rota dinâmica primeiro e trata "novo" como um id. */}
                <Route path="/automacao/fluxos/novo" element={<PermissionRoute perm="automation.workflows.write"><FluxoNovo /></PermissionRoute>} />
                <Route path="/automacao/fluxos/importar" element={<PermissionRoute perm="automation.workflows.write"><FluxoImportar /></PermissionRoute>} />
                <Route path="/automacao/fluxos/:id" element={<PermissionRoute perm="automation.workflows.read"><FluxoCanvas /></PermissionRoute>} />
                <Route path="/automacao/fluxos/:id/lista" element={<PermissionRoute perm="automation.workflows.read"><FluxoEditor /></PermissionRoute>} />
                <Route path="/automacao/agendamentos" element={<PermissionRoute perm="automation.workflows.read"><Agendamentos /></PermissionRoute>} />
                <Route path="/automacao/calendarios/novo" element={<PermissionRoute perm="automation.calendars.manage"><CalendarioEditor /></PermissionRoute>} />
                <Route path="/automacao/calendarios/:id" element={<PermissionRoute perm="automation.workflows.read"><CalendarioEditor /></PermissionRoute>} />
                <Route path="/automacao/execucoes" element={<PermissionRoute perm="automation.executions.read"><Execucoes /></PermissionRoute>} />
                <Route path="/automacao/execucoes/:id" element={<PermissionRoute perm="automation.executions.read"><ExecucaoDetalhe /></PermissionRoute>} />
                <Route path="/automacao/templates" element={<PermissionRoute perm="automation.templates.read"><TemplatesAutomacao /></PermissionRoute>} />
                <Route path="/automacao/templates/novo" element={<PermissionRoute perm="automation.templates.write"><TemplateEditor /></PermissionRoute>} />
                <Route path="/automacao/templates/:id" element={<PermissionRoute perm="automation.templates.read"><TemplateEditor /></PermissionRoute>} />
                <Route path="/automacao/eventos" element={<PermissionRoute perm="automation.events.read"><Eventos /></PermissionRoute>} />
                <Route path="/automacao/notificacoes" element={<PermissionRoute perm="automation.notifications.read"><Notificacoes /></PermissionRoute>} />
                <Route path="/ia/agentes" element={<PermissionRoute perm="ai.agents.read"><Agentes /></PermissionRoute>} />
                <Route path="/ia/agentes/nova" element={<PermissionRoute perm="ai.agents.write"><AgenteEditor /></PermissionRoute>} />
                <Route path="/ia/agentes/importar" element={<PermissionRoute perm="ai.agents.write"><AgenteImportar /></PermissionRoute>} />
                {/* `read` (não `write`): a aba Testar vive aqui, e quem só tem
                    ai.agents.execute precisa alcançá-la. O Salvar é gateado por
                    can('ai.agents.write') dentro do editor. */}
                <Route path="/ia/agentes/:id" element={<PermissionRoute perm="ai.agents.read"><AgenteEditor /></PermissionRoute>} />
                <Route path="/ia/conhecimento" element={<PermissionRoute perm="ai.knowledge.read"><BasesConhecimento /></PermissionRoute>} />
                <Route path="/ia/conhecimento/nova" element={<PermissionRoute perm="ai.knowledge.write"><BaseConhecimentoEditor /></PermissionRoute>} />
                <Route path="/ia/conhecimento/:id" element={<PermissionRoute perm="ai.knowledge.read"><BaseConhecimentoDetalhe /></PermissionRoute>} />
                <Route path="/ia/conhecimento/:id/documentos/novo" element={<PermissionRoute perm="ai.knowledge.write"><BaseDocumentoEditor /></PermissionRoute>} />
                <Route path="/ia/memoria" element={<PermissionRoute perm="ai.memory.read"><Memoria /></PermissionRoute>} />
                <Route path="/ia/memoria/perfis/nova" element={<PermissionRoute perm="ai.memory.write"><MemoriaPerfilEditor /></PermissionRoute>} />
                <Route path="/ia/memoria/perfis/:id/editar" element={<PermissionRoute perm="ai.memory.write"><MemoriaPerfilEditor /></PermissionRoute>} />
                <Route path="/ia/memoria/:id" element={<PermissionRoute perm="ai.memory.read"><MemoriaEntradas /></PermissionRoute>} />
                <Route path="/ia/ferramentas" element={<PermissionRoute perm="ai.tools.read"><Ferramentas /></PermissionRoute>} />
                <Route path="/ia/ferramentas/tool/nova" element={<PermissionRoute perm="ai.tools.write"><FerramentaEditor /></PermissionRoute>} />
                <Route path="/ia/ferramentas/tool/:id/editar" element={<PermissionRoute perm="ai.tools.write"><FerramentaEditor /></PermissionRoute>} />
                <Route path="/ia/aprovacoes" element={<PermissionRoute perm="ai.approvals.read"><Aprovacoes /></PermissionRoute>} />
                <Route path="/ia/aprovacoes/politicas/nova" element={<PermissionRoute perm="ai.approvals.decide"><AprovacaoPoliticaEditor /></PermissionRoute>} />
                <Route path="/ia/aprovacoes/:id" element={<PermissionRoute perm="ai.approvals.read"><AprovacaoDetalhe /></PermissionRoute>} />
                <Route path="/ia/custos" element={<PermissionRoute perm="ai.costs.read"><Custos /></PermissionRoute>} />
                <Route path="/isp/incidentes" element={<PermissionRoute perm="isp.incidents.read"><Incidentes /></PermissionRoute>} />
                <Route path="/isp/incidentes/novo" element={<PermissionRoute perm="isp.incidents.write"><IncidenteEditor /></PermissionRoute>} />
                {/* `read`: a aba Afetados e as ações de ativar/disparar têm gate
                    próprio por permissão dentro da tela. */}
                <Route path="/isp/incidentes/:id" element={<PermissionRoute perm="isp.incidents.read"><IncidenteEditor /></PermissionRoute>} />
                <Route path="/isp/abertura-chamado" element={<PermissionRoute perm="isp.incidents.read"><AberturaChamado /></PermissionRoute>} />
                <Route path="/recursos/mapeamentos" element={<PermissionRoute perm="resource.mappings.read"><Mapeamentos /></PermissionRoute>} />
                {/* `novo` antes de `:id` — senão a rota dinâmica casa primeiro e trata "novo" como um id. */}
                <Route path="/recursos/mapeamentos/novo" element={<PermissionRoute perm="resource.mappings.write"><MapeamentoEditor /></PermissionRoute>} />
                <Route path="/recursos/mapeamentos/:id" element={<PermissionRoute perm="resource.mappings.read"><MapeamentoEditor /></PermissionRoute>} />
                <Route path="/recursos/explorer" element={<PermissionRoute perm="resource.explore.read"><Explorer /></PermissionRoute>} />
                <Route path="/desenvolvedor/console" element={<PermissionRoute perm="devtools.use"><ConsoleDev /></PermissionRoute>} />
                <Route path="/desenvolvedor/api-keys" element={<PermissionRoute perm="developer.apikeys.read"><ApiKeys /></PermissionRoute>} />
                <Route path="/studio-ux-demo" element={<StudioUxDemo />} />
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
