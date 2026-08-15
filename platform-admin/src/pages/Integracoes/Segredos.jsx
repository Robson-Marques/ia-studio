import React, { useEffect, useMemo, useState } from 'react';
import { ListScreen, Badge, Button, Modal, Field, Input, ConfirmDialog, useToast } from '@studio-ux-ds/react';
import { listSecrets, rotateSecret } from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';
import { SECRET_KIND_LABELS } from './integration.constants';

// Integrações/Cofre — os segredos das conexões. Migrada pro DS na v0.10.11.
//
// A tela só mostra METADADO: nome, tipo, quais campos existem, quando foi
// trocado. O valor cifrado nunca sai por HTTP — nem para o administrador. Por
// isso a única ação possível é **trocar** (rotacionar), nunca "ver".
//
// Decisões de composição:
//
//  · **A linha não abre nada** — e isso é deliberado, não esquecimento. A regra
//    da casa é "a linha abre o registro"; aqui não existe registro para abrir:
//    tudo o que se pode saber sobre um segredo já está nas cinco colunas. Abrir
//    uma tela para repetir a mesma linha seria cerimônia vazia.
//  · **Trocar fica na barra de lote, uma por vez.** Cada segredo tem campos
//    próprios (um tem `api_key`, outro tem `client_id`+`client_secret`), então
//    não existe formulário que sirva para dois ao mesmo tempo.
//  · **A troca continua em Modal**, e cabe na regra: são campos curtos de senha,
//    sem texto longo nem nada a redigir. Com um ConfirmDialog por cima, porque o
//    valor antigo é descartado e não volta.
//
// **Bug consertado junto:** o modal de rotação chamava `toast.error/success` sem
// ter `useToast()` — o `catch` estourava `ReferenceError` em vez de mostrar o
// erro, e a validação de campo vazio derrubava a tela em vez de avisar.

export default function Segredos() {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rotacionando, setRotacionando] = useState(null); // { secret, clear }
  const [q, setQ] = useState('');

  const podeTrocar = can('integrations.secrets.manage');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((s) => (s.name || '').toLowerCase().includes(term));
  }, [items, q]);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listSecrets();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'name', header: 'Segredo', render: (s) => (
      <span style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{s.name}</span>
    ) },
    { key: 'kind', header: 'Tipo', render: (s) => <Badge tone="info">{SECRET_KIND_LABELS[s.kind] || s.kind}</Badge> },
    { key: 'fields', header: 'Campos guardados', render: (s) => (
      (s.fields || []).length
        ? <div className="flex gap-1 flex-wrap">{s.fields.map((f) => <Badge key={f} tone="neutral">{f}</Badge>)}</div>
        : '—'
    ) },
    { key: 'rotated', header: 'Trocado em', render: (s) => (s.rotated_at ? formatDateTime(s.rotated_at) : 'nunca') },
    { key: 'created', header: 'Criado em', render: (s) => formatDateTime(s.created_at) },
  ];

  // Uma por vez: cada segredo tem campos próprios, então não há formulário que
  // sirva para dois ao mesmo tempo.
  const bulkActions = (ids, clear) => {
    if (!podeTrocar || ids.length !== 1) return null;
    const secret = items.find((s) => s.id === ids[0]);
    if (!secret) return null;
    return (
      <Button
        variant="ghost"
        icon="refresh"
        title="Substitui os valores guardados por novos — o antigo é descartado"
        onClick={() => setRotacionando({ secret, clear })}
      >
        Trocar os valores
      </Button>
    );
  };

  return (
    <>
      <ListScreen
        title="Cofre de Segredos"
        subtitle="As credenciais das conexões, guardadas cifradas. Esta tela mostra só o que existe — o valor em si nunca sai do cofre, nem aqui."
        search={q}
        onSearch={setQ}
        searchPlaceholder="Buscar segredo…"
        loading={loading && !items.length}
        columns={columns}
        rows={rows}
        getRowId={(s) => s.id}
        selectionMode="single"
        bulkActions={bulkActions}
        filterActive={!!q.trim()}
        emptyNew={{
          icon: 'lock',
          title: 'Cofre vazio',
          description: 'Os segredos entram sozinhos quando você cria uma conexão — não se cadastra segredo por aqui.',
        }}
        emptyFiltered={{ title: 'Nenhum segredo encontrado', description: 'Nenhum segredo com esse nome.', onClear: () => setQ('') }}
      />

      <RotacionarSegredo
        entrada={rotacionando}
        onClose={() => setRotacionando(null)}
        onDone={() => { rotacionando?.clear?.(); setRotacionando(null); load(); }}
      />
    </>
  );
}

function RotacionarSegredo({ entrada, onClose, onDone }) {
  const toast = useToast();
  const secret = entrada?.secret || null;
  const [valores, setValores] = useState({});
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setValores({});
    setConfirmando(false);
  }, [secret?.id]);

  if (!secret) return null;
  const campos = secret.fields?.length ? secret.fields : ['value'];

  function pedirConfirmacao() {
    const faltando = campos.filter((f) => !String(valores[f] ?? '').trim());
    if (faltando.length) {
      toast.error(`Preencha o novo valor de: ${faltando.join(', ')}.`);
      return;
    }
    setConfirmando(true);
  }

  async function trocar() {
    setSalvando(true);
    try {
      await rotateSecret(secret.id, valores);
      toast.success('Valores trocados. Teste a conexão que usa este segredo.');
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
      setConfirmando(false);
    }
  }

  return (
    <>
      <Modal
        open={Boolean(secret)}
        onClose={salvando ? undefined : onClose}
        title={`Trocar os valores — ${secret.name}`}
        footer={
          <>
            <Button variant="secondary" disabled={salvando} onClick={onClose}>Cancelar</Button>
            <Button variant="primary" loading={salvando} onClick={pedirConfirmacao}>Trocar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>
            A troca substitui <strong>todos</strong> os valores deste segredo de uma vez. As conexões que o usam passam a
            usar os novos imediatamente — teste logo depois.
          </p>
          {campos.map((f) => (
            <Field key={f} label={`Novo valor — ${f}`} required>
              <Input
                type="password"
                autoComplete="new-password"
                value={valores[f] ?? ''}
                onChange={(e) => setValores((prev) => ({ ...prev, [f]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmando}
        danger
        loading={salvando}
        title="Confirmar a troca"
        message={`Substituir os valores de “${secret.name}”? Os antigos são descartados na hora e não têm como voltar — se os novos estiverem errados, a conexão para até você corrigir.`}
        confirmLabel="Trocar"
        onClose={() => setConfirmando(false)}
        onConfirm={trocar}
      />
    </>
  );
}
