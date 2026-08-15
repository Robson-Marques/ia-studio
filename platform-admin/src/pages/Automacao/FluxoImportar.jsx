import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormScreen, Field, TextArea, useToast } from '@studio-ux-ds/react';
import { importWorkflow } from '../../services/automation';
import { useWorkspace } from '../../context/WorkspaceContext';

// Automação/FluxoImportar — recria um fluxo a partir do arquivo exportado (v0.10.2).
//
// Rota `/automacao/fluxos/importar`. Era Modal `size="lg"` com um TextArea de 12
// linhas de JSON — o caso mais literal da regra do Modal. Como importar CRIA um
// registro, rota é o container certo (e não o inspetor lateral).

export default function FluxoImportar() {
  const navigate = useNavigate();
  const toast = useToast();
  const { workspaceId, environmentId } = useWorkspace();

  const [json, setJson] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleImport() {
    if (!workspaceId || !environmentId) {
      toast.error('Escolha um workspace e um ambiente no topo da tela antes de importar.');
      return;
    }
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      toast.error('O conteúdo colado não é um JSON válido — cole o arquivo exportado inteiro.');
      return;
    }
    setSaving(true);
    try {
      const workflow = await importWorkflow({ workspace_id: workspaceId, environment_id: environmentId, data });
      toast.success('Fluxo importado — confira os passos antes de publicar.');
      navigate(`/automacao/fluxos/${workflow.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen
      title="Importar fluxo"
      subtitle="Recria um fluxo a partir de um arquivo exportado. Ele entra como rascunho — nada dispara antes de você publicar."
      onSubmit={handleImport}
      onCancel={() => navigate('/automacao/fluxos')}
      submitLabel="Importar"
      saving={saving}
    >
      <Field
        label="Conteúdo do arquivo exportado"
        required
        hint="Use o botão Exportar de um fluxo para gerar o arquivo. Ele não carrega senhas nem chaves — as conexões precisam ser escolhidas de novo aqui."
      >
        <TextArea
          rows={18}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder={'{\n  "schema_version": 1,\n  "kind": "iastudio.workflow",\n  ...\n}'}
          style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
        />
      </Field>
    </FormScreen>
  );
}
