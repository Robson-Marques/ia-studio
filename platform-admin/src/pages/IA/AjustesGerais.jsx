import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CatalogTab, McpTab } from './Ferramentas';
import Memoria from './Memoria';

// IA/AjustesGerais — consolida os ajustes avançados dos assistentes numa entrada
// só do menu, com abas (porte da direção do Aquapark, que junta Ferramentas +
// governança em "Ajustes gerais"). Aqui as abas são Habilidades (catálogo de
// ferramentas), Servidores MCP e Memória — telas de configuração que os
// assistentes usam por baixo, tiradas do primeiro nível do menu.
//
// Reaproveita as sub-telas existentes: `CatalogTab`/`McpTab` (exportadas da
// Ferramentas) e a `Memoria`, cada uma renderizando a própria ListScreen com os
// segments compartilhados. As rotas antigas (/ia/ferramentas, /ia/memoria)
// redirecionam pra cá; os editores (tool, perfil de memória) seguem intactos.

const TITLE = 'Ajustes gerais';
const SEGMENTS = [
  { id: 'habilidades', label: 'Habilidades' },
  { id: 'mcp',         label: 'Servidores MCP' },
  { id: 'memoria',     label: 'Memória' },
];
const VALID = new Set(SEGMENTS.map((s) => s.id));
const SUBTITLES = {
  habilidades: 'O que os assistentes podem fazer — habilidades da plataforma, personalizadas e importadas de servidores MCP.',
  mcp:         'Servidores MCP que trazem habilidades externas para os assistentes.',
  memoria:     'O que os assistentes lembram, por escopo (sessão / contato / fluxo / assistente), com validade e limite de itens.',
};

export default function AjustesGerais() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(() => (VALID.has(params.get('tab')) ? params.get('tab') : 'habilidades'));

  const onSegment = (id) => {
    setTab(id);
    setParams((p) => { p.set('tab', id); return p; }, { replace: true });
  };
  const shared = { seg: { segments: SEGMENTS, segment: tab, onSegment }, title: TITLE, subtitle: SUBTITLES[tab] };

  if (tab === 'mcp') return <McpTab {...shared} />;
  if (tab === 'memoria') return <Memoria {...shared} />;
  return <CatalogTab {...shared} />;
}
