# Especificação — Comportamento do Assistente ISP (atendimento WhatsApp)

> Documento de ALINHAMENTO. Fonte da verdade do comportamento é o Robson — este doc
> apenas registra o que ele definiu. Onde há decisão em aberto, está marcado
> **[DECISÃO]**. Nada é implementado sem este doc travado.
> Criado em 2026-07-12 após a rodada de testes v0.9.44–v0.9.48.

## 0. Princípios (por que o comportamento atual falha)

- **O cliente dirige, o sistema embasa.** Nunca supor o motivo; se não foi declarado, perguntar. As respostas saem da consulta ao ERP, não de achismo.
- **Sem diagnóstico raso.** Não concluir na primeira ferramentada. Seguir as etapas (contrato → login → status) antes de responder.
- **Não vazar dado estrutural.** Nunca expor OLT/CTO/% ou nº de clientes offline. O cliente ouve só o que lhe diz respeito.
- **Não anunciar o normal.** Só comentar o que está fora do padrão (bloqueio, cancelamento, incidente).
- **Linguagem do usuário.** "Conexão", não "conta"; nada de jargão técnico.

> Observação transversal: a maioria das falhas observadas (pular etapa, anunciar
> "conta ativa", diagnóstico genérico) é de **modelo fraco** (`gpt-4o-mini`) tentando
> sustentar lógica de vários passos por prompt. Duas defesas: (1) modelo forte;
> (2) tornar o diagnóstico **determinístico** (o sistema decide as etapas, o modelo
> só apresenta). Este doc adota (2) onde a lógica é exata.

## 1. Abertura e identificação

- Cumprimentar e, **se o motivo já veio**, emendar direto nele. **Se não veio**, perguntar o motivo — sem supor.
- Assunto de assinante (conexão, fatura, chamado) exige **CPF/CNPJ do titular** para prosseguir: se não veio, pedir e aguardar.
- Venda (contratar/planos): não pedir CPF; orientar a pessoa a escrever cidade/endereço + o que procura.
- Confirmação de identidade: emenda no motivo já identificado (ex.: "Perfeito, vou verificar sua conexão."); não recomeçar a saudação.

## 2. Diagnóstico determinístico (contrato → login)

Lógica exata (o sistema executa; o assistente só apresenta o resultado):

1. Buscar **contratos ATIVOS** do cliente. Contratos inativos **não entram** (suprimidos).
2. **> 1 contrato** → apresentar as opções pelo **endereço do contrato** e pedir para o cliente escolher. **1 contrato** → seguir direto, sem perguntar sobre contrato.
3. Buscar **logins ATIVOS** do contrato escolhido. Logins inativos suprimidos.
4. **> 1 login** → apresentar pelo **endereço do login** e pedir para escolher. **1 login** → seguir direto.
5. Com o login definido, ver o **status daquele login** (online/offline, desde quando) + situação do contrato (bloqueio/cancelamento) e então responder.

**[DECISÃO A — endereço do login]** Confirmado com o Robson: o login **pode ou não** ter
endereço próprio (cadastro manual, poucos casos). Regra adotada: usar o **endereço do
login quando existir**; quando não existir, cair no **endereço do contrato**. Se a
operação exigir precisão, padronizar o cadastro de endereço no login/contrato no IXC
(fora do escopo do assistente).

## 3. Incidente estrutural (rede)

- Quando a análise indicar anomalia estrutural na região do cliente **não cadastrada** no menu ISP → Incidentes:
  - **Nunca** informar OLT/CTO/quantidade de offline nem detalhe técnico.
  - Dizer apenas que **foi identificada uma anomalia na região** dele e que a **supervisão será acionada** para analisar o incidente.
  - **Não** abrir chamado de suporte nesse caso (é rede, não instalação).
- **[FRENTE PRÓPRIA — Alerta de Incidentes]** Criar um menu de **alertas de incidentes**: registrar o incidente detectado (com dados e previsão), tratar depois e **notificar a equipe responsável via WhatsApp**. Não faz parte da primeira entrega do assistente.

## 4. Financeiro

