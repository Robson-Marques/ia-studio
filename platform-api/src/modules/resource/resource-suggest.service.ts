// Mapper Inteligente (diretriz 25): colhe uma AMOSTRA (via IProvider.execute /
// discover da conexao) + os campos canonicos do tipo → pede a IA
// (LlmProviderService) um field_map SUGERIDO. NUNCA aplica sozinho — devolve a
// sugestao para o usuario revisar e confirmar (automatismo OFF). Se nao houver
// conexao de IA ativa, cai num heuristico local (match por nome de campo).
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConnectionsService } from '../integration/connections/connections.service';
import { AiOrchestratorService } from '../ai/orchestrator/ai-orchestrator.service';
import { LlmProviderService } from '../ai/providers/llm-provider.service';
import { allFieldsFor, CanonicalField, findResourceType } from './resource-model.catalog';
import { SuggestMappingDto } from './dto/resource.dtos';

export interface SuggestResult {
  resource_type: string;
  source_operation: string;
  /** { canonicalField: "sourcePath" } sugerido — REVISAR antes de aplicar. */
  suggested_field_map: Record<string, string>;
  /** Campos canonicos sem sugestao (para o usuario preencher). */
  unmatched: string[];
  /** Amostra achatada usada na sugestao (chaves observadas). */
  sample_keys: string[];
  /** 'ai' = veio do LLM; 'heuristic' = fallback local. */
  strategy: 'ai' | 'heuristic';
}

@Injectable()
export class ResourceSuggestService {
  private readonly logger = new Logger(ResourceSuggestService.name);
  private static readonly DEFAULT_MODEL = 'gpt-4o-mini';

  constructor(
    private readonly connections: ConnectionsService,
    private readonly orchestrator: AiOrchestratorService,
    private readonly llm: LlmProviderService,
  ) {}

  async suggest(organizationId: string, dto: SuggestMappingDto): Promise<SuggestResult> {
    if (!findResourceType(dto.resource_type)) {
      throw new BadRequestException(`Tipo canônico desconhecido: "${dto.resource_type}".`);
    }
    const fields = allFieldsFor(dto.resource_type);

    // 1) Amostra via provider (read-only). Se a operacao falhar, tenta discover.
    const sampleRecord = await this.collectSample(organizationId, dto);
    const flat = this.flatten(sampleRecord);
    const sampleKeys = Object.keys(flat);

    if (sampleKeys.length === 0) {
      throw new BadRequestException(
        'A amostra retornou vazia — verifique a operação/parâmetros ou os dados da conexão.',
      );
    }

    // 2) Sugestao via IA (ou heuristico se nao houver conexao AI ativa).
    try {
      const aiMap = await this.suggestViaAi(organizationId, dto, fields, flat);
      return this.finish(dto, fields, sampleKeys, aiMap, 'ai');
    } catch (e) {
      this.logger.warn(`Sugestão via IA indisponível (${(e as Error).message}) — usando heurística local.`);
      const heuristic = this.suggestHeuristic(fields, sampleKeys);
      return this.finish(dto, fields, sampleKeys, heuristic, 'heuristic');
    }
  }

  private finish(
    dto: SuggestMappingDto,
    fields: CanonicalField[],
    sampleKeys: string[],
    map: Record<string, string>,
    strategy: 'ai' | 'heuristic',
  ): SuggestResult {
    // So aceita paths que existem na amostra (a IA nao inventa origem).
    const known = new Set(sampleKeys);
    const cleaned: Record<string, string> = {};
    for (const [canonical, path] of Object.entries(map)) {
      if (fields.some((f) => f.key === canonical) && known.has(path)) cleaned[canonical] = path;
    }
    const unmatched = fields.map((f) => f.key).filter((k) => !(k in cleaned));
    return {
      resource_type: dto.resource_type,
      source_operation: dto.source_operation,
      suggested_field_map: cleaned,
      unmatched,
      sample_keys: sampleKeys,
      strategy,
    };
  }

