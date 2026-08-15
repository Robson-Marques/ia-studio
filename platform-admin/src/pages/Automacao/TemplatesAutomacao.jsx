import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, Select, Field, ConfirmDialog, useToast } from '@studio-ux-ds/react';
import { listAutomationTemplates, deleteAutomationTemplate } from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { CHANNEL_LABEL, formatDateTime } from './automation.constants';
import { extractTemplateVars } from './template.helpers';

// Automação/Templates — catálogo multi-canal com {{variáveis}} (diretriz 11).
// Migrada pro DS na v0.9.99.
//
// Decisões de composição:
//
//  · **O template saiu do Modal e virou rota** (`/automacao/templates/:id`). O
//    corpo da mensagem é um TextArea de 8 linhas — o caso mais literal da regra
//    do Modal do DS. Além disso o editor mostra as variáveis detectadas enquanto
//    se escreve: é tela de trabalho, não caixinha de confirmação.
//  · **Lápis e lixeira saíram da linha.** A linha abre o template; excluir vive
//    na barra de lote (aceita vários — são registros independentes) e "Editar"
//    aparece lá só quando há exatamente 1 marcado.
//  · O filtro de canal foi pra `toolbar` do `DataTable`, e não mais grudado no
//    título da tela.

export default function TemplatesAutomacao() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState('');
  const [deleting, setDeleting] = useState(null); // { ids, clear }
  const [deletingBusy, setDeletingBusy] = useState(false);

  const canWrite = can('automation.templates.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listAutomationTemplates({
        channel: channel || undefined,
        environment_id: environmentId || undefined,
      });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [channel, environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmDelete() {
    setDeletingBusy(true);
    const { ids, clear } = deleting;
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try { await deleteAutomationTemplate(id); ok += 1; }
      catch (err) { falhas.push(err.message); }
    }
    setDeletingBusy(false);
    setDeleting(null);
    clear();
    if (ok) toast.success(ok === 1 ? 'Template excluído.' : `${ok} templates excluídos.`);
    if (falhas.length) toast.error(`Não deu pra excluir ${falhas.length}: ${falhas[0]}`);
    load();
  }

  const novo = canWrite && (
    <Button variant="primary" icon="plus" onClick={() => navigate('/automacao/templates/novo')}>
      Novo template
    </Button>
  );

  const columns = [
    { key: 'name', header: 'Nome', render: (t) => (
      <span style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{t.name}</span>
    ) },
    { key: 'channel', header: 'Onde é usado', render: (t) => (
      <Badge tone="info">{CHANNEL_LABEL[t.channel] || t.channel}</Badge>
    ) },
    { key: 'vars', header: 'Variáveis', render: (t) => {
      const vars = extractTemplateVars(t);
      if (!vars.length) return <span style={{ fontSize: 12, color: 'var(--su-text-muted)' }}>nenhuma</span>;
      return (
        <div className="flex gap-1 flex-wrap">
          {vars.slice(0, 4).map((v) => <Badge key={v} tone="neutral">{v}</Badge>)}
          {vars.length > 4 && <Badge tone="neutral">+{vars.length - 4}</Badge>}
        </div>
      );
    } },
    { key: 'updated_at', header: 'Atualizado', render: (t) => formatDateTime(t.updated_at) },
  ];

  const bulkActions = canWrite
    ? (ids, clear) => (
      <>
        {ids.length === 1 && (
          <Button variant="ghost" icon="edit" onClick={() => navigate(`/automacao/templates/${ids[0]}`)}>
            Editar
          </Button>
        )}
        <Button
          variant="ghost"
          icon="trash"
          title="Fluxos que usam o template passam a falhar no passo de mensagem"
          onClick={() => setDeleting({ ids, clear })}
        >
          Excluir
        </Button>
      </>
    )
    : undefined;

  const filterContent = (
    <div style={{ minWidth: 220 }}>
      <Field label="Onde é usado">
        <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">Todos os canais</option>
          {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
    </div>
  );

  const nomesSelecionados = (deleting?.ids || [])
    .map((id) => items.find((t) => t.id === id)?.name)
    .filter(Boolean);

  return (
    <>
      <ListScreen
        title="Templates"
        subtitle={`Textos prontos com ${'{{variáveis}}'} que os fluxos reaproveitam — a automação escolhe o template e o sistema preenche o resto.`}
        primaryAction={novo}
        filterContent={filterContent}
        filtersActive={!!channel}
        onClearFilters={() => setChannel('')}
        toolbarActions={[{ icon: 'refresh', label: 'Atualizar', onClick: load }]}
        loading={loading && !items.length}
        columns={columns}
        rows={items}
        getRowId={(t) => t.id}
        onRowClick={(t) => navigate(`/automacao/templates/${t.id}`)}
        getRowLabel={(t) => `Abrir template ${t.name}`}
        bulkActions={bulkActions}
        filterActive={!!channel}
        emptyNew={{
          icon: 'file',
          title: 'Nenhum template ainda',
          description: `Um template guarda o texto uma vez e deixa os pedaços que mudam como ${'{{variáveis}}'} — assim o mesmo aviso serve para todo mundo.`,
          action: novo,
        }}
        emptyFiltered={{ title: 'Nenhum template para esse canal', description: 'Troque o filtro para ver os outros canais, ou crie um template para este.', onClear: () => setChannel('') }}
      />

      {/* 5 patrasques: ConfirmDialog + a consequência escrita + tooltip no botão
          + loading + gate can('automation.templates.write'). */}
      <ConfirmDialog
        open={!!deleting}
        danger
        loading={deletingBusy}
        title={nomesSelecionados.length > 1 ? 'Excluir templates' : 'Excluir template'}
        message={
          nomesSelecionados.length > 1
            ? `Excluir ${nomesSelecionados.length} templates (${nomesSelecionados.slice(0, 3).join(', ')}${nomesSelecionados.length > 3 ? '…' : ''})? Qualquer fluxo que use um deles passa a falhar no passo de mensagem — e isso só aparece quando o fluxo rodar.`
            : `Excluir "${nomesSelecionados[0] || ''}"? Qualquer fluxo que use esse template passa a falhar no passo de mensagem — e isso só aparece quando o fluxo rodar.`
        }
        confirmLabel="Excluir"
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
