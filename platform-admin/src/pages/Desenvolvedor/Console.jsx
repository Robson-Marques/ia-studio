import React, { useEffect, useState } from 'react';
import { Terminal, Loader2, Play, Database, Globe, Sparkles, Wrench, AlertTriangle } from 'lucide-react';
import Tabs from '../../components/ui/Tabs';
import { FormField, TextInput, Textarea, Select, NumberInput } from '../../components/ui/FormField';
import { listConnections } from '../../services/integrations';
import { listTools } from '../../services/ai';
import { useToast } from '@studio-ux-ds/react';
import { runExecute, runSql, runHttp, runAi, runTool } from '../../services/devtools';

const PAGE_TABS = [
  { id: 'execute', label: 'Execute', Icon: Play },
  { id: 'sql',     label: 'SQL',     Icon: Database },
  { id: 'http',    label: 'HTTP',    Icon: Globe },
  { id: 'ai',      label: 'IA',      Icon: Sparkles },
  { id: 'tool',    label: 'Tool',    Icon: Wrench },
];

// Desenvolvedor → Console (Postman interno): abas Execute / SQL / HTTP / IA / Tool.
// Cada aba tem um form + área de resposta JSON + loading. SQL avisa read-only.
export default function Console() {
  const toast = useToast();
  const [tab, setTab] = useState('execute');
  const [connections, setConnections] = useState([]);
  const [tools, setTools] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [{ items: conns }, { items: t }] = await Promise.all([
          listConnections(),
          listTools().catch(() => ({ items: [] })),
        ]);
        setConnections(conns);
        setTools(t);
      } catch (err) {
        toast.error(err.message);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Console do Desenvolvedor</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Depure integrações e IA sem sair do painel. Cada execução é auditada; nada de negócio é persistido aqui.
        </p>
      </div>
      <Tabs items={PAGE_TABS} active={tab} onChange={setTab} />
      {tab === 'execute' && <ExecuteTab connections={connections} />}
      {tab === 'sql'     && <SqlTab connections={connections} />}
      {tab === 'http'    && <HttpTab connections={connections} />}
      {tab === 'ai'      && <AiTab connections={connections} />}
      {tab === 'tool'    && <ToolTab connections={connections} tools={tools} />}
    </div>
  );
}

// ─── Área de resposta reutilizável ───────────────────────────

function ResultArea({ loading, result, error }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--ap-text-2)' }}>Resposta</p>
      <div
        className="rounded-lg px-3 py-2 min-h-[160px] max-h-[420px] overflow-auto"
        style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)' }}
      >
        {loading ? (
          <div className="flex items-center gap-2 text-xs py-4" style={{ color: 'var(--ap-text-4)' }}>
            <Loader2 size={14} className="animate-spin" /> Executando…
          </div>
        ) : error ? (
          <pre className="text-xs whitespace-pre-wrap break-words text-red-500">{error}</pre>
        ) : result !== undefined ? (
          <pre className="text-xs whitespace-pre-wrap break-words" style={{ color: 'var(--ap-text-3)' }}>
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        ) : (
          <p className="text-xs py-4" style={{ color: 'var(--ap-text-5)' }}>Execute para ver o resultado.</p>
        )}
      </div>
    </div>
  );
}

function ConnectionSelect({ value, onChange, connections, filter, required, hint }) {
  const list = filter ? connections.filter(filter) : connections;
  return (
    <FormField label="Conexão" required={required} hint={hint}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione…</option>
        {list.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.provider_key}</option>)}
      </Select>
    </FormField>
  );
}

function RunButton({ loading, onClick, label = 'Executar' }) {
  return (
    <button className="btn-primary disabled:opacity-60" disabled={loading} onClick={onClick}>
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} {label}
    </button>
  );
}

// Hook local minimalista para o estado de execução de cada aba.
function useRun() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(undefined);
  const [error, setError] = useState('');
  async function run(fn) {
    setLoading(true); setError(''); setResult(undefined);
    try {
      const data = await fn();
      setResult(data);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }
  return { loading, result, error, run };
}

// ─── Execute ─────────────────────────────────────────────────

