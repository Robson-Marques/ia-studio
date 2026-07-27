import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader, Card, Tabs, DataTable, Badge, Button, Modal, ConfirmDialog, Field, Input, Select, PhoneInput, Pagination, CopyButton, EmptyState, useToast, Spinner } from '@studio-ux-ds/react';
import { listUsers, createUser, updateUser, inactivateUser, activateUser } from '../services/users';
import { listInvites, createInvite, revokeInvite } from '../services/invites';
import { listProfiles } from '../services/profiles';
import { usePermissions } from '../hooks/usePermissions';
import { formatDateTime } from '../lib/format';

// Usuários e convites — quem entra na organização. Migrada pro DS na v0.10.16.
//
// Decisões de composição:
//
//  · **Duas abas, uma tela**: pessoa que já entrou e convite que ainda não foi
//    aceito são o mesmo assunto ("quem tem acesso") em dois estados. As abas usam
//    `id` (sem ele o `Tabs` do DS não marca a ativa — ver DS v1.2.33).
//  · **Formulário de usuário e de convite ficam em Modal**: campos curtos, nada a
//    redigir. Decisão confirmada pelo Robson nesta frente — o convite são três
//    campos, e a pessoa só existe de verdade quando aceita.
//  · **Ativar/inativar e revogar vão para a barra de lote**, e só aparecem quando
//    TODA a seleção aceita a transição: oferecer "reativar" para quem já está
//    ativo é prometer o que não faz nada.
//  · **O link do convite usa `CopyButton`** em vez de clipboard à mão — e ele fica
//    na linha, porque é o único jeito de a pessoa receber o convite (não há envio
//    automático de e-mail aqui).

const ABAS = [
  { id: 'usuarios', label: 'Pessoas', icon: 'users' },
  { id: 'convites', label: 'Convites', icon: 'mail' },
];

const POR_PAGINA = 10;

export default function Usuarios() {
  const [aba, setAba] = useState('usuarios');
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    let vivo = true;
    listProfiles()
      .then(({ items }) => { if (vivo) setProfiles(items); })
      .catch(() => { /* o seletor fica vazio; o erro aparece ao salvar */ });
    return () => { vivo = false; };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pessoas e convites"
        subtitle="Quem tem acesso à organização, e quem foi convidado e ainda não entrou."
      />
      <Tabs items={ABAS} value={aba} onChange={setAba} />
      {aba === 'usuarios' ? <AbaPessoas profiles={profiles} /> : <AbaConvites profiles={profiles} />}
    </div>
  );
}

/* ───────────────────────── Pessoas ───────────────────────── */

