import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DetailScreen, Card, Badge, Button, CopyButton, DescriptionList, Timeline, EmptyState, Spinner, useToast } from '@studio-ux-ds/react';
import {
  getConnection, listConnectionLogs, discoverConnection, testConnection,
} from '../../services/integrations';
import {
  getBaileysPairingQr, reconnectBaileys, restartBaileysPairing,
} from '../../services/whatsappBaileys';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';
import { statusMeta, RESOURCE_KIND_LABELS, prettifyProviderKey } from './integration.constants';
import GoogleOAuthButton from './GoogleOAuthButton';

// Integrações/ConexaoDetalhe — uma conexão (v0.10.11).
//
// Rota: /integracoes/conexoes/:id — antes era um Modal `lg` com abas Dados/Logs.
// Virou rota porque a conexão é um registro que existe por si: tem histórico, é
// destino de link de outras telas e agora pode ser aberta direto pela URL.
//
// **"Recursos" virou aba.** No legado, "Descobrir recursos" era um ícone na
// linha da lista que abria OUTRO modal com o resultado. O resultado é justamente
// o que se consulta com calma — os ids de setores, assuntos e números que o
// operador precisa copiar para configurar ferramentas e fluxos — e ele sumia ao
// fechar. Como aba, carrega sob demanda (igual aos logs) e fica onde se procura.
//
// A descoberta **não altera nada** do outro lado: é só leitura. O aviso está na
// tela porque "descobrir" soa como algo que mexe.

