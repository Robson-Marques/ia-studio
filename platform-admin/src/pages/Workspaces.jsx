import React, { useEffect, useState } from 'react';
import { PageHeader, Card, Badge, Button, IconButton, Modal, Field, Input, Select, EmptyState, DSIcon, useToast, Spinner } from '@studio-ux-ds/react';
import {
  listWorkspaces, createWorkspace, updateWorkspace, createEnvironment, updateEnvironment,
} from '../services/workspaces';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../context/AuthContext';

// Workspaces e ambientes — a divisão dos projetos da organização. Migrada pro DS
// na v0.10.16.
//
// **Continua em cartões, não virou tabela**, e aqui a razão é estrutural: cada
// workspace CONTÉM os ambientes dele. Uma tabela plana perderia o aninhamento, e
// uma tabela com linha que abre para dentro é justamente o que o `DataTable` não
// faz. O cartão mostra o pai e os filhos juntos, que é como se lê isso.
//
// Os dois formulários **continuam em Modal** e cabem na regra: um campo de nome
// (e o tipo, na criação do ambiente). Nada a redigir.
//
// Salvar aqui chama `refreshMe()`: o seletor de workspace vive na barra de cima,
// alimentado pelo `/me` — sem isso o nome novo aparece na lista e continua velho
// no seletor, e a divergência dura até o próximo login.

const TIPOS_DE_AMBIENTE = [
  { value: 'PRODUCTION',  label: 'Produção',        tone: 'success' },
  { value: 'STAGING',     label: 'Homologação',     tone: 'warning' },
  { value: 'DEVELOPMENT', label: 'Desenvolvimento', tone: 'info' },
];

const tipoInfo = (type) => TIPOS_DE_AMBIENTE.find((e) => e.value === type) || { label: type, tone: 'neutral' };

export default function Workspaces() {
  const toast = useToast();
  const { can } = usePermissions();
  const { refreshMe } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formWs, setFormWs] = useState(null);   // { editing? }
  const [formEnv, setFormEnv] = useState(null); // { workspace, editing? }

  const podeEscrever = can('core.workspaces.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listWorkspaces();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function depoisDeSalvar() {
    await load();
    // O seletor da barra de cima vem do `/me` — sem isto ele fica com o nome antigo.
    try { await refreshMe(); } catch { /* não é crítico: a lista já está certa */ }
  }

  const novoWorkspace = podeEscrever && (
    <Button variant="primary" icon="plus" onClick={() => setFormWs({})}>Novo workspace</Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workspaces e ambientes"
        subtitle="Workspaces separam projetos que não devem se misturar; dentro de cada um ficam os ambientes — produção, homologação, desenvolvimento."
        actions={novoWorkspace}
      />

      {loading && !items.length ? (
        <Spinner size="lg" center />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="home"
            title="Nenhum workspace"
            description="Crie o primeiro para começar a separar os projetos. Conexões, fluxos e assistentes pertencem sempre a um workspace e a um ambiente."
            action={novoWorkspace}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((ws) => (
            <Card key={ws.id}>
              <div style={{ padding: 20 }} className="space-y-4">
                <div className="flex items-start gap-3">
                  <span style={{ color: 'var(--su-action)' }}><DSIcon name="home" /></span>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">
                      {ws.name}
                    </p>
                    <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }}>
                      {(ws.environments || []).length === 1 ? '1 ambiente' : `${(ws.environments || []).length} ambientes`}
                    </p>
                  </div>
                  {podeEscrever && (
                    <IconButton
                      icon="edit"
                      title="Renomear este workspace"
                      aria-label={`Renomear o workspace ${ws.name}`}
                      onClick={() => setFormWs({ editing: ws })}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  {(ws.environments || []).map((env) => {
                    const info = tipoInfo(env.type);
                    return (
                      <div
                        key={env.id}
                        className="flex items-center gap-2"
                        style={{ border: '1px solid var(--su-border-default)', borderRadius: 8, padding: '8px 12px' }}
                      >
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--su-text-primary)' }} className="truncate">
                          {env.name || info.label}
                        </span>
                        <Badge tone={info.tone}>{info.label}</Badge>
                        {podeEscrever && (
                          <IconButton
                            icon="edit"
                            title="Renomear este ambiente"
                            aria-label={`Renomear o ambiente ${env.name || info.label}`}
                            onClick={() => setFormEnv({ workspace: ws, editing: env })}
                          />
                        )}
                      </div>
                    );
                  })}
                  {!(ws.environments || []).length && (
                    <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-muted)' }}>
                      Sem ambiente ainda — nada pode ser criado dentro deste workspace até existir um.
                    </p>
                  )}
                </div>

                {podeEscrever && (
                  <Button variant="ghost" icon="plus" onClick={() => setFormEnv({ workspace: ws })}>
                    Adicionar ambiente
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <FormWorkspace
        open={Boolean(formWs)}
        editing={formWs?.editing}
        onClose={() => setFormWs(null)}
        onSaved={() => { setFormWs(null); depoisDeSalvar(); }}
      />
      <FormAmbiente
        open={Boolean(formEnv)}
        workspace={formEnv?.workspace}
        editing={formEnv?.editing}
        onClose={() => setFormEnv(null)}
        onSaved={() => { setFormEnv(null); depoisDeSalvar(); }}
      />
    </div>
  );
}

function FormWorkspace({ open, editing, onClose, onSaved }) {
  const toast = useToast();
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (open) setNome(editing?.name || ''); }, [open, editing]);

  async function salvar() {
    if (!nome.trim()) { toast.error('Dê um nome ao workspace.'); return; }
    setSalvando(true);
    try {
      if (editing) {
        await updateWorkspace(editing.id, { name: nome.trim() });
        toast.success('Workspace renomeado.');
      } else {
        await createWorkspace({ name: nome.trim() });
        toast.success('Workspace criado.');
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
      title={editing ? 'Renomear workspace' : 'Novo workspace'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" disabled={salvando} onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={salvando} onClick={salvar}>Salvar</Button>
        </>
      }
    >
      <Field label="Nome" required hint="Como este projeto é conhecido internamente. Ex.: Atendimento.">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Atendimento" autoFocus />
      </Field>
    </Modal>
  );
}

function FormAmbiente({ open, workspace, editing, onClose, onSaved }) {
  const toast = useToast();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('DEVELOPMENT');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(editing?.name || '');
    setTipo(editing?.type || 'DEVELOPMENT');
  }, [open, editing]);

  async function salvar() {
    setSalvando(true);
    try {
      if (editing) {
        await updateEnvironment(workspace.id, editing.id, { name: nome.trim() || undefined });
        toast.success('Ambiente renomeado.');
      } else {
        await createEnvironment(workspace.id, { name: nome.trim() || undefined, type: tipo });
        toast.success('Ambiente criado.');
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
      title={editing ? `Renomear ambiente — ${workspace?.name || ''}` : `Novo ambiente — ${workspace?.name || ''}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" disabled={salvando} onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={salvando} onClick={salvar}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome" hint="Opcional — sem nome, o ambiente é chamado pelo tipo.">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Produção BR" autoFocus />
        </Field>
        {/* O tipo não aparece na edição porque não muda: um ambiente de produção
            não "vira" desenvolvimento — isso trocaria o significado do que já
            está rodando dentro dele. */}
        {!editing && (
          <Field label="Tipo" required hint="Define o papel do ambiente. Não muda depois de criado.">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_DE_AMBIENTE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
