import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer, Field, TextArea, Checkbox, Button, useToast } from '@studio-ux-ds/react';
import { executeWorkflow } from '../../../services/automation';

// Automação/editor/ExecuteDrawer — rodar o fluxo agora, à mão (v0.10.2).
//
// Era `ExecuteModal`. Tem TextArea (a entrada em JSON), então sai do Modal; e
// **age sobre o fluxo em foco** em vez de criar um registro, então vai pro
// inspetor lateral e não pra rota (regra dos três containers, DS v1.2.24).
//
// A simulação nasce LIGADA de propósito: a diretriz de automatismos manda o
// comportamento com efeito real ser escolha explícita, nunca o default.

export default function ExecuteDrawer({ open, onClose, workflow }) {
  const toast = useToast();
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
      toast.error('Os dados de entrada não estão num JSON válido.');
      return;
    }
    setRunning(true);
    try {
      const execution = await executeWorkflow(workflow.id, { input: parsed, dry_run: dryRun });
      toast.success(dryRun ? 'Simulação na fila.' : 'Execução na fila.');
      onClose();
      navigate(`/automacao/execucoes/${execution.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={running ? undefined : onClose}
      title={`Rodar agora: ${workflow?.name ?? ''}`}
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={running}>Cancelar</Button>
          <Button
            variant={dryRun ? 'primary' : 'danger'}
            icon="play"
            loading={running}
            title="Entra na fila — a tela da execução abre em seguida"
            onClick={handleRun}
          >
            {dryRun ? 'Simular' : 'Rodar de verdade'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Dados de entrada"
          hint="Em JSON. Os passos leem isso como {{input.…}}. Deixe {} se o fluxo não precisa de entrada."
        >
          <TextArea
            rows={10}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
          />
        </Field>

        <Checkbox
          variant="card"
          label="Só simular"
          meta="Os passos que enviam algo (WhatsApp, chamada externa, aviso) apenas registram no histórico, sem sair de verdade."
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
        />

        {!dryRun && (
          <p
            style={{
              fontSize: 13, margin: 0, padding: 12, borderRadius: 8,
              border: '1px solid var(--su-danger)', color: 'var(--su-danger-fg)',
              background: 'var(--su-danger-bg)',
            }}
          >
            Execução real: as mensagens vão ser enviadas e as chamadas externas vão acontecer de verdade.
          </p>
        )}
      </div>
    </Drawer>
  );
}