- **Cliente BLOQUEADO por inadimplência:**
  - Tentar o **desbloqueio de confiança** (se permitido pela regra do provedor). Se realizado, informar que fez um **desbloqueio temporário** e perguntar se quer **PIX ou boleto** para pagamento.
  - **Não abrir chamado de suporte** para cliente bloqueado. Encaminhar para a **fila do setor Financeiro**.
- **Cliente EM ATRASO (sem bloqueio):** informar que a mensalidade está **há X dias em atraso** e perguntar se deseja a mensalidade (2ª via).
- 2ª via = coletar **linha digitável** + **PIX copia-e-cola**.
  - **[FRENTE — Página de pagamento]** Em vez de despejar os códigos no chat, gerar uma **página pública simples** (porte do Aquapark) onde o cliente copia linha/PIX — extensível a **pagamento por cartão** no futuro. A IA manda o link (idealmente num CTA com botão).

## 5. Suporte técnico → chamado

- Fluxo técnico (contrato ativo, login do cliente offline, sem incidente de região): orientar o básico (reiniciar modem), e **entender do cliente o que está acontecendo** para descrever no chamado.
- Abrir a OS **na mesma resposta** ao aceite, com setor/assunto da config, CPF, **login+contrato daquele login** e a descrição.
- Ao abrir: informar **número + prazo de até 72h** e encaminhar para a **fila do setor de Suporte**.
- Anti-duplicidade por setor (já implementado): se já há chamado aberto naquele setor, informar o número existente.

## 6. Confirmação de ações

- Depende da interação: se o cliente **já chegou pedindo** (ex.: "quero a 2ª via"), executar **direto**.
- Para **abrir chamado**, sempre **entender o problema** antes, para descrever bem a OS.

---

## Capacidades NOVAS a construir (não existem hoje)

| # | Capacidade | Usada em | Observação |
|---|---|---|---|
| C1 | **Filas de setor** — criar "Fila Setor Financeiro" e "Fila Setor de Suporte" (evitar o termo "supervisão"), **por config** (como a config de setor/assunto da OS) | §3, §4, §5 | **[DECISÃO B]** confirmado: não existem, criar; escolha por config, não nome fixo |
| C2 | **Handoff bot → fila de setor** (a IA move a conversa para a fila certa + a fila emite a mensagem de "está na fila, aguarde") | §4 (financeiro), §5 (suporte) | Depende de C1 |
| C3 | **Desbloqueio de confiança habilitado para a IA** + retorno do resultado + oferta PIX/boleto | §4 | Tool já existe (`desbloqueio_confianca`); hoje fora do escopo da IA |
| C4 | **Diagnóstico determinístico** (contrato→login, suprime inativos, decide quando perguntar) | §2 | Tira a lógica multi-passo do modelo |
| C5 | **Página pública de 2ª via/pagamento** (copiar linha/PIX; futuro cartão) | §4 | Porte do Aquapark |
| C6 | **Alerta de incidentes** (registrar + previsão + notificar equipe via WhatsApp) | §3 | Frente própria, depois |

## Decisões em aberto

- **[A]** Endereço no login: adotado "login se houver, senão contrato" (§2). Padronização de cadastro no IXC é decisão operacional futura.
- **[B]** Filas por config — resolvido (criar Financeiro e Suporte, escolha por config).
- **[C]** Página de pagamento: confirmar se entra já na primeira leva do financeiro ou como frente separada logo depois.

## Ordem de implementação sugerida (1 frente por vez, checkpoint entre elas)

1. **C4 — Diagnóstico determinístico** (contrato→login). É o coração do "diagnóstico não raso" e não depende de mais nada.
2. **C1 + C2 — Filas de setor + handoff** (Financeiro e Suporte). Destrava o fim da OS (§5) e o encaminhamento financeiro (§4).
3. **C3 — Desbloqueio de confiança pela IA** + oferta PIX/boleto.
4. **C5 — Página de 2ª via/pagamento** (porte do Aquapark).
5. **C6 — Alerta de incidentes** (frente própria).

Só depois de cada frente validada por você é que passo pra próxima.
