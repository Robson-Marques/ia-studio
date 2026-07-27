import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, EmptyState, Badge, Button, Switch, ConfirmDialog, useToast,
} from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { listWorkflows, publishWorkflow, unpublishWorkflow } from '../../services/automation';

// Tag estável que o seed coloca no fluxo de exemplo (isp-example.repository.ts).
const AUTOREPLY_TAG = 'ia-whatsapp';

// WhatsApp/AtendimentoIA — a casca amigável do fluxo "A IA responde no WhatsApp".
// Ligar = publicar o fluxo; desligar = despublicar. Migrada pro DS na v0.10.9.
//
// Decisões de composição:
//
//  · **O interruptor era um `<button role="switch">` desenhado à mão** — pílula de
//    52×30px com `translateX` calculado e `var(--ap-accent, #6366f1)` cravado.
//    Agora é o `Switch` do DS: mesmo gesto, sem 20 linhas de estilo, e acompanha
//    o accent e o tema.
//  · **Desligar passou a pedir confirmação.** Ligar já pedia; desligar rodava
//    direto no clique — e é a ação que **para o atendimento automático** de um
//    canal em produção. Os 5 patrasques valem nos dois sentidos (era a mesma
//    assimetria que corrigi no fluxo, na v0.10.4).
//  · O estado ("ligado/desligado") virou `Badge`, não texto com verde cravado.

export default function AtendimentoIA() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'on' | 'off'

  async function load() {
    setLoading(true);
    try {
      const items = await listWorkflows();
      const list = Array.isArray(items) ? items : (items?.items ?? []);
      setWorkflow(list.find((w) => Array.isArray(w.tags) && w.tags.includes(AUTOREPLY_TAG)) ?? null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ligado = workflow?.status === 'PUBLISHED';
  const canToggle = can('automation.workflows.publish');

  async function confirmToggle() {
    if (!workflow) return;
    setSaving(true);
    try {
      if (confirm === 'on') {
        await publishWorkflow(workflow.id, workflow.current_version || 1);
        toast.success('Pronto. A IA vai responder no WhatsApp quando ninguém estiver atendendo.');
      } else {
        await unpublishWorkflow(workflow.id);
        toast.success('Desligado. A IA não responde mais sozinha no WhatsApp.');
      }
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Atendimento por IA" />
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atendimento por IA"
        subtitle="Deixe o assistente responder as mensagens do WhatsApp quando não houver ninguém na conversa."
      />

      {!workflow ? (
        <Card>
          <EmptyState
            icon="message"
            title="Ainda não há atendimento por IA nesta organização"
            description="O fluxo de exemplo é criado sozinho quando existe um provedor de internet conectado e um assistente de IA. Conecte um provedor em Integrações para começar."
            action={
              <Button variant="secondary" icon="external-link" onClick={() => navigate('/integracoes/conexoes')}>
                Ir para Integrações
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <div style={{ padding: 20 }} className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                    A IA responde no WhatsApp
                  </p>
                  <Badge tone={ligado ? 'success' : 'neutral'}>{ligado ? 'ligado' : 'desligado'}</Badge>
                </div>
                <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5, color: 'var(--su-text-secondary)' }}>
                  Quando um cliente manda mensagem e <strong>ninguém da equipe está atendendo</strong> aquela conversa,
                  o assistente responde sozinho. Se um atendente humano estiver conduzindo, a IA fica quieta.
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />}
                <Switch
                  checked={ligado}
                  aria-label={ligado ? 'Desligar o atendimento por IA' : 'Ligar o atendimento por IA'}
                  onChange={() => {
                    if (!canToggle) {
                      toast.error('Você não tem permissão para ligar ou desligar isto.');
                      return;
                    }
                    setConfirm(ligado ? 'off' : 'on');
                  }}
                />
              </div>
            </div>

            <div style={{ paddingTop: 16, borderTop: '1px solid var(--su-border-subtle)' }} className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                icon="external-link"
                onClick={() => navigate(`/automacao/fluxos/${workflow.id}`)}
              >
                Ver o fluxo “{workflow.name}”
              </Button>
              <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }}>
                O fluxo mostra o passo a passo: mensagem recebida → confere se há alguém atendendo → assistente responde.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 5 patrasques nos DOIS sentidos — desligar também para um canal em uso. */}
      <ConfirmDialog
        open={!!confirm}
        danger={confirm === 'off'}
        loading={saving}
        title={confirm === 'off' ? 'Desligar o atendimento por IA' : 'Ligar o atendimento por IA'}
        message={
          confirm === 'off'
            ? 'Desligar? As mensagens que chegarem sem ninguém atendendo ficam sem resposta até alguém abrir a conversa. Você pode ligar de novo a qualquer momento.'
            : 'A partir de agora, quando um cliente escrever no WhatsApp e ninguém estiver atendendo aquela conversa, o assistente responde sozinho. Você pode desligar a qualquer momento aqui.'
        }
        confirmLabel={confirm === 'off' ? 'Desligar' : 'Ligar'}
        onClose={() => setConfirm(null)}
        onConfirm={confirmToggle}
      />
    </div>
  );
}
