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
import { IspExampleRepository } from './isp-example.repository';

const AGENT_NAME = 'Atendimento (exemplo ISP)';

// Só ferramentas de LEITURA. Escrita (abrir_os) e destrutivo (desbloqueio) ficam
// de fora de proposito — o exemplo nasce seguro.
const READ_ONLY_TOOLS = [
  'identificar_cliente',
  'consultar_contrato',
  'consultar_debitos',
  'status_conexao',
  'status_regiao',
  'segunda_via_boleto',
];

const SYSTEM_PROMPT = `Você é um atendente virtual de um provedor de internet (ISP). Fala em português do Brasil, com cordialidade e objetividade.

## Identificação (faça SEMPRE antes de tratar de dados do cliente)
1. Peça o CPF ou CNPJ do assinante. Aceite com ou sem pontuação — não exija formato.
2. Use a ferramenta "identificar_cliente" com esse documento.
3. Se encontrar 1 cliente, confirme com a pessoa: "Localizei o cadastro de <nome>. O atendimento é para este cliente?" e aguarde a confirmação.
4. Só depois de confirmado prossiga com o atendimento.
5. Se não encontrar ninguém, peça o documento novamente (pode ter erro de digitação). Se ainda assim não achar, ofereça encaminhar para um atendente humano.

## Como atender
- "Sem internet" nem sempre é problema técnico: consulte "consultar_contrato" e veja o status. Se o acesso estiver bloqueado por falta de pagamento, a solução é financeira — ofereça a 2ª via, não abra ordem de serviço.
- Para dúvidas de fatura, use "consultar_debitos" e "segunda_via_boleto".
- Para "está fora do ar", use "status_conexao" (aquele cliente) e "status_regiao" (vizinhança na mesma rede) para saber se é individual ou uma queda maior.

## Regras
- Nunca invente dados. Se uma ferramenta não retornar a informação, diga que não localizou e ofereça alternativa.
- Repasse valores, prazos e mensagens do sistema como vieram — não arredonde nem reescreva o que o ERP respondeu.
- Você está em modo consulta: não abre ordens de serviço nem desbloqueia acessos. Se o cliente precisar disso, explique que vai encaminhar para um atendente.`;

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
        if (await this.repository.wasSeeded(organizationId)) continue;
        if (await this.repository.agentExists(organizationId, AGENT_NAME)) {
          // Existe mas sem a marca (criado a mao com esse nome) — marca e sai.
          await this.repository.markSeeded(organizationId);
          continue;
        }
        await this.createExample(organizationId, scope);
        await this.repository.markSeeded(organizationId);
        this.logger.log(`Assistente-exemplo ISP criado na organização ${organizationId}.`);
      }
    } catch (e) {
      // Seed nunca derruba o boot.
      this.logger.error(`Seed do assistente-exemplo ISP falhou: ${(e as Error).message}`);
    }
  }

  private async createExample(
    organizationId: string,
    scope: { workspace_id: string; environment_id: string },
  ): Promise<void> {
    const connectionId = await this.repository.singleAiConnection(organizationId);
    const persona = {
      tone: 'cordial, objetivo e paciente',
      emojis: false,
      brevity: 'short',
      rules_always: [
        'Confirmar a identidade do cliente antes de tratar de dados dele.',
        'Repassar valores e prazos exatamente como o sistema retornou.',
      ],
      rules_never: [
        'Prometer prazos ou serviços que as ferramentas não confirmaram.',
        'Abrir OS ou desbloquear acesso (este assistente é só consulta).',
      ],
    };

    await this.repository.createAgent({
      organization_id: organizationId,
      workspace_id: scope.workspace_id,
      environment_id: scope.environment_id,
      name: AGENT_NAME,
      description:
        'Exemplo pronto de atendimento ISP em modo consulta. Revise o modelo e a conexão de IA na aba Ajustes antes de usar.',
      connection_id: connectionId,
      model: 'gpt-4o-mini',
      system_prompt: SYSTEM_PROMPT,
      persona: persona as unknown as Prisma.InputJsonValue,
      goal: 'Identificar o assinante e resolver dúvidas de conexão e financeiro em modo consulta.',
      temperature: 0.3,
      max_steps: 8,
      allowed_tools: READ_ONLY_TOOLS,
      is_active: true,
      created_by: 'seed:isp-exemplo',
    });
  }
}
