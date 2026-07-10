# Spec — Identificação do interlocutor no atendimento

> Status: **proposta, aguardando validação humana**. Nada implementado.
> Origem: pedido de 09/07/2026 — "identifique o cliente pelo número, pergunte se
> o atendimento é para ele, senão peça CPF/CNPJ; e isso tem que ser configurável
> no assistente, visível e editável, nada hardcoded".

## 0. Decisão do produto (09/07/2026): sempre pedir o documento

Robson optou por **sempre solicitar o CPF/CNPJ do assinante** — mais simples e
com menos caminhos para dar errado que a árvore telefone→parcial→terceiro. Esta
seção rege; o resto do documento fica como referência das alternativas avaliadas.

Fluxo padrão:
1. Assistente pede o documento do titular.
2. `cpfCnpjCandidates` já aceita com/sem máscara (nada de "digite sem pontos").
3. `identificar_cliente({ cpf })` (busca completa — nunca parcial, ver 2.1).
4. 0 resultados → `on_not_found`. >1 → `on_multiple`. 1 → segue.

### ⚠️ Ressalva de segurança (registrada, decisão mantida)

Pedir o documento **identifica, não autentica**. CPF é semipúblico no Brasil
(contratos, cadastros, vazamentos). Com "informe o CPF" como única barreira,
qualquer um que tenha o CPF de um assinante vê boletos, endereço e histórico dele.

Mitigação **opcional** e recomendada, sem perder a simplicidade — um segundo
fator barato que o cadastro já tem:

- **No WhatsApp:** o telefone do canal confirma sozinho. Se o número bate com o
  cadastro do CPF informado, dispensa pergunta extra; se não bate, pede o 2º fator.
- **Fora do WhatsApp / número não bate:** "quais os 4 últimos dígitos do telefone
  cadastrado?". Uma pergunta a mais; exige posse do documento **e** do número.

Isso é um toggle (`verification.enabled`), default a definir. Mantém o fluxo
"sempre pede CPF" e fecha a porta do CPF-como-senha. **Sem** isso, o gate da
seção 5 protege contra o LLM tagarela, mas não contra quem tem o CPF alheio.

## 1. Princípio: nada de segmento no core

`CPF/CNPJ` é vocabulário de ISP/varejo brasileiro. O IA Studio é genérico
(diretriz reitora). Portanto a configuração fala de **identificador**, não de
CPF; o *tipo* do identificador é uma escolha do assistente, e a busca real vive
nas **tools** (Resource Extension), como já acontece com `identificar_cliente`.

Uma clínica identificaria por número de carteirinha; uma escola, por matrícula.
Se escrevermos "cpf" no schema do agente, criamos a dívida que a diretriz existe
para evitar.

## 2. Duas correções ao pedido

**a) O CPF já é aceito com ou sem formatação — hoje.**
`cpfCnpjCandidates()` tenta o valor cru, só-dígitos e mascarado, nessa ordem, e
a base do IXC guarda os dois formatos (a `FABRICIA` sem máscara, o `Mateus` com).
Então `123.456.789-00`, `12345678900`, `12.345.678/0001-90` e `12345678000190`
já funcionam. **Pedir "sem pontos" ao cliente é uma restrição desnecessária** —
piora a experiência sem ganho técnico. A mensagem deve pedir o documento e
aceitar o que vier. (O texto continua editável; a recomendação é do produto, não
uma trava.)

