import React, { useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Badge, Button, Modal, Field, Input, ConfirmDialog, Banner, CopyButton, EmptyState, useToast, Spinner } from '@studio-ux-ds/react';
import { listApiKeys, createApiKey, revokeApiKey } from '../../services/developer';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';

// Desenvolvedor/Chaves de API — autenticam quem chama a API da plataforma de
// fora. Migrada pro DS na v0.10.13.
//
// A chave em claro existe por **um instante**: aparece uma vez, na criação, e
// depois só o prefixo e o hash ficam guardados. Toda a composição desta tela gira
// em torno disso — o aviso, o botão de copiar e o fecho que só oferece "já copiei".
//
// Decisões de composição:
//
//  · **A linha não abre nada** (deliberado): não há nada sobre uma chave que não
//    esteja nas seis colunas. Revogar é a única ação, e vive na barra de lote.
//  · **Criar continua em Modal** e cabe na regra: três campos curtos, nada a
//    redigir. **Mostrar a chave também** — é leitura, e leitura de uma coisa só.
//  · **Revogar aceita várias** de uma vez, mas só as que ainda valem: oferecer
//    revogar o que já está revogado é prometer o que vai falhar.
//
// **Bug consertado junto:** os dois modais chamavam `toast.*` sem que o arquivo
// tivesse `useToast()` neles — o `catch` estourava `ReferenceError` em vez de
// mostrar o erro, e a validação do nome derrubava a tela em vez de avisar. Mesma
// família dos dois casos achados em Integrações.

export default function ApiKeys() {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [chaveNova, setChaveNova] = useState(null); // { key, plaintext }
  const [revogar, setRevogar] = useState(null);     // { ids, clear }
  const [revogando, setRevogando] = useState(false);

  const podeGerenciar = can('developer.apikeys.manage');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listApiKeys();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function situacao(k) {
    if (k.revoked_at) return { label: 'revogada', tone: 'danger' };
    if (k.expires_at && new Date(k.expires_at).getTime() < Date.now()) return { label: 'vencida', tone: 'warning' };
    return { label: 'em uso', tone: 'success' };
  }

  async function confirmarRevogacao() {
    if (!revogar) return;
    const { ids, clear } = revogar;
    setRevogando(true);
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try { await revokeApiKey(id); ok += 1; }
      catch (err) { falhas.push(err.message); }
    }
    setRevogando(false);
    setRevogar(null);
    clear?.();
    if (ok) toast.success(ok === 1 ? 'Chave revogada.' : `${ok} chaves revogadas.`);
    if (falhas.length) toast.error(`${falhas.length} não deram: ${falhas[0]}`);
    load();
  }

  const nova = podeGerenciar && (
    <Button variant="primary" icon="plus" onClick={() => setCriando(true)}>Nova chave</Button>
  );

  const columns = [
    { key: 'name', header: 'Chave', render: (k) => (
      <div className="min-w-0">
        <p style={{ fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">{k.name}</p>
        <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)', fontFamily: 'var(--su-font-mono, monospace)' }}>
          ias_{k.prefix}_…
        </p>
      </div>
    ) },
    { key: 'scopes', header: 'Pode fazer', render: (k) => (
      (k.scopes || []).length
        ? <div className="flex gap-1 flex-wrap">{k.scopes.map((s) => <Badge key={s} tone="info">{s}</Badge>)}</div>
        : <span style={{ color: 'var(--su-text-muted)' }}>tudo o que a API permite</span>
    ) },
    { key: 'status', header: 'Situação', render: (k) => {
      const s = situacao(k);
      return <Badge tone={s.tone}>{s.label}</Badge>;
    } },
    { key: 'last', header: 'Último uso', render: (k) => (k.last_used_at ? formatDateTime(k.last_used_at) : 'nunca usada') },
    { key: 'exp', header: 'Vence em', render: (k) => (k.expires_at ? formatDateTime(k.expires_at) : 'não vence') },
  ];

  // Só as que ainda valem: revogar o que já foi revogado não faz nada.
  const bulkActions = (ids, clear) => {
    if (!podeGerenciar) return null;
    const sel = items.filter((k) => ids.includes(k.id));
    if (!sel.length || !sel.every((k) => !k.revoked_at)) return null;
    return (
      <Button
        variant="ghost"
        icon="trash"
        title="A chave para de autenticar na hora, e não volta"
        onClick={() => setRevogar({ ids, clear })}
      >
        Revogar
      </Button>
    );
  };

  const varias = (revogar?.ids.length || 0) > 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chaves de API"
        subtitle="Autenticam quem chama a API da plataforma de fora. A chave aparece uma única vez, na criação — depois guardamos só o prefixo e um resumo criptográfico."
        actions={nova}
      />

      {loading && !items.length ? (
        <Spinner size="lg" center />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="lock"
            title="Nenhuma chave"
            description="Crie uma chave para um sistema de fora chamar a API da plataforma em nome da sua organização."
            action={nova}
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          getRowId={(k) => k.id}
          bulkActions={bulkActions}
        />
      )}

      <CriarChave
        open={criando}
        onClose={() => setCriando(false)}
        onCreated={(res) => { setCriando(false); setChaveNova(res); load(); }}
      />

      <MostrarChave chaveNova={chaveNova} onClose={() => setChaveNova(null)} />

      <ConfirmDialog
        open={Boolean(revogar)}
        danger
        loading={revogando}
        title="Revogar chave de API"
        message={
          varias
            ? `Revogar as ${revogar.ids.length} chaves selecionadas? Toda integração que usa qualquer uma delas para de autenticar imediatamente. A revogação é permanente — elas nunca voltam a funcionar.`
            : 'Revogar esta chave? Toda integração que a usa para de autenticar imediatamente. A revogação é permanente — a chave nunca volta a funcionar. Se a ideia é trocar a chave, crie a nova ANTES de revogar a antiga.'
        }
        confirmLabel="Revogar"
        onClose={() => setRevogar(null)}
        onConfirm={confirmarRevogacao}
      />
    </div>
  );
}

