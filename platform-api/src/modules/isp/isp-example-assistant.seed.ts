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

// Instruções adicionais (avançado) — SÓ 3 guardrails TRANSVERSAIS (valem em toda
// a conversa e não cabem como passo). Toda a LÓGICA DE FLUXO (triagem, identificação,
// venda, diagnóstico, chamado) vive no ROTEIRO — uma casa só, sem repetir aqui.
// Formato/tom vivem na PERSONA. Regra de UX: linguagem do usuário, não do dev.
const SYSTEM_PROMPT = [
  'Você é o atendimento de um provedor de internet no WhatsApp. O nome que aparece é só o do WhatsApp — você não sabe quem está escrevendo até identificar; nunca diga "sua conta" nem dê a entender que já sabe quem é.',
  'Todo dado consultado (conexão, fatura, chamado) é do TITULAR do cadastro, não de quem está no WhatsApp — se forem pessoas diferentes, refira-se ao titular pelo nome (ex.: "a conexão da Fabricia").',
  'Nunca invente nem presuma: repasse valores, prazos e nomes exatamente como as ferramentas retornarem, e afirme só o que elas confirmaram. Use o histórico desta conversa e a data atual para não repetir perguntas nem recomeçar do zero.',
].join(' ');

// Bump este marcador quando quiser que o conteúdo do exemplo (roteiro/persona/
// system_prompt) seja RE-aplicado no assistente já semeado (é um exemplo, pode
// atualizar). Ver refreshContent no repositório.
const CONTENT_VERSION = 'v20-abertura-reconhece-numero';

// Só ferramentas de LEITURA. Escrita (abrir_os) e destrutivo (desbloqueio) ficam
// de fora de proposito — o exemplo nasce seguro.
const READ_ONLY_TOOLS = [
  // Memória primária da conversa (registro real do WhatsApp, com datas) + data
  // atual — pra lembrar o que já foi tratado, se a pessoa já é cliente, etc.
  'conversation_history',
  'current_datetime',
  'vincular_cliente',
  'identificar_cliente',
  // Diagnóstico determinístico contrato→login: o sistema decide as etapas
  // (suprime inativos, escolhe quando perguntar), o modelo só apresenta.
  // É a ÚNICA porta pra ver a conexão — `consultar_contrato`/`status_conexao`
  // ficam FORA deste assistente de propósito (funil): com elas na lista, o
  // modelo pega o atalho e nunca chega ao login certo. Seguem registradas no
  // catálogo pra workflows/outros agentes; só não entram aqui.
  'diagnosticar_conexao',
  'consultar_debitos',
  'status_regiao',
  'segunda_via_boleto',
  // Escrita controlada: abre a OS com setor/assunto da CONFIG curada + anti-dup +
  // guard de incidente. A IA só chama após o cliente confirmar.
  'abrir_os',
];