function ExecuteTab({ connections }) {
  const toast = useToast();
  const { loading, result, error, run } = useRun();
  const [form, setForm] = useState({ connection_id: '', operation: '', params: '' });
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  function submit() {
    if (!form.connection_id) { toast.error('Selecione a conexão.'); return; }
    if (!form.operation.trim()) { toast.error('Informe a operação.'); return; }
    let params;
    if (form.params.trim()) {
      try { params = JSON.parse(form.params); } catch { toast.error('Params: JSON inválido.'); return; }
    }
    run(() => runExecute({ connection_id: form.connection_id, operation: form.operation.trim(), params }));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card p-4 space-y-3">
        <ConnectionSelect connections={connections} value={form.connection_id} onChange={(v) => patch({ connection_id: v })} required />
        <FormField label="Operação" required hint="Operação do IProvider.execute (ex.: cliente.dados).">
          <TextInput value={form.operation} onChange={(e) => patch({ operation: e.target.value })} placeholder="cliente.dados" />
        </FormField>
        <FormField label="Params (JSON)">
          <Textarea rows={6} className="font-mono text-xs" value={form.params} onChange={(e) => patch({ params: e.target.value })} placeholder='{ "login": "teste" }' />
        </FormField>
        <RunButton loading={loading} onClick={submit} />
      </div>
      <div className="card p-4"><ResultArea loading={loading} result={result} error={error} /></div>
    </div>
  );
}

// ─── SQL ─────────────────────────────────────────────────────

function SqlTab({ connections }) {
  const toast = useToast();
  const { loading, result, error, run } = useRun();
  const [form, setForm] = useState({ connection_id: '', sql: '' });
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  function submit() {
    if (!form.connection_id) { toast.error('Selecione a conexão.'); return; }
    if (!form.sql.trim()) { toast.error('Informe o SQL.'); return; }
    run(() => runSql({ connection_id: form.connection_id, sql: form.sql }));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card p-4 space-y-3">
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]"
          style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)', color: 'var(--ap-text-3)' }}
        >
          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <span>Somente leitura por padrão. Consultas de escrita são bloqueadas pelo backend.</span>
        </div>
        <ConnectionSelect connections={connections} value={form.connection_id} onChange={(v) => patch({ connection_id: v })} required hint="Conexão do tipo banco de dados." />
        <FormField label="SQL" required>
          <Textarea rows={7} className="font-mono text-xs" value={form.sql} onChange={(e) => patch({ sql: e.target.value })} placeholder="SELECT * FROM clientes LIMIT 10" />
        </FormField>
        <RunButton loading={loading} onClick={submit} label="Executar consulta" />
      </div>
      <div className="card p-4"><ResultArea loading={loading} result={result} error={error} /></div>
    </div>
  );
}

