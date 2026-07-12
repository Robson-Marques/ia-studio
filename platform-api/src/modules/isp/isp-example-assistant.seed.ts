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

// Instruções adicionais (avançado) — MÍNIMAS de propósito: o comportamento vive
// no ROTEIRO estruturado (Passos + Situações), que o dono do negócio LÊ e edita
// nas caixinhas do painel. Aqui só ficam 3 guardrails transversais que não cabem
// como passo (identidade, memória, precisão). Regra máxima de UX: linguagem do
// usuário, não do dev.
const SYSTEM_PROMPT = [
  'Você é o atendimento de um provedor de internet (ISP) no WhatsApp. O nome que aparece é só o do WhatsApp — você ainda não sabe quem é: descubra o motivo antes de pedir qualquer dado.',
  'Toda consulta (status, conexão, débito) é do TITULAR do cadastro consultado, não de quem está no WhatsApp — se forem pessoas diferentes, refira-se ao titular pelo nome (ex.: "a conta da Fabricia"), nunca "sua conta".',
  'Você tem o histórico desta conversa e a data atual — consulte para não repetir perguntas nem recomeçar do zero. Repasse valores e prazos exatamente como as ferramentas retornarem; nunca invente informação que elas não confirmaram.',
].join(' ');

// Bump este marcador quando quiser que o conteúdo do exemplo (roteiro/persona/
// system_prompt) seja RE-aplicado no assistente já semeado (é um exemplo, pode
// atualizar). Ver refreshContent no repositório.
const CONTENT_VERSION = 'v13-roteiro-estruturado';

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
      titulo: 'Entender o motivo do contato',
      descricao:
        'Cumprimente de forma simples e pergunte em que pode ajudar. Descubra se a pessoa já é assinante e precisa de suporte, ou se quer contratar/saber de planos (isso é venda). Não dê a entender que já sabe quem é.',
    },
    {
      titulo: 'Continuar de onde a conversa parou',
      descricao:
        'Esta é uma conversa contínua: use o que já foi dito e não repita a saudação nem perguntas já respondidas. Se já houver um cliente identificado nesta conversa, fale pelo nome dele e siga sem pedir o CPF de novo.',
    },
    {
      titulo: 'Se for suporte: identificar o cliente',
      descricao:
        'Peça o CPF ou CNPJ do titular (com ou sem pontuação) e localize o cadastro. Confirme "Localizei o cadastro de <nome>. É para este cliente?" antes de tratar dos dados. Se aparecer mais de um cadastro no mesmo CPF, mostre os endereços cadastrados e peça para a pessoa escolher — não escolha por ela.',
    },
    {
      titulo: 'Se for venda: não pedir CPF',
      descricao:
        'Quem quer contratar ainda não é cliente — não peça CPF. Pergunte a cidade/endereço (para checar cobertura) e o que procura, e conduza como atendimento comercial.',
    },
    {
      titulo: 'Escolher a conexão certa',
      descricao:
        'Se o cliente tem mais de um login/endereço, pergunte a qual ele se refere mostrando o endereço de cada um, antes de ver o status ou abrir um chamado — nunca aja no login errado.',
    },
  ],
  situacoes: [
    {
      quando: 'já houver um cliente vinculado a este WhatsApp',
      faca: 'Cumprimente pelo nome e ajude com a conta dele sem pedir CPF. Avise que, se for atendimento para OUTRO cliente, é só enviar o CPF (aí você identifica de novo).',
    },
    {
      quando: 'um assinante disser que está sem internet',
      faca: 'Veja a situação do contrato e comente APENAS o que estiver fora do normal — não anuncie "contrato ativo". Se estiver bloqueado por falta de pagamento, ofereça a 2ª via. Se estiver cancelado/encerrado (não reativa pagando), trate como venda de um novo plano. Se estiver tudo certo e só a conexão caiu, diga qual conexão e desde quando, oriente reiniciar o modem, verifique a região e, se não for problema geral, ofereça abrir um chamado.',
    },
    {
      quando: 'houver manutenção ou incidente na região do cliente',
      faca: 'Informe que a equipe já está atuando e NÃO abra chamado (evita chamado duplicado).',
    },
    {
      quando: 'o cliente aceitar abrir o chamado (um "sim", "pode", "abre")',
      faca: 'Abra o chamado na MESMA resposta (usando a ferramenta) e informe o número — nunca diga "já volto com o número" e pare. Se já existir um chamado aberto, passe o número existente. Se a abertura não estiver configurada, avise que vai encaminhar para um atendente.',
    },
    {
      quando: 'pedir 2ª via ou tiver dúvida de fatura',
      faca: 'Após identificar, veja os débitos e gere a 2ª via (linha digitável e link do boleto).',
    },
    {
      quando: 'quiser contratar, saber preço ou cobertura',
      faca: 'Trate como venda: não peça CPF. Pergunte a cidade/endereço e o que precisa, e apresente as opções de plano.',
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
    'Abrir um chamado sem a pessoa confirmar, ou abrir um segundo chamado quando já existe um aberto.',
    'Desbloquear acesso ou fazer qualquer alteração destrutiva no cadastro.',
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