  private async collectSample(organizationId: string, dto: SuggestMappingDto): Promise<unknown> {
    try {
      const raw = await this.connections.execute(
        organizationId,
        dto.connection_id,
        dto.source_operation,
        dto.sample_params ?? {},
      );
      const row = this.firstRow(raw);
      if (row) return row;
    } catch (e) {
      this.logger.debug(`execute(${dto.source_operation}) falhou na amostragem: ${(e as Error).message}`);
    }
    // Fallback: primeiro recurso do discover (schema discovery).
    const discovered = await this.connections
      .execute(organizationId, dto.connection_id, dto.source_operation, dto.sample_params ?? {})
      .catch(() => null);
    return this.firstRow(discovered) ?? {};
  }

  private firstRow(raw: unknown): unknown {
    if (raw === null || raw === undefined) return null;
    if (Array.isArray(raw)) return raw[0] ?? null;
    if (typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if ('data' in obj) {
        const data = obj['data'];
        if (Array.isArray(data)) return data[0] ?? null;
        if (data && typeof data === 'object') return data;
        return null;
      }
      return obj;
    }
    return null;
  }

  /** Achata um objeto em { "a.b.0.c": value } (so folhas escalares/vazias). */
  private flatten(value: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
    if (value === null || value === undefined) {
      if (prefix) out[prefix] = value;
      return out;
    }
    if (Array.isArray(value)) {
      // Considera so o primeiro item do array (amostra de forma).
      if (value.length > 0) this.flatten(value[0], prefix ? `${prefix}.0` : '0', out);
      return out;
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        this.flatten(v, prefix ? `${prefix}.${k}` : k, out);
      }
      return out;
    }
    if (prefix) out[prefix] = value;
    return out;
  }

  private async suggestViaAi(
    organizationId: string,
    dto: SuggestMappingDto,
    fields: CanonicalField[],
    flat: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const resolved = await this.orchestrator.resolve({ organizationId }, ResourceSuggestService.DEFAULT_MODEL);
    const fieldsDesc = fields.map((f) => `- ${f.key} (${f.type})${f.label ? `: ${f.label}` : ''}`).join('\n');
    const sampleDesc = Object.entries(flat)
      .map(([k, v]) => `- ${k} = ${JSON.stringify(v)?.slice(0, 80)}`)
      .join('\n');

    const system =
      'Você é um assistente que mapeia campos de uma resposta de API para campos canônicos. ' +
      'Responda APENAS com um JSON { "campoCanonico": "caminho.na.amostra" } contendo somente os pares com correspondência clara. ' +
      'Use exatamente os caminhos observados na amostra. Não invente caminhos.';
    const user =
      `Tipo canônico: ${dto.resource_type}\n\nCampos canônicos alvo:\n${fieldsDesc}\n\n` +
      `Amostra (caminho = valor):\n${sampleDesc}\n\nRetorne o JSON do mapeamento.`;

    const result = await this.llm.chat(resolved, {
      model: ResourceSuggestService.DEFAULT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
      maxTokens: 800,
    });
    return this.parseJsonMap(result.content);
  }

  private parseJsonMap(content: string): Record<string, string> {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  }

  /** Heuristico local: casa nome do campo canonico com chave da amostra. */
  private suggestHeuristic(fields: CanonicalField[], sampleKeys: string[]): Record<string, string> {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const out: Record<string, string> = {};
    const synonyms: Record<string, string[]> = {
      id: ['id', 'codigo', 'cod', 'idcliente', 'login'],
      name: ['name', 'nome', 'razaosocial', 'cliente'],
      document: ['document', 'cpf', 'cnpj', 'cpfcnpj', 'documento'],
      email: ['email', 'mail'],
      phone: ['phone', 'telefone', 'celular', 'fone'],
      amount: ['amount', 'valor', 'total', 'preco'],
      due_date: ['duedate', 'vencimento', 'datavencimento'],
      status: ['status', 'situacao', 'estado'],
      barcode: ['barcode', 'linhadigitavel', 'codigobarras'],
    };
    for (const f of fields) {
      const targets = new Set([norm(f.key), ...(synonyms[f.key] ?? [])]);
      const hit = sampleKeys.find((k) => {
        const leaf = norm(k.split('.').pop() ?? k);
        return targets.has(leaf);
      });
      if (hit) out[f.key] = hit;
    }
    return out;
  }
}
