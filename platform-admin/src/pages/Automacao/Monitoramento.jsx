import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Execucoes from './Execucoes';
import Eventos from './Eventos';
import Notificacoes from './Notificacoes';

// Automação/Monitoramento — consolida Execuções + Eventos + Notificações numa
// entrada só do menu, com abas (segments do molde). São telas de observação/
// diagnóstico; juntá-las enxuga a navegação (porte da direção do Aquapark).
// Cada aba é a tela existente renderizada com o padrão de segments já usado em
// Agendamentos/Usuários (a filha espalha `{...seg}` na própria ListScreen). As
// rotas antigas (/automacao/execucoes|eventos|notificacoes) redirecionam pra cá.

const SEGMENTS = [
  { id: 'execucoes', label: 'Execuções' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'notificacoes', label: 'Notificações' },
];
const VALID = new Set(SEGMENTS.map((s) => s.id));

export default function Monitoramento() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(() => (VALID.has(params.get('tab')) ? params.get('tab') : 'execucoes'));

  const onSegment = (id) => {
    setTab(id);
    setParams((p) => { p.set('tab', id); return p; }, { replace: true });
  };
  const seg = { segments: SEGMENTS, segment: tab, onSegment };

  if (tab === 'eventos') return <Eventos seg={seg} />;
  if (tab === 'notificacoes') return <Notificacoes seg={seg} />;
  return <Execucoes seg={seg} />;
}
