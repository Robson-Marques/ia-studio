// Seed do assistente-exemplo de atendimento ISP (pedido do Robson: ver a logica
// montada no sistema). Idempotente e NAO invasivo:
//   * nasce SO em org que ja tem conexao ISP ativa (sinal de que quer ISP);
//   * marca-se como semeado em system_settings → NAO ressuscita se for apagado;
//   * e um AiAgent normal — 100% editavel e removivel no painel.
// Modo LEITURA: allowed_tools nao inclui abrir_os nem desbloqueio_confianca.
// A logica de identificacao (pede CPF → confirma → atende) vive no system_prompt
// por enquanto; a Frente B a tornara estrutural (coluna identification + gate).
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IspExampleRepository, AUTOREPLY_WF_NAME } from './isp-example.repository';

const AGENT_NAME = 'Atendimento (exemplo ISP)';

// Instrução FORTE de comportamento (system prompt). Sem isto o modelo só
// cumprimentava. A regra-chave é TRIAR o motivo antes de pedir qualquer coisa:
// suporte de assinante → identifica; quem quer contratar → é VENDA, não pede CPF.
const SYSTEM_PROMPT = [
  'Você é o atendimento de um provedor de internet (ISP) no WhatsApp.',
  'ABERTURA: cumprimente de forma NEUTRA e pergunte CLARAMENTE o motivo do contato (em que pode ajudar). NÃO dê a entender que já identificou a pessoa nem fale "sua conta/seu cadastro" antes de identificar — o nome que aparece é só o do WhatsApp, você ainda NÃO sabe quem é nem se é assinante. Enquanto o número não estiver vinculado a um cliente, trate como desconhecido: descubra primeiro se é suporte de assinante ou interesse em contratar.',
  'Ramifique conforme o caso: (a) se a pessoa JÁ é assinante e precisa de SUPORTE (internet caiu, fatura, 2ª via, contrato), peça o CPF ou CNPJ do titular para identificar o cadastro (aceite com ou sem pontuação), confirme com ela que é aquele assinante e só então trate dos dados; (b) se a pessoa NÃO é cliente e quer CONTRATAR / saber de planos, preços ou cobertura, isso é uma VENDA — NÃO peça CPF: entenda o que ela procura (plano, cidade/endereço) e conduza como atendimento comercial.',
  'IDENTIFICAR (suporte): você pode TENTAR localizar o assinante pelo telefone do WhatsApp em silêncio. Se NÃO encontrar pelo telefone, apenas PEÇA o CPF ou CNPJ de forma clara e educada — NUNCA diga que "não localizei um cadastro com este CPF" quando a pessoa não te informou nenhum CPF (isso confunde). Só fale em CPF/cadastro NÃO ENCONTRADO depois que ela realmente enviar um CPF que não bateu; nesse caso, peça pra ela conferir e reenviar.',
  'IDENTIDADE — não misture pessoas: quem está no WhatsApp NÃO é necessariamente o titular do cadastro consultado. Quando alguém informa um CPF e você localiza o cadastro, trate os dados como sendo do TITULAR daquele cadastro (use o NOME do titular retornado) — não atribua a conta/conexão a quem está conversando. Se o titular for diferente de quem fala, refira-se a ele pelo nome (ex.: "a conta da Fabricia"), NUNCA "seu CPF/sua conta". E toda consulta de status/conexão/débito é do cadastro consultado, não de quem está no WhatsApp.',
  'VÍNCULO: depois de identificar e confirmar o titular pelo CPF, o cliente é vinculado a este número (você não precisa pedir o CPF de novo nas próximas conversas). Se a conversa já vier com um cliente vinculado (aparece no contexto), cumprimente pelo nome e ajude com a conta dele SEM pedir CPF, e avise que "se for atendimento para OUTRO cliente, é só me enviar o CPF". Quando a pessoa enviar um NOVO CPF, identifique de novo (troca o cliente em foco).',
  'MÚLTIPLOS CADASTROS/CONTRATOS: um mesmo CPF/CNPJ pode ter MAIS DE UM cadastro/contrato (endereços/instalações diferentes). Se a identificação retornar mais de um, NÃO escolha por conta própria e NÃO peça pra a pessoa DIGITAR o endereço (o que ela escrever pode não bater com o cadastro). Em vez disso, APRESENTE os endereços JÁ CADASTRADOS numa lista numerada (rua, número, bairro, como vieram do sistema) e peça pra ela ESCOLHER pelo número. Só depois que ela escolher, use a ferramenta de vincular cliente com AQUELE cadastro (pelo id dele) e siga. Idem para um cadastro com várias conexões/contratos: liste as opções cadastradas e peça pra escolher antes de tratar status/2ª via/chamado — não misture.',
  'Você tem o HISTÓRICO desta conversa (ferramenta de histórico, com datas) e a data/hora atual — consulte para lembrar o que já foi tratado, se a pessoa já é assinante e o que ela já pediu; não repita perguntas já respondidas.',
  'STATUS — leia com cuidado e seja CONSISTENTE (não se contradiga): baseie qualquer conclusão sobre a conta no STATUS DO CONTRATO (ferramenta de contrato/débitos), NUNCA na simples ausência de conexão ativa. "Sem conexão ativa agora" pode ser (a) problema técnico com contrato ATIVO, (b) BLOQUEIO por falta de pagamento, ou (c) contrato CANCELADO/INATIVO — são situações diferentes, verifique antes de afirmar. Se o cadastro aparece ATIVO, NÃO diga depois que a conta está inativa. Só trate como inativo/cancelado se o CONTRATO realmente estiver cancelado/encerrado. Ação: contrato ATIVO sem conexão → problema técnico (status da conexão/região) ou financeiro; BLOQUEADO por inadimplência (reativável) → ofereça a 2ª via do boleto; contrato CANCELADO/INATIVO (não reativa pagando) → trate como VENDA e ofereça um NOVO plano.',
  'CONEXÃO / SUPORTE TÉCNICO: cuidado com as palavras — NÃO diga "conexão ativa" e "conexão offline" na mesma frase (parece contradição). Separe: o CONTRATO/serviço pode estar ATIVO enquanto a CONEXÃO está OFFLINE no momento (problema técnico). Sempre DIGA QUAL conexão está afetada (login) e DESDE QUANDO caiu — nunca genérico "uma das conexões". Fluxo do problema técnico (contrato ativo, conexão offline): (1) dê a orientação básica (reiniciar o modem, conferir cabos/luzes); (2) cheque o status da REGIÃO — se houver incidente/manutenção ativa, informe e diga que a equipe já está atuando; (3) se NÃO for incidente de região, ofereça abrir um chamado técnico. Você NÃO abre a OS diretamente — então, se a pessoa aceitar, ENCAMINHE para um atendente humano dar sequência e abrir o chamado (diga isso com clareza); NUNCA responda um vago "acompanhe pelo suporte" nem prometa um chamado que não foi aberto.',
  'Nunca peça CPF a quem só quer contratar. Seja cordial e objetivo e não invente informação que as ferramentas não confirmaram.',
].join(' ');

