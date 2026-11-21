import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen, PageHeader, Card, Badge, Button, Spinner, useToast } from '@studio-ux-ds/react';
import { ensureNativeAgent, listAgents } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';

/**
 * Newnet: agente único e nativo. Não há catálogo, wizard ou criação manual.
 * O backend provisiona de forma idempotente para quem pode administrar.
 * Perfis só de leitura consultam o agente existente sem fazer mutações.
 */
export default function Agentes() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const canWrite = can('ai.agents.write');
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = canWrite
          ? await ensureNativeAgent()
          : await listAgents().then(({ items }) =>
              items.find((a) => a.name === 'Assistente Newnet') || (items.length === 1 ? items[0] : null));
        if (alive) setAgent(result);
      } catch (err) {
        if (alive) { setError(err.message); toast.error(err.message); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [canWrite]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSection = (section) => {
    if (agent) navigate(`/ia/agentes/${agent.id}?secao=${section}`);
  };

  return (
    <Screen as="div" className="space-y-4">
      <PageHeader
        title="Agente Newnet"
        subtitle="Assistente oficial da Newnet Telecom. Complete seu conhecimento e escolha as funções autorizadas."
      />
      {loading ? <Spinner size="lg" center /> : error ? (
        <Card><div style={{ padding: 20 }}>
          <strong>Não foi possível carregar o agente.</strong>
          <p style={{ marginTop: 8 }}>{error}</p>
        </div></Card>
      ) : !agent ? (
        <Card><div style={{ padding: 20 }}>
          O agente ainda não foi provisionado. Solicite ao administrador a permissão para configurá-lo.
        </div></Card>
      ) : (
        <>
          <Card>
            <div style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span aria-hidden="true" style={{ fontSize: 26 }}>✦</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{agent.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--su-text-secondary)' }}>Agente oficial desta instalação</div>
                </div>
              </div>
              <Badge tone={agent.is_active === false ? 'neutral' : 'success'}>
                {agent.is_active === false ? 'Desativado' : 'Disponível'}
              </Badge>
            </div>
          </Card>
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <div style={{ padding: 20 }} className="space-y-3">
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Conhecimento</h2>
                <p style={{ fontSize: 13, color: 'var(--su-text-secondary)' }}>
                  Vincule documentos e bases para que o agente responda com informações da Newnet.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => openSection('sabe')}>Configurar conhecimento</Button>
                  {can('ai.knowledge.read') && (
                    <Button variant="secondary" onClick={() => navigate('/ia/conhecimento')}>Gerenciar bases</Button>
                  )}
                </div>
              </div>
            </Card>
            <Card>
              <div style={{ padding: 20 }} className="space-y-3">
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Habilidades e acessos</h2>
                <p style={{ fontSize: 13, color: 'var(--su-text-secondary)' }}>
                  Escolha as consultas permitidas. Ações que alteram dados exigem autorização específica.
                </p>
                <Button variant="secondary" onClick={() => openSection('faz')}>Configurar habilidades</Button>
              </div>
            </Card>
            <Card>
              <div style={{ padding: 20 }} className="space-y-3">
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>ConnectChat — primeira validação</h2>
                <p style={{ fontSize: 13, color: 'var(--su-text-secondary)' }}>
                  Conecte o canal web ao agente Newnet e teste conversas reais em modo supervisionado,
                  sem envio automático ou alteração dos dados no IXC.
                </p>
                {can('comm.connectchat.read') ? (
                  <Button variant="primary" onClick={() => navigate('/connectchat/conversas')}>Abrir ConnectChat</Button>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--su-text-secondary)' }}>Solicite acesso de leitura ao ConnectChat.</p>
                )}
              </div>
            </Card>
            <Card>
              <div style={{ padding: 20 }} className="space-y-3">
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Testar agente</h2>
                <p style={{ fontSize: 13, color: 'var(--su-text-secondary)' }}>
                  Verifique respostas e acessos antes de liberar o uso operacional.
                </p>
                <Button variant="secondary" onClick={() => openSection('testar')}>Abrir teste</Button>
              </div>
            </Card>
            {canWrite && (
              <Card>
                <div style={{ padding: 20 }} className="space-y-3">
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Administração</h2>
                  <p style={{ fontSize: 13, color: 'var(--su-text-secondary)' }}>
                    Identidade, modelo de IA, versões e demais parâmetros técnicos.
                  </p>
                  <Button variant="secondary" onClick={() => openSection('visao')}>Configurações administrativas</Button>
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </Screen>
  );
}
