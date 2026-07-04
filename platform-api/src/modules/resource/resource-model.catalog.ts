// Catalogo de tipos canonicos (Resource Model — diretriz 9). Modelo LOGICO em
// codigo: a plataforma NAO e dona dos dados de negocio. Cada tipo declara seus
// campos canonicos + extensoes verticais (diretriz 50) — nada hardcoded no core
// de fluxo: o vertical (ISP) declara suas extensoes aqui, sob o resource_type.
//
// Um arquivo, uma pergunta: "quais tipos e campos canonicos existem?". O Mapper
// (resource-mapper.service) e o Mapper Inteligente (resource-suggest.service)
// consomem estas definicoes.

export type CanonicalFieldType = 'string' | 'number' | 'boolean' | 'date' | 'money' | 'enum';

export interface CanonicalField {
  key: string;
  label: string;
  type: CanonicalFieldType;
  description?: string;
  /** true = campo tipicamente chave/identificador do registro. */
  identifier?: boolean;
}

export interface CanonicalExtension {
  /** Vertical dona da extensao (informativo — ex.: 'isp'). */
  vertical: string;
  fields: CanonicalField[];
}

export interface CanonicalResourceType {
  type: string;
  label: string;
  description: string;
  fields: CanonicalField[];
  extensions?: CanonicalExtension[];
}

// Campos canonicos comuns reaproveitados por varios tipos.
const F = {
  id: { key: 'id', label: 'Identificador', type: 'string', identifier: true } as CanonicalField,
  name: { key: 'name', label: 'Nome', type: 'string' } as CanonicalField,
  document: { key: 'document', label: 'Documento (CPF/CNPJ)', type: 'string' } as CanonicalField,
  email: { key: 'email', label: 'E-mail', type: 'string' } as CanonicalField,
  phone: { key: 'phone', label: 'Telefone', type: 'string' } as CanonicalField,
  status: { key: 'status', label: 'Status', type: 'enum' } as CanonicalField,
  amount: { key: 'amount', label: 'Valor', type: 'money' } as CanonicalField,
  due_date: { key: 'due_date', label: 'Vencimento', type: 'date' } as CanonicalField,
  created_at: { key: 'created_at', label: 'Criado em', type: 'date' } as CanonicalField,
  description: { key: 'description', label: 'Descrição', type: 'string' } as CanonicalField,
};

// Extensao vertical ISP (diretriz 50) — conectividade do assinante.
const ISP_CONNECTIVITY: CanonicalExtension = {
  vertical: 'isp',
  fields: [
    { key: 'connection_status', label: 'Status de conexão', type: 'enum', description: 'online/offline/bloqueado' },
    { key: 'olt', label: 'OLT', type: 'string' },
    { key: 'cto', label: 'CTO', type: 'string' },
    { key: 'slot', label: 'Slot', type: 'string' },
  ],
};

export const RESOURCE_TYPES: CanonicalResourceType[] = [
  {
    type: 'Customer',
    label: 'Cliente',
    description: 'Assinante/cliente da operação (pessoa ou empresa).',
    fields: [F.id, F.name, F.document, F.email, F.phone, F.status, F.created_at],
    extensions: [ISP_CONNECTIVITY],
  },
  {
    type: 'Person',
    label: 'Pessoa',
    description: 'Pessoa física (contato/titular).',
    fields: [F.id, F.name, F.document, F.email, F.phone],
  },
  {
    type: 'Company',
    label: 'Empresa',
    description: 'Pessoa jurídica.',
    fields: [F.id, F.name, F.document, F.email, F.phone],
  },
  {
    type: 'Product',
    label: 'Produto/Plano',
    description: 'Produto, serviço ou plano contratável.',
    fields: [
      F.id, F.name, F.description, F.amount, F.status,
      { key: 'sku', label: 'SKU/Código', type: 'string' },
    ],
    extensions: [
      {
        vertical: 'isp',
        fields: [
          { key: 'download_speed', label: 'Velocidade download (Mbps)', type: 'number' },
          { key: 'upload_speed', label: 'Velocidade upload (Mbps)', type: 'number' },
        ],
      },
    ],
  },
  {
    type: 'Order',
    label: 'Pedido',
    description: 'Pedido/venda.',
    fields: [F.id, F.status, F.amount, F.created_at, { key: 'customer_ref', label: 'Cliente (ref.)', type: 'string' }],
  },
  {
    type: 'Invoice',
    label: 'Fatura/Boleto',
    description: 'Documento financeiro a receber (boleto, fatura).',
    fields: [
      F.id, F.amount, F.due_date, F.status,
      { key: 'customer_ref', label: 'Cliente (ref.)', type: 'string' },
      { key: 'barcode', label: 'Linha digitável/Código de barras', type: 'string' },
      { key: 'issue_date', label: 'Emissão', type: 'date' },
    ],
  },
  {
    type: 'Payment',
    label: 'Pagamento',
    description: 'Baixa/pagamento de um documento financeiro.',
    fields: [
      F.id, F.amount, F.status,
      { key: 'paid_at', label: 'Pago em', type: 'date' },
      { key: 'method', label: 'Forma de pagamento', type: 'string' },
      { key: 'invoice_ref', label: 'Fatura (ref.)', type: 'string' },
    ],
  },
  {
    type: 'Contract',
    label: 'Contrato',
    description: 'Contrato/assinatura vigente.',
    fields: [
      F.id, F.status,
      { key: 'customer_ref', label: 'Cliente (ref.)', type: 'string' },
      { key: 'start_date', label: 'Início', type: 'date' },
      { key: 'end_date', label: 'Término', type: 'date' },
    ],
  },
  {
    type: 'Ticket',
    label: 'Atendimento/Chamado',
    description: 'Chamado de atendimento/suporte.',
    fields: [
      F.id, F.status, F.description, F.created_at,
      { key: 'customer_ref', label: 'Cliente (ref.)', type: 'string' },
      { key: 'subject', label: 'Assunto', type: 'string' },
      { key: 'priority', label: 'Prioridade', type: 'string' },
    ],
  },
  {
    type: 'ServiceOrder',
    label: 'Ordem de Serviço',
    description: 'Ordem de serviço técnica (instalação, reparo, visita).',
    fields: [
      F.id, F.status, F.description, F.created_at,
      { key: 'customer_ref', label: 'Cliente (ref.)', type: 'string' },
      { key: 'type', label: 'Tipo de OS', type: 'string' },
      { key: 'scheduled_at', label: 'Agendada para', type: 'date' },
    ],
    extensions: [ISP_CONNECTIVITY],
  },
  {
    type: 'Lead',
    label: 'Lead/Oportunidade',
    description: 'Prospecto/oportunidade comercial.',
    fields: [F.id, F.name, F.email, F.phone, F.status, F.created_at],
  },
];

export const RESOURCE_TYPE_KEYS: string[] = RESOURCE_TYPES.map((t) => t.type);

/** Definicao de um tipo canonico ou undefined. */
export function findResourceType(type: string): CanonicalResourceType | undefined {
  return RESOURCE_TYPES.find((t) => t.type === type);
}

/** Todos os campos (canonicos + extensoes) de um tipo, achatados. */
export function allFieldsFor(type: string): CanonicalField[] {
  const def = findResourceType(type);
  if (!def) return [];
  const ext = (def.extensions ?? []).flatMap((e) => e.fields);
  return [...def.fields, ...ext];
}