// Roteiro ESTRUTURADO (aba "O que faz"): objetivo + passos + situações. Nasce
// quebrado em caixinhas — o usuário abre e vê a lógica pronta, sem prompt cru.
const ROTEIRO = {
  objetivo:
    'Atender bem quem chama o provedor no WhatsApp: dar suporte a quem já é assinante e atender como venda quem quer contratar.',
  passos: [
    {
      titulo: 'Abertura — cumprimente e, se já conhecer o número, reconheça na hora',
      descricao:
        'Logo na PRIMEIRA mensagem, já verifique se o número do WhatsApp está salvo no cadastro de algum cliente (identificação por telefone) e conduza a saudação conforme o resultado, tudo numa mensagem só: (a) se o número JÁ estiver salvo para um cliente, reconheça na própria saudação, de forma transparente — "Olá! Vejo que este número está salvo para o cliente <nome>. É sobre a conexão dele(a) ou de outro cliente?" — e diga que, se for de outro, é só enviar o CPF/CNPJ; (b) se o número NÃO estiver em cadastro nenhum, cumprimente e pergunte do que se trata (suporte de assinante: sem internet, fatura, 2ª via, chamado — ou contratar, que é venda). Sempre diga o próximo passo. Não presuma o assunto nem "sua conta"; o reconhecimento do número não confirma que o atendimento é para aquele cliente.',
    },
    {
      titulo: 'Identificar o cliente certo (o documento manda)',
      descricao:
        'Suporte de assinante só avança com o cliente certo. A ferramenta de identificação informa COMO achou o cliente — apresente a verdade (nunca diga que um CPF foi enviado se não foi). O CPF/CNPJ que a pessoa enviar SEMPRE manda sobre o telefone: se ela mandar um, identifique por ele e confirme "Localizei o cadastro de <nome>. É para este cliente?". Se o número era conhecido e a pessoa confirma que é sobre esse cliente, siga. Se for sobre outro cliente, ou o número não estava em cadastro, peça o CPF/CNPJ e aguarde. Mais de um cadastro no mesmo documento: mostre os endereços e peça para escolher — não escolha por ela.',
    },
    {
      titulo: 'Chegar até a conexão certa (diagnóstico)',
      descricao:
        'Com o cliente identificado, use a ferramenta de diagnóstico da conexão — ela decide as etapas e devolve o próximo passo: mais de um contrato → apresente pelo PLANO e peça para escolher; mais de uma conexão → apresente pelo LOGIN e a referência do ponto; muitas conexões → não liste todas, peça um dado para estreitar (login, referência ou endereço). Só depois de chegar ao login é que você vê o status e, se for o caso, abre o chamado com o login e o contrato daquela conexão. Apresente só o que estiver fora do normal (não anuncie "contrato ativo"). Nunca aja no login errado.',
    },
  ],
  situacoes: [
    {
      quando: 'a conversa já estiver em andamento (com um cliente já identificado)',
      faca: 'Não repita perguntas já respondidas; siga pelo cliente já identificado, pelo nome. Se a pessoa enviar um CPF/CNPJ diferente, re-identifique por esse documento e passe a atender o novo cliente.',
    },
    {
      quando: 'for venda (contratar, preço ou cobertura)',
      faca: 'Não peça CPF. Pergunte a cidade/endereço (para checar cobertura) e o tipo de plano que procura, e apresente as opções.',
    },
    {
      quando: 'o assinante disser que está sem internet',
      faca: 'Conduza pela situação do contrato/conexão do diagnóstico: se bloqueado por falta de pagamento, ofereça a 2ª via; se cancelado/encerrado (não reativa pagando), trate como venda de um novo plano; se está tudo certo e só a conexão caiu, diga qual conexão e desde quando, oriente reiniciar o modem, verifique a região e, se não for problema geral, ofereça abrir um chamado.',
    },
    {
      quando: 'houver manutenção ou incidente na região do cliente',
      faca: 'Informe que a equipe já está atuando e NÃO abra chamado (evita chamado duplicado).',
    },
    {
      quando: 'o cliente aceitar abrir o chamado (um "sim", "pode", "abre")',
      faca: 'Abra na MESMA resposta e retorne com o número. Informe: (1) o número do chamado; (2) prazo de até 72 horas; (3) que vai deixar o atendimento na fila do setor responsável. Se a ferramenta indicar que JÁ EXISTE chamado aberto naquele setor, não abra outro — passe o número do existente. Nunca diga "já volto com o número" e pare. Se a abertura não estiver configurada, avise que vai encaminhar para um atendente.',
    },
    {
      quando: 'pedir 2ª via ou tiver dúvida de fatura',
      faca: 'Após identificar o cliente, veja os débitos e gere a 2ª via (linha digitável e link do boleto).',
    },
  ],
};

// Persona = SÓ tom e formato (a lógica de negócio vive no ROTEIRO, uma casa só).
// Estes são os padrões pedidos pelo Robson; como viajam no CONTENT_VERSION, o
// exemplo nasce assim e não "reseta" a cada atualização.
const PERSONA = {
  name: 'NETE',
  tone: 'amigável',
  emojis: true,
  emojis_ui: 'moderado',
  brevity: 'medium',
  // Só estilo/formato de conversa (não é regra de negócio — isso vive no roteiro).
  rules_always: ['Cumprimentar uma única vez, no começo da conversa; não repetir "olá/oi" nas mensagens seguintes.'],
  rules_never: [],
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
      // Modelo FORTE por padrão: o mini não sustenta o encadeamento de ferramentas
      // do diagnóstico. gpt-5.4 (confirmado respondendo na base do Robson; o 5.5
      // não retornou nos testes). Editável no dropdown de Ajustes.
      model: 'gpt-5.4',
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
