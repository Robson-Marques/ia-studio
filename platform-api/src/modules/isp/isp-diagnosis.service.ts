// Diagnostico determinístico contrato→login (spec-assistente-isp §2, Frente C4).
//
// PROBLEMA que resolve: o modelo fraco (gpt-4o-mini) nao sustenta a lógica de
// varios passos (buscar contratos ativos → escolher → buscar logins ativos →
// escolher → ver status). Ele pulava etapa, anunciava "conta ativa" e concluia
// raso. Aqui o SISTEMA decide as etapas; o modelo so APRESENTA o resultado.
//
// Compoe os ops CANONICOS do ERP (cliente.dados / cliente.planos / cliente.acesso)
// — funciona com Altarede e IXC sem tocar nenhum provider. As projecoes
// (isp-projections) normalizam os campos dos dois ERPs; este service so consome
// o normalizado e decide.
//
// Regra de endereco (DECISAO A, confirmada na base real): contrato/login quase
// sempre HERDAM o endereco do cliente (endereco_proprio=false, campos vazios).
// So a minoria tem endereco proprio. Entao o rotulo de escolha lidera pelo que
// distingue de verdade — PLANO no contrato, LOGIN + REFERENCIA no login — e o
// endereco entra so quando e proprio (nao repetir o endereco do cliente em
// todas as opcoes).
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConnectionsService } from '../integration/connections/connections.service';
import { projectCliente, projectConexao, projectContrato, rows } from './isp-projections';

/** Acima disto, nao despejar a lista inteira no WhatsApp: pedir um dado. */
const MUITOS_LOGINS = 5;
/** Teto de opcoes devolvidas ao modelo (evita estouro de token). */
const MAX_OPCOES = 8;

export interface DiagnoseInput {
  cpf: string;
  /** Contrato escolhido pelo cliente (2ª chamada, apos escolher_contrato). */
  idContrato?: string;
  /** Login escolhido pelo cliente (chamada final, apos escolher_login). */
  login?: string;
}

interface ContratoResumo {
  id_contrato: string;
  plano?: string;
  bloqueado: boolean;
  status_internet?: string;
  bloqueado_em?: string;
  nao_bloquear_ate?: string;
}

interface ContratoOpcao {
  id_contrato: string;
  plano?: string;
  endereco?: string;
}

interface LoginOpcao {
  login: string;
  referencia?: string;
  endereco?: string;
  online: boolean;
}

export type DiagnosisResult =
  | { etapa: 'cliente_nao_encontrado' }
  | { etapa: 'sem_contrato_ativo'; total_contratos: number }
  | { etapa: 'escolher_contrato'; total: number; opcoes: ContratoOpcao[] }
  | { etapa: 'sem_login_ativo'; contrato: ContratoResumo }
  | {
      etapa: 'escolher_login';
      contrato: ContratoResumo;
      total: number;
      muitos: boolean;
      opcoes: LoginOpcao[];
    }
  | {
      etapa: 'resolvido';
      contrato: ContratoResumo;
      login: {
        login: string;
        online: boolean;
        conectado_desde?: string;
        desconectado_em?: string;
      };
      endereco?: string;
    };

@Injectable()
export class IspDiagnosisService {
  private readonly logger = new Logger(IspDiagnosisService.name);

  constructor(private readonly connections: ConnectionsService) {}

  /**
   * Executa o diagnóstico determinístico e devolve a PRÓXIMA etapa. O agente
   * chama esta ferramenta a cada escolha do cliente (passa id_contrato / login).
   */
  async diagnose(connectionId: string, input: DiagnoseInput): Promise<DiagnosisResult> {
    const cpf = input.cpf.trim();
    if (!cpf) throw new BadRequestException('Informe o CPF/CNPJ do titular.');

    // 1) Cliente (id + endereço de cadastro, usado como fallback dos pontos).
    const clienteRaw = await this.connections.execute(connectionId, 'cliente.dados', { cpf });
    const cliente = rows(clienteRaw).map(projectCliente)[0];
    if (!cliente) return { etapa: 'cliente_nao_encontrado' };

    // 2) Contratos ATIVOS (status = 'A'). Inativos/cancelados suprimidos.
    const contratosTodos = rows(await this.connections.execute(connectionId, 'cliente.planos', { cpf })).map(
      projectContrato,
    );
    const ativos = contratosTodos.filter((c) => this.isAtivo(c['status']));
    if (ativos.length === 0) return { etapa: 'sem_contrato_ativo', total_contratos: contratosTodos.length };

    // Escolha do contrato: 1 → segue; >1 sem escolha válida → pergunta.
    const contrato = this.pickContrato(ativos, input.idContrato);
    if (!contrato) {
      return {
        etapa: 'escolher_contrato',
        total: ativos.length,
        opcoes: ativos.slice(0, MAX_OPCOES).map((c) => this.contratoOpcao(c, cliente)),
      };
    }
    const contratoId = String(contrato['id']);
    const resumo = this.contratoResumo(contrato);

    // 3) Logins ATIVOS (ativo='S') DAQUELE contrato. Inativos suprimidos.
    const loginsTodos = rows(await this.connections.execute(connectionId, 'cliente.acesso', { cpf })).map(
      projectConexao,
    );
    const loginsDoContrato = loginsTodos.filter(
      (l) => l['ativo'] === true && String(l['id_contrato'] ?? '') === contratoId,
    );
    if (loginsDoContrato.length === 0) return { etapa: 'sem_login_ativo', contrato: resumo };

    // Escolha do login: 1 → segue; >1 sem escolha válida → pergunta (enxuto).
    const login = this.pickLogin(loginsDoContrato, input.login);
    if (!login) {
      return {
        etapa: 'escolher_login',
        contrato: resumo,
        total: loginsDoContrato.length,
        muitos: loginsDoContrato.length > MUITOS_LOGINS,
        opcoes: loginsDoContrato.slice(0, MAX_OPCOES).map((l) => this.loginOpcao(l)),
      };
    }

    // 4) Resolvido: status do login + situação do contrato. O modelo apresenta
    //    só o que estiver fora do normal.
    return {
      etapa: 'resolvido',
      contrato: resumo,
      login: {
        login: String(login['login'] ?? ''),
        online: login['online'] === true,
        conectado_desde: this.s(login['conectado_desde']),
        desconectado_em: this.s(login['desconectado_em']),
      },
      endereco: this.enderecoEfetivo(login, contrato, cliente),
    };
  }

