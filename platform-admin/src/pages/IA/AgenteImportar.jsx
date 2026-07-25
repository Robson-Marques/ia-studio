import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHeader, Card, Field, TextArea, Button, useToast,
} from '@studio-ux-ds/react';
import { importAgent } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';

// IA/AgenteImportar — importar assistente de um arquivo exportado (v0.9.90).
// Promovido a rota: era um Modal com TextArea de 12 linhas para colar o JSON —
// a regra do Modal do DS (v1.2.12) manda escrita/colagem longa para tela
// dedicada.
//
// Rota: /ia/agentes/importar

export default function AgenteImportar() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();

  const canWrite = can('ai.agents.write');

  const [json, setJson] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleImport() {
    if (!canWrite) { toast.error('Sem permissão.'); return; }
    if (!workspaceId || !environmentId) { toast.error('Selecione um workspace e um ambiente no topo.'); return; }
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      toast.error('Conteúdo inválido — cole o arquivo exportado de um assistente.');
      return;
    }
    setSaving(true);
    try {
      const saved = await importAgent({ workspace_id: workspaceId, environment_id: environmentId, data });
      toast.success('Assistente importado.');
      // Abre o assistente importado pra revisão (o próximo passo natural).
      if (saved?.id) navigate(`/ia/agentes/${saved.id}`);
      else navigate('/ia/agentes');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar assistente"
        subtitle="Recria um assistente a partir do arquivo gerado pela ação Exportar."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/ia/agentes')} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={!canWrite}
              loading={saving}
              icon="check"
            >
              {saving ? 'Importando…' : 'Importar'}
            </Button>
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }}>
          <Field
            label="Conteúdo do arquivo exportado"
            hint="Abra o arquivo .json baixado na ação Exportar e cole o conteúdo inteiro aqui. Segredos não viajam no arquivo — a conexão de IA precisa ser escolhida de novo depois."
          >
            <TextArea
              rows={18}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              placeholder='{"schema_version":1,"kind":"iastudio.agent",...}'
              style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}