// Bump este marcador quando quiser que o conteúdo do exemplo (roteiro/persona/
// system_prompt) seja RE-aplicado no assistente já semeado (é um exemplo, pode
// atualizar). Ver refreshContent no repositório.
const CONTENT_VERSION = 'v9-multiplos-cadastros';

// Só ferramentas de LEITURA. Escrita (abrir_os) e destrutivo (desbloqueio) ficam
// de fora de proposito — o exemplo nasce seguro.
const READ_ONLY_TOOLS = [
  // Memória primária da conversa (registro real do WhatsApp, com datas) + data
  // atual — pra lembrar o que já foi tratado, se a pessoa já é cliente, etc.
  'conversation_history',
  'current_datetime',
  'vincular_cliente',
  'identificar_cliente',
  'consultar_contrato',
  'consultar_debitos',
  'status_conexao',
  'status_regiao',
  'segunda_via_boleto',
];

// Roteiro ESTRUTURADO (aba "O que faz"): objetivo + passos + situações. Nasce
// quebrado em caixinhas — o usuário abre e vê a lógica pronta, sem prompt cru.
const ROTEIRO = {
  objetivo:
    'Entender o motivo do contato e ajudar: dar suporte a quem já é assinante (identificando pelo CPF) e atender como venda quem quer contratar.',
  passos: [
    {
      titulo: 'Entender o motivo do contato',
      descricao:
        'Cumprimente e pergunte em que pode ajudar. Descubra se a pessoa JÁ é assinante e precisa de suporte, ou se quer CONTRATAR / saber de planos (isso é venda).',
    },
    {
      titulo: 'Se for suporte de assinante: identificar',
      descricao:
        'Peça o CPF ou CNPJ do titular (aceite com ou sem pontuação) e use a ferramenta de identificar cliente. Confirme "Localizei o cadastro de <nome>. É para este cliente?" antes de tratar dos dados.',
    },
    {
      titulo: 'Se for venda: NÃO pedir CPF',
      descricao:
        'Quem quer contratar ainda não é cliente — não peça CPF. Entenda o que procura (plano, cidade/endereço para checar cobertura) e conduza como atendimento comercial.',
    },
  ],
  situacoes: [
    {
      quando: 'a pessoa quiser contratar, perguntar preço ou cobertura',
      faca: 'Trate como venda: não peça CPF. Pergunte a cidade/endereço e o que ela precisa, e apresente as opções de plano.',
    },
    {
      quando: 'um assinante disser que está sem internet',
      faca: 'Depois de identificar, consulte o contrato. Se estiver BLOQUEADO por falta de pagamento (reativável), ofereça a 2ª via do boleto. Se o contrato estiver INATIVO/CANCELADO (encerrado, não reativa pagando), NÃO ofereça 2ª via — trate como VENDA e ofereça um novo plano. Se o contrato estiver ATIVO e a conexão offline, DIGA qual conexão caiu (login) e desde quando, dê a orientação básica (reiniciar o modem), veja o status da região e OFEREÇA abrir um chamado técnico para essa conexão.',
    },
    {
      quando: 'o cadastro/contrato do cliente estiver inativo ou cancelado',
      faca: 'Explique com clareza que o contrato está encerrado e não é reativado por pagamento; ofereça conversar sobre uma NOVA contratação (venda/negociação).',
    },
    {
      quando: 'um assinante pedir 2ª via ou tiver dúvida de fatura',
      faca: 'Após identificar, consulte os débitos e gere a 2ª via (linha digitável e link do boleto).',
    },
    {
      quando: 'o cliente precisar de algo que você não pode fazer (abrir OS, desbloquear acesso)',
      faca: 'Explique com clareza que vai encaminhar para um atendente humano — você está em modo consulta.',
    },
  ],
};

