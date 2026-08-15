import React, { useEffect, useState } from 'react';
import { Screen, PageHeader, Card, Tabs, FormGrid, Field, Input, TextArea, Select, NumericInput, Button, Banner, CopyButton, useToast, Spinner } from '@studio-ux-ds/react';
import { listConnections } from '../../services/integrations';
import { listTools } from '../../services/ai';
import { runExecute, runSql, runHttp, runAi, runTool } from '../../services/devtools';

// Desenvolvedor/Console — bancada para bater na integração e na IA sem sair do
// painel. Migrada pro DS na v0.10.13.
//
// As cinco abas são o mesmo desenho: formulário à esquerda, resposta à direita.
// Não virou rota por aba de propósito — a aba aqui não é um registro, é o canal
// que se está testando, e o estado de cada uma é rascunho da sessão.
//
// O `id` de cada aba é obrigatório: sem ele o `Tabs` do DS nunca marca a ativa e
// o conteúdo desaparece ao clicar (foi o que aconteceu na v0.10.11, ver DS
// v1.2.33). O legado usava a prop `active` do `Tabs` LOCAL, que é outra coisa.

const PAGE_TABS = [
  { id: 'execute', label: 'Operação', icon: 'play' },
  { id: 'sql',     label: 'SQL',      icon: 'dashboard' },
  { id: 'http',    label: 'HTTP',     icon: 'external-link' },
  { id: 'ai',      label: 'IA',       icon: 'zap' },
  { id: 'tool',    label: 'Ferramenta', icon: 'settings' },
];

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen as="div" className="space-y-6">
      <PageHeader
        title="Bancada de testes"
        subtitle="Chame uma operação, uma consulta ou a IA direto daqui para ver o que volta. Toda execução fica registrada; nada de negócio é criado."
      />
      <Tabs items={PAGE_TABS} value={tab} onChange={setTab} />
      {tab === 'execute' && <AbaOperacao connections={connections} />}
      {tab === 'sql'     && <AbaSql connections={connections} />}
      {tab === 'http'    && <AbaHttp connections={connections} />}
      {tab === 'ai'      && <AbaIa connections={connections} />}
      {tab === 'tool'    && <AbaFerramenta connections={connections} tools={tools} />}
    </Screen>
  );
}

// ─── Peças compartilhadas ────────────────────────────────────

function Resposta({ loading, result, error }) {
  const texto = result === undefined ? '' : (typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>O que voltou</p>
        {texto && <CopyButton value={texto} label="Copiar" />}
      </div>
      <div
        style={{
          border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12,
          minHeight: 180, maxHeight: 440, overflow: 'auto',
        }}
      >
        {loading ? (
          <div className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--su-text-muted)' }}>
            <Spinner size="sm" /> Executando…
          </div>
        ) : error ? (
          <pre style={{
            fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, margin: 0,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--su-danger-fg)',
          }}>
            {error}
          </pre>
        ) : result !== undefined ? (
          <pre style={{
            fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, margin: 0,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--su-text-secondary)',
          }}>
            {texto}
          </pre>
        ) : (
          <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }}>Execute para ver o resultado.</p>
        )}
      </div>
    </div>
  );
}

function CampoConexao({ value, onChange, connections, required, hint }) {
  return (
    <Field label="Conexão" required={required} hint={hint}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione…</option>
        {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
    </Field>
  );
}

// Casca comum das cinco abas: formulário à esquerda, resposta à direita.
function Bancada({ children, loading, result, error }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card><div style={{ padding: 20 }} className="space-y-4">{children}</div></Card>
      <Card><div style={{ padding: 20 }}><Resposta loading={loading} result={result} error={error} /></div></Card>
    </div>
  );
}

// Estado de execução de uma aba. O erro aparece nos DOIS lugares de propósito: o
// toast avisa que acabou, e o painel guarda o texto inteiro para ser lido e copiado.
function useRun() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(undefined);
  const [error, setError] = useState('');
  async function run(fn) {
    setLoading(true); setError(''); setResult(undefined);
    try {
      setResult(await fn());
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }
  return { loading, result, error, run };
}

// ─── Operação do conector ────────────────────────────────────