// Criação — três campos curtos, nada a redigir: cabe no Modal.
function CriarChave({ open, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', scopes: '', expires_at: '' });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (open) setForm({ name: '', scopes: '', expires_at: '' }); }, [open]);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function salvar() {
    if (form.name.trim().length < 2) { toast.error('Dê um nome com pelo menos 2 letras.'); return; }
    const scopes = form.scopes.split(',').map((s) => s.trim()).filter(Boolean);
    let expiresAt;
    if (form.expires_at) {
      const d = new Date(form.expires_at);
      if (Number.isNaN(d.getTime())) { toast.error('A data de vencimento não é válida.'); return; }
      expiresAt = d.toISOString();
    }
    setSalvando(true);
    try {
      const res = await createApiKey({
        name: form.name.trim(),
        scopes: scopes.length ? scopes : undefined,
        expires_at: expiresAt,
      });
      onCreated(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={salvando ? undefined : onClose}
      title="Nova chave de API"
      footer={
        <>
          <Button variant="secondary" disabled={salvando} onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={salvando} onClick={salvar}>Criar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome" required hint="Para você reconhecer depois quem usa esta chave. Ex.: Integração do ERP.">
          <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Integração do ERP" autoFocus />
        </Field>
        <Field label="Pode fazer" hint="Separado por vírgula. Vazio = sem restrição explícita. Ex.: public.read, public.write">
          <Input value={form.scopes} onChange={(e) => patch({ scopes: e.target.value })} placeholder="public.read, public.write" />
        </Field>
        <Field label="Vence em" hint="Opcional. Vazio = não vence.">
          <Input type="date" value={form.expires_at} onChange={(e) => patch({ expires_at: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

// A chave em claro, uma única vez. Não fecha por clique fora nem por Esc: fechar
// sem copiar significa criar outra chave, e o descuido custa um passo inteiro.
function MostrarChave({ chaveNova, onClose }) {
  const toast = useToast();
  const plaintext = chaveNova?.plaintext || '';

  return (
    <Modal
      open={Boolean(chaveNova)}
      onClose={undefined}
      title="Chave criada"
      footer={<Button variant="primary" onClick={onClose}>Já copiei — fechar</Button>}
    >
      <div className="space-y-4">
        <Banner tone="warning">
          <strong>Copie agora.</strong> Esta chave não vai aparecer de novo — guardamos só o prefixo e um resumo
          criptográfico dela. Se perder, o caminho é criar outra e revogar esta.
        </Banner>
        <Field label={chaveNova?.key?.name ? `Chave “${chaveNova.key.name}”` : 'A chave'}>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={plaintext}
              onFocus={(e) => e.target.select()}
              style={{ flex: 1, fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
            />
            <CopyButton
              value={plaintext}
              label="Copiar"
              variant="secondary"
              size="md"
              onCopied={(ok) => { if (!ok) toast.error('Não deu para copiar — selecione o texto e copie à mão ANTES de fechar.'); }}
            />
          </div>
        </Field>
      </div>
    </Modal>
  );
}