function AbaPessoas({ profiles }) {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null); // { editing? }
  const [acao, setAcao] = useState(null); // { tipo: 'inativar'|'reativar', ids, clear }
  const [agindo, setAgindo] = useState(false);

  const podeEscrever = can('core.users.write');
  const podeInativar = can('core.users.inactivate');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listUsers();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pagina = useMemo(
    () => items.slice((page - 1) * POR_PAGINA, page * POR_PAGINA),
    [items, page],
  );

  const perfilDe = (u) =>
    u.profile?.name || u.profile_name || profiles.find((p) => p.id === u.profile_id)?.name || '—';

  const ativo = (u) => u.is_active !== false && u.status !== 'INACTIVE';

  async function confirmar() {
    if (!acao) return;
    const { tipo, ids, clear } = acao;
    setAgindo(true);
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try {
        if (tipo === 'inativar') await inactivateUser(id);
        else await activateUser(id);
        ok += 1;
      } catch (err) {
        falhas.push(err.message);
      }
    }
    setAgindo(false);
    setAcao(null);
    clear?.();
    if (ok) {
      const verbo = tipo === 'inativar' ? 'sem acesso' : 'com acesso de volta';
      toast.success(ok === 1 ? `Pessoa ficou ${verbo}.` : `${ok} pessoas ficaram ${verbo}.`);
    }
    if (falhas.length) toast.error(`${falhas.length} não deram: ${falhas[0]}`);
    load();
  }

  const columns = [
    { key: 'name', header: 'Pessoa', render: (u) => (
      <div className="min-w-0">
        <p style={{ fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">
          {u.name || '—'}
        </p>
        <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }} className="truncate">{u.email}</p>
      </div>
    ) },
    { key: 'profile', header: 'Perfil de acesso', render: (u) => perfilDe(u) },
    { key: 'status', header: 'Situação', render: (u) => (
      ativo(u) ? <Badge tone="success">com acesso</Badge> : <Badge tone="neutral">sem acesso</Badge>
    ) },
    { key: 'last', header: 'Última entrada', render: (u) => (u.last_login_at ? formatDateTime(u.last_login_at) : 'nunca entrou') },
  ];

  const bulkActions = (ids, clear) => {
    const sel = items.filter((u) => ids.includes(u.id));
    if (!sel.length) return null;
    const uma = sel.length === 1 ? sel[0] : null;
    return (
      <>
        {podeEscrever && uma && (
          <Button variant="ghost" icon="edit" onClick={() => setForm({ editing: uma })}>Editar</Button>
        )}
        {podeInativar && sel.every((u) => ativo(u)) && (
          <Button
            variant="ghost"
            icon="power"
            title="Bloqueia a entrada na hora — dá para liberar de novo depois"
            onClick={() => setAcao({ tipo: 'inativar', ids, clear })}
          >
            Tirar o acesso
          </Button>
        )}
        {podeInativar && sel.every((u) => !ativo(u)) && (
          <Button
            variant="ghost"
            icon="play"
            title="Libera a entrada na hora"
            onClick={() => setAcao({ tipo: 'reativar', ids, clear })}
          >
            Devolver o acesso
          </Button>
        )}
      </>
    );
  };

  const varias = (acao?.ids.length || 0) > 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
          {items.length === 1 ? '1 pessoa' : `${items.length} pessoas`}
        </p>
        {podeEscrever && (
          <Button variant="primary" icon="plus" onClick={() => setForm({})}>Nova pessoa</Button>
        )}
      </div>

      {loading && !items.length ? (
        <Spinner size="lg" center />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="users"
            title="Ninguém além de você"
            description="Cadastre uma pessoa com senha inicial, ou mande um convite pela aba ao lado para ela mesma criar a senha."
          />
        </Card>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={pagina}
            getRowId={(u) => u.id}
            bulkActions={bulkActions}
          />
          <Pagination
            page={page}
            perPage={POR_PAGINA}
            total={items.length}
            itemLabel={['pessoa', 'pessoas']}
            onPage={setPage}
          />
        </>
      )}

      <FormPessoa
        open={Boolean(form)}
        editing={form?.editing}
        profiles={profiles}
        onClose={() => setForm(null)}
        onSaved={() => { setForm(null); load(); }}
      />

      <ConfirmDialog
        open={Boolean(acao)}
        danger={acao?.tipo === 'inativar'}
        loading={agindo}
        title={acao?.tipo === 'inativar' ? 'Tirar o acesso' : 'Devolver o acesso'}
        message={
          acao?.tipo === 'inativar'
            ? `${varias ? 'Estas pessoas' : 'Esta pessoa'} para de entrar no sistema imediatamente. O cadastro fica, e o acesso pode ser devolvido depois — nada é apagado.`
            : `${varias ? 'Estas pessoas voltam' : 'Esta pessoa volta'} a entrar no sistema imediatamente, com o mesmo perfil de antes.`
        }
        confirmLabel={acao?.tipo === 'inativar' ? 'Tirar o acesso' : 'Devolver'}
        onClose={() => !agindo && setAcao(null)}
        onConfirm={confirmar}
      />
    </div>
  );
}