function AbaOperacao({ connections }) {
  const toast = useToast();
  const { loading, result, error, run } = useRun();
  const [form, setForm] = useState({ connection_id: '', operation: '', params: '' });
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  function enviar() {
    if (!form.connection_id) { toast.error('Escolha a conexão.'); return; }
    if (!form.operation.trim()) { toast.error('Informe a operação.'); return; }
    let params;
    if (form.params.trim()) {
      try { params = JSON.parse(form.params); } catch { toast.error('Os parâmetros não são um JSON válido.'); return; }
    }
    run(() => runExecute({ connection_id: form.connection_id, operation: form.operation.trim(), params }));
  }

  return (
    <Bancada loading={loading} result={result} error={error}>
      <CampoConexao connections={connections} value={form.connection_id} onChange={(v) => patch({ connection_id: v })} required />
      <Field label="Operação" required hint='O nome que o conector expõe. Ex.: "cliente.dados".'>
        <Input
          value={form.operation}
          onChange={(e) => patch({ operation: e.target.value })}
          placeholder="cliente.dados"
          style={{ fontFamily: 'var(--su-font-mono, monospace)' }}
        />
      </Field>
      <Field label="Parâmetros" hint="Em JSON. Vazio manda a operação sem argumento.">
        <TextArea
          rows={6}
          style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
          value={form.params}
          onChange={(e) => patch({ params: e.target.value })}
          placeholder='{ "login": "teste" }'
        />
      </Field>
      <Button variant="primary" icon="play" loading={loading} onClick={enviar}>Executar</Button>
    </Bancada>
  );
}

// ─── SQL ─────────────────────────────────────────────────────

function AbaSql({ connections }) {
  const toast = useToast();
  const { loading, result, error, run } = useRun();
  const [form, setForm] = useState({ connection_id: '', sql: '' });
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  function enviar() {
    if (!form.connection_id) { toast.error('Escolha a conexão.'); return; }
    if (!form.sql.trim()) { toast.error('Escreva a consulta.'); return; }
    run(() => runSql({ connection_id: form.connection_id, sql: form.sql }));
  }

  return (
    <Bancada loading={loading} result={result} error={error}>
      <Banner tone="warning">
        Somente consulta. Comando que grava, altera ou apaga é recusado pelo servidor — não dá para estragar dado daqui.
      </Banner>
      <CampoConexao
        connections={connections}
        value={form.connection_id}
        onChange={(v) => patch({ connection_id: v })}
        required
        hint="Precisa ser uma conexão de banco de dados."
      />
      <Field label="Consulta" required>
        <TextArea
          rows={7}
          style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
          value={form.sql}
          onChange={(e) => patch({ sql: e.target.value })}
          placeholder="SELECT * FROM clientes LIMIT 10"
        />
      </Field>
      <Button variant="primary" icon="play" loading={loading} onClick={enviar}>Consultar</Button>
    </Bancada>
  );
}

// ─── HTTP ────────────────────────────────────────────────────