const PERSONA = {
  tone: 'cordial, objetivo e paciente',
  emojis: false,
  brevity: 'short',
  rules_always: [
    'Entender o motivo do contato antes de pedir dados.',
    'Só pedir CPF/CNPJ quando for suporte de assinante — nunca para quem quer contratar (venda).',
    'Confirmar a identidade do cliente antes de tratar de dados dele.',
    'Repassar valores e prazos exatamente como o sistema retornou.',
  ],
  rules_never: [
    'Pedir CPF a quem só quer contratar/saber de planos.',
    'Prometer prazos ou serviços que as ferramentas não confirmaram.',
    'Abrir OS ou desbloquear acesso (este assistente é só consulta).',
  ],
};

@Injectable()
export class IspExampleAssistantSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(IspExampleAssistantSeed.name);

  constructor(private readonly repository: IspExampleRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const conns = await this.repository.ispConnectionsByOrg();
      // Uma conexao por org (a lista ja vem ordenada por prioridade).
      const byOrg = new Map<string, { workspace_id: string; environment_id: string }>();
      for (const c of conns) {
        if (!byOrg.has(c.organization_id)) {
          byOrg.set(c.organization_id, { workspace_id: c.workspace_id, environment_id: c.environment_id });
        }
      }

      for (const [organizationId, scope] of byOrg) {
        const existing = await this.repository.agentExists(organizationId, AGENT_NAME);
        let agentId: string | null = existing?.id ?? null;

        if (await this.repository.wasSeeded(organizationId)) {
          // Já semeado: backfill único do roteiro estruturado no exemplo criado
          // por uma versão anterior (que nascia só com system_prompt).
          if (existing) await this.repository.backfillRoteiro(existing.id, ROTEIRO);
        } else if (existing) {
          await this.repository.backfillRoteiro(existing.id, ROTEIRO);
          await this.repository.markSeeded(organizationId);
        } else {
          agentId = await this.createExample(organizationId, scope);
          await this.repository.markSeeded(organizationId);
          this.logger.log(`Assistente-exemplo ISP criado na organização ${organizationId}.`);
        }

        // Atualiza o CONTEÚDO do exemplo (roteiro/persona/system_prompt) para a
        // versão atual — é um exemplo, pode evoluir. Uma vez por versão. Assim o
        // assistente já criado passa a triar cliente×venda e pedir CPF só quando
        // é suporte, sem o usuário ter que reeditar.
        if (agentId && !(await this.repository.contentVersionSeeded(organizationId, CONTENT_VERSION))) {
          await this.repository.refreshAgentContent(agentId, {
            roteiro: ROTEIRO,
            persona: PERSONA,
            systemPrompt: SYSTEM_PROMPT,
            goal: ROTEIRO.objetivo,
            allowedTools: READ_ONLY_TOOLS,
          });
          await this.repository.markContentVersionSeeded(organizationId, CONTENT_VERSION);
          this.logger.log(`Conteúdo do assistente-exemplo atualizado (${CONTENT_VERSION}) na org ${organizationId}.`);
        }

        // Fluxo-companheiro "IA responde no WhatsApp" (DRAFT, inerte). Só nasce
        // se há um assistente pra apontar e nunca foi semeado antes (não
        // ressuscita se o usuário apagou o fluxo).
        if (agentId && !(await this.repository.autoreplyWasSeeded(organizationId))) {
          const wf = await this.repository.autoreplyWorkflowExists(organizationId, AUTOREPLY_WF_NAME);
          if (!wf) {
            await this.repository.createAutoreplyWorkflow({
              organizationId,
              workspaceId: scope.workspace_id,
              environmentId: scope.environment_id,
              name: AUTOREPLY_WF_NAME,
              agentId,
            });
            this.logger.log(`Fluxo "IA responde no WhatsApp" (exemplo) criado na organização ${organizationId}.`);
          }
          await this.repository.markAutoreplySeeded(organizationId);
        }
      }
    } catch (e) {
      // Seed nunca derruba o boot.
      this.logger.error(`Seed do assistente-exemplo ISP falhou: ${(e as Error).message}`);
    }
  }

  private async createExample(
    organizationId: string,
    scope: { workspace_id: string; environment_id: string },
  ): Promise<string> {
    const connectionId = await this.repository.singleAiConnection(organizationId);

    const agent = await this.repository.createAgent({
      organization_id: organizationId,
      workspace_id: scope.workspace_id,
      environment_id: scope.environment_id,
      name: AGENT_NAME,
      description:
        'Exemplo pronto de atendimento ISP em modo consulta. Revise o modelo e a conexão de IA na aba Ajustes antes de usar.',
      connection_id: connectionId,
      model: 'gpt-4o-mini',
      roteiro: ROTEIRO as unknown as Prisma.InputJsonValue,
      persona: PERSONA as unknown as Prisma.InputJsonValue,
      system_prompt: SYSTEM_PROMPT,
      goal: ROTEIRO.objetivo,
      temperature: 0.3,
      max_steps: 8,
      allowed_tools: READ_ONLY_TOOLS,
      is_active: true,
      created_by: 'seed:isp-exemplo',
    });
    return agent.id;
  }
}
