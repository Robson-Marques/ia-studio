import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Loader2, MessageCircle, ExternalLink, ShieldCheck } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useToast } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { listWorkflows, publishWorkflow, unpublishWorkflow } from '../../services/automation';

// Tag estável que o seed coloca no fluxo de exemplo (isp-example.repository.ts).
const AUTOREPLY_TAG = 'ia-whatsapp';

// Atendimento por IA no WhatsApp — casca amigável do fluxo "IA responde no
// WhatsApp". Ligar = publicar o fluxo; desligar = despublicar (volta a DRAFT).
// O fluxo em si (gatilho → condição → assistente → enviar) fica no canvas.
export default function AtendimentoIA() {
  const toast = useToast();
  const { can } = usePermissions();
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOn, setConfirmOn] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const items = await listWorkflows();
      const list = Array.isArray(items) ? items : (items?.items ?? []);
      const wf = list.find((w) => Array.isArray(w.tags) && w.tags.includes(AUTOREPLY_TAG)) ?? null;
      setWorkflow(wf);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const enabled = workflow?.status === 'PUBLISHED';
  const canToggle = can('automation.workflows.publish');

  async function turnOn() {
    if (!workflow) return;
    setConfirmOn(false);
    setSaving(true);
    try {
      await publishWorkflow(workflow.id, workflow.current_version || 1);
      toast.success('Pronto. A IA vai responder no WhatsApp quando ninguém estiver atendendo.');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function turnOff() {
    if (!workflow) return;
    setSaving(true);
    try {
      await unpublishWorkflow(workflow.id);
      toast.success('Desligado. A IA não vai mais responder sozinha no WhatsApp.');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function onToggleClick() {
    if (!canToggle) return;
    if (enabled) turnOff();
    else setConfirmOn(true);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--ap-text-1)' }}>
          <Bot size={20} /> Atendimento por IA
        </h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Deixe o assistente responder as mensagens do WhatsApp automaticamente.
        </p>
      </div>

      {!workflow ? (
        <EmptyState
          icon={Bot}
          title="Nenhum atendimento por IA configurado ainda"
          description="O fluxo de exemplo é criado automaticamente quando esta organização tem um provedor de internet (ISP) conectado e um assistente de IA. Conecte um provedor em Integrações para começar."
        />
      ) : (
        <div className="rounded-lg p-5" style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface)' }}>
          {/* Linha principal: descrição + interruptor */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--ap-text-1)' }}>
                A IA responde no WhatsApp
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ap-text-3)' }}>
                Quando um cliente manda mensagem e <strong>ninguém da equipe está atendendo</strong> aquela conversa,
                o assistente responde sozinho. Se um atendente humano estiver conduzindo, a IA fica quieta.
              </p>
            </div>

            {/* Interruptor-pílula */}
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={onToggleClick}
              disabled={!canToggle || saving}
              title={
                !canToggle
                  ? 'Você não tem permissão para ligar/desligar (Publicar fluxos).'
                  : enabled ? 'Desligar o atendimento por IA' : 'Ligar o atendimento por IA'
              }
              className="relative shrink-0 inline-flex items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                width: 52, height: 30,
                backgroundColor: enabled ? 'var(--ap-accent, #6366f1)' : 'var(--ap-border)',
              }}
            >
              <span
                className="inline-block rounded-full bg-white transition-transform"
                style={{ width: 24, height: 24, transform: `translateX(${enabled ? 25 : 3}px)` }}
              />
              {saving && (
                <Loader2 size={14} className="animate-spin absolute -right-6" style={{ color: 'var(--ap-text-4)' }} />
              )}
            </button>
          </div>

          {/* Estado atual */}
          <div className="mt-4 flex items-center gap-2 text-xs" style={{ color: enabled ? '#10b981' : 'var(--ap-text-4)' }}>
            {enabled ? <ShieldCheck size={14} /> : <MessageCircle size={14} />}
            {enabled ? 'Ligado — a IA está atendendo no WhatsApp.' : 'Desligado — nenhuma resposta automática.'}
          </div>

          {/* Link pro fluxo no canvas (quem quiser ver/editar a lógica) */}
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--ap-border-sub, var(--ap-border))' }}>
            <Link
              to={`/automacao/fluxos/${workflow.id}`}
              className="text-xs inline-flex items-center gap-1.5 hover:underline"
              style={{ color: 'var(--ap-accent, #6366f1)' }}
            >
              <ExternalLink size={13} /> Ver e editar o fluxo "{workflow.name}"
            </Link>
            <p className="text-[11px] mt-1" style={{ color: 'var(--ap-text-4)' }}>
              O fluxo mostra o passo a passo: mensagem recebida → confere se há humano atendendo → assistente responde.
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOn}
        title="Ligar o atendimento por IA?"
        message="A partir de agora, quando um cliente escrever no WhatsApp e ninguém estiver atendendo aquela conversa, o assistente vai responder sozinho. Você pode desligar a qualquer momento aqui."
        confirmLabel="Ligar"
        loading={saving}
        onClose={() => setConfirmOn(false)}
        onConfirm={turnOn}
      />
    </div>
  );
}
