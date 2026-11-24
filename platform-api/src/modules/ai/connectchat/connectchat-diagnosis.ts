// Diagnóstico determinístico do atendimento (ConnectChat / Newnet).
//
// Responde UMA pergunta: dado o ESTADO real do cliente no sistema (lido a cada
// turno), QUAL é a conduta deste atendimento. O sistema decide o caminho; o
// modelo relata e conduz por ele. É o oposto de enfeite: cada linha aqui existe
// para MUDAR a ação da Nete. A identidade e os princípios estáveis ficam no
// protocolo (`connectchat-attendance-protocol.ts`); os caminhos por estado moram
// só aqui, para não duplicar.

import type { AttendanceIdentity } from './connectchat-attendance-protocol';
import type { ConnectchatSupportContextService, VerifiedSupportContext } from './connectchat-support-context.service';

type BillingContext = Awaited<ReturnType<ConnectchatSupportContextService['billingForVerifiedConversation']>>;

/** Monta o bloco de estado + o diagnóstico determinístico DESTE cliente. */
export function buildDiagnosis(
  identified: AttendanceIdentity | null,
  support: VerifiedSupportContext | null,
  billing: BillingContext | null,
): string | null {
  if (!identified && !support) return null;
  const str = (r: Record<string, unknown>, k: string): string | null =>
    typeof r[k] === 'string' && (r[k] as string).trim() ? (r[k] as string).trim() : null;
  const lines: string[] = [
    '## Estado do cliente no sistema (memória desta sessão — não é a conversa; recém-lida do IXC)',
  ];
  if (identified) {
    lines.push(`- Titular: ${identified.name}${identified.document ? `, documento ${identified.document}` : ''}`);
  }
  if (!support || support.available === false) {
    lines.push('- Não consegui ler o estado operacional agora; confirme o essencial pelas ferramentas antes de concluir e, se faltar dado crítico, encaminhe para um atendente.');
    return lines.join('\n');
  }
  const conns = support.connections ?? [];
  const online = conns.some((c) => c['online'] === true);
  lines.push(`- Acesso: ${conns.length ? (online ? 'online' : 'offline') : 'sem dado'}`);
  const tecnologia = support.technology;
  lines.push(`- Tecnologia de acesso: ${tecnologia === 'FIBRA' ? 'FIBRA' : tecnologia === 'RADIO' ? 'RÁDIO' : 'sem dado'}`);
  const blocked = (support.blockedContracts ?? 0) > 0;
  lines.push(`- Contrato: ${blocked ? 'BLOQUEADO por inadimplência' : (support.contracts?.length ? 'ativo' : 'sem dado')}`);
  if (billing && billing.available) {
    const inv = billing.invoices ?? [];
    const overdue = inv.filter((b) => b['vencido'] === true).length;
    lines.push(inv.length
      ? `- Financeiro: ${inv.length} boleto(s) em aberto${overdue ? `, ${overdue} vencido(s)` : ''}`
      : '- Financeiro: nenhum boleto em aberto');
  }
  const openOs = support.openOs ?? [];
  lines.push(openOs.length
    ? `- OS aberta: sim${str(openOs[0], 'protocolo') ? ` (protocolo ${str(openOs[0], 'protocolo')})` : ''}`
    : '- OS aberta: não');
  const openTickets = support.openTickets ?? [];
  lines.push(`- Chamado aberto: ${openTickets.length ? 'sim' : 'não'}`);
  const incident = (support.incidents ?? []).find((i) => i.suppress_os) ?? (support.incidents ?? [])[0];
  lines.push(incident
    ? `- Incidente na região: sim — ${String(incident.message ?? incident.title ?? 'ocorrência registrada').slice(0, 160)}`
    : '- Incidente na região: não');
  const recent = [...openTickets, ...(support.recentTickets ?? [])].slice(0, 5);

  // Diagnóstico determinístico: o SISTEMA decide o caminho; o modelo RELATA e
  // conduz por ele, não escolhe outro.
  const hist = support.historyAnalysis;
  const reincidente = hist && !hist.unavailable ? (hist.recurrent || hist.recurrentWithin48h) : recent.length >= 2;
  const radio = tecnologia === 'RADIO';
  const fibra = tecnologia === 'FIBRA';
  const temOsAberta = openOs.length > 0 || openTickets.length > 0;
  lines.push('');
  lines.push('## Diagnóstico (determinístico — RELATE ao cliente e siga este caminho; não escolha outro)');
  if (blocked) {
    lines.push('- Contrato BLOQUEADO por inadimplência: trate pelo financeiro (desbloqueio de confiança quando permitido, 2ª via ou link). NÃO trate como problema técnico nem abra OS.');
  } else if (incident && incident.suppress_os) {
    lines.push('- INCIDENTE na região cobrindo este cliente: informe a manutenção (e a previsão, se houver). NÃO abra OS.');
  } else if (!online) {
    lines.push(`- Acesso OFFLINE, sem bloqueio: a CONEXÃO está offline — diga isso a ele ("vi aqui que sua conexão está offline"), ele não precisa provar nada. NÃO peça "desliga e liga" (reinício não resolve quem está offline). Entenda o porquê (pode ser estrutura/rede externa — confira incidente). Pergunte se ele está EM CASA e consegue conferir se os equipamentos estão ligados (luzes/cabos) e mandar uma FOTO.${radio ? ' É cliente de RÁDIO: há o rádio no poste/torre além do roteador — os dois precisam estar ligados.' : fibra ? ' É cliente de FIBRA: confira a luz/sinal da ONU.' : ''} Se não for algo simples no local, abra OS para a equipe verificar a estrutura/sinal.`);
  } else {
    lines.push(`- Acesso ONLINE, sem bloqueio: a causa costuma ser local (roteador/aparelho).${radio ? ' Como é RÁDIO, considere também o rádio no poste/torre.' : ''} Aqui cabe um reinício: você pode REINICIAR A CONEXÃO pelo sistema (reiniciar_conexao); se for pedir ao cliente para reiniciar o equipamento, confirme antes que ele está em casa e consegue agora ("consegue desligar o roteador uns 30s pra gente acompanhar?"). Se persistir, abra OS.`);
  }
  if (temOsAberta) {
    lines.push('- Já existe OS/chamado aberto deste cliente: ACOMPANHE o existente, não duplique. Se o cliente disser que NORMALIZOU/voltou, confirme e ENCERRE o chamado (ferramenta de encerramento), registrando que ele confirmou a solução; se houver mais de uma O.S. aberta, pergunte qual antes.');
  }
  const resolTxt = [...(hist?.previousResolutionHints ?? []), ...(support.recurrenceEvidence ?? [])].join(' ').toLowerCase();
  const foraDaRede = /iptv|\btv\b|televis|aplicativo|\bapp\b|streaming|smart ?tv|aparelho do cliente|equipamento do cliente|roteador pr[oó]prio|sem garantia/.test(resolTxt);
  if (reincidente) {
    lines.push('- Cliente REINCIDENTE no mesmo problema. NÃO repita às cegas o passo que já foi tentado: leia a RESOLUÇÃO dos chamados anteriores (abaixo) e conduza por ela. Se o mesmo procedimento já falhou antes, ESCALE / abra OS marcando reincidência, em vez de mandar o mesmo de novo.');
  }
  if (foraDaRede) {
    lines.push('- ATENÇÃO (histórico): a causa já identificada antes aponta FORA da rede (TV/IPTV/app/equipamento do cliente). Conduza por isso — não trate como problema da internet nem repita reinício de roteador por padrão.');
  }
  if (hist && hist.previousResolutionHints && hist.previousResolutionHints.length) {
    lines.push(`- O que já resolveu antes (USE para decidir a conduta, não só mencione): ${hist.previousResolutionHints.slice(0, 3).join(' | ').slice(0, 300)}`);
  }
  if (support.recurrenceEvidence && support.recurrenceEvidence.length) {
    lines.push(`- Histórico semelhante: ${support.recurrenceEvidence.slice(0, 3).join(' | ').slice(0, 300)}`);
  }
  lines.push('- Na PRIMEIRA resposta, relate com naturalidade só o essencial do que você viu e já conduza pela análise. Não despeje dado nem pule o diagnóstico.');
  if (recent.length) {
    lines.push('- Chamados recentes (leia a resolução para conduzir):');
    for (const t of recent) {
      const data = str(t, 'aberto_em') ?? str(t, 'encerrado_em') ?? '';
      const titulo = str(t, 'titulo') ?? 'chamado';
      const sit = str(t, 'situacao_interna') ?? str(t, 'status') ?? '';
      const pedido = str(t, 'descricao');
      const resol = str(t, 'resolucao');
      lines.push(`  - ${data ? data + ' — ' : ''}${titulo}${sit ? ` (${sit})` : ''}${pedido ? ` — pedido: ${pedido.slice(0, 120)}` : ''}${resol ? ` — resolução: ${resol.slice(0, 120)}` : ''}`);
    }
  }
  return lines.join('\n');
}
