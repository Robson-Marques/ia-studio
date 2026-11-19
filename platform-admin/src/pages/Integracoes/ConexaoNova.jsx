import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Screen, WizardScreen, PageHeader, Card, Field, Input, Select, Button, Badge, EmptyState, useToast, Spinner } from '@studio-ux-ds/react';
import { listConnectionProviders, listConnections, createConnection, archiveCodexConnection } from '../../services/integrations';
import { ConnectionField, WebhookUrlBox } from './ConnectionFields';
import { statusMeta } from './integration.constants';
import GoogleOAuthButton from './GoogleOAuthButton';
import CodexCliLogin from './CodexCliLogin';

// Integrações/ConexaoNova — o passo a passo de criar uma conexão (v0.10.11).
//
// Rota `/integracoes/conexoes/nova`. O escolhedor de provider é o primeiro
// passo do wizard, sem uma etapa separada de instalação.
//
// Por que rota:
//  · É formulário de vários passos **com credenciais**. Perder o preenchido por
//    um clique fora é inaceitável — o legado sabia disso e desligava o fechar
//    por clique/Esc, que já é o modal admitindo que não devia ser modal.
//  · O passo a passo tem endereço. Dá para mandar link, dá para o F5 não
//    significar recomeçar do zero por engano, e o "voltar" do navegador não
//    fecha a coisa toda.
//
// O escolhedor de conector virou **o primeiro passo**, não um modal antes: era a
// mesma decisão, partida em duas telas, com dois "Cancelar" diferentes.
//
// Passos = [Conector] + os do `wizard_schema` do provider + [Conferir e salvar].
// Nenhum código por tipo de conector: o schema descreve, isto conduz.

