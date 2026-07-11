import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, PlugZap, XCircle } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { FormField, TextInput } from '../../components/ui/FormField';
import { ConnectionField, WebhookUrlBox } from './ConnectionFields';
import { createConnection } from '../../services/integrations';
import { useWorkspace } from '../../context/WorkspaceContext';
import { toast } from '../../lib/toast';
import { statusMeta } from './integration.constants';
import GoogleOAuthButton from './GoogleOAuthButton';

// Wizard de conexão dirigido pelo wizard_schema do provider (declarativo —
// nenhum código por tipo de conector). Passos: dados do wizard → passo final
// "Testar e salvar" (o backend cria PENDING_AUTH, testa e devolve o estado).
export default function ConnectionWizard({ open, provider, onClose, onCreated }) {
  const { workspace, environment, workspaceId, environmentId } = useWorkspace();
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // conexão criada (com status/health)

  const schema = provider?.wizard_schema || { steps: [], testable: true };
  const steps = useMemo(() => schema.steps || [], [schema]);
  const totalSteps = steps.length + 1; // + passo "Testar e salvar"
  const isFinalStep = stepIndex === steps.length;

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setName(provider ? `${provider.name}` : '');
    // Defaults declarados no schema.
    const defaults = {};
    (provider?.wizard_schema?.steps || []).forEach((s) =>
      (s.fields || []).forEach((f) => {
        if (f.default !== undefined) defaults[f.key] = String(f.default);
      }),
    );
    setValues(defaults);
    setResult(null);
  }, [open, provider]);

  function setValue(key, value) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(step) {
    for (const field of step.fields || []) {
      if (field.required && !String(values[field.key] ?? '').trim()) {
        toast.error(`Preencha o campo "${field.label}".`);
        return false;
      }
    }
    return true;
  }

  function handleNext() {
    if (stepIndex === 0 && !name.trim()) {
      toast.error('Dê um nome para a conexão.');
      return;
    }
    if (!isFinalStep && !validateStep(steps[stepIndex])) return;
    setStepIndex((i) => Math.min(i + 1, totalSteps - 1));
  }

  async function handleSave() {
    if (!workspaceId || !environmentId) {
      toast.error('Selecione workspace e ambiente no topo do painel.');
      return;
    }
    setSaving(true);
    try {
      const config = {};
      const secrets = {};
      steps.forEach((s) =>
        (s.fields || []).forEach((f) => {
          const v = values[f.key];
          if (v === undefined || v === '') return;
          if (f.secret) secrets[f.key] = String(v);
          else config[f.key] = f.type === 'number' ? Number(v) : v;
        }),
      );
      const created = await createConnection({
        provider_key: provider.key,
        name: name.trim(),
        workspace_id: workspaceId,
        environment_id: environmentId,
        config,
        secrets,
      });
      setResult(created);
      if (created.status === 'ACTIVE') toast.success('Conexão criada e testada com sucesso.');
      else if (created.status === 'ERROR') toast.warn('Conexão criada, mas o teste falhou. Veja o detalhe.');
      else toast.info('Conexão criada — aguardando autenticação.');
      onCreated?.(created);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!provider) return null;

  const currentStep = !isFinalStep ? steps[stepIndex] : null;

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      // Formulario de varios passos: NAO fecha por clique fora/Esc (evita perder
      // os dados preenchidos). Só fecha pelo X ou pelos botoes.
      dismissable={false}
      title={`Conectar — ${provider.name}`}
      size="lg"
      footer={
        result ? (
          <button className="btn-primary" onClick={onClose}>Concluir</button>
        ) : (
          <>
            <button
              className="btn-secondary disabled:opacity-60"
              disabled={saving || stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft size={14} /> Voltar
            </button>
            {isFinalStep ? (
              <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
                Testar e salvar
              </button>
            ) : (
              <button className="btn-primary" onClick={handleNext}>
                Avançar <ChevronRight size={14} />
              </button>
            )}
          </>
        )
      }
    >
      {/* Indicador de passos */}
      <div className="flex items-center gap-1.5 mb-4">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{ backgroundColor: i <= stepIndex ? 'var(--ap-accent, #6366f1)' : 'var(--ap-border)' }}
          />
        ))}
      </div>

      {!isFinalStep && (
        <div className="space-y-3">
          {stepIndex === 0 && (
            <FormField label="Nome da conexão" required hint="Um nome para você identificar esta conexão. Ex.: Financeiro, Comercial.">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </FormField>
          )}
          <p className="text-sm font-semibold" style={{ color: 'var(--ap-text-1)' }}>{currentStep.title}</p>
          {currentStep.description && (
            <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>{currentStep.description}</p>
          )}
          {(currentStep.fields || []).map((field) => (
            <ConnectionField
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(v) => setValue(field.key, v)}
              namePrefix={`wiz-${provider.key}`}
            />
          ))}
          {/* Se o passo tem campo generatable e o provider expõe webhookPath,
              mostra a URL do webhook pra colar na Meta. */}
          {schema.webhookPath && (currentStep.fields || []).some((f) => f.generatable) && (
            <WebhookUrlBox webhookPath={schema.webhookPath} />
          )}
        </div>
      )}

      {isFinalStep && !result && (
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--ap-text-1)' }}>Testar e salvar</p>
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            A conexão será criada em <strong>{workspace?.name || 'workspace'}</strong> /{' '}
            <strong>{environment?.name || environment?.kind || 'ambiente'}</strong>, os campos secretos irão
            para o Cofre de Segredos e o teste de saúde roda em seguida.
          </p>
          <div
            className="rounded-lg px-3 py-2 text-xs space-y-1"
            style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)', color: 'var(--ap-text-3)' }}
          >
            <p><strong>Conector:</strong> {provider.name}</p>
            <p><strong>Nome:</strong> {name || '—'}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {result.status === 'ACTIVE'
              ? <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
              : <XCircle size={20} className="text-amber-500 shrink-0" />}
            <p className="text-sm font-semibold" style={{ color: 'var(--ap-text-1)' }}>
              Estado: {statusMeta(result.status).label}
            </p>
          </div>
          {result.status_detail && (
            <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>{result.status_detail}</p>
          )}
          {/* Google Workspace: passo "Entrar com Google" pós-criação (PENDING_AUTH). */}
          {result.provider_key === 'google-workspace' && result.status !== 'ACTIVE' && (
            <div className="pt-1">
              <GoogleOAuthButton
                connectionId={result.id}
                onActivated={(conn) => { setResult(conn); onCreated?.(conn); }}
              />
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--ap-text-5)' }}>
                Autorize o acesso à conta Gmail. Os tokens ficam no Cofre de Segredos.
              </p>
            </div>
          )}
          <p className="text-xs" style={{ color: 'var(--ap-text-5)' }}>
            Você pode testar novamente a qualquer momento na tela Conexões.
          </p>
        </div>
      )}
    </Modal>
  );
}