  // ─── Escolha ────────────────────────────────────────

  private pickContrato(ativos: Record<string, unknown>[], idContrato?: string): Record<string, unknown> | null {
    if (ativos.length === 1) return ativos[0]!;
    const alvo = (idContrato ?? '').trim();
    if (alvo) return ativos.find((c) => String(c['id']) === alvo) ?? null; // id inválido → re-pergunta
    return null;
  }

  private pickLogin(logins: Record<string, unknown>[], login?: string): Record<string, unknown> | null {
    if (logins.length === 1) return logins[0]!;
    const alvo = (login ?? '').trim().toLowerCase();
    if (alvo) return logins.find((l) => String(l['login'] ?? '').toLowerCase() === alvo) ?? null;
    return null;
  }

  // ─── Montagem de saída ──────────────────────────────

  private contratoResumo(c: Record<string, unknown>): ContratoResumo {
    const statusInternet = this.s(c['status_internet']);
    return {
      id_contrato: String(c['id']),
      plano: this.s(c['plano']),
      // Contrato ativo cuja internet NAO esta liberada ('A') = bloqueado/suspenso.
      // Heuristica conservadora (refinada na Frente 3 — Financeiro).
      bloqueado: !!statusInternet && statusInternet.toUpperCase() !== 'A',
      status_internet: statusInternet,
      bloqueado_em: this.s(c['bloqueado_em']),
      nao_bloquear_ate: this.s(c['nao_bloquear_ate']),
    };
  }

  private contratoOpcao(c: Record<string, unknown>, cliente: Record<string, unknown>): ContratoOpcao {
    const plano = this.s(c['plano']);
    // Endereço efetivo do contrato: próprio quando houver, senão o do cliente.
    // Vai SEMPRE (ajuda a distinguir quando é ponto diferente); o `id_contrato`
    // é o desempate final quando plano E endereço coincidem (ex.: dois contratos
    // do mesmo plano no mesmo endereço).
    const endereco = c['endereco_proprio'] === true ? this.fmtEndereco(c) : this.fmtEndereco(cliente);
    return {
      id_contrato: String(c['id']),
      ...(plano ? { plano } : {}),
      ...(endereco ? { endereco } : {}),
    };
  }

  private loginOpcao(l: Record<string, unknown>): LoginOpcao {
    const referencia = this.s(l['referencia']);
    const endereco = l['endereco_proprio'] === true ? this.fmtEndereco(l) : undefined;
    return {
      login: String(l['login'] ?? ''),
      online: l['online'] === true,
      ...(referencia ? { referencia } : {}),
      ...(endereco ? { endereco } : {}),
    };
  }

  /** Endereço efetivo do ponto: próprio do login → do contrato → do cliente. */
  private enderecoEfetivo(
    login: Record<string, unknown>,
    contrato: Record<string, unknown>,
    cliente: Record<string, unknown>,
  ): string | undefined {
    if (login['endereco_proprio'] === true) return this.fmtEndereco(login);
    if (contrato['endereco_proprio'] === true) return this.fmtEndereco(contrato);
    return this.fmtEndereco(cliente);
  }

  private fmtEndereco(row: Record<string, unknown>): string | undefined {
    const partes = [this.s(row['endereco']), this.s(row['numero'])].filter(Boolean).join(', ');
    const bairro = this.s(row['bairro']);
    const out = [partes, bairro].filter(Boolean).join(' - ');
    return out || undefined;
  }

  // ─── Helpers ────────────────────────────────────────

  private isAtivo(status: unknown): boolean {
    return typeof status === 'string' && status.trim().toUpperCase() === 'A';
  }

  private s(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  }
}