const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function AbaHttp({ connections }) {
  const toast = useToast();
  const { loading, result, error, run } = useRun();
  const [form, setForm] = useState({ method: 'GET', url: '', connection_id: '', headers: '', body: '' });
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  function enviar() {
    if (!form.url.trim()) { toast.error('Informe o endereço.'); return; }
    let headers;
    if (form.headers.trim()) {
      try {
        const obj = JSON.parse(form.headers);
        headers = Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
      } catch {
        toast.error('Os cabeçalhos não são um JSON válido. Use { "Authorization": "Bearer …" }.');
        return;
      }
    }
    let body;
    if (form.body.trim()) {
      // Texto que não é JSON vai como texto — é útil testar endpoint que espera
      // form-urlencoded ou XML, e recusar aqui só atrapalharia.
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
    <Bancada loading={loading} result={result} error={error}>
      <div className="grid grid-cols-[120px_1fr] gap-2 items-end">
        <Field label="Método">
          <Select value={form.method} onChange={(e) => patch({ method: e.target.value })}>
            {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Endereço" required>
          <Input value={form.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://api.exemplo.com/v1/recurso" />
        </Field>
      </div>
      <CampoConexao
        connections={connections}
        value={form.connection_id}
        onChange={(v) => patch({ connection_id: v })}
        hint="Opcional — escolha uma conexão para reaproveitar a autenticação dela."
      />
      <Field label="Cabeçalhos" hint='Opcional, em JSON. Ex.: { "Authorization": "Bearer …" }'>
        <TextArea
          rows={3}
          style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
          value={form.headers}
          onChange={(e) => patch({ headers: e.target.value })}
        />
      </Field>
      <Field label="Corpo" hint="Opcional. Aceita JSON ou texto puro.">
        <TextArea
          rows={4}
          style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
          value={form.body}
          onChange={(e) => patch({ body: e.target.value })}
        />
      </Field>
      <Button variant="primary" icon="send" loading={loading} onClick={enviar}>Enviar</Button>
    </Bancada>
  );
}

// ─── IA ──────────────────────────────────────────────────────

function AbaIa({ connections }) {
  const toast = useToast();
  const { loading, result, error, run } = useRun();
  const [form, setForm] = useState({ connection_id: '', model: '', prompt: '', system: '', temperature: null, max_tokens: null });
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  function enviar() {
    if (!form.connection_id) { toast.error('Escolha a conexão de IA.'); return; }
    if (!form.model.trim()) { toast.error('Informe o modelo.'); return; }
    if (!form.prompt.trim()) { toast.error('Escreva o que pedir à IA.'); return; }
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
    <Bancada loading={loading} result={result} error={error}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CampoConexao
          connections={connections}
          value={form.connection_id}
          onChange={(v) => patch({ connection_id: v })}
          required
          hint="Uma conexão de provedor de IA."
        />
        <Field label="Modelo" required>
          <Input value={form.model} onChange={(e) => patch({ model: e.target.value })} placeholder="gpt-4o-mini" />
        </Field>
      </div>
      <Field label="Instrução de fundo" hint="Opcional — o papel que a IA deve assumir antes de responder.">
        <TextArea rows={2} value={form.system} onChange={(e) => patch({ system: e.target.value })} placeholder="Você é um assistente…" />
      </Field>
      <Field label="Pedido" required>
        <TextArea rows={5} value={form.prompt} onChange={(e) => patch({ prompt: e.target.value })} />
      </Field>
      <FormGrid columns={2}>
        <Field label="Criatividade" hint="0 a 2. Vazio usa o padrão do modelo.">
          <NumericInput fullWidth value={form.temperature} onChange={(v) => patch({ temperature: v })} min={0} max={2} step={0.1} allowEmpty placeholder="0,7" />
        </Field>
        <Field label="Tamanho máximo da resposta" hint="Em tokens. Vazio usa o padrão.">
          <NumericInput fullWidth value={form.max_tokens} onChange={(v) => patch({ max_tokens: v })} min={1} max={8000} step={1} allowEmpty placeholder="1000" />
        </Field>
      </FormGrid>
      <Button variant="primary" icon="zap" loading={loading} onClick={enviar}>Perguntar à IA</Button>
    </Bancada>
  );
}

// ─── Ferramenta ──────────────────────────────────────────────

function AbaFerramenta({ connections, tools }) {
  const toast = useToast();
  const { loading, result, error, run } = useRun();
  const [form, setForm] = useState({ tool_key: '', input: '{\n  \n}', connection_id: '' });
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  function enviar() {
    if (!form.tool_key.trim()) { toast.error('Escolha a ferramenta.'); return; }
    let input;
    try { input = JSON.parse(form.input); } catch { toast.error('A entrada não é um JSON válido.'); return; }
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      toast.error('A entrada tem que ser um objeto JSON — { } com os campos dentro.');
      return;
    }
    run(() => runTool({ tool_key: form.tool_key.trim(), input, connection_id: form.connection_id || undefined }));
  }

  return (
    <Bancada loading={loading} result={result} error={error}>
      <Field label="Ferramenta" required hint={tools.length ? undefined : 'Nenhuma ferramenta cadastrada — escreva a chave dela à mão.'}>
        {tools.length ? (
          <Select value={form.tool_key} onChange={(e) => patch({ tool_key: e.target.value })}>
            <option value="">Selecione…</option>
            {tools.map((t) => <option key={t.id || t.key} value={t.key}>{t.name}</option>)}
          </Select>
        ) : (
          <Input value={form.tool_key} onChange={(e) => patch({ tool_key: e.target.value })} placeholder="consultar_estoque" />
        )}
      </Field>
      <CampoConexao
        connections={connections}
        value={form.connection_id}
        onChange={(v) => patch({ connection_id: v })}
        hint="Opcional — algumas ferramentas trabalham sobre uma conexão específica."
      />
      <Field label="Entrada" required hint="Em JSON, no formato que a ferramenta declara.">
        <TextArea
          rows={6}
          style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
          value={form.input}
          onChange={(e) => patch({ input: e.target.value })}
        />
      </Field>
      <Button variant="primary" icon="play" loading={loading} onClick={enviar}>Rodar a ferramenta</Button>
    </Bancada>
  );
}