export default function ConexaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();

  const podeEscrever = can('integrations.connections.write');
  const podeVerLogs = can('integrations.logs.read');

  const [conexao, setConexao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState('dados');
  const [testando, setTestando] = useState(false);

  const [logs, setLogs] = useState(null);
  const [carregandoLogs, setCarregandoLogs] = useState(false);
  const [recursos, setRecursos] = useState(null);
  const [carregandoRecursos, setCarregandoRecursos] = useState(false);

  // Pareamento (só conexões Baileys). `pareamento` = { status, qr_image }.
  const [pareamento, setPareamento] = useState(null);
  const [carregandoPareamento, setCarregandoPareamento] = useState(false);
  const [acaoPareamento, setAcaoPareamento] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setConexao(await getConnection(id));
    } catch (err) {
      toast.error(err.message);
      navigate('/integracoes/conexoes', { replace: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Logs e recursos carregam quando a aba é aberta — nenhuma das duas é barata,
  // e a maioria das visitas quer só os dados.
  useEffect(() => {
    if (aba !== 'logs' || logs !== null) return;
    let cancelado = false;
    (async () => {
      setCarregandoLogs(true);
      try {
        const { items } = await listConnectionLogs(id);
        if (!cancelado) setLogs(items);
      } catch (err) {
        if (!cancelado) { toast.error(err.message); setLogs([]); }
      } finally {
        if (!cancelado) setCarregandoLogs(false);
      }
    })();
    return () => { cancelado = true; };
  }, [aba, id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function carregarRecursos() {
    setCarregandoRecursos(true);
    try {
      setRecursos(await discoverConnection(id));
    } catch (err) {
      toast.error(err.message);
      setRecursos([]);
    } finally {
      setCarregandoRecursos(false);
    }
  }

  useEffect(() => {
    if (aba !== 'recursos' || recursos !== null || carregandoRecursos) return;
    carregarRecursos();
  }, [aba]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pareamento: enquanto a aba está aberta, consulta o estado do socket a cada
  // ~4s. O QR só existe em `qr_pending` e expira rápido — por isso o intervalo,
  // e não uma consulta única. Para de consultar ao sair da aba.
  async function consultarPareamento({ silencioso = false } = {}) {
    if (!silencioso) setCarregandoPareamento(true);
    try {
      setPareamento(await getBaileysPairingQr(id));
    } catch (err) {
      if (!silencioso) toast.error(err.message);
    } finally {
      if (!silencioso) setCarregandoPareamento(false);
    }
  }

  useEffect(() => {
    if (aba !== 'pareamento') return undefined;
    let vivo = true;
    consultarPareamento();
    const timer = setInterval(() => { if (vivo) consultarPareamento({ silencioso: true }); }, 4000);
    return () => { vivo = false; clearInterval(timer); };
  }, [aba, id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReconectar() {
    setAcaoPareamento(true);
    try {
      await reconnectBaileys(id);
      toast.success('Reconectando o número…');
      await consultarPareamento({ silencioso: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAcaoPareamento(false);
    }
  }

  async function handleReiniciarPareamento() {
    setAcaoPareamento(true);
    try {
      await restartBaileysPairing(id);
      toast.success('Pareamento reiniciado — escaneie o novo QR.');
      setPareamento(null);
      await consultarPareamento();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAcaoPareamento(false);
    }
  }

  async function handleTest() {
    setTestando(true);
    try {
      const { health } = await testConnection(id);
      if (health?.ok) toast.success(`Respondeu: ${health.detail || 'conexão saudável.'}`);
      else toast.warn(`Não passou: ${health?.detail || 'sem detalhe.'}`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTestando(false);
    }
  }

  if (!conexao) return null;

  const meta = statusMeta(conexao.status);
  const precisaAutorizar = conexao.provider_key === 'google-workspace' && conexao.status !== 'ACTIVE';
  // Pareamento vale só para os conectores Baileys (número interno e canal
  // manual de coexistência) — são os únicos com socket para parear.
  const isBaileys = conexao.provider_key === 'whatsapp-baileys-internal'
    || conexao.provider_key === 'whatsapp-baileys-manual';

  // Estado do socket → papel semântico + o que fazer. Espelha os literais do
  // runtime (disconnected | connecting | qr_pending | connected | error).
  const PAREAMENTO_META = {
    connected:   { tone: 'success', label: 'Conectado',        hint: 'Este número está pareado e pronto para enviar e receber.' },
    qr_pending:  { tone: 'warning', label: 'Aguardando leitura', hint: 'Abra o WhatsApp no celular e escaneie o código abaixo.' },
    connecting:  { tone: 'info',    label: 'Conectando…',       hint: 'Estabelecendo o link com o WhatsApp — aguarde alguns segundos.' },
    disconnected:{ tone: 'neutral', label: 'Desconectado',      hint: 'O número ainda não foi pareado. Reinicie o pareamento para gerar o QR.' },
    error:       { tone: 'danger',  label: 'Com erro',          hint: 'O link caiu. Tente reconectar; se não voltar, reinicie o pareamento.' },
  };
  const estPar = PAREAMENTO_META[pareamento?.status] || { tone: 'neutral', label: pareamento?.status || 'Verificando…', hint: '' };

  // O item do `Tabs` do DS é identificado por **`id`** (não `value` — esse é o
  // da aba ativa, no componente). Declarar `{ value, label }` não dá erro: o
  // `it.id` fica `undefined`, nenhuma aba casa com a ativa e o `onChange` devolve
  // `undefined` — a tela some ao clicar em qualquer aba. Prop morta de novo.
  const abas = [
    { id: 'dados', label: 'Dados' },
    // Pareamento só aparece para Baileys e para quem pode escrever conexão (o
    // endpoint exige connections.write). Fica logo após "Dados" — é o passo que
    // liga a conexão de verdade.
    ...(isBaileys && podeEscrever ? [{ id: 'pareamento', label: 'Pareamento' }] : []),
    { id: 'recursos', label: 'Recursos' },
    ...(podeVerLogs ? [{ id: 'logs', label: 'Histórico de chamadas' }] : []),
  ];

  return (
    <DetailScreen
      back={{ label: 'Voltar para conexões', onClick: () => navigate('/integracoes/conexoes') }}
      title={conexao.name}
      subtitle={prettifyProviderKey(conexao.provider_key)}
      actions={
        <>
          {podeEscrever && (
            <Button
              variant="secondary"
              icon="zap"
              loading={testando}
              title="Abre uma conexão real com o sistema do outro lado e conta o que voltou"
              onClick={handleTest}
            >
              Testar
            </Button>
          )}
          {podeEscrever && precisaAutorizar && (
            <GoogleOAuthButton connectionId={conexao.id} onActivated={() => load()} />
          )}
          {podeEscrever && (
            <Button variant="primary" icon="edit" onClick={() => navigate(`/integracoes/conexoes/${id}/editar`)}>
              Editar
            </Button>
          )}
        </>
      }
      tabs={abas}
      tab={aba}
      onTab={setAba}
      loading={loading}
      /* `bare`: cada aba traz os próprios cartões. */
      bare
    >
      {aba === 'dados' && (
        <>
          <Card>
            <div style={{ padding: 20 }}>
              <DescriptionList
                items={[
                  // O id fica aqui porque é o que se cola ao fixar esta conexão
                  // numa ferramenta ou num fluxo — e não aparecia em lugar nenhum.
                  { key: 'Identificador', value: (
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <code style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, wordBreak: 'break-all' }}>
                        {conexao.id}
                      </code>
                      <CopyButton value={conexao.id} title="Copiar o identificador" onCopied={(ok) => { if (!ok) toast.error('Não deu para copiar — selecione e copie à mão.'); }} />
                    </span>
                  ) },
                  { key: 'Conector', value: prettifyProviderKey(conexao.provider_key) },
                  { key: 'Prioridade', value: `${conexao.priority ?? 0} — quando há mais de uma conexão do mesmo tipo, a maior é usada primeiro` },
                  { key: 'Conectada em', value: conexao.connected_at ? formatDateTime(conexao.connected_at) : '—' },
                  { key: 'Última verificação', value: conexao.last_health_at ? formatDateTime(conexao.last_health_at) : 'nunca testada' },
                  { key: 'Última utilização', value: conexao.last_used_at ? formatDateTime(conexao.last_used_at) : 'nunca usada' },
                  { key: 'Última sincronização', value: conexao.last_sync_at ? formatDateTime(conexao.last_sync_at) : 'nunca' },
                ]}
              />
            </div>
          </Card>

          <Card>
            <div style={{ padding: 20 }} className="space-y-2">
              <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                Configuração
              </h2>
              <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }}>
                O que está guardado nesta conexão. Senhas, chaves e tokens não aparecem aqui — ficam cifrados no cofre e nunca saem por HTTP.
              </p>
              <pre
                style={{
                  fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, margin: 0,
                  border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12,
                  maxHeight: 280, overflow: 'auto', color: 'var(--su-text-secondary)',
                }}
              >
                {JSON.stringify(conexao.config || {}, null, 2)}
              </pre>
            </div>
          </Card>
        </>
      )}

      {aba === 'pareamento' && (
        <Card>
          <div style={{ padding: 20 }} className="space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1" style={{ minWidth: 0 }}>
                <Badge tone={estPar.tone}>{estPar.label}</Badge>
                <p style={{ fontSize: 12, margin: 0, maxWidth: 560, color: 'var(--su-text-muted)' }}>
                  {estPar.hint || 'Consultando o estado do número…'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" icon="refresh" loading={carregandoPareamento} onClick={() => consultarPareamento()}>
                  Atualizar
                </Button>
                <Button variant="secondary" icon="zap" loading={acaoPareamento} onClick={handleReconectar}>
                  Reconectar
                </Button>
                <Button variant="secondary" icon="refresh" loading={acaoPareamento} onClick={handleReiniciarPareamento}>
                  Reiniciar pareamento
                </Button>
              </div>
            </div>

            {carregandoPareamento && pareamento === null ? (
              <div className="flex justify-center py-10">
                <Spinner size="lg" />
              </div>
            ) : pareamento?.status === 'connected' ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-primary)' }}>Este número está pareado.</p>
                <p style={{ fontSize: 12, margin: 0, maxWidth: 420, color: 'var(--su-text-muted)' }}>
                  Já envia e recebe por aqui. Para trocar de número, use <b>Reiniciar pareamento</b>.
                </p>
              </div>
            ) : pareamento?.qr_image ? (
              <div className="flex flex-col items-center gap-3 py-4">
                {/* Fundo branco obrigatório para a leitura do QR — exceção
                    consciente aos tokens do DS (a câmera precisa do contraste). */}
                <div style={{ background: '#ffffff', padding: 16, borderRadius: 12, border: '1px solid var(--su-border-default)' }}>
                  <img
                    src={pareamento.qr_image}
                    alt="QR Code de pareamento do WhatsApp"
                    style={{ display: 'block', width: 264, height: 264 }}
                  />
                </div>
                <p style={{ fontSize: 12, margin: 0, maxWidth: 440, textAlign: 'center', color: 'var(--su-text-muted)' }}>
                  No celular: WhatsApp › <b>Aparelhos conectados</b> › <b>Conectar um aparelho</b> e aponte a câmera para o código.
                  Ele expira em segundos — se sumir, um novo aparece sozinho.
                </p>
              </div>
            ) : (
              <EmptyState
                icon="refresh"
                title="Sem QR no momento"
                description="Toque em Reiniciar pareamento para gerar um novo código. Se este número já foi pareado antes, use Reconectar."
              />
            )}
          </div>
        </Card>
      )}

      {aba === 'recursos' && (
        <Card>
          <div style={{ padding: 20 }} className="space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <p style={{ fontSize: 12, margin: 0, maxWidth: 640, color: 'var(--su-text-muted)' }}>
                O que esta conexão expõe do outro lado — setores, assuntos, planos, números. É só leitura: nada é gravado
                aqui nem alterado lá. Copie os identificadores para usar na configuração de ferramentas e fluxos.
              </p>
              <Button variant="ghost" icon="refresh" loading={carregandoRecursos} onClick={carregarRecursos}>
                Consultar de novo
              </Button>
            </div>

            {carregandoRecursos && recursos === null ? (
              <div className="flex justify-center py-10">
                <Spinner size="lg" />
              </div>
            ) : !recursos?.length ? (
              <EmptyState
                icon="search"
                title="Nada a listar"
                description="A conexão respondeu, mas não expõe recursos para descobrir. Nem todo conector tem o que listar — e uma conexão desativada não responde."
              />
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  recursos.reduce((acc, r) => { (acc[r.kind] = acc[r.kind] || []).push(r); return acc; }, {}),
                ).map(([kind, linhas]) => (
                  <div key={kind}>
                    <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px', color: 'var(--su-text-secondary)' }}>
                      {RESOURCE_KIND_LABELS[kind] || kind}{' '}
                      <span style={{ fontWeight: 400, color: 'var(--su-text-muted)' }}>({linhas.length})</span>
                    </p>
                    <div style={{ border: '1px solid var(--su-border-default)', borderRadius: 8, overflow: 'hidden' }}>
                      {linhas.map((r, i) => (
                        <div
                          key={`${kind}:${r.id}`}
                          className="flex items-center gap-2 px-3 py-2"
                          style={{ borderTop: i ? '1px solid var(--su-border-subtle, var(--su-border-default))' : 'none' }}
                        >
                          <span style={{ fontSize: 13, flex: 1, minWidth: 0, color: 'var(--su-text-primary)' }} className="truncate">
                            {r.name}
                          </span>
                          <code style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, color: 'var(--su-text-muted)' }}>
                            {r.id}
                          </code>
                          <CopyButton value={String(r.id)} title={`Copiar o identificador de ${r.name}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {aba === 'logs' && (
        <Card>
          <div style={{ padding: 20 }}>
            {carregandoLogs ? (
              <div className="flex justify-center py-10">
                <Spinner size="lg" />
              </div>
            ) : !logs?.length ? (
              <EmptyState
                icon="file"
                title="Nenhuma chamada registrada"
                description="Assim que algum fluxo, assistente ou tela usar esta conexão, a chamada aparece aqui."
              />
            ) : (
              <Timeline
                items={logs.map((log) => ({
                  active: log.status !== 'SUCCESS',
                  title: (
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={log.status === 'SUCCESS' ? 'success' : 'danger'}>
                        {log.status === 'SUCCESS' ? 'ok' : 'falhou'}
                      </Badge>
                      <span>{log.operation}</span>
                      {log.error && (
                        <span style={{ color: 'var(--su-danger-fg)' }}>{log.error}</span>
                      )}
                    </span>
                  ),
                  meta: [
                    log.duration_ms != null ? `${log.duration_ms} ms` : null,
                    formatDateTime(log.created_at),
                  ].filter(Boolean).join(' · '),
                }))}
              />
            )}
          </div>
        </Card>
      )}
    </DetailScreen>
  );
}
