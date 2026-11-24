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
import { buildRecentHistory } from './connectchat-recent-history';

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
  lines.push('- Instabilidade/quedas do login: SEM DADO (log de conexão ainda não carregado) — NÃO afirme que a conexão caiu nem que não caiu; isso você não verificou.');
  // Histórico recente REAL (OS + chamados), literal e datado; e o registro
  // fechado que deve INFORMAR a conduta. O código entrega os fatos; a Nete
  // interpreta e decide — não é fluxo fixo.
  const history = buildRecentHistory(support.recentOs ?? [], support.recentTickets ?? []);

  // Guardrails determinísticos (bloqueio, incidente, offline); a conduta a partir
  // do histórico é da Nete, com os fatos na frente.
  const hist = support.historyAnalysis;
  const reincidente = hist && !hist.unavailable ? (hist.recurrent || hist.recurrentWithin48h) : history.entries.length >= 2;
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
  if (reincidente) {
    lines.push('- Cliente REINCIDENTE: o sistema detectou registro recente do mesmo tipo. Trate com PRIORIDADE e não repita às cegas o que já foi feito.');
  }
  // O fechamento do registro relevante INFORMA a decisão; quem decide é a Nete.
  // O código não escolhe o caminho — oferece os fatos e as opções plausíveis.
  if (history.driver) {
    const d = history.driver;
    const quando = d.data ? `em ${d.data}` : 'recente';
    const fech = (d.fechamento ?? d.relato ?? '').slice(0, 160);
    const citacao = fech ? ` fechada com: "${fech}"` : ' (sem texto de fechamento registrado)';
    if (history.driverKind === 'CAMPO') {
      lines.push(`- Há ${d.tipo} anterior relevante (${quando})${citacao}. Da última vez a solução foi INTERVENÇÃO DA EQUIPE em campo (troca de equipamento/cabo/sinal). USE isso para decidir como um atendente faria — você NÃO está preso a um caminho: se o acesso está online e o cliente está em casa, pode pedir para ele desligar/ligar o equipamento da tomada e ver se persiste; OU já abrir OS para a equipe verificar, marcando a reincidência. Julgue pelo relato atual. Ao falar com ele, diga a DATA e RESUMA o que foi feito em linguagem simples (ex.: "foi feita a troca de um equipamento") — sem copiar o texto nem citar nome de técnico/código.`);
    } else if (history.driverKind === 'FORA_DA_REDE') {
      lines.push(`- Há ${d.tipo} anterior relevante (${quando})${citacao}. A resolução aponta causa FORA da nossa rede (TV/IPTV/app/equipamento do cliente). Confirme pelo relato atual se é o mesmo caso antes de tratar como problema de rede; se confirmar, conduza por isso. Diga a DATA e resuma em linguagem simples o que foi constatado — sem copiar o texto nem expor detalhe interno.`);
    } else {
      lines.push(`- Há ${d.tipo} anterior relevante (${quando})${citacao}. A resolução não deixa claro o que foi feito: peça a informação que falta para descrever bem antes de decidir a conduta. Diga a DATA e resuma em linguagem simples o que consta, sem copiar o texto e sem completar o que não está escrito.`);
    }
  }
  lines.push('- REGRA DESTE DIAGNÓSTICO: afirme sobre o cliente SÓ o que está escrito aqui. O que não está — quedas, ou o que foi feito num registro sem resolução escrita — você NÃO sabe; não invente nem repita como fato do sistema o que o cliente disse. "Não tenho esse dado" é válido.');
  lines.push('- Na PRIMEIRA resposta, relate com naturalidade só o que está no diagnóstico e conduza. Não acrescente nenhum fato que não esteja aqui.');
  if (history.entries.length) {
    lines.push('- Histórico recente do cliente (ESTE é o real, que você LÊ para ENTENDER; ao falar com o cliente, conte o SENTIDO em linguagem simples, com a DATA, SEM copiar o texto e SEM expor detalhe interno como nome de técnico; não vá além do que está aqui; registros marcados [interno] são de teste/processo e NÃO contam como histórico do cliente):');
    for (const e of history.entries) {
      const data = e.data ?? 'sem data';
      const marca = e.interno ? ' [interno — desconsidere]' : '';
      const rel = e.relato ? ` — relato: "${e.relato.slice(0, 120)}"` : '';
      const fec = e.fechamento
        ? ` — fechamento: "${e.fechamento.slice(0, 120)}"`
        : (e.encerrada ? ' — fechamento: sem texto registrado' : '');
      lines.push(`  - ${data} — ${e.tipo}: ${e.titulo}${marca}${rel}${fec}`);
    }
  }
  return lines.join('\n');
}
