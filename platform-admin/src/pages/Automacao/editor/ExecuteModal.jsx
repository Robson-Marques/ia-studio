import React, { useEffect, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../../components/ui/Modal';
import { FormField, Textarea } from '../../../components/ui/FormField';
import { executeWorkflow } from '../../../services/automation';
import { toast } from '../../../lib/toast';

// Execução manual: input JSON + toggle dry-run (diretriz 27 — nós side-effect
// só simulam). A API enfileira; acompanhar em Execuções.
export default function ExecuteModal({ open, onClose, workflow }) {
  const navigate = useNavigate();
  const [input, setInput] = useState('{}');
  const [dryRun, setDryRun] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => { if (open) { setInput('{}'); setDryRun(true); } }, [open]);

  async function handleRun() {
    let parsed;
    try {
      parsed = input.trim() ? JSON.parse(input) : {};
    } catch {
      toast.error('Input JSON inválido.');
      return;
    }
    setRunning(true);
    try {
      const execution = await executeWorkflow(workflow.id, { input: parsed, dry_run: dryRun });
      toast.success(`Execução ${dryRun ? 'simulada ' : ''}enfileirada.`);
      onClose();
      navigate(`/automacao/execucoes?open=${execution.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={running ? undefined : onClose}
      title={`Executar: ${workflow?.name ?? ''}`}
      size="md"
      dismissable={!running}
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={running}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleRun} disabled={running} title="Enfileira a execução — acompanhe em Execuções">
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Executar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Input (JSON)" hint="Disponível nos passos como {{input.*}}.">
          <Textarea rows={6} className="font-mono text-xs" value={input} onChange={(e) => setInput(e.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ap-text-2)' }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="accent-current w-4 h-4" />
          <span>
            Dry-run (simulação) — passos com efeito externo (WhatsApp, HTTP, eventos) apenas registram no log, sem executar de verdade.
          </span>
        </label>
        {!dryRun && (
          <p className="text-xs rounded-lg p-2" style={{ border: '1px solid var(--ap-border)', color: 'var(--ap-text-3)' }}>
            Atenção: execução REAL — mensagens/chamadas serão disparadas.
          </p>
        )}
      </div>
    </Modal>
  );
}
