import React from 'react';
import { Badge } from '@studio-ux-ds/react';
import { WORKFLOW_STATUS } from './automation.constants';
import { statusToTone } from '../../lib/tone';

// Situação do fluxo (Rascunho / Publicado / Arquivado) como Badge do DS.
//
// Morava dentro de `Fluxos.jsx` e era importado de lá pelo editor em lista e pelo
// canvas — três telas dependendo de um componente exportado por uma **página**.
// Página é ponto de entrada de rota, não módulo de biblioteca: quem importa dela
// arrasta o arquivo inteiro (e todos os imports dele) por causa de 4 linhas.
// Arquivo próprio, uma responsabilidade.
export default function WorkflowStatusBadge({ status }) {
  const info = WORKFLOW_STATUS[status] || { label: status, variant: 'gray' };
  return <Badge tone={statusToTone(info.variant)}>{info.label}</Badge>;
}
