// Seed idempotente (boot) dos ResourceMapping de EXEMPLO do Altarede (diretriz
// 25) — mappings de provider (connection_id null) que nascem OFF (is_active
// false): o usuario ativa e/ou clona para a conexao dele. Nunca sobrescreve
// curadoria (upsert com update no-op). Nenhum dado de negocio e semeado.
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResourceRepository } from './resource.repository';

interface ExampleMapping {
  resource_type: string;
  source_operation: string;
  field_map: Record<string, string>;
  extensions?: Record<string, string>;
  description: string;
}

// Mapeamentos de exemplo do Altarede (RELATORIO 2.2 / provider altarede.provider).
const ALTAREDE_EXAMPLES: ExampleMapping[] = [
  {
    resource_type: 'Person',
    source_operation: 'cliente.dados',
    field_map: {
      id: 'ID',
      name: 'NOME',
      document: 'CPF_CNPJ',
      email: 'EMAIL',
      phone: 'CELULAR',
    },
    description: 'Pessoa a partir de cliente/dados (Altarede).',
  },
  {
    resource_type: 'Customer',
    source_operation: 'cliente.dados',
    field_map: {
      id: 'ID',
      name: 'NOME',
      document: 'CPF_CNPJ',
      email: 'EMAIL',
      phone: 'CELULAR',
      status: 'STATUS',
    },
    // Extensao ISP (diretriz 50): conectividade via cliente/acesso.
    extensions: {
      connection_status: 'STATUS_CONEXAO',
      olt: 'OLT',
      cto: 'CTO',
      slot: 'SLOT',
    },
    description: 'Cliente + extensão ISP (conectividade) a partir de cliente/dados.',
  },
  {
    resource_type: 'Invoice',
    source_operation: 'financeiro.boleto_aberto',
    field_map: {
      id: 'ID',
      amount: 'VALOR',
      due_date: 'VENCIMENTO',
      status: 'STATUS',
      customer_ref: 'ID_CLIENTE',
      barcode: 'LINHA_DIGITAVEL',
      issue_date: 'EMISSAO',
    },
    description: 'Fatura/boleto em aberto a partir de financeiro/boleto_aberto.',
  },
  {
    resource_type: 'ServiceOrder',
    source_operation: 'os.cadastrar',
    field_map: {
      id: 'ID',
      status: 'STATUS',
      description: 'DESCRICAO',
      customer_ref: 'ID_CLIENTE',
      type: 'TIPO',
      created_at: 'DATA_ABERTURA',
    },
    description: 'Ordem de serviço a partir de os/cadastrar.',
  },
  {
    resource_type: 'Product',
    source_operation: 'cliente.planos',
    field_map: {
      id: 'ID',
      name: 'NOME',
      description: 'DESCRICAO',
      amount: 'VALOR',
      status: 'STATUS',
      sku: 'CODIGO',
    },
    extensions: {
      download_speed: 'DOWNLOAD',
      upload_speed: 'UPLOAD',
    },
    description: 'Produto/plano a partir de cliente/planos (+ extensão ISP de velocidade).',
  },
];

@Injectable()
export class ResourceSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ResourceSeedService.name);

  constructor(private readonly repository: ResourceRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      let count = 0;
      for (const ex of ALTAREDE_EXAMPLES) {
        await this.repository.upsertByNaturalKey(
          'altarede',
          null,
          ex.resource_type,
          ex.source_operation,
          {
            field_map: ex.field_map as Prisma.InputJsonValue,
            extensions: ex.extensions as Prisma.InputJsonValue | undefined,
            description: ex.description,
            is_active: false, // nasce OFF (diretriz 25) — usuario ativa
          },
        );
        count++;
      }
      this.logger.log(`ResourceMapping de exemplo (Altarede) semeados: ${count}.`);
    } catch (e) {
      // Seed nunca derruba o boot.
      this.logger.error(`Seed de ResourceMapping falhou: ${(e as Error).message}`);
    }
  }
}