// ─── HTTP ────────────────────────────────────────────────────

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function HttpTab({ connections }) {
  const toast = useToast();
  const { loading, result, error, run } = useRun();
  const [form, setForm] = useState({ method: 'GET', url: '', connection_id: '', headers: '', body: '' });
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  function submit() {
    if (!form.url.trim()) { toast.error('Informe a URL.'); return; }
    // headers no formato { chave: valor } → [{ key, value }] esperado pelo backend.
    let headers;
    if (form.headers.trim()) {
      try {
        const obj = JSON.parse(form.headers);
        headers = Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
      } catch { toast.error('Headers: JSON inválido (use { "Authorization": "Bearer ..." }).'); return; }
    }
    let body;
    if (form.body.trim()) {
      try { body = JSON.parse(form.body); } catch { body = form.body; }
    }
    run(() => runHttp({
      method: form.method,
      url: form.url.trim(),
      headers,
      body,
      connection_id: form.connection_id || undefined,
    }));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-[110px_1fr] gap-2 items-end">
          <FormField label="Método">
            <Select value={form.method} onChange={(e) => patch({ method: e.target.value })}>
              {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </FormField>
          <FormField label="URL" required>
            <TextInput value={form.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://api.exemplo.com/v1/recurso" />
          </FormField>
        </div>
        <ConnectionSelect connections={connections} value={form.connection_id} onChange={(v) => patch({ connection_id: v })} hint="Opcional — usa a autenticação da conexão." />
        <FormField label="Headers (JSON — opcional)">
          <Textarea rows={3} className="font-mono text-xs" value={form.headers} onChange={(e) => patch({ headers: e.target.value })} placeholder='{ "Authorization": "Bearer ..." }' />
        </FormField>
        <FormField label="Body (JSON ou texto — opcional)">
          <Textarea rows={4} className="font-mono text-xs" value={form.body} onChange={(e) => patch({ body: e.target.value })} />
        </FormField>
        <RunButton loading={loading} onClick={submit} label="Enviar requisição" />
      </div>
      <div className="card p-4"><ResultArea loading={loading} result={result} error={error} /></div>
    </div>
  );
}

// ─── IA ──────────────────────────────────────────────────────

function AiTab({ connections }) {
  const toast = useToast();
  const { loading, result, error, run } = useRun();
  const [form, setForm] = useState({ connection_id: '', model: '', prompt: '', system: '', temperature: null, max_tokens: null });
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  function submit() {
    if (!form.connection_id) { toast.error('Selecione a conexão de IA.'); return; }
    if (!form.model.trim()) { toast.error('Informe o modelo.'); return; }
    if (!form.prompt.trim()) { toast.error('Informe o prompt.'); return; }
    run(() => runAi({
      connection_id: form.connection_id,
      model: form.model.trim(),
      prompt: form.prompt,
      system: form.system.trim() || undefined,
      temperature: form.temperature ?? undefined,
      max_tokens: form.max_tokens ?? undefined,
    }));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ConnectionSelect connections={connections} value={form.connection_id} onChange={(v) => patch({ connection_id: v })} required hint="Conexão de provedor de IA." />
          <FormField label="Modelo" required>
            <TextInput value={form.model} onChange={(e) => patch({ model: e.target.value })} placeholder="gpt-4o-mini" />
          </FormField>
        </div>
        <FormField label="System (opcional)">
          <Textarea rows={2} value={form.system} onChange={(e) => patch({ system: e.target.value })} placeholder="Você é um assistente…" />
        </FormField>
        <FormField label="Prompt" required>
          <Textarea rows={5} value={form.prompt} onChange={(e) => patch({ prompt: e.target.value })} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Temperature (0–2)">
            <NumberInput value={form.temperature} onChange={(v) => patch({ temperature: v })} min={0} max={2} step="0.1" allowEmpty placeholder="ex.: 0.7" />
          </FormField>
          <FormField label="Max tokens">
            <NumberInput value={form.max_tokens} onChange={(v) => patch({ max_tokens: v })} min={1} max={8000} step={1} allowEmpty placeholder="ex.: 1000" />
          </FormField>
        </div>
        <RunButton loading={loading} onClick={submit} label="Chamar IA" />
      </div>
      <div className="card p-4"><ResultArea loading={loading} result={result} error={error} /></div>
    </div>
  );
}

// ─── Tool ────────────────────────────────────────────────────

function ToolTab({ connections, tools }) {
  const toast = useToast();
  const { loading, result, error, run } = useRun();
  const [form, setForm] = useState({ tool_key: '', input: '{\n  \n}', connection_id: '' });
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  function submit() {
    if (!form.tool_key.trim()) { toast.error('Informe a tool_key.'); return; }
    let input;
    try { input = JSON.parse(form.input); } catch { toast.error('Input: JSON inválido.'); return; }
    if (typeof input !== 'object' || input === null || Array.isArray(input)) { toast.error('Input deve ser um objeto JSON.'); return; }
    run(() => runTool({ tool_key: form.tool_key.trim(), input, connection_id: form.connection_id || undefined }));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card p-4 space-y-3">
        <FormField label="Ferramenta (tool_key)" required>
          {tools.length ? (
            <Select value={form.tool_key} onChange={(e) => patch({ tool_key: e.target.value })}>
              <option value="">Selecione…</option>
              {tools.map((t) => <option key={t.id || t.key} value={t.key}>{t.name} ({t.key})</option>)}
            </Select>
          ) : (
            <TextInput value={form.tool_key} onChange={(e) => patch({ tool_key: e.target.value })} placeholder="consultar_estoque" />
          )}
        </FormField>
        <ConnectionSelect connections={connections} value={form.connection_id} onChange={(v) => patch({ connection_id: v })} hint="Opcional — algumas tools operam sobre uma conexão." />
        <FormField label="Input (JSON)" required>
          <Textarea rows={6} className="font-mono text-xs" value={form.input} onChange={(e) => patch({ input: e.target.value })} />
        </FormField>
        <RunButton loading={loading} onClick={submit} label="Rodar ferramenta" />
      </div>
      <div className="card p-4"><ResultArea loading={loading} result={result} error={error} /></div>
    </div>
  );
}
