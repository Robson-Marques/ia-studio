import React, { useEffect, useState } from 'react';
import { Loader2, Play, Wrench, User, Bot } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import { FormField, Textarea } from '../../../components/ui/FormField';
import { Badge } from '../../../components/ui/Table';
import { executeAgent } from '../../../services/ai';
import { useToast } from '@studio-ux-ds/react';
import { formatUsd, formatTokens, RUN_STATUS } from '../ia.constants';

// Teste do agente: input → run síncrona → transcript + tokens + custo.
// O transcript vem em run.messages[] ({role, content, tool_calls?, tool_call_id?}).
export default function AgentExecuteModal({ open, onClose, agent }) {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(null);

  useEffect(() => { if (open) { setInput(''); setRun(null); } }, [open]);

  async function handleRun() {
    if (!input.trim()) { toast.error('Informe uma mensagem/input para o teste.'); return; }
    setRunning(true);
    setRun(null);
    try {
      const result = await executeAgent(agent.id, { input: input.trim() });
      setRun(result);
      const st = result?.status;
      if (st === 'AWAITING_APPROVAL') toast.warn('Execução aguardando aprovação de uma ação.');
      else if (st === 'ERROR') toast.error('A execução terminou com erro — veja o transcript.');
      else toast.success('Execução concluída.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  const messages = Array.isArray(run?.messages) ? run.messages : [];
  const statusInfo = run ? (RUN_STATUS[run.status] || { label: run.status, variant: 'gray' }) : null;

  return (
    <Modal
      open={open}
      onClose={running ? undefined : onClose}
      title={`Testar agente: ${agent?.name ?? ''}`}
      size="xl"
      dismissable={!running}
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={running}>Fechar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleRun} disabled={running}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Executar teste
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Mensagem / input" hint="Simula a primeira mensagem do usuário para o agente.">
          <Textarea rows={3} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ex.: Qual o horário de atendimento?" />
        </FormField>

        {running && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: 'var(--ap-text-4)' }}>
            <Loader2 size={16} className="animate-spin" /> Executando o agente…
          </div>
        )}

        {run && (
          <div className="space-y-3">
            {/* Resumo tokens/custo */}
            <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--ap-text-3)' }}>
              {statusInfo && <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>}
              <span>Tokens: <strong style={{ color: 'var(--ap-text-1)' }}>{formatTokens(run.total_tokens)}</strong>
                {' '}({formatTokens(run.prompt_tokens)} prompt + {formatTokens(run.completion_tokens)} resposta)</span>
              <span>Custo: <strong style={{ color: 'var(--ap-text-1)' }}>{formatUsd(run.cost_usd)}</strong></span>
              {run.model && <span>Modelo: <strong style={{ color: 'var(--ap-text-1)' }}>{run.model}</strong></span>}
            </div>

            {run.error && (
              <p className="text-xs rounded-lg p-2 text-red-500" style={{ border: '1px solid var(--ap-border)' }}>{run.error}</p>
            )}

            {/* Transcript */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-5)' }}>Transcript</p>
              {messages.length ? messages.map((m, i) => (
                <TranscriptLine key={i} message={m} />
              )) : (
                <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
                  {run.output || 'Sem transcript detalhado.'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TranscriptLine({ message }) {
  const role = message.role || 'assistant';
  const meta = {
    user:      { Icon: User, label: 'Usuário', color: 'var(--ap-text-2)' },
    assistant: { Icon: Bot, label: 'Agente', color: 'var(--ap-text-1)' },
    tool:      { Icon: Wrench, label: 'Ferramenta', color: 'var(--ap-text-3)' },
    system:    { Icon: Bot, label: 'Sistema', color: 'var(--ap-text-4)' },
  }[role] || { Icon: Bot, label: role, color: 'var(--ap-text-2)' };
  const toolCalls = message.tool_calls || message.toolCalls || [];
  let content = message.content;
  if (content && typeof content !== 'string') content = JSON.stringify(content, null, 2);

  return (
    <div className="rounded-lg p-2.5" style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface-2)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <meta.Icon size={13} style={{ color: 'var(--ap-text-4)' }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ap-text-5)' }}>{meta.label}</span>
      </div>
      {content && (
        <p className="text-xs whitespace-pre-wrap break-words" style={{ color: meta.color }}>{content}</p>
      )}
      {toolCalls.map((tc, i) => (
        <p key={i} className="text-[11px] font-mono mt-1" style={{ color: 'var(--ap-text-4)' }}>
          → {tc.name || tc.function?.name}({JSON.stringify(tc.arguments || tc.function?.arguments || {})})
        </p>
      ))}
    </div>
  );
}
