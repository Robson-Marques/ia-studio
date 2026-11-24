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
  const multiplosAtivos = conns.length > 1;
  const online = conns.some((c) => c['online'] === true);
  lines.push(`- Acesso: ${multiplosAtivos ? `MÚLTIPLOS logins ativos (${conns.length})` : conns.length ? (online ? 'online' : 'offline') : 'sem dado'}`);
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
  const link = support.linkHistory;
  if (!link || !link.available) {
    lines.push('- Quedas do login: SEM DADO (não foi possível ler o log de conexão agora) — NÃO afirme que caiu nem que não caiu.');
  } else if (link.anomalia) {
    lines.push(`- Quedas/instabilidade do login: SIM — há anomalia real registrada no log. PARA O CLIENTE: diga apenas que verificou uma anomalia/instabilidade na conexão dele; NUNCA passe números, horários ou quantidade. (Só para a OS: quedas 24h=${link.quedas24h}, 7d=${link.quedas7d}${link.ultimoMotivo ? `, último motivo técnico "${link.ultimoMotivo}"` : ''}.)`);
  } else {
    lines.push('- Quedas/instabilidade do login: sem quedas recentes registradas no log. Se o cliente disser que cai, você pode dizer que não vê quedas recentes no sistema — não invente instabilidade.');
  }

  // Histórico recente REAL (OS + chamados), literal e datado, que a Nete LÊ para
  // entender e sintetizar. O código entrega os fatos; a decisão é dela.
  const history = buildRecentHistory(support.recentOs ?? [], support.recentTickets ?? []);
  const now = Date.now();
  const dentro30d = (value: string | null): boolean => {
    const t = Date.parse(value ?? '');
    return Number.isFinite(t) && t <= now && now - t <= 30 * 86_400_000;
  };
  const reincidencias30d = history.entries.filter((e) => !e.interno && dentro30d(e.data)).length;
  const reincidente = reincidencias30d >= 2;
  const radio = tecnologia === 'RADIO';
  const fibra = tecnologia === 'FIBRA';
  const temOsAberta = openOs.length > 0 || openTickets.length > 0;

  lines.push('');
  lines.push('## Diagnóstico (determinístico — o sistema decide o CAMINHO; você conduz, interpreta e decide dentro dele)');

  // Múltiplos logins ativos: sem análise possível — OS simples + atendente.
  if (multiplosAtivos) {
    lines.push('- MÚLTIPLOS contratos/logins ATIVOS: você NÃO consegue saber a qual a pessoa se refere, então NÃO faça análise (nada de quedas, reinício, histórico, tecnologia). Abra uma OS SIMPLES e encaminhe para um atendente. Na descrição da OS, registre o MOTIVO do contato dito pelo cliente e a nota de que, por haver múltiplos cadastros ativos, não foi possível identificar a qual ele se referia (se ele disser qual instalação/endereço, inclua). Ao cliente, de forma simples e gentil: você viu que ele tem mais de um contrato, já abriu um chamado e em breve um atendente entra em contato para confirmar qual instalação/contrato — porque por aqui você não consegue visualizar. Seco; não encha de perguntas.');
    return lines.join('\n');
  }

  if (blocked) {
    lines.push('- Contrato BLOQUEADO por inadimplência: trate pelo financeiro (desbloqueio de confiança quando permitido, 2ª via ou link). NÃO trate como problema técnico nem abra OS.');
  } else if (incident && incident.suppress_os) {
    lines.push('- INCIDENTE na região cobrindo este cliente: informe a manutenção (e a previsão, se houver). NÃO abra OS.');
  } else if (!online) {
    lines.push(`- Acesso OFFLINE, sem bloqueio: a CONEXÃO está offline — diga isso a ele ("vi aqui que sua conexão está offline"), ele não precisa provar nada. NÃO peça "desliga e liga" (reinício não resolve quem está offline). Entenda o porquê (pode ser estrutura/rede externa — confira incidente). Pergunte se ele está EM CASA e consegue conferir se os equipamentos estão ligados (luzes/cabos) e mandar uma FOTO.${radio ? ' É cliente de RÁDIO: há o rádio no poste/torre além do roteador — os dois precisam estar ligados.' : fibra ? ' É cliente de FIBRA: confira a luz/sinal da ONU.' : ''} Se não for algo simples no local, abra OS para a equipe verificar a estrutura/sinal e encaminhe.`);
  } else {
    lines.push(`- Acesso ONLINE, sem bloqueio.${link && link.available && link.anomalia ? ' Há anomalia/instabilidade registrada no log: PRIMEIRO informe ao cliente que você verificou uma anomalia na conexão dele (sem números).' : ' A causa costuma ser local (roteador/aparelho).'}${radio ? ' Como é RÁDIO, considere também o rádio no poste/torre.' : ''} DEPOIS de relatar o que verificou (incluindo, se houver, o que foi feito no atendimento anterior), peça ao cliente para desligar o equipamento da tomada uns 30s e religar, para ver se normaliza — confirmando antes que ele está EM CASA e consegue agora. Se ele NÃO puder, ou NÃO resolver, abra OS e encaminhe para a equipe técnica. (Reinício pelo sistema está indisponível por ora — não prometa "reiniciar por aqui"; quem reinicia o equipamento é o cliente.)`);
  }

  if (temOsAberta) {
    lines.push('- Já existe OS/chamado aberto deste cliente: ACOMPANHE o existente, não duplique. Se o cliente disser que NORMALIZOU/voltou, confirme e ENCERRE o chamado (ferramenta de encerramento), registrando que ele confirmou a solução; se houver mais de uma O.S. aberta, pergunte qual antes.');
  }
  if (reincidente) {
    lines.push(`- Cliente REINCIDENTE: ${reincidencias30d} atendimentos relacionados nos últimos 30 dias. Trate com PRIORIDADE e não repita às cegas o que já foi feito; registre a reincidência na OS.`);
  }

  // O fechamento do registro relevante INFORMA a decisão (e vai na OS); quem decide é a Nete.
  if (history.driver) {
    const d = history.driver;
    const quando = d.data ? `em ${d.data}` : 'recente';
    if (history.driverKind === 'CAMPO') {
      lines.push(`- Registro anterior relevante (${quando}): da última vez a solução foi INTERVENÇÃO DA EQUIPE em campo (troca de equipamento/cabo/sinal). Ao cliente, resuma em linguagem simples (ex.: "da última vez foi feita a troca de um equipamento"), com a data — sem copiar o texto nem citar técnico/código. Use na decisão: pode valer o religar do equipamento antes, ou já abrir OS marcando a reincidência; você julga.`);
    } else if (history.driverKind === 'FORA_DA_REDE') {
      lines.push(`- Registro anterior relevante (${quando}): a resolução aponta causa FORA da nossa rede (TV/IPTV/app/equipamento do cliente). Confirme pelo relato atual se é o mesmo caso antes de tratar como problema de rede. Ao cliente, resuma simples o que foi, com a data — sem copiar nem expor interno.`);
    } else {
      lines.push(`- Registro anterior relevante (${quando}): a resolução não deixa claro o que foi feito. Ao cliente, resuma simples o que consta (com a data), sem completar o que não está escrito.`);
    }
  }

  lines.push('- REGRA DESTE DIAGNÓSTICO: afirme sobre o cliente SÓ o que está escrito aqui. O que não está — você NÃO sabe; não invente nem repita como fato do sistema o que o cliente disse. "Não tenho esse dado" é válido.');
  lines.push('- NA PRIMEIRA resposta, RELATE com naturalidade o que você verificou no sistema (online/offline; a anomalia, se houver; e o que foi feito no atendimento anterior, se for relevante ao caso de hoje) e conduza a partir disso. Relatar o que encontrou NÃO é opcional — NÃO vá direto para "reinicie o equipamento" sem antes dizer o que viu. Fale simples e interpretado, SEM dado interno (números de quedas, horários, nome de técnico, código, ID ou trecho copiado do sistema).');
  lines.push('- PARA A ORDEM DE SERVIÇO (quando abrir — detalhe ao técnico, SINTETIZADO): escreva um resumo que o técnico entenda — o motivo do contato de hoje; a EVOLUÇÃO dos atendimentos dos últimos 30 dias (quantos houve, o que ocorreu em cada e como o último foi resolvido), resumindo o que aconteceu ENTRE eles sem transcrever fechamento (inclua atualizações/ausências do cliente quando houver); e, havendo anomalia, o resumo das quedas de conexão. É COMPREENSÃO, não recorte: nada de colar trechos entre aspas. Todo esse detalhe vai só na OS — ao cliente, o mínimo.');

  if (history.entries.length) {
    lines.push('- Histórico recente do cliente (você LÊ para ENTENDER e sintetizar; registros [interno] são teste/processo e NÃO contam):');
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