export default function ConexaoNova() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const [providers, setProviders] = useState([]);
  const [carregandoProviders, setCarregandoProviders] = useState(true);
  const [providerKey, setProviderKey] = useState(searchParams.get('provider') || '');
  const [nome, setNome] = useState('');
  const [valores, setValores] = useState({});
  const [passo, setPasso] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [codexExistentes, setCodexExistentes] = useState([]);
  const [removendo, setRemovendo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { items } = await listConnectionProviders();
        setProviders(items || []);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setCarregandoProviders(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (providerKey !== 'codex-cli') return;
    listConnections().then(({ items }) => {
      setCodexExistentes((items || []).filter((c) => c.provider_key === 'codex-cli'));
    }).catch((err) => toast.error(err.message));
  }, [providerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const provider = useMemo(() => providers.find((p) => p.key === providerKey) || null, [providers, providerKey]);
  const schema = provider?.wizard_schema || { steps: [] };
  const passosSchema = schema.steps || [];

  // Ao escolher o conector: sugere o nome e aplica os valores padrão do schema.
  useEffect(() => {
    if (!provider) return;
    setNome((atual) => atual || provider.name);
    const padroes = {};
    (provider.wizard_schema?.steps || []).forEach((s) =>
      (s.fields || []).forEach((f) => { if (f.default !== undefined) padroes[f.key] = String(f.default); }),
    );
    setValores((prev) => ({ ...padroes, ...prev }));
  }, [provider]);

  const etapas = [
    { label: 'Conector' },
    ...passosSchema.map((s, i) => ({ label: s.title || `Passo ${i + 1}` })),
    { label: 'Conferir e salvar' },
  ];
  const ultimo = etapas.length - 1;
  const noFinal = passo === ultimo;
  const passoAtual = passo > 0 && passo <= passosSchema.length ? passosSchema[passo - 1] : null;

  function avancar() {
    if (passo === 0) {
      if (!provider) { toast.error('Escolha o conector.'); return; }
      if (!nome.trim()) { toast.error('Dê um nome para a conexão.'); return; }
    }
    if (passoAtual) {
      for (const f of passoAtual.fields || []) {
        if (f.required && !String(valores[f.key] ?? '').trim()) {
          toast.error(`Preencha “${f.label}”.`);
          return;
        }
      }
    }
    setPasso((i) => Math.min(i + 1, ultimo));
  }

  async function salvar() {
    setSalvando(true);
    try {
      const config = {};
      const secrets = {};
      passosSchema.forEach((s) =>
        (s.fields || []).forEach((f) => {
          const v = valores[f.key];
          if (v === undefined || v === '') return;
          if (f.secret) secrets[f.key] = String(v);
          else config[f.key] = f.type === 'number' ? Number(v) : v;
        }),
      );
      const criada = await createConnection({
        provider_key: provider.key,
        name: nome.trim(),
        config,
        secrets,
      });
      setResultado(criada);
      if (criada.status === 'ACTIVE') toast.success('Conexão criada e testada.');
      else if (criada.status === 'ERROR') toast.warn('Conexão criada, mas o teste não passou — veja o motivo abaixo.');
      else toast.info('Conexão criada — falta autorizar.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  }

  // --- Resultado: a conexão já existe, o passo a passo acabou ---
  if (resultado) {
    const meta = statusMeta(resultado.status);
    const precisaGoogle = resultado.provider_key === 'google-workspace' && resultado.status !== 'ACTIVE';
    return (
      <Screen as="div" className="space-y-6">
        <PageHeader title={resultado.name} subtitle="Conexão criada" />
        <Card>
          <div style={{ padding: 20 }} className="space-y-3">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {resultado.status_detail && (
              <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>{resultado.status_detail}</p>
            )}
            {resultado.provider_key === 'codex-cli' && (
              <CodexCliLogin
                connectionId={resultado.id}
                onActivated={() => navigate(`/integracoes/conexoes/${resultado.id}`)}
              />
            )}
            {precisaGoogle && (
              <div className="space-y-1.5">
                <GoogleOAuthButton
                  connectionId={resultado.id}
                  onActivated={(conn) => setResultado(conn)}
                />
                <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }}>
                  Autorize o acesso à conta. Os tokens vão para o cofre — não ficam nesta tela.
                </p>
              </div>
            )}
            <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }}>
              Você pode testar de novo quando quiser, na própria conexão.
            </p>
            <div className="flex gap-2 flex-wrap pt-1">
              <Button variant="primary" onClick={() => navigate(`/integracoes/conexoes/${resultado.id}`)}>
                Abrir a conexão
              </Button>
              {resultado.provider_key === 'codex-cli' && (
                <Button variant="secondary" disabled={removendo} onClick={async () => {
                  if (!window.confirm('Remover esta conexão da lista? O histórico será preservado.')) return;
                  setRemovendo(true);
                  try {
                    await archiveCodexConnection(resultado.id);
                    toast.success('Conexão removida da lista.');
                    navigate('/integracoes/conexoes');
                  } catch (err) { toast.error(err.message); }
                  finally { setRemovendo(false); }
                }}>
                  Desfazer cadastro
                </Button>
              )}
              <Button variant="secondary" onClick={() => navigate('/integracoes/conexoes')}>
                Ver todas
              </Button>
            </div>
          </div>
        </Card>
      </Screen>
    );
  }

  // O Codex não usa campos de credenciais e não deve ter etapas vazias.
  // Uma única tela: selecionar/reutilizar conexão, criar se necessário e
  // passar direto à autenticação oficial exibida no resultado.
  if (providerKey === 'codex-cli' && passo === 0 && !resultado) {
    return (
      <Screen as="div" className="space-y-6">
        <PageHeader title="Conectar conta ChatGPT" subtitle="Codex CLI — autenticação oficial sem chave de API"
          back={{ label: 'Voltar às conexões', onClick: () => navigate('/integracoes/conexoes') }} />
        <Card>
          <div style={{ padding: 20 }} className="space-y-4">
            <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>
              Crie uma conexão ou abra uma existente para continuar o login. Não é necessário repetir o cadastro.
            </p>
            {codexExistentes.length > 0 && (
              <div className="space-y-2">
                <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Conexões ChatGPT existentes</h2>
                {codexExistentes.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2"
                    style={{ padding: 12, border: '1px solid var(--su-border-default)', borderRadius: 8 }}>
                    <div className="space-y-1">
                      <strong style={{ fontSize: 13 }}>{c.name}</strong>
                      <div><Badge tone={statusMeta(c.status).tone}>{statusMeta(c.status).label}</Badge></div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/integracoes/conexoes/${c.id}`)}>
                      Abrir / reconectar
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Field label="Nome da nova conexão" required hint="Crie uma nova conta somente se precisar de uma conexão separada.">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off"
                placeholder="Ex.: Minha conta ChatGPT" />
            </Field>
            <div className="flex gap-2 flex-wrap">
              <Button variant="primary" loading={salvando} disabled={!nome.trim() || salvando} onClick={salvar}>
                Criar e conectar
              </Button>
              <Button variant="secondary" onClick={() => navigate('/integracoes/conexoes')}>Cancelar</Button>
            </div>
          </div>
        </Card>
      </Screen>
    );
  }

  // --- Sem provider disponível: o passo a passo não tem como começar ---
  if (!carregandoProviders && !providers.length) {
    return (
      <Screen as="div" className="space-y-6">
        <PageHeader title="Nova conexão" />
        <Card>
          <EmptyState
            icon="plug"
            title="Nenhum conector disponível"
            description="Nenhum conector ativo está pronto para ser configurado nesta instalação."
          />
        </Card>
      </Screen>
    );
  }

  return (
    <WizardScreen
      title="Nova conexão"
      subtitle={provider ? provider.name : 'Escolha o conector e informe o que ele precisa para entrar.'}
      back={{ label: 'Cancelar', onClick: () => navigate('/integracoes/conexoes') }}
      steps={etapas}
      current={passo + 1}
      onBack={() => setPasso((i) => Math.max(0, i - 1))}
      onNext={noFinal ? salvar : avancar}
      nextLabel={noFinal ? 'Criar e testar' : 'Avançar'}
      working={salvando}
    >
        <div style={{ padding: 20, maxWidth: 720 }} className="space-y-4">
          {carregandoProviders ? (
            <div className="flex justify-center py-10">
              <Spinner size="lg" />
            </div>
          ) : passo === 0 ? (
            <>
              <Field label="Conector" required hint="Escolha qual sistema esta conexão vai configurar.">
                <Select value={providerKey} onChange={(e) => setProviderKey(e.target.value)} autoFocus>
                  <option value="">Selecione…</option>
                  {providers.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                </Select>
              </Field>
              {provider?.description && (
                <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }}>{provider.description}</p>
              )}
              <Field label="Nome da conexão" required hint="Um nome seu, para reconhecer depois. Ex.: Financeiro, Comercial.">
                <Input value={nome} onChange={(e) => setNome(e.target.value)} name="nova-conn-nome" autoComplete="off" />
              </Field>
            </>
          ) : passoAtual ? (
            <>
              {passoAtual.description && (
                <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>{passoAtual.description}</p>
              )}
              {(passoAtual.fields || []).map((field) => (
                <ConnectionField
                  key={field.key}
                  field={field}
                  value={valores[field.key]}
                  onChange={(v) => setValores((prev) => ({ ...prev, [field.key]: v }))}
                  namePrefix={`nova-${provider.key}`}
                />
              ))}
              {schema.webhookPath && (passoAtual.fields || []).some((f) => f.generatable) && (
                <WebhookUrlBox webhookPath={schema.webhookPath} />
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>
                A conexão vai ser criada nesta instalação. As senhas e chaves vão para o
                cofre cifradas, e o teste de acesso roda em seguida — se não passar, a conexão é criada mesmo assim e você
                conserta sem refazer tudo.
              </p>
              <div
                style={{
                  border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12,
                  fontSize: 13, color: 'var(--su-text-secondary)',
                }}
                className="space-y-1"
              >
                <p style={{ margin: 0 }}><strong>Conector:</strong> {provider?.name || '—'}</p>
                <p style={{ margin: 0 }}><strong>Nome:</strong> {nome || '—'}</p>
              </div>
            </>
          )}
        </div>
    </WizardScreen>
  );
}