function FormPessoa({ open, editing, profiles, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', profile_id: '', password: '', whatsapp_phone: '' });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(editing
      ? {
        name: editing.name || '',
        email: editing.email || '',
        profile_id: editing.profile_id || editing.profile?.id || '',
        password: '',
        whatsapp_phone: editing.whatsapp_phone || '',
      }
      : { name: '', email: '', profile_id: '', password: '', whatsapp_phone: '' });
  }, [open, editing]);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  async function salvar() {
    if (!form.name.trim()) { toast.error('Informe o nome.'); return; }
    if (!editing && !form.email.trim()) { toast.error('Informe o e-mail.'); return; }
    if (!form.profile_id) { toast.error('Escolha o perfil de acesso.'); return; }
    if (!editing && (!form.password || form.password.length < 8)) {
      toast.error('A senha inicial precisa de pelo menos 8 caracteres.');
      return;
    }
    setSalvando(true);
    try {
      if (editing) {
        await updateUser(editing.id, {
          name: form.name.trim(),
          profile_id: form.profile_id,
          whatsapp_phone: form.whatsapp_phone || null,
        });
        toast.success('Dados salvos.');
      } else {
        await createUser({
          name: form.name.trim(),
          email: form.email.trim(),
          profile_id: form.profile_id,
          password: form.password,
          ...(form.whatsapp_phone ? { whatsapp_phone: form.whatsapp_phone } : {}),
        });
        toast.success('Pessoa cadastrada. Passe a senha inicial para ela.');
      }
      onSaved();
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
      title={editing ? 'Editar pessoa' : 'Nova pessoa'}
      footer={
        <>
          <Button variant="secondary" disabled={salvando} onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={salvando} onClick={salvar}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome completo" autoFocus />
        </Field>
        <Field
          label="E-mail"
          required
          hint={editing ? 'Não muda depois do cadastro — é com ele que a pessoa entra.' : 'É com ele que a pessoa entra no sistema.'}
        >
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="pessoa@empresa.com"
            disabled={Boolean(editing)}
          />
        </Field>
        <Field label="Perfil de acesso" required hint="Define o que ela pode fazer aqui dentro.">
          <Select value={form.profile_id} onChange={(e) => set('profile_id', e.target.value)}>
            <option value="">Selecione…</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="WhatsApp para avisos" hint="Só para alerta interno (ex.: incidente de rede). Deixe vazio se ela não recebe.">
          <PhoneInput value={form.whatsapp_phone} onChange={(v) => set('whatsapp_phone', v)} />
        </Field>
        {!editing && (
          <Field label="Senha inicial" required hint="Pelo menos 8 caracteres. Ela pode trocar depois, em Minha conta.">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              autoComplete="new-password"
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* ───────────────────────── Convites ───────────────────────── */

function AbaConvites({ profiles }) {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [revogar, setRevogar] = useState(null); // { ids, clear }
  const [agindo, setAgindo] = useState(false);

  const podeConvidar = can('core.invites.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listInvites();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const linkDoConvite = (inv) => `${window.location.origin}/convite/${inv.token || inv.invite_token || inv.id}`;

  const perfilDe = (inv) =>
    inv.profile?.name || inv.profile_name || profiles.find((p) => p.id === inv.profile_id)?.name || '—';

  const situacao = (inv) => inv.status || (inv.accepted_at ? 'ACCEPTED' : 'PENDING');
  const pendente = (inv) => situacao(inv) === 'PENDING';

  const badge = (inv) => {
    const s = situacao(inv);
    if (s === 'ACCEPTED') return <Badge tone="success">aceito</Badge>;
    if (s === 'REVOKED') return <Badge tone="neutral">cancelado</Badge>;
    if (s === 'EXPIRED') return <Badge tone="danger">venceu</Badge>;
    return <Badge tone="warning">esperando</Badge>;
  };

  async function confirmarRevogacao() {
    if (!revogar) return;
    const { ids, clear } = revogar;
    setAgindo(true);
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try { await revokeInvite(id); ok += 1; }
      catch (err) { falhas.push(err.message); }
    }
    setAgindo(false);
    setRevogar(null);
    clear?.();
    if (ok) toast.success(ok === 1 ? 'Convite cancelado.' : `${ok} convites cancelados.`);
    if (falhas.length) toast.error(`${falhas.length} não deram: ${falhas[0]}`);
    load();
  }

  const columns = [
    { key: 'email', header: 'Convidado', render: (inv) => (
      <span style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{inv.email}</span>
    ) },
    { key: 'profile', header: 'Vai entrar como', render: (inv) => perfilDe(inv) },
    { key: 'status', header: 'Situação', render: (inv) => badge(inv) },
    { key: 'created', header: 'Convidado em', render: (inv) => formatDateTime(inv.created_at) },
    // O link fica na linha porque é o único caminho para a pessoa receber o
    // convite — o sistema não dispara e-mail por conta.
    { key: 'link', header: 'Link', align: 'right', render: (inv) => (
      pendente(inv)
        ? <CopyButton value={linkDoConvite(inv)} title="Copiar o link deste convite" />
        : <span style={{ color: 'var(--su-text-muted)' }}>—</span>
    ) },
  ];

  const bulkActions = (ids, clear) => {
    if (!podeConvidar) return null;
    const sel = items.filter((inv) => ids.includes(inv.id));
    if (!sel.length || !sel.every(pendente)) return null;
    return (
      <Button
        variant="ghost"
        icon="trash"
        title="O link para de funcionar na hora"
        onClick={() => setRevogar({ ids, clear })}
      >
        Cancelar convite
      </Button>
    );
  };

  const varios = (revogar?.ids.length || 0) > 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
          {items.length === 1 ? '1 convite' : `${items.length} convites`}
        </p>
        {podeConvidar && (
          <Button variant="primary" icon="plus" onClick={() => setCriando(true)}>Novo convite</Button>
        )}
      </div>

      {loading && !items.length ? (
        <Spinner size="lg" center />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="mail"
            title="Nenhum convite"
            description="No convite você escolhe o e-mail e o perfil; a pessoa cria a própria senha ao aceitar. O link tem que ser enviado por você — o sistema não manda e-mail sozinho."
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          getRowId={(inv) => inv.id}
          bulkActions={bulkActions}
        />
      )}

      <FormConvite
        open={criando}
        profiles={profiles}
        onClose={() => setCriando(false)}
        onSaved={() => load()}
      />

      <ConfirmDialog
        open={Boolean(revogar)}
        danger
        loading={agindo}
        title="Cancelar convite"
        message={
          varios
            ? `Cancelar os ${revogar.ids.length} convites selecionados? Os links param de funcionar na hora — se a pessoa tentar usar, não entra.`
            : 'Cancelar este convite? O link para de funcionar na hora — se a pessoa tentar usar, não entra. Dá para convidar de novo depois.'
        }
        confirmLabel="Cancelar convite"
        onClose={() => !agindo && setRevogar(null)}
        onConfirm={confirmarRevogacao}
      />
    </div>
  );
}

function FormConvite({ open, profiles, onClose, onSaved }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [profileId, setProfileId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [link, setLink] = useState('');

  useEffect(() => {
    if (open) { setEmail(''); setProfileId(''); setLink(''); }
  }, [open]);

  async function salvar() {
    if (!email.trim()) { toast.error('Informe o e-mail.'); return; }
    if (!profileId) { toast.error('Escolha o perfil de acesso.'); return; }
    setSalvando(true);
    try {
      const inv = await createInvite({ email: email.trim(), profile_id: profileId });
      const token = inv?.token || inv?.invite_token || inv?.id;
      setLink(`${window.location.origin}/convite/${token}`);
      onSaved();
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
      title="Novo convite"
      footer={
        link ? (
          <Button variant="primary" onClick={onClose}>Pronto</Button>
        ) : (
          <>
            <Button variant="secondary" disabled={salvando} onClick={onClose}>Cancelar</Button>
            <Button variant="primary" loading={salvando} onClick={salvar}>Criar convite</Button>
          </>
        )
      }
    >
      {link ? (
        <div className="space-y-3">
          <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>
            Convite criado. <strong>Envie este link para a pessoa</strong> — o sistema não manda e-mail sozinho, e sem o
            link ela não tem como entrar.
          </p>
          <div className="flex items-center gap-2">
            <Input value={link} readOnly onFocus={(e) => e.target.select()} style={{ flex: 1, fontSize: 12 }} />
            <CopyButton
              value={link}
              label="Copiar"
              variant="secondary"
              size="md"
              onCopied={(ok) => { if (!ok) toast.error('Não deu para copiar — selecione e copie à mão antes de fechar.'); }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="E-mail" required hint="É com este e-mail que a pessoa vai entrar.">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" autoFocus />
          </Field>
          <Field label="Vai entrar como" required hint="O perfil define o que ela pode fazer.">
            <Select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <option value="">Selecione…</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  );
}
