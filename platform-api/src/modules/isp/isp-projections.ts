// Projecoes das linhas do ERP para o que o AGENTE precisa ver. Funcoes puras.
//
// Por que existir: o ERP devolve a linha inteira da tabela — o `cliente` do IXC
// tem ~150 colunas (`crm_data_sondagem`, `emp_remuneracao`, `ref_pes_fone2`,
// `iss_classificacao_padrao`...). Mandar isso pro LLM custa milhares de tokens
// por chamada e amplia a superficie de vazamento: cada campo e uma coisa a mais
// que o modelo pode repetir ao cliente. A redacao no provider tira o PERIGOSO
// (senhas); estas projecoes tiram o IRRELEVANTE.
//
// Regra: o provider continua devolvendo a linha crua (util pra workflows e pro
// `ixc.listar`); quem estreita e a TOOL, que e a fronteira com o modelo.

/** Envelope `{ data: [...] }` dos providers → array de linhas. */
export function rows(raw: unknown): Record<string, unknown>[] {
  const data = raw && typeof raw === 'object' ? (raw as { data?: unknown }).data : raw;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function str(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  // Datas zeradas do MySQL ("0000-00-00") e ids nulos ("0") nao informam nada.
  if (!trimmed || trimmed === '0000-00-00' || trimmed === '0000-00-00 00:00:00') return undefined;
  return trimmed;
}

/** Remove as chaves sem valor — o modelo nao precisa ler campo vazio. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

/** Cadastro do cliente: identificacao, contato e endereco. Nada de CRM/RH/fiscal. */
export function projectCliente(row: Record<string, unknown>): Record<string, unknown> {
  return compact({
    id: str(row['id']),
    nome: str(row['razao']),
    nome_fantasia: str(row['fantasia']),
    cpf_cnpj: str(row['cnpj_cpf']),
    ativo: str(row['ativo']) === 'S',
    email: str(row['email']) ?? str(row['hotsite_email']),
    celular: str(row['telefone_celular']),
    whatsapp: str(row['whatsapp']),
    telefone: str(row['fone']) ?? str(row['telefone_comercial']),
    endereco: str(row['endereco']),
    numero: str(row['numero']),
    complemento: str(row['complemento']),
    bairro: str(row['bairro']),
    cep: str(row['cep']),
    // `alerta` e o aviso que o provedor deixou pro atendente ver.
    alerta: str(row['alerta']),
  });
}

/** Boleto: o que o cliente precisa pra pagar, e o atendente pra explicar. */
export function projectBoleto(row: Record<string, unknown>): Record<string, unknown> {
  return compact({
    id: str(row['id']),
    documento: str(row['documento']),
    valor: str(row['valor']),
    valor_aberto: str(row['valor_aberto']),
    vencimento: str(row['data_vencimento']),
    status: str(row['status']),
    linha_digitavel: str(row['linha_digitavel']),
    link_boleto: str(row['gateway_link']),
    id_contrato: str(row['id_contrato']),
    descricao: str(row['obs']),
  });
}

/** Conexao do assinante: estado atual e ultima sessao. Sem senha, sem config. */
export function projectConexao(row: Record<string, unknown>): Record<string, unknown> {
  return compact({
    login: str(row['login']),
    online: row['online'] === true || str(row['online'])?.toUpperCase().startsWith('S'),
    status: str(row['status']),
    ativo: str(row['ativo']) === 'S',
    ip: str(row['ip']),
    mac: str(row['mac']),
    conectado_desde: str(row['ultima_conexao_inicial']),
    desconectado_em: str(row['ultima_conexao_final']),
    motivo_desconexao: str(row['motivo_desconexao']),
    id_contrato: str(row['id_contrato']),
  });
}

/** Contrato/plano do assinante. */
export function projectContrato(row: Record<string, unknown>): Record<string, unknown> {
  return compact({
    id: str(row['id']),
    plano: str(row['contrato']),
    status: str(row['status']),
    status_internet: str(row['status_internet']),
    data_ativacao: str(row['data_ativacao']),
    pago_ate: str(row['pago_ate_data']),
    bloqueado_em: str(row['dt_ult_bloq_auto']),
    nao_bloquear_ate: str(row['nao_bloquear_ate']),
    alerta: str(row['alerta_contrato']),
  });
}