**b) Confirmar com o nome do titular vaza dado a quem não se identificou.**
"Você é o Mateus Oliosi?" revela o nome do titular para **quem quer que esteja
com aquele telefone** — número reciclado pela operadora, celular perdido,
terceiro. Precisa ser uma escolha explícita, com opção de mascarar
(`M***** O*****`) ou de confirmar sem citar nome ("o atendimento é para o
titular deste número?").

## 2.1. Identificar ≠ verificar (documento parcial)

Duas etapas distintas, e o documento parcial só serve na segunda.

**Identificar** = achar o cadastro. Só dois caminhos seguros: o **telefone** do
canal, ou o **documento completo**. Buscar por documento parcial (`oper: 'L'`) é
inviável por três motivos:

1. **Quebra na máscara.** `cnpj_cpf` no IXC tem os dois formatos na mesma base
   (`176.464.277-56` e `13358785726`). A substring `6427756` acha o segundo e não
   o primeiro. Metade da base ficaria invisível, sem erro — a falha silenciosa
   típica desta API, só que criada por nós.
2. **Enumeração.** Quatro dígitos casam com dezenas de pessoas; a resposta
   entrega nome, telefone e endereço de terceiros ao atendente/LLM.
3. **Ambiguidade.** Sem um candidato prévio, "termina em 56" não é identidade.

**Verificar** = provar que o interlocutor é o titular. Aqui o parcial é o padrão
da indústria (o banco já sabe quem ligou e pede os 3 últimos dígitos). Regras:

- A comparação é **em memória**, contra o cadastro já encontrado. **Nunca** vira
  consulta à API.
- Ambos os lados normalizados para **só dígitos** — a máscara deixa de importar.
- Substitui a confirmação por nome, e resolve o vazamento da seção 2(b): em vez
  de "você é o Mateus Oliosi?", pergunta-se "confirme os 3 últimos dígitos do CPF
  do titular". Não revela nada e verifica de fato.
- `max_attempts` + backoff: adivinhar 3 dígitos é 1 em 1000 por tentativa.

Config correspondente:

```jsonc
"verification": {
  "enabled": true,
  "method": "partial_document",   // | "full_document" | "confirm_name" | "off"
  "digits": 3,                    // últimos N dígitos
  "message": "Para sua segurança, confirme os {{digits}} últimos dígitos do {{label}} do titular."
}
```

## 2.2. Quando o interlocutor quer falar de OUTRO cliente

Caso real: terceiro autorizado (cônjuge, contador, síndico), ou alguém com mais
de um cadastro. Ele busca pelo documento completo — e aqui o esquema da seção 2.1
**não vale**.

O documento parcial só é segundo fator porque o primeiro é a **posse do telefone**.
Quem informou o CPF completo já o conhece; pedir 3 dígitos dele não prova nada, e
CPF no Brasil é semipúblico. **Identificar por documento não é autenticar.**

Saídas possíveis (`second_factor`), do mais forte ao mais fraco:

| Opção | Como | Ressalva |
|---|---|---|
| `registered_phone_last4` | pede os 4 últimos dígitos do telefone **cadastrado** | o cadastro pode estar velho; vimos 67 clientes sem telefone |
| `birth_date` | data de nascimento do titular | **frequentemente vazia**: a `FABRICIA` tem `0000-00-00` |
| `last_invoice_value` | valor do último boleto | falha para cliente sem histórico |
| `none_readonly` | segue sem verificar, **sem** dados pessoais/financeiros | o gate da seção 5 continua fechado |
| `handoff` | transfere para atendente humano | sempre disponível |

Regras:

- O segundo fator **não pode ser derivável do que a pessoa já forneceu**.
- Se o fator escolhido não existir no cadastro (nascimento vazio, sem telefone),
  o sistema **não pula a verificação**: cai no `on_second_factor_unavailable`
  (`none_readonly` ou `handoff`). Nunca "deixa passar por falta de dado".
- O ERP **não modela terceiro autorizado**. Então autorizar um terceiro é decisão
  humana; a plataforma não pode inferi-la. `handoff` é a resposta honesta.

Config:

```jsonc
"other_client": {
  "allowed": true,
  "second_factor": "registered_phone_last4",   // ver tabela
  "on_second_factor_unavailable": "handoff"    // | "none_readonly"
}
```

## 3. Pré-requisitos estruturais (frente própria, antes desta)

Estes dois faltam e **sem eles a feature não funciona no fluxo real**:

1. **O telefone não chega ao agente.** `agent.nodes.ts` chama
   `runner.run({agentId, input, executionId, traceId})` — sem `scopeKeys`. O
   `AgentRunnerService` e o `ToolExecutionContext` já preveem o campo; ninguém o
   preenche. Precisa: o nó AGENT propagar `scope_keys` (ex.: `{ contact: <telefone>,
   session: <chat_id> }`) a partir do payload do gatilho.
2. **A identificação precisa ser lembrada.** Sem memória de escopo `CONTACT`, o
   assistente repete "é para este cliente?" a cada mensagem. Já existe
   `AiMemoryProfile` com escopo — falta o agente gravar o resultado.

Sem (1), a config é decorativa. Sem (2), é irritante.

## 4. Onde a configuração mora

Espelha `AiAgent.persona` (Json com forma documentada + compilador puro +
aba no editor). Nova coluna `AiAgent.identification Json?`:

```jsonc
{
  "enabled": true,
  "strategy": "lookup_then_confirm",   // | "always_ask" | "off"
  "lookup_tool": "identificar_cliente",
  "lookup_arg": "telefone",            // argumento alimentado pelo scope key
  "scope_key": "contact",              // de onde sai o telefone

  // Ver seção 2.1: verificação por documento parcial substitui a confirmação
  // por nome, que revela o titular a quem ainda não se identificou.
  "verification": {
    "enabled": true,
    "method": "partial_document",      // | "full_document" | "confirm_name" | "off"
    "digits": 3,
    "message": "Para sua segurança, confirme os {{digits}} últimos dígitos do {{label}} do titular."
  },

  "identifier": {
    "kind": "cpf_cnpj",                // | "email" | "codigo" | "livre"
    "label": "CPF ou CNPJ",
    "arg": "cpf",                      // argumento da tool
    "request_message": "Para continuar, me informe o {{label}} do titular."
  },

  "on_not_found": "ask_identifier",    // | "handoff" | "continue"
  "on_multiple": "ask_identifier",     // | "handoff"
  "max_attempts": 2,
  "on_exhausted": "handoff"            // | "continue"
}
```

Compilador `agent-identification.ts` (puro, espelha `compilePersona`) injeta o
fragmento no system prompt.

## 5. Determinístico vs. prompt

Regra: **o que é obrigação não vai para o prompt.**

- A **busca pelo telefone** é feita pelo runner antes do LLM (pre-step), e o
  resultado entra no contexto como fato. Não depende de o modelo lembrar de
  chamar a tool.
- A **confirmação** e o **pedido do documento** são conduzidos pelo LLM (é
  diálogo), guiados pelo fragmento compilado.
- A **verificação** (comparar os dígitos informados com o cadastro) é feita pelo
  **código**, nunca pelo LLM. O modelo coleta o valor e chama uma tool builtin
  `verificar_titular({ valor })`; ela normaliza os dois lados para dígitos,
  compara e devolve `true/false`. Um modelo não deve julgar se uma credencial
  confere — ele erra, e pior, pode ser convencido de que confere.
- O que **não pode** depender do prompt: não revelar dados do cadastro antes da
  verificação. Se isso for requisito, tem que ser **gate** — as tools de dado
  sensível (`consultar_debitos`, `segunda_via_boleto`) recusam enquanto o run não
  tiver `titular_verificado`. Prompt não é controle de acesso.

## 6. Casos que o desenho precisa cobrir

| Caso | Realidade na base do IXC | Política |
|---|---|---|
| Telefone acha 1 cliente | comum | confirmar |
| Telefone acha 0 | número novo, cadastro desatualizado | `on_not_found` |
| Telefone acha >1 | visto: mesmo telefone em clientes distintos | `on_multiple` |
| 1 cliente, N contratos/logins | visto: `Sérgio Augusto Barbosa` com 2 logins | escolher contrato depois, não na identificação |
| Cliente nega ser o titular | terceiro no telefone | pedir identificador |
| Documento não encontrado | erro de digitação | `max_attempts` → `on_exhausted` |

## 7. Frontend

Aba **"Quem está falando"** no editor do assistente (`AgentEditorModal`), entre
"Quem é" e "O que faz". Selects para `strategy`, `name_display`, `on_not_found`,
`on_multiple`, `on_exhausted`, `identifier.kind`, `max_attempts`. Textos como
`FormField` + `TextInput`, com dica das variáveis disponíveis (`{{nome}}`,
`{{label}}`). Sem lib nova; componentes de `components/ui/`.

## 8. Ordem de execução proposta

1. **Frente A (estrutural):** `scope_keys` do gatilho → nó AGENT → runner →
   `ToolExecutionContext`. Checkpoint.
2. **Frente B:** `AiAgent.identification` + compilador + pre-step de lookup +
   memória de contato. Checkpoint.
3. **Frente C:** aba no editor.
4. **Frente D (se for requisito):** gate de dado sensível pós-confirmação.

`db push` da Frente B adiciona coluna nullable — não destrutivo.
