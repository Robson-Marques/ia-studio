import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormScreen, Field, Input, NumericInput, useToast } from '@studio-ux-ds/react';
import { getConnection, getMarketplace, updateConnection } from '../../services/integrations';
import { ConnectionField, WebhookUrlBox } from './ConnectionFields';
import { prettifyProviderKey } from './integration.constants';

// Integrações/ConexaoEditar — nome, etiquetas, prioridade e credenciais de uma
// conexão (v0.10.11). Rota `/integracoes/conexoes/:id/editar`; era um Modal `lg`.
//
// Virou rota pelo mesmo motivo da tela de detalhe, com um agravante: **é o
// formulário onde se digita credencial**. Um modal que fecha por clique fora com
// uma chave de API meio digitada é uma perda silenciosa — e o legado precisava
// desligar o `dismissable` justamente por isso, o que já era o sintoma.
//
// Regra dos secretos: o cofre nunca devolve o valor guardado, então o campo
// nasce vazio e **vazio significa "manter o que está lá"**, não "apagar". Quem
// diz isso ao usuário é o `ConnectionField` (dica + placeholder) — sem esse
// aviso, o campo em branco parece uma credencial que sumiu.

export default function ConexaoEditar() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [conexao, setConexao] = useState(null);
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState('');
  const [etiquetas, setEtiquetas] = useState('');
  const [prioridade, setPrioridade] = useState(0);
  const [valores, setValores] = useState({});

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const conn = await getConnection(id);
        if (cancelado) return;
        setConexao(conn);
        setNome(conn.name || '');
        setEtiquetas((conn.tags || []).join(', '));
        setPrioridade(conn.priority ?? 0);
        // Pré-preenche só o que NÃO é secreto — o cofre não devolve o resto.
        setValores({ ...(conn.config || {}) });
        const { items } = await getMarketplace();
        if (cancelado) return;
        const provider = items.find((i) => i.key === conn.provider_key);
        setSchema(provider?.wizard_schema || { steps: [] });
      } catch (err) {
        if (cancelado) return;
        toast.error(err.message);
        navigate('/integracoes/conexoes', { replace: true });
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const campos = useMemo(() => (schema?.steps || []).flatMap((s) => s.fields || []), [schema]);
  const temGeravel = campos.some((f) => f.generatable);

  async function handleSave() {
    if (!nome.trim()) { toast.error('Dê um nome para a conexão.'); return; }
    setSalvando(true);
    try {
      const config = {};
      const secrets = {};
      campos.forEach((f) => {
        const bruto = valores[f.key];
        const secreto = f.secret || f.type === 'password';
        if (secreto) {
          // Só envia o secreto quando foi preenchido — vazio mantém o atual.
          if (bruto !== undefined && String(bruto).trim() !== '') secrets[f.key] = String(bruto);
        } else if (bruto !== undefined) {
          config[f.key] = f.type === 'number' && bruto !== '' ? Number(bruto) : bruto;
        }
      });
      const body = {
        name: nome.trim(),
        tags: etiquetas.split(',').map((t) => t.trim()).filter(Boolean),
        priority: Number(prioridade) || 0,
        config,
      };
      if (Object.keys(secrets).length) body.secrets = secrets;
      await updateConnection(id, body);
      toast.success('Conexão salva. Use “Testar” para conferir se as credenciais funcionam.');
      navigate(`/integracoes/conexoes/${id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!conexao) return null;

  return (
    <FormScreen
      back={{ label: 'Voltar para a conexão', onClick: () => navigate(`/integracoes/conexoes/${id}`) }}
      title={`Editar — ${conexao.name}`}
      subtitle={prettifyProviderKey(conexao.provider_key)}
      loading={loading}
      saving={salvando}
      onSubmit={handleSave}
      onCancel={() => navigate(`/integracoes/conexoes/${id}`)}
    >
      {/* Largura de leitura é decisão de quem põe o formulário na tela — o
          FormGrid/molde distribui, não limita (lição do DS v1.2.36). */}
      <div style={{ maxWidth: 720 }} className="space-y-4">
          <Field label="Nome da conexão" required hint="É por este nome que ela aparece nas listas e na configuração de fluxos.">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus name="conn-nome" autoComplete="off" />
          </Field>
          <Field label="Etiquetas" hint="Separadas por vírgula. Servem para achar e agrupar. Ex.: Financeiro, Comercial">
            <Input value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} name="conn-etiquetas" autoComplete="off" />
          </Field>
          <Field label="Prioridade" hint="Quando há mais de uma conexão do mesmo conector, a de maior prioridade é usada primeiro.">
            <NumericInput value={prioridade} onChange={setPrioridade} min={0} step={1} />
          </Field>

        {campos.length > 0 && (
          <div className="space-y-4" style={{ borderTop: '1px solid var(--su-border-subtle)', paddingTop: 'var(--su-space-5)' }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>Credenciais</h2>
            <p style={{ fontSize: 12, margin: '4px 0 0', color: 'var(--su-text-muted)' }}>
              Os campos secretos vêm em branco porque o cofre não devolve o que guardou. Deixe em branco para manter o
              que já está lá; preencha só o que quiser trocar.
            </p>
          </div>
          {campos.map((field) => (
            <ConnectionField
              key={field.key}
              field={field}
              value={valores[field.key]}
              onChange={(v) => setValores((prev) => ({ ...prev, [field.key]: v }))}
              namePrefix={`edit-${conexao.provider_key}`}
              editing
            />
          ))}
          {schema?.webhookPath && temGeravel && <WebhookUrlBox webhookPath={schema.webhookPath} />}
          </div>
        )}
      </div>
    </FormScreen>
  );
}
