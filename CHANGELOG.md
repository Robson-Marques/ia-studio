# Changelog — IA Studio

## v0.10.78 - 2026-09-12 (WhatsApp Templates: UI — qualidade e ações na lista — Checkpoint 4a)

Sem `db push`. Só `platform-admin` (build do painel). Consome os endpoints das v0.10.74–77.

Primeiro slice da UI de templates: a lista passa a mostrar os sinais novos e a permitir as ações.

- **Coluna "Qualidade"** (Boa/Atenção/Ruim) a partir do webhook de qualidade da Meta.
- **Coluna "Ações"** (só com `comm.whatsapp.templates.manage`): **Duplicar** (rascunho) e **Excluir** — a exclusão detecta se o template vive na Meta e, nesse caso, remove de lá e daqui (delete-official), com confirmação e texto próprio; senão, exclui só o local.
- `services/whatsapp.js`: clientes dos novos endpoints (get/update/delete/bind/duplicate/replicate/push-edit/delete-official).
- Corrige o texto da tela, que dizia que template não se edita nem se exclui — agora é possível.

Próximos slices: editar rascunho / editar publicado (push-edit) por formulário, replicar entre números e vincular a evento.

## v0.10.77 - 2026-09-12 (WhatsApp Templates: editar publicado e remover da Meta — Checkpoint 3b)

Sem `db push`. Só `platform-api`. Operações que tocam a Meta (Graph API).

- **`POST :id/push-edit`** — edita um template **já publicado** (categoria/componentes) direto na Meta e reenvia para análise (volta a `PENDING`). Bloqueia se o template ainda não está na Meta (aí é o PUT de rascunho).
- **`POST :id/delete-official`** — remove o template **da Meta** (por nome + hsm_id) e, em seguida, localmente. Complementa o `DELETE :id` (que só apagava o local e bloqueava quando havia cópia na Meta).
- **Provider Meta**: operações novas `editTemplate` e `deleteTemplate`; e no `meta-graph.client` os métodos `editWabaTemplate`, `deleteWabaTemplate` e o helper `metaDelete` (DELETE na Graph API).

Falta do catálogo: `header-media` (mídia de cabeçalho — upload retomável da Meta, mais envolvido) e a **UI** grande de templates.

## v0.10.76 - 2026-09-12 (WhatsApp Templates: duplicar e replicar — Checkpoint 3a)

Sem `db push`. Só `platform-api`. Operações locais (não chamam a Meta).

- **`POST :id/duplicate`** — copia o template na MESMA conexão como rascunho, com nome único (`<nome>_copia`, `_copia2`…).
- **`POST :id/replicate`** (body `{ connection_ids: [...] }`) — cria o template como **rascunho** em outras conexões WhatsApp da organização; pula onde já existe (mesmo nome/idioma) e reporta o resultado por conexão. Não publica na Meta — o destino publica/sincroniza depois.

Reuso de conteúdo entre números sem retrabalho. As operações que tocam a Meta — editar publicado (push-edit), remover da Meta (delete-official) e mídia de cabeçalho — ficam para o Checkpoint 3b (exigem operações novas no provider).

## v0.10.75 - 2026-09-12 (WhatsApp Templates: qualidade + categoria ao vivo por webhook — Checkpoint 2)

**Com `db push`** (adiciona `quality` em `comm_whatsapp_templates`). Só `platform-api`.

Revisão do plano na comparação fina: **"importar da Meta" já estava coberto** — o nosso `sync` puxa TODOS os templates da WABA e faz upsert local; e o **status básico** (aprovado/recusado/pausado) já chegava ao vivo por webhook. O que faltava eram os OUTROS eventos de template que a Meta manda e a gente ignorava. Este checkpoint fecha isso:

- **`message_template_quality_update`** → grava a **nota de qualidade** (GREEN/YELLOW/RED/UNKNOWN) no campo novo `quality`. Nota baixa degrada o número — sinal operacional que faltava.
- **`template_category_update`** → quando a Meta troca a categoria do template sozinha, o nosso registro acompanha.
- Sem endpoint novo: o webhook já roteia todo `change` para o `handleChange`; estes campos só passam a ser tratados (antes caíam no log genérico).

Não portei o fluxo "importaveis/importar" do Aquapark — seria redundante com o `sync` (mesma lógica do painel de flags: o nosso já cobre de forma mais simples).

## v0.10.74 - 2026-09-11 (WhatsApp Templates: CRUD + vínculo a evento — Checkpoint 1)

Sem `db push` (o modelo `WhatsappTemplate` já tinha os campos). Só `platform-api`.

Primeiro checkpoint do porte de Templates HSM: fecha o CRUD local do catálogo, que hoje só tinha listar/criar/sincronizar.

- **`GET :id`** — detalhe do template (com dono).
- **`PUT :id`** — edita o conteúdo de um **rascunho** (categoria + header/body/footer/botões). Templates já enviados à Meta não se editam por aqui (isso é o "editar publicado"/push-edit, checkpoint futuro) — bloqueado com mensagem clara.
- **`DELETE :id`** — exclui o template local; bloqueia quando ele ainda vive na Meta (removê-lo de lá é o delete-official, checkpoint futuro), para não deixar órfão.
- **`POST :id/bind`** — liga/desliga o vínculo do template a um evento do sistema (docs-as-code); metadado local, vale em qualquer status.

Sem conteúdo vertical: o mecanismo de vínculo a evento é genérico; nada do seed de cobrança do Aquapark foi trazido. Próximo: importar templates já existentes na Meta.

## v0.10.73 - 2026-09-11 (WhatsApp/YCloud: correção do envio de mídia — paridade com o Aquapark)

Sem `db push`. Só `platform-api`. Traz para o nosso lado a correção de envio de mídia que o Aquapark aplicou (o nosso porte era anterior a ela).

- **Nome de arquivo com extensão** no upload à YCloud (`uploadYCloudMedia`): o nome enviado passa a ter extensão coerente com o mime (mapa mime→extensão). Sem isso, mídia sem nome/extensão — o caso clássico é **áudio gravado no navegador** — era recusada pelo WhatsApp.
- **Motivo de erro mais útil** da YCloud: extrai a razão real de `error.message` e, quando é a Meta que recusa, de `error.whatsappApiError.message` (é aí que vem o "porquê" da recusa da mídia); mensagem amigável no 400.

Revisão de paridade: o resto do caminho de mídia do nosso conector (upload via `fetch`+`Blob`, que já manda o tamanho do corpo) estava alinhado — a lacuna real era o nome do arquivo.

## v0.10.72 - 2026-09-11 (Assistentes: botão de baixar a revisão — front)

Sem `db push`. Só `platform-admin` (build do painel). Consome o endpoint da v0.10.71.

- **Botão "Exportar PDF"** na aba Revisão do editor do assistente — aparece na revisão selecionada quando ela está concluída; baixa o parecer pelo navegador.
- `services/ai.js`: `exportContentReview` (busca o binário e dispara o download).

Fecha a revisão de conteúdo de ponta a ponta (comparar → ver → baixar).

## v0.10.71 - 2026-09-11 (Assistentes: export da revisão de conteúdo — backend)

Sem `db push`. **Nova dependência `pdf-lib`** no `platform-api` (o painel roda `npm install` antes do build). Só `platform-api`.

Backend do export da revisão de conteúdo — gera o parecer já produzido em **PDF ou TXT**, sem reexecutar a IA.

- **Endpoint** `GET ai/agents/:id/content-reviews/:reviewId/export?format=pdf|txt` (`ai.agents.read`), devolve o arquivo (Content-Type + Content-Disposition).
- `content-review-export.service.ts` — porte do Aquapark com `pdf-lib` (JS puro, sem headless), adaptado: sem escopo, usa `document_label`, autoria genérica ("IA Studio").
- `findReview` no repositório; `export()` no serviço (carrega assistente + revisão e monta o arquivo).

Requer o `pdf-lib` instalado no servidor (vai no `npm install` da Atualização). O botão de baixar na aba Revisão entra na próxima versão (front).

## v0.10.70 - 2026-09-11 (Assistentes: histórico de execuções na aba Testar)

Sem `db push`. Só `platform-admin` (build do painel). Sem endpoint novo — usa o `GET ai/agents/:id/runs` que já existia.

Diff pequeno de Assistentes: a aba **Testar** passa a mostrar as **execuções recentes**, não só a última.

- Lista as últimas execuções (status, data, tokens, custo); cada linha é clicável para rever aquele resultado no cartão de saída.
- Depois de um teste, o histórico recarrega e o cartão passa a mostrar a execução recém-criada pela linha do banco (com tokens/custo já consolidados) — antes a resposta imediata não trazia esses números.
- `services/ai.js`: reaproveita `listAgentRuns` (já existia). Só componentes do DS; tokens `--su-*`.

## v0.10.69 - 2026-09-11 (Assistentes: revisão de conteúdo — aba no editor — Checkpoint 2b)

Sem `db push`. Só `platform-admin` (build do painel). Consome os endpoints da v0.10.68.

A revisão de conteúdo ganha lugar no **editor do assistente**.

- **Nova aba "Revisão"** no `AgenteEditor` (entre "O que sabe" e "Testar"), espelhando o padrão da aba Testar (habilita depois de salvar).
- Botão **Revisar conteúdo** (só com `ai.agents.write`) dispara a comparação das fontes; o resultado aparece com **status** (Coerente / Pontos a conferir), os apontamentos (severidade Crítico/Atenção/Melhoria + tipo Conflito/Redundância/Lacuna/Risco de promessa, com explicação, recomendação e trechos citados) e os pontos fortes.
- Histórico de revisões anteriores, clicáveis para rever cada resultado.
- `services/ai.js` — `listContentReviews` e `reviewAgentContent`. Só componentes que o DS exporta; tokens `--su-*`, sem cor fixa.

Fecha a frente de Assistentes do porte do menu IA Studio (revisão de conteúdo, backend + UI). O **export PDF** da revisão fica como sub-checkpoint opcional. Requer conexão de IA ativa e ao menos duas fontes prontas no assistente.

## v0.10.68 - 2026-09-11 (Assistentes: revisão de conteúdo — backend — Checkpoint 2a)

**Com `db push`** (adiciona a tabela `ai_agent_content_reviews`). Só `platform-api`.

Primeiro diff genuíno de Assistentes (o resto do menu IA Studio já existe): **revisão de conteúdo** — a IA compara as fontes de conhecimento vinculadas ao assistente e aponta **conflitos, redundâncias, lacunas e riscos de promessa**, com trechos e recomendação. Só leitura das fontes; não conversa nem executa ações.

- **Modelo `AiAgentContentReview`** (`ai_agent_content_reviews`), multi-tenant, ligado ao assistente. `result_json` guarda o resultado estruturado (resumo, status, issues, pontos fortes).
- **Endpoints** sob `ai/agents`: `GET :id/content-reviews` (histórico, `ai.agents.read`) e `POST :id/content-reviews` (dispara, `ai.agents.write`). Sem perm nova — é operação do assistente.
- **Adaptação ao nosso modelo (não cópia):** o Aquapark separa fontes em INFO vs BEHAVIOR (escopos KNOWLEDGE/BEHAVIOR/COMPLETE); a nossa base de conhecimento **não tem categoria**, então a revisão é de escopo único (compara os documentos prontos das bases vinculadas ao assistente, exige ≥2). Prompt genérico (sem viés comercial).
- **Arquitetura:** LLM via Orchestrator + `LlmProviderService` (conexão de IA resolvida, modelo da conexão ou default por tipo) — igual à Análise de atendimento. Gate de orçamento + registro de custo reaproveitados.

A tela (aba/painel de revisão no editor do assistente) e o **export PDF** entram nos próximos sub-checkpoints. Requer conexão de IA ativa e ao menos duas fontes prontas.

## v0.10.67 - 2026-09-10 (Menu IA Studio: Análise de atendimento — tela — Checkpoint 1b)

Sem `db push`. Só `platform-admin` (build do painel). Consome os endpoints da v0.10.66.

Fecha o Checkpoint 1: a **Análise de atendimento** ganha tela no menu **IA Studio**.

- **Nova entrada de menu** "Análise de atendimento" (`/ia/analise`), entre Pendências e Custos, visível com `ai.analysis.read`.
- **Tela** (`pages/IA/AnaliseAtendimento`): lista as análises agrupadas por execução (cada sugestão marcada como **Melhoria da IA** ou **Melhoria da equipe**, com o sinal observado). Botão **Analisar conversa** (só com `ai.analysis.run`) abre um seletor de conversa e dispara a análise; ao concluir, recarrega. Filtra pelo ambiente ativo.
- `services/ai.js` — `listAttendanceAnalyses` e `analyzeAttendanceChat`.
- Construída só com componentes que este DS exporta (Card, Badge, Button, EmptyState, Spinner, Modal, Field, Select) — cabeçalho montado com tokens `--su-*`, sem cor fixa.

Para a análise rodar de verdade, é preciso ao menos uma **conexão de IA ativa** em Integrações › Conexões. Fecha a frente 1 do porte do menu IA Studio; próximo checkpoint: Ajustes › Ações da IA.

## v0.10.66 - 2026-09-10 (Menu IA Studio: Análise de atendimento — backend — Checkpoint 1a)

**Com `db push`** (adiciona a tabela `ai_attendance_analyses`). Só `platform-api`.

Primeira frente do porte do menu IA Studio (genérica, sem viés de vertical): backend da **Análise de atendimento** — sob pedido explícito de uma pessoa, a IA lê uma conversa e propõe melhorias, cada uma marcada como **IA** (conhecimento/instrução/automação/resposta da IA) ou **equipe** (abordagem/processo humano). Não envia nada ao cliente nem altera o atendimento.

- **Modelo `AiAttendanceAnalysis`** (`ai_attendance_analyses`), multi-tenant (organization/workspace/environment), ligado à conversa. Uma execução grava várias linhas com o mesmo `analysis_trace_id`.
- **Endpoints** `@Controller('ai/attendance-analysis')`: `GET` (lista, `ai.analysis.read`) e `POST analyze-chat` (dispara, `ai.analysis.run`).
- **Diferença de arquitetura vs. Aquapark:** lá o LLM era `openai/gpt-5.5` fixo; aqui resolvemos uma **Conexão de IA** pelo Orchestrator (Provider Registry + Cofre) e passamos pelo `LlmProviderService`. O modelo vem da conexão (`config.default_model`/`model`) ou de um default por tipo de provedor — sem acoplar a um provedor. Gate de orçamento e registro de custo reaproveitados (`CostsService`).
- **Permissões** novas `ai.analysis.read` / `ai.analysis.run` (grupo IA, rótulos, perfil Operador de IA; Administrador herda por `ALL_PERMISSIONS`).
- Prompt de análise trata o histórico como **dado não confiável** (não segue instruções embutidas); mapeia os remetentes do IA Studio (`bot`=IA, `user:<id>`=equipe, `contact`=cliente).

A tela (menu IA Studio › Análise de atendimento) entra no Checkpoint 1b (front). Requer ao menos uma conexão de IA ativa para rodar a análise.

## v0.10.65 - 2026-09-10 (Coexistência: modo manual na conversa — Checkpoint 5b)

Sem `db push`. Só `platform-admin` (build do painel). Consome os endpoints da v0.10.63.

Fecha a coexistência pela UI: a conversa pode ser passada para um número Baileys direto da janela de atendimento, e a barra de resposta se adapta ao canal.

- **Botão "Modo manual"** no cabeçalho da conversa (`ChatWindow`) — aparece quando há canal Baileys manual elegível (ativo e vinculado à conexão oficial desta conversa). Um canal: liga direto; mais de um: abre um seletor. Ligado, vira **"Voltar ao oficial"** e um `Badge` "Modo manual" acompanha a situação.
- **Aviso na conversa:** enquanto em modo manual, uma faixa deixa claro que IA, automações e modelos ficam de fora e que o envio sai pelo número Baileys (sem janela de 24h).
- **Barra de resposta ciente do canal** (`MessageComposer`): no modo manual não há janela de 24h (o atendente escreve sempre), e somem o modelo, o anexo do aparelho e o áudio gravado — o backend recusa esses no canal manual. Texto e mídia por endereço público continuam.
- `services/whatsapp.js` — `listManualChannels` e `setManualChannel` (liga/desliga).

Fecha a Fase 5 (UI da coexistência). Com a aba de Pareamento (v0.10.64) e o modo manual, dá para parear um número Baileys e responder por ele numa conversa oficial, ponta a ponta.

## v0.10.64 - 2026-09-10 (Baileys: aba de Pareamento (QR) na conexão — Checkpoint 5a)

Sem `db push`. Só `platform-admin` (build do painel).

Primeira frente de UI da coexistência: a conexão Baileys agora se pareia pela própria tela de detalhe, em **Integrações › Conexões** (o único ponto que mantivemos do nosso desenho — nada de tela dedicada de WhatsApp Conexões).

- **Aba "Pareamento"** em `ConexaoDetalhe` — aparece **só** para `whatsapp-baileys-internal` e `whatsapp-baileys-manual`, e só para quem pode escrever conexão (o endpoint exige `integrations.connections.write`). Fica logo após "Dados".
- **QR ao vivo:** consulta `GET /comm/whatsapp/baileys/connections/:id/pairing-qr` a cada ~4s enquanto a aba está aberta (o QR expira rápido; para de consultar ao sair da aba). Mostra o código sobre fundo branco (contraste que a câmera exige), estado do socket como `Badge` semântico (`disconnected`/`connecting`/`qr_pending`/`connected`/`error`) e a instrução de escanear.
- **Ações:** `Reconectar` (religa uma sessão já pareada, sem QR novo) e `Reiniciar pareamento` (descarta a sessão e gera QR do zero — trocar de número).
- `services/whatsappBaileys.js` — novo cliente (`getBaileysPairingQr`, `reconnectBaileys`, `restartBaileysPairing`).
- Corrige de passagem o `import` do `Spinner` no `ConexaoDetalhe` (já era usado nas abas Recursos/Histórico sem estar importado).

Próxima frente: o botão de **modo manual** na janela da conversa (liga/desliga o canal Baileys de coexistência), consumindo os endpoints da v0.10.63.

## v0.10.63 - 2026-09-10 (Baileys manual: coexistência no envio — Checkpoint 4b)

Sem `db push` (o campo já veio na v0.10.62). `platform-api`.

Ativa a coexistência no fluxo de envio: a conversa pode ficar em **modo manual** (respondida por um número Baileys), e nesse modo IA/automações/modelos ficam de fora.

- **Guarda automática:** `WhatsappOrchestratorService.send()` (por onde passam IA, relacionamento e cobrança) recusa (`409`) quando a conversa está em modo manual. O envio humano não passa por aqui, então não é afetado.
- **Roteamento humano:** `WhatsappInboxService.deliver()` — se a conversa está em modo manual, a resposta do atendente sai pelo canal Baileys manual (sem janela de 24h, sem Meta) e é registrada na mesma conversa (origem oficial preservada). Modelo (template) é bloqueado no canal manual; mídia gravada no aparelho também (envie por link).
- **Registry:** `sendViaBaileysConnection` (envio por um canal Baileys específico).
- **Endpoints:** `POST /comm/whatsapp/chats/:id/manual-channel` (liga/desliga, validando que o canal é `whatsapp-baileys-manual` e que o vínculo bate com a conexão oficial da conversa) e `GET .../manual-channels` (lista os elegíveis).

Fecha a Fase 4 (coexistência backend). A UI (botão de modo manual na conversa, tela de conexões com QR) é a próxima frente — front, com `studio-ux-adoption`.

## v0.10.62 - 2026-09-10 (Baileys manual: fundação — provider + vínculo — Checkpoint 4a)

**Com `db push`** (adiciona `manual_connection_id` em `comm_whatsapp_chats`). `platform-api`.

Fundação do canal **manual** (coexistência). Cria o tipo de conexão e o campo do vínculo; o comportamento no fluxo de envio (bloquear IA/automação/modelos e rotear o envio humano) entra no Checkpoint 4b.

- **Schema:** `WhatsappChat.manual_connection_id` (FK solta para a conexão `whatsapp-baileys-manual` escolhida). A origem oficial (`connection_id`) fica intacta; enquanto o manual está setado, IA/modelos/automações não podem usar a conversa (guarda no 4b).
- `providers/whatsapp-baileys-manual.provider.ts` — provider no Registry (`whatsapp-baileys-manual`) com o campo `official_connection_id` (conexão oficial que este canal acompanha). Fino como o interno; `health` reflete o pareamento. Reaproveita o runtime e o registry Baileys (a fase 3b já cobre os dois `provider_key`).
- Registrado em `registry.module.ts` e `provider-seed.service.ts`.

Requer `baileys`/`qrcode` no servidor (deps da v0.10.59) para parear. Build e boot seguem seguros sem parear (import blindado; boot só sobe socket de conexão com sessão salva).

## v0.10.61 - 2026-09-10 (Baileys internal: ativação — provider + registry + QR — Checkpoint 3b)

Sem `db push`. Só `platform-api` (build da API). **Requer o `baileys`/`qrcode` instalados no servidor** (deps da v0.10.59).

Ativa o conector Baileys interno (o runtime da v0.10.59 deixa de ser inerte).

- `providers/whatsapp-baileys-internal.provider.ts` — provider no Registry (`whatsapp-baileys-internal`), fino de propósito (sem ciclo de módulo). Aparece no marketplace/wizard; `health` diz a verdade do pareamento lendo a `WhatsappBaileysSession`.
- `whatsapp-baileys-registry.service.ts` — Map de runtimes por conexão, religa os pareados no boot (só os que têm sessão salva), e expõe QR/reconectar/reparear + `sendInternalNotification` (avisos internos por texto).
- `whatsapp-baileys.controller.ts` — `GET/POST /comm/whatsapp/baileys/connections/:id/{pairing-qr,reconnect,restart-pairing}` (perm `integrations.connections.write`).
- Registrado no `registry.module.ts`, `provider-seed.service.ts` e `comm.module.ts` (+ `WhatsappBaileysSessionRepository` no DI).

Como criar: em Integrações › Conexões, novo tipo "WhatsApp interno (Baileys)", salvar, abrir e ler o QR num número dedicado a avisos internos (não recebe conversas). O envio interno (`sendInternalNotification`) fica exposto para os módulos de notificação usarem — o gancho de quem chama entra numa integração posterior.

Fecha a Fase 3 (interno). O Baileys **manual** + o vínculo de coexistência é a Fase 4.

## v0.10.60 - 2026-09-09 (Correção de build: media (Json) no inbound YCloud + blindagem do import Baileys)

Sem `db push`. Só `platform-api` (build da API).

Conserta o erro de compilação (TS2322) que **quebrou o build** das v0.10.58/0.10.59 na etapa API_BUILD (a produção ficou na v0.10.57 pelo fail-safe — nada aplicado pela metade).

- **`whatsapp-ycloud-inbound.service.ts`:** o campo `media` do `createMessage` é `Json` do Prisma (`InputJsonValue`) e estava tipado como `Record<string, unknown>`, que o Prisma Client não aceita direto. Agora com cast explícito para `Prisma.InputJsonValue` (e `undefined` quando não há mídia).
- **`whatsapp-baileys.runtime.ts`:** os `import()` dinâmicos de `@whiskeysockets/baileys` e `qrcode` passam por especificador em variável, para não exigir resolução do módulo em tempo de build (o `nest build` compila o runtime mesmo inerte). Assim o build não quebra caso as deps ainda não estejam instaladas; em runtime resolvem normalmente e, se faltarem, devolvem erro claro (sem fallback silencioso).

Atualize direto para a v0.10.60 — inclui tudo das v0.10.58 (webhook YCloud) e v0.10.59 (fundação Baileys). As tags 58/59 não compilavam e ficam para trás.

Nota: o Baileys só é exercitado quando a ativação (Checkpoint 3b) entrar. Antes disso, garanta que o pipeline de atualização roda `npm install` das dependências novas no servidor.

## v0.10.59 - 2026-09-09 (Baileys internal: fundação — deps + sessão + runtime — Checkpoint 3a)

**Com `db push`** (cria `comm_whatsapp_baileys_sessions`). `platform-api` (build + dependências novas).

Fundação da Fase 3 (Baileys), o conector stateful. É **aditivo e inerte**: nada instancia o runtime ainda — a ativação (registry + provider + endpoint de QR) entra no Checkpoint 3b. O objetivo desta versão é validar no servidor que o `baileys` instala e a tabela sobe, antes do socket.

- **Dependências:** `@whiskeysockets/baileys ^7.0.0-rc14` + `qrcode ^1.5.4` (+ `@types/qrcode`), pinadas iguais ao Aquapark (código provado nessa versão).
- **Schema:** `WhatsappBaileysSession` (1 por conexão, multi-tenant) guarda o estado de auth do socket cifrado (AES-256-GCM). Não é segredo do usuário — é sessão de socket, atualizada a cada rotação de chave Signal.
- `whatsapp-baileys-session.repository.ts` — load/save/clear cifrado do blob.
- `connectors/whatsapp-baileys.runtime.ts` — runtime portado do `baileys-internal-adapter` do Aquapark, implementando o contrato `WhatsappConnectionRuntime` (socket + QR→dataURL + eventos). Só OUTBOUND; interno = só texto; sem reconexão automática após queda (segurança contra ban).

IMPORTANTE: o Baileys é WhatsApp não-oficial e **não é testável daqui** — exige `npm install` no servidor e pareamento com um celular real, e carrega risco de bloqueio da conta. A validação ponta a ponta acontece no servidor após aplicar esta tag.

## v0.10.58 - 2026-09-09 (Conector YCloud: webhook inbound + coexistência — Checkpoint 2b)

Sem `db push`. Só `platform-api` (build da API).

Fase 2b do porte dos conectores: entra o **inbound da YCloud** e a coexistência de histórico compartilhado.

- `whatsapp-ycloud-webhook.controller.ts` — rota pública `POST /api/webhooks/whatsapp/ycloud`. Resolve a conexão dona validando a assinatura `YCloud-Signature` (HMAC-SHA256 sobre `t.corpo`, conforme doc oficial) contra o `webhook_secret` de cada conexão `whatsapp-ycloud` no Cofre.
- `whatsapp-ycloud-inbound.service.ts` — normaliza os eventos (`whatsapp.inbound_message.received`, `whatsapp.message.updated` e os de histórico `whatsapp.business_app.sync_history_message`/`sent_message_sync`) e persiste na MESMA inbox (`comm_whatsapp_chats`/`messages`), reaproveitando o `WhatsappChatsRepository`. Mensagem viva do cliente publica `whatsapp.inbound.message` (dispara IA/automação); **histórico compartilhado entra na conversa mas NUNCA dispara automação** (coexistência).
- `verifyYCloudSignature` adicionado ao `ycloud.client.ts`; controller + serviço registrados no `comm.module.ts`.

Sem alteração de schema: o marcador de "histórico" é decisão de roteamento (não publica o evento), não coluna. Uma ressalva honesta: a doc diverge no ponto final do payload assinado — a verificação aceita as duas formas até confirmarmos contra um evento real.

## v0.10.57 - 2026-09-08 (Conector YCloud: correção do template.language conforme doc oficial)

Sem `db push`. Só `platform-api` (build da API).

Ajuste de conformidade com a doc da YCloud (`POST /v2/whatsapp/messages/sendDirectly`): no envio de **template**, o campo `template.language` é uma **string** (ex.: `"pt_BR"`), não o objeto `{ code }` da Cloud API. O `ycloud.client.ts` (v0.10.56) montava como objeto — corrigido para string. Sem essa correção, o envio de template pela YCloud seria recusado.

Também confirmado pela doc: autenticação por header `X-API-Key` (já estava correto) e endpoint de envio `/v2/whatsapp/messages/sendDirectly` (correto).

## v0.10.56 - 2026-09-08 (Conector YCloud: envio + registro — Checkpoint 2a)

Sem `db push`. Só `platform-api` (build da API).

Fase 2a do porte dos conectores (especialidade `ia-studio.whatsapp-connectors@1.0.0`): entra o **provider YCloud** (`whatsapp-ycloud`) no Provider Registry — coexiste com o `whatsapp-meta`, ambos oficiais.

- `shared/integration/ycloud.client.ts` — cliente REST da YCloud (`fetch` nativo, sem novas dependências): `sendYCloudMessage` (texto/mídia/template via `sendDirectly`), `uploadYCloudMedia` (multipart) e `pingYCloud` (health leve).
- `registry/providers/whatsapp-ycloud.provider.ts` — `IProvider` espelhando o `whatsapp-meta`: wizard (número, WABA, chave da API e segredo do webhook — os dois últimos no Cofre), `health`/`connect` (valida a chave), `execute` (sendText/sendTemplate/sendMedia/uploadMedia/sendRich) e `discover`.
- Registrado no `registry.module.ts` e no `provider-seed.service.ts` (semeado no boot como definição do marketplace).

Interativos (cta_url/botões/lista) e o **inbound** (webhook + assinatura + persistência, com histórico compartilhado → `isHistory`) entram no Checkpoint 2b. Nada de coexistência de conversa ainda; sem alteração de schema.

## v0.10.55 - 2026-09-08 (Conectores WhatsApp: contrato/tipos — Checkpoint 1)

Sem `db push`. Só `platform-api` (arquivo de contrato, ainda sem consumidor — não altera comportamento).

Primeiro passo do porte dos conectores WhatsApp do Aquapark (especialidade `ia-studio.whatsapp-connectors@1.0.0`). Entra o contrato unificado dos conectores em `modules/comm/whatsapp/connectors/connector.types.ts`, **aditivo** — nada importa dele ainda.

- Define a fronteira **HTTP (stateless, via `IProvider.execute` — Meta/YCloud)** vs **SOCKET (stateful — Baileys)**, com uma porta única de envio (`WhatsappOutboundPort`) que os dois transportes satisfazem.
- `WhatsappProviderKey` (whatsapp-meta/ycloud/baileys-internal/baileys-manual), presets de `ConnectorCapabilities` por conector, `PairingResult` (QR), e o runtime stateful `WhatsappConnectionRuntime` (socket/QR/eventos) para o Baileys.
- Coexistência: `ConnectorInboundMessage` com `isHistory`/`isSelf` (histórico compartilhado não dispara automação), `BaileysManualConfig.officialConnectionId`, e erros tipados sem fallback silencioso (`UnsupportedMessageError`/`ConnectionNotReadyError`/`SendFailedError`/`ManualChannelOnlyError`).
- Reusa `RichMessage`/`NormalizedMessage` de `shared/integration/whatsapp.types` — sem duplicar.

Próxima fase (após validação): provider YCloud (`whatsapp-ycloud`) + webhook.

## v0.10.54 - 2026-08-16 (Editor de assistente: 8 → 5 abas)

Sem `db push`. Só `platform-admin`.

Última frente do porte da direção do Aquapark: o editor de assistente enxuga de **8 → 5 abas** — **Visão geral · Quem é · O que faz · O que sabe · Testar** —, sem perder nenhuma configuração.

- **"O que pode fazer"** (seleção de habilidades) foi **dobrada em "O que faz"** (o que o assistente faz inclui as ações que pode usar), com um subtítulo próprio.
- **"Ajustes avançados"** (conexão/modelo, criatividade, passos/tokens, memória, salvaguardas) virou uma **seção recolhível** no fim de "Visão geral" — recolhida por padrão, porque a maioria não precisa mexer. A validação do modelo agora leva pra "Visão geral" e expande a seção.
- **"Quem atende"** era um **placeholder sem campo nenhum** (só um aviso de que o atendimento automático ainda está sendo montado) — saiu de cena. Nenhuma capacidade perdida.

Fecha a simplificação da área de IA inspirada no Aquapark: Custos como painel de leitura, navegação consolidada (Monitoramento, Ajustes gerais), Atendimento por IA reagrupado e agora o editor mais direto.

## v0.10.53 - 2026-08-16 (Blindagem do VersionService: tag de outro sistema nunca vira "versão atual")

Sem `db push`. Só `platform-api` (build da API).

Conserto de raiz do incidente em que uma **tag `v2.2.62` do AquaPark** entrou no `/opt/iastudio` e foi lida como "versão atual" — como era maior que qualquer `v0.10.x`, o painel de Atualização travava em "nada disponível" e não oferecia as versões novas do IA Studio.

O `VersionService` passa a **ancorar a linha de versão no `CHANGELOG.md`** (conteúdo sempre do próprio repo): usa o `major` do cabeçalho do topo (`## vX.Y.Z`) como referência e **ignora qualquer tag de outra linha** (major diferente), tanto na "versão atual" (`git describe`) quanto na lista de "disponíveis" (`git tag --list`). Uma tag intrusa de outro sistema nunca mais é lida como atual nem oferecida. Degradação segura: se o CHANGELOG não puder ser lido, o filtro se desliga e volta ao comportamento antigo (não quebra).

Contexto: a limpeza no servidor (remover a tag intrusa) já resolveu o sintoma; esta mudança impede a recorrência.

## v0.10.52 - 2026-08-16 (Navegação: "Atendimento por IA" volta pro grupo IA Studio)

Sem `db push`. Só `platform-admin`.

Pequeno ajuste de agrupamento: **"Atendimento por IA"** sai do grupo **WhatsApp** e vai para o grupo **IA Studio** (logo abaixo de Assistentes), onde conceitualmente pertence — é o assistente respondendo no WhatsApp, config de IA, não gestão de canal. A tela e a rota (`/whatsapp/atendimento-ia`) **não mudam**; só o lugar no menu e o breadcrumb ("IA Studio / Atendimento por IA"). O grupo WhatsApp fica com Conversas · Templates · Equipes e Filas · Números.

## v0.10.51 - 2026-08-16 (Navegação: Habilidades + Memória viram "Ajustes gerais")

Sem `db push`. Só `platform-admin`.

Fecha a consolidação da navegação da área de IA (par do Monitoramento na v0.10.50, mesma direção do Aquapark). O grupo **IA Studio** vai de 6 → 5 itens: **Assistentes · Conhecimento · Pendências · Custos · Ajustes gerais**.

- **Ajustes gerais** *(novo)* reúne, em abas (segments do molde), **Habilidades** (catálogo de ferramentas), **Servidores MCP** e **Memória** — a configuração avançada que os assistentes usam por baixo, tirada do primeiro nível. Nenhuma capacidade some. Reaproveita as sub-telas existentes (as abas da Ferramentas + a Memória), cada uma renderizando a própria ListScreen com o mesmo padrão de segments.
- Rotas antigas (`/ia/ferramentas`, `/ia/memoria`) **redirecionam** para `/ia/ajustes?tab=…`. Os editores (ferramenta, perfil de memória, entradas de memória) seguem intactos.

Com as duas levas de navegação (Monitoramento + Ajustes gerais), a área de IA+Automação foi de **12 → 9** entradas de menu (IA Studio 5 + Automação 4). Direção mais enxuta, sem perda de capacidade — o "(A) reframe" combinado com o Robson.

## v0.10.50 - 2026-08-16 (Navegação: Execuções + Eventos + Notificações viram "Monitoramento")

Sem `db push`. Só `platform-admin`.

Segunda frente da simplificação (porte da direção do Aquapark): **enxugar a navegação** dobrando telas de observação/diagnóstico numa entrada só. O grupo **Automação** vai de 6 → 4 itens: **Fluxos · Agendamentos · Templates · Monitoramento**.

- **Monitoramento** *(novo)* reúne **Execuções**, **Eventos** e **Notificações** em abas (segments do molde) — nenhuma capacidade some, só deixaram de ser três itens de menu separados. Cada aba é a tela existente renderizada com o mesmo padrão de segments de Agendamentos/Usuários.
- Rotas antigas (`/automacao/execucoes`, `/eventos`, `/notificacoes`) **redirecionam** para `/automacao/monitoramento?tab=…` — links antigos e o sino do topo continuam funcionando. O detalhe de execução (`/automacao/execucoes/:id`) segue intacto.

É a leva (A) reframe decidida com o Robson: reorganiza e esconde o avançado, sem jogar fora nada. **Próxima frente (imediata):** o grupo **IA Studio** — dobrar **Habilidades** + **Memória** numa entrada "Ajustes gerais" (6 → 5 itens). Navegação é frente crítica, por isso feita em passos validados um a um.

## v0.10.49 - 2026-08-16 (Custos de IA vira painel de leitura — porte da ideia do Aquapark)

Sem `db push`. Só `platform-admin`.

Primeira frente da simplificação da área de IA, portando a direção do "Painel da IA" do Aquapark: **custo é acompanhamento, não gestão**. A tela **Custos de IA** deixa de ser um produto de 3 abas (Consumo / Orçamentos / Simulador) e passa a ser um **painel de leitura**: os indicadores (Custo total, Tokens, Assistentes ativos) + o consumo por provedor/modelo/assistente no mês. Segue no molde `DashboardScreen`.

Saíram da superfície:

- **Orçamentos** (definir limite mensal + alerta + bloqueio) — era uma **segunda fonte de configuração**; se o limite voltar a ser exposto, mora em Ajustes, não num produto de custo à parte. O backend de orçamento (`listBudgets`/`createBudget`/enforcement) **não foi tocado** — só o UI saiu de cena.
- **Simulador** de custo — planejamento, fora do escopo de um painel de observação.

Nada de dado novo foi inventado: a tela usa o mesmo `getCostsSummary` de antes. É uma redução de superfície reversível (o menu segue com "Custos"). Frente decidida com o Robson após o estudo comparativo Aquapark × IA Studio.

## v0.10.48 - 2026-08-15 (Adoção do DS: polimento — WizardScreen, FluxoCanvas e fechamento)

Sem `db push`. Só `platform-admin`.

Polimento final da adoção do DS:

- **Nova conexão** → do `Screen` base para o molde **`WizardScreen`**. É o caso de uso do wizard: o passo seguinte depende do anterior (escolher o conector define quais credenciais pedir). O molde traz o Stepper, o "Voltar/Avançar" e, no último passo, o verbo do que vai acontecer ("Criar e testar") — some a barra de botões montada à mão no cabeçalho. As telas de "conexão criada" e "nenhum conector instalado" seguem no `Screen` base (não são passos do wizard).
- **Editor de fluxo (canvas)** → entra no `Screen` base. Reavaliado: ele **não** é full-bleed — tem cabeçalho + canvas numa página normal, então deve respeitar a preferência de largura como as outras (quem quiser o canvas em largura total escolhe "Tela inteira" no Personalizar). Com isso **nenhuma tela com cabeçalho fica fora** da preferência de largura.

**Decisão registrada:** **Abertura de chamado** (ISP) foi mantida no `Screen` base, e **não** migrada para `SettingsScreen`. O molde de configuração envolve tudo num único cartão, mas essa tela tem 5 contextos de configuração independentes, cada um com seu próprio Salvar (decisão de design já documentada no arquivo). Colapsar em um cartão com 5 botões de salvar pioraria a clareza — forçar o molde aqui seria o oposto de adotá-lo bem.

Encerra a adoção: as únicas telas sem molde de largura agora são as genuinamente full-bleed (o **inbox de Conversas** do WhatsApp, `h-full` sem cabeçalho), por design.

## v0.10.47 - 2026-08-15 (Adoção do DS: telas restantes — fecha a cobertura de largura)

Sem `db push`. Só `platform-admin`.

Última frente da adoção do DS: as telas de editor/config que faltavam passam a ser `.su-screen`, então a preferência de largura do Personalizar (Medida de leitura / Tela inteira) alcança **o painel inteiro**. Feito numa frente só para não gastar tantos versionamentos.

- **Base de conhecimento (nova)** → molde `FormScreen` (`bare`, duas seções em cartão submetidas juntas).
- **Abertura de chamado** (ISP), **Nova conexão** (assistente com passos/Stepper), **Editor de fluxo**, **Editor de incidente**, **Editor de assistente** e **Bancada de testes** (Desenvolvedor) → molde base **`Screen`**, o contêiner oficial do DS para "jornada composta que nenhum molde especializado cobre". Preserva a estrutura de cada tela (abas, canvas do editor, tabelas, modais) e só traz o `.su-screen`/largura. Nada de comportamento mudou.

Ficam **de fora de propósito** (não devem ser capados na medida de leitura): o **canvas do editor de fluxo** (`FluxoCanvas`) e o **inbox de Conversas** do WhatsApp — telas full-bleed que querem a largura total, como manda o design. **Editar conexão** (`ConexaoEditar`) já usava `FormScreen`.

Com isso, **todas as telas de conteúdo do IA Studio usam um molde do DS** (ListScreen / DashboardScreen / SettingsScreen / FormScreen / Screen), e a largura escolhida no Personalizar vale em todas.

## v0.10.46 - 2026-08-15 (Adoção do DS: formulários simples no molde `FormScreen`)

Sem `db push`. Só `platform-admin`.

Os formulários de criação/importação passam a usar o molde `FormScreen` do DS — viram `.su-screen` (a largura do Personalizar vale neles) e ganham o comportamento do molde: é um `<form>` de verdade (Enter submete), o Salvar traz o estado de carregando no próprio botão, e o Cancelar/Salvar ficam na base do cartão (Cancelar *ghost* à esquerda, Salvar *primary* à direita). Onde há permissão, o Salvar **some** para quem não pode (via `canSubmit`), em vez de ficar cinza.

- **Novo fluxo** e **Importar fluxo** (Automação).
- **Importar assistente** e **Nova política de aprovação** (IA).
- **Adicionar documento** (IA/Conhecimento) — com o carregamento da base no skeleton do molde.
- **Novo template** (WhatsApp) — usa `FormScreen bare` (o formulário tem duas seções em cartão: os campos e os Botões), tudo submetido junto.

Ficam para levas seguintes: **Abertura de chamado** (ISP) é config de 5 seções independentes → molde `SettingsScreen`; **editores grandes** (AgenteEditor, FluxoEditor, IncidenteEditor, ConexaoEditar, BaseConhecimentoEditor), o **wizard** ConexaoNova (`WizardScreen`), o **canvas** FluxoCanvas e o **Console** do desenvolvedor → avaliados caso a caso.

## v0.10.45 - 2026-08-15 (Adoção do DS: Dashboard no molde `DashboardScreen`)

Sem `db push`. Só `platform-admin`.

O **Dashboard** (primeira tela após login) passa a usar o molde `DashboardScreen` do DS — o mesmo de Custos de IA. Vira `.su-screen` (a largura do Personalizar vale nele) e ganha o comportamento do molde: os 4 indicadores (Usuários, Workspaces, Execuções, Consumo de IA) viram `stats` renderizados pelo molde, com **skeleton na forma do KPI** durante o carregamento em vez do spinner solto que fazia o painel pular de "nada" para os números. O card de Plano segue como conteúdo abaixo dos indicadores. Cores por assunto (`hue`) preservadas.

## v0.10.44 - 2026-08-15 (Adoção do DS: Marketplace e Explorer no molde base `Screen`)

Sem `db push`. Só `platform-admin`.

As duas telas que faltavam passam a ser `.su-screen` (a largura do Personalizar vale nelas). Nenhuma das duas encaixa no molde `SearchScreen` — que é para "campo único de busca é a razão da tela, que começa vazia" — então usam o molde base **`Screen`** (jornada composta), preservando a estrutura atual:

- **Marketplace** (Integrações) é **browse-first**: mostra o catálogo de conectores em grade agrupada por categoria de cara, com filtro por nome/categoria. Não é busca-primeiro nem tabela — segue em grade, agora dentro de `Screen`.
- **Explorador de recursos** (Recursos) tem uma **busca composta** (conexão + tipo obrigatórios + texto opcional + botão), não um campo único. Segue com o formulário + a tabela de resultados + o Modal de detalhe, agora dentro de `Screen`.

Com isso, **todas as telas do IA Studio já usam um molde do DS** (ListScreen / DashboardScreen / SettingsScreen / Screen), então a preferência de largura do Personalizar alcança o painel inteiro. Restam só telas de **editor/formulário** e o **Dashboard** para revisão de molde numa próxima passada, se desejado.

## v0.10.43 - 2026-08-15 (Adoção do DS: Workspaces no molde base `Screen`)

Sem `db push`. Só `platform-admin`.

**Workspaces e ambientes** era a última tela de gestão que ainda não era `.su-screen`, então a preferência de largura do Personalizar não a alcançava. Ela não é lista nem formulário: é uma **grade de cards aninhados** (cada workspace contém seus ambientes), e forçá-la num `ListScreen` (que vira tabela no desktop) perderia o aninhamento. Então usa o molde base **`Screen`** do DS — o contêiner oficial para "jornada composta que nenhum molde especializado cobre" —, que traz o `.su-screen` (e a largura) preservando o grid de cards e os dois modais (renomear workspace / criar-renomear ambiente). Nada de comportamento mudou.

## v0.10.42 - 2026-08-15 (Deploy: `npm install --prefer-online` nos fronts)

Só `scripts/upgrade.sh`. Sem `db push`, sem mudança de código de app.

Os deploys da v0.10.40 e v0.10.41 falharam na etapa `ADMIN_BUILD` com `ETARGET` não porque a versão do Studio UX não existia, e sim porque o **cache de metadata do npm no servidor estava velho** e escondia as versões novas do DS publicadas no GitLab — só voltou a enxergar depois de um `npm cache clean --force` manual. Para não depender disso, o `npm install` dos fronts (os únicos que puxam `@studio-ux-ds/*`) passa a usar `--prefer-online`, que força o npm a revalidar a metadata contra o registry antes de resolver as versões.

Efeito a partir do próximo upgrade que rodar com este script (o `upgrade.sh` que executa é o da versão já instalada).

## v0.10.41 - 2026-08-14 (Fix do deploy da v0.10.40: Studio UX ^1.3.10)

Sem `db push`. Só `platform-admin`.

A v0.10.40 falhou no deploy na etapa `ADMIN_BUILD`: o `npm install` deu `ETARGET` porque `@studio-ux-ds/*@^1.3.8` **não existia no registry** (o número foi pulado). O servidor fez rollback sozinho para a v0.10.39 — nada ficou aplicado pela metade. Corrigido: a dependência do Studio UX passa a `^1.3.10` (versão publicada atual) nos quatro pacotes.

Todo o conteúdo da v0.10.40 (telas de ajuste no molde `SettingsScreen` — Trocar senha, Atendimento por IA, Minha conta) vai junto nesta versão, já que a v0.10.40 nunca chegou a ser aplicada.

## v0.10.40 - 2026-08-14 (Adoção do DS: telas de ajuste viram SettingsScreen + Studio UX 1.3.8)

Sem `db push`. Só `platform-admin`.

Primeira leva do molde **`SettingsScreen`** do DS (as levas 1–4 foram de listas → `ListScreen`). As telas de **ajuste/configuração** viram `.su-screen`, então a preferência de largura do Personalizar passa a valer nelas. O molde separa as duas ergonomias de configuração: ajuste de **efeito imediato** (um toggle que liga algo agora, retorno por toast, sem Salvar) e ajuste que **só vale em conjunto** (formulário com Salvar/Cancelar).

- **Trocar senha** → `SettingsScreen` com Salvar/Cancelar (formulário — vale em conjunto). Os campos foram para uma `SettingsSection`; o molde renderiza os botões.
- **Atendimento por IA** (WhatsApp) → `SettingsScreen` **sem Salvar** (efeito imediato): o toggle liga/desliga o fluxo na hora, com ConfirmDialog nos dois sentidos (os 5 patrasques) e retorno por toast.
- **Minha conta** → `SettingsScreen` **sem Salvar** (leitura): plano, consumo e recursos do plano em três `SettingsSection` (antes eram três cards soltos).

Além disso, **dependência do Studio UX subida para `^1.3.8`** (era `^1.2.68`) nos quatro pacotes (`tokens`/`components`/`icons`/`react`). Como não há `package-lock.json`, o `npm install` do `upgrade.sh` resolve a nova versão no deploy.

Ficam de fora (outro molde, frente própria): **Workspaces** (grade de cards aninhados), **Marketplace**/**Explorer** (→ Search) e **Dashboard** (→ Dashboard).

## v0.10.39 - 2026-08-14 (Adoção do DS: listas viram ListScreen — leva 4 (telas de administração))

Sem `db push`. Só `platform-admin`.

Última leva das telas de **lista** (leva 1 = IA na v0.10.34; leva 2 = Automação + WhatsApp na v0.10.37; leva 3 = Integrações + Recursos na v0.10.38). Convertidas as listas de administração/plataforma que faltavam — agora `.su-screen`, então a preferência de largura do Personalizar vale nelas. Comportamento preservado (colunas, clique-na-linha, barras de lote, paginação, estados vazios, os 5 patrasques).

- **Incidentes e Manutenções** (ISP) → `ListScreen` com busca por título.
- **Perfis de acesso** → `ListScreen` com busca + barra de lote (excluir, só perfis personalizados).
- **Chaves de API** (Desenvolvedor) → `ListScreen` com busca + barra de lote (revogar); os modais de criar/mostrar chave preservados.
- **Auditoria** → `ListScreen` com os filtros (ação/item/período) no painel de filtros do molde, paginação server-side e o Modal de detalhe (antes/depois) preservado.
- **Pessoas e convites** → `ListScreen` com as abas (Pessoas/Convites) viradas em **segments** do molde, busca por nome/e-mail, paginação (Pessoas) + os formulários em Modal preservados.

Ficam de fora (não são lista de tabela, entram com outro molde numa frente própria): **Workspaces e ambientes** (grade de cards aninhados workspace→ambiente — precisa de um molde de grade, não de tabela), Integrações/**Marketplace** e Recursos/**Explorer** (catálogo/busca → Search), **Dashboard** (painel → Dashboard) e as telas de ajustes (Atendimento IA, Minha conta etc. → Settings). Com isso, todas as telas que são **lista** no IA Studio já usam o molde do DS.

## v0.10.38 - 2026-08-14 (Adoção do DS: listas viram ListScreen — leva 3 (Integrações + Recursos))

Sem `db push`. Só `platform-admin`.

Continuação da adoção do DS tela a tela (leva 1 = IA na v0.10.34; leva 2 = Automação + WhatsApp na v0.10.37). Mais telas de **lista** viram `.su-screen`, então a preferência de largura do Personalizar passa a valer nelas. Comportamento preservado (colunas, clique-na-linha, barras de lote, estados vazios, os 5 patrasques).

Família **Integrações**:

- **Conexões** → `ListScreen` com busca por nome/conector/etiqueta + barra de lote (testar/editar/ativar/desativar/manutenção) + ConfirmDialog.
- **Cofre de Segredos** → `ListScreen` com busca por nome, seleção única, barra de lote (trocar os valores) + o Modal de rotação com ConfirmDialog.

Família **Recursos**:

- **Mapeamentos** → `ListScreen` com busca por tipo/conexão/operação + barra de lote (editar/ativar/desativar/excluir) + ConfirmDialog.

Ficam de fora (não são lista, entram com outro molde): Integrações/**Marketplace** (catálogo de cards → Search) e Recursos/**Explorer** (ferramenta de busca → Search). Telas de ajustes (WhatsApp/Atendimento IA e afins) entram com o molde de configuração.

## v0.10.37 - 2026-08-14 (Adoção do DS: listas viram ListScreen — leva 2 (Automação + WhatsApp))

Sem `db push`. Só `platform-admin`.

Continuação da adoção do DS tela a tela (leva 1 foi a família IA na v0.10.34). As telas de **lista** que eram `<div>` comum + `DataTable` não eram `.su-screen`, então a preferência de largura do Personalizar (Medida de leitura / Tela inteira) não as alcançava. Convertidas para o molde `ListScreen` do DS — o mesmo padrão do AquaPark. Comportamento preservado (mesmas colunas, clique-na-linha, ações em lote, estados vazios, os 5 patrasques nos ConfirmDialog).

Família **Automação** (as telas que são lista):

- **Fluxos** → `ListScreen` com busca por nome + barra de lote (arquivar/excluir) + ConfirmDialog.
- **Eventos** → `ListScreen` com busca server-side (debounce) pelo nome do evento, "Atualizar" na toolbar, paginação, e o detalhe (payload + reprocessar) segue em Modal.
- **Execuções** → `ListScreen` com os filtros (situação/fluxo/rastreio) no painel de filtros do molde, "Atualizar" na toolbar, paginação.
- **Notificações** → `ListScreen` só-leitura (log), "Atualizar" na toolbar, paginação.
- **Templates (Automação)** → `ListScreen` com filtro por canal no painel de filtros + barra de lote (editar/excluir).
- **Agendamentos** → `ListScreen` com as abas (Agendamentos/Calendários) viradas em **segments** do molde.

Família **WhatsApp** (as telas que são lista):

- **Números** → `ListScreen` com busca por nome/telefone + barra de lote (Sincronizar agora).
- **Templates (WhatsApp)** → `ListScreen` com filtro por número no painel de filtros + "Atualizar" na toolbar; Sincronizar/Novo no cabeçalho.
- **Equipes e Filas** → `ListScreen` com as abas (Equipes/Filas) viradas em **segments** do molde, preservando a barra de lote (Desativar/Reativar) e o ConfirmDialog.

Ficam de fora (não são lista): WhatsApp **Conversas** (inbox full-bleed) e **Atendimento IA** (tela de ajustes — entra depois com o molde de configuração). Próximas levas de lista: Integrações e Recursos.

## v0.10.36 - 2026-08-07 (Fix: abas da Custos paravam de pular)

Sem `db push`. Só `platform-admin`.

Na v0.10.35 os KPIs da Custos apareciam **só na aba Consumo** — então trocar de aba fazia a barra de abas **pular de posição** (com KPIs no Consumo, sem KPIs nas outras). Corrigido: os indicadores (Custo total / Tokens / Assistentes ativos) passam a ser carregados no **nível da página** e ficam **fixos acima das abas**, iguais nas três — é o que o `DashboardScreen` (v1.2.68) manda ("os KPIs são o assunto da tela e não mudam com a aba"). A barra de abas fica sempre no mesmo lugar; só o conteúdo abaixo troca.

## v0.10.35 - 2026-08-07 (Adoção do DS: Custos vira DashboardScreen — a última tela do IA Studio)

Sem `db push`. Só `platform-admin`.

**Custos** era a única tela do IA Studio que a preferência de largura do Personalizar (Medida de leitura / Tela inteira) não alcançava — porque não era `.su-screen`. Não é lista: é um painel (indicadores + tabela + calculadora). Convertida para o molde `DashboardScreen` do DS, o mesmo que o AquaPark usa nos painéis. As abas Consumo/Orçamentos/Simulador viraram as `tabs` do molde. Com isso, **todas as telas do IA Studio respeitam a largura**.

## v0.10.34 - 2026-08-07 (Adoção do DS: listas viram ListScreen — leva 1 (família IA))

Sem `db push`. Só `platform-admin`.

As listas que eram `<div>` comum + `DataTable` não eram `.su-screen`, então a preferência de largura do Personalizar (Medida de leitura / Tela inteira) não as alcançava. Convertidas para o molde `ListScreen` do DS — o mesmo padrão que o AquaPark usa — que traz a `.su-screen` e a toolbar padrão. Comportamento preservado (mesmas colunas, clique-na-linha, ações, estados vazios).

Convertida a **família IA inteira** (as telas que são lista):

- **Memória**, **Conhecimento**, **Assistentes** → `ListScreen` com busca por nome (pra a toolbar do molde não ficar vazia). Assistentes preserva a barra de lote (exportar N, Versões) e o modal de versões.
- **Habilidades** e **Pendências** → `ListScreen` com as abas viradas em **segments** do molde (Catálogo/Servidores MCP; Fila/Políticas), preservando ações em lote e modais.

Leva 1 de uma migração por família (regra do DS: adoção tela a tela). Próximas: Automação, WhatsApp, Integrações, Recursos e as avulsas — as que são de fato lista. Telas mistas (ex.: Custos = resumo + lista + calculadora) entram com o molde certo de cada uma (Dashboard/Form), não à força em ListScreen.

## v0.10.33 - 2026-08-07 (Studio UX 1.2.68: medida de leitura, largura escolhida pela pessoa)

Sem `db push`. Só `platform-admin` (dependência do DS).

Sobe o Design System de `^1.2.49` para **`^1.2.68`** (19 versões). O que chega ao painel:

- **Medida de leitura (1.2.66).** Os moldes de tela (`FormScreen`/`DetailScreen`) passam a limitar o conteúdo a 1280px centralizados. É o remédio para o defeito que aparecia em monitor largo: rótulo a mil pixels do valor, barra de progresso virando um fio de 1700px. **Nenhuma tela do painel precisou de `wide`** — as 14 que usam molde são formulários e detalhes, exatamente o caso que o teto beneficia; o canvas de fluxo não usa molde, então não é afetado. `wide` fica reservado para quando aparecer conteúdo que realmente queira o monitor inteiro.
- **A pessoa escolhe a largura (1.2.67).** O Customize ganhou *Largura do conteúdo* (medida de leitura × tela cheia), persistida junto com tema e acento. Serve de escape se alguma tela ficar apertada — sem precisar de release. Entra sozinho: o painel já chama `configureTheme`/`applyTheme` no boot, então não há piscada.
- **Também vêm** (sem trabalho no consumidor): `DashboardScreen` com abas mantendo os KPIs fixos (1.2.68), `DataTable` com linha de detalhe expansível (1.2.64), `TableIdentity` (1.2.63), correções de `DescriptionList`, busca da toolbar, `FileUpload`, `NumericInput` e cinco glifos que estavam sendo encobertos por apelidos (1.2.60).

Os "consumer follow-up" das versões desse intervalo eram todos do AquaPark — nada pendente para o IA Studio.

## v0.10.32 - 2026-08-07 (Com endereço dedicado, o Console some do domínio principal)

Sem `db push`. Backend (rota pública) + Console (boot).

Com o Console tendo endereço próprio, `/<domínio principal>/console/` não deveria mais atender — agora abrir esse caminho leva direto ao endereço dedicado.

- **`GET /public/console-location`** (aberto, throttle): devolve só o hostname do Console canônico (host `CONSOLE` **ACTIVE**, o principal ganha) ou `null` quando não há endereço dedicado. Nada além do hostname sai por aí — e ele não é segredo: o certificado desse host está em Certificate Transparency, público.
- **O Console redireciona no boot**, antes de montar a aplicação (sem piscar tela). Preserva a rota, tirando o prefixo `/console/` — no endereço dedicado ele mora na raiz.
- **Por que não editar o vhost principal:** aquele arquivo é gerenciado pelo certbot; cirurgia com `sed` ali arriscaria o TLS do domínio principal. O redirecionamento no app é reversível e vale para qualquer instalação.
- **Salvaguardas** (redirecionar sozinho pode trancar o operador para fora): só redireciona para host *No ar*; **`?stay=1`** desliga na visita; falha de rede não redireciona; e nunca redireciona se já estiver no host canônico (sem laço).

## v0.10.31 - 2026-08-07 (Console em domínio dedicado abre na raiz, sem /console/)

Sem `db push`. Scripts de build/deploy (`install.sh`, `upgrade.sh`) + vhost (`domains-sync.sh`).

A v0.10.30 tirou a página branca redirecionando para `/console/` — funcionava, mas deixava a URL feia num domínio que existe só para o Console. Agora é a solução certa:

- **Duas saídas de build do Console.** `base` do Vite e `basename` do router são definidos **em build**, então um `dist` só não serve dois lugares. O `install.sh` e o `upgrade.sh` passam a gerar também `platform-console/dist-root` (build com `base=/`), além do `dist` normal (`/console/` no modo single). O `npm install` continua rodando uma vez.
- **O vhost do domínio dedicado serve `dist-root` na raiz** — `console.seudominio.com.br` abre o Console direto, sem `/console/`.
- **Fallback sem página branca:** se o servidor ainda não passou pelo upgrade que gera o `dist-root`, o script avisa e cai no layout `/console/` (funciona) em vez de servir a raiz quebrada.
- Para aplicar num vhost já existente: `bash scripts/domains-sync.sh --host <host> --force-vhost` (o script é *create-if-missing* para não apagar o bloco TLS do certbot).

## v0.10.30 - 2026-08-07 (Fix: Console em domínio dedicado abria em branco)

Sem `db push`. Só o script de operação (`scripts/domains-sync.sh`) — nenhum código compilado mudou.

- **A causa:** o Console é buildado com `base=/console/` (o `index.html` pede `/console/assets/…` e o router usa `basename=/console/`). O vhost que eu gerava para um host de superfície `CONSOLE` servia o `dist` na **raiz** do domínio — o HTML carregava, os assets davam 404 e o router não casava rota nenhuma. Resultado: **página branca**, com a situação marcada corretamente como "No ar" (DNS e certificado estavam certos; o errado era o layout do vhost).
- **A correção:** o vhost de host `CONSOLE` passa a espelhar o layout que já funciona no domínio principal — `/` redireciona para `/console/`, servido por alias, com `/api/` no proxy.
- **`--force-vhost`:** o script é *create-if-missing* de propósito (para não apagar o bloco TLS que o certbot injeta), então um vhost criado por versão anterior não seria corrigido sozinho. O novo flag recria o arquivo; o certbot reinjeta o TLS em seguida, porque a emissão é idempotente.
- Registrado em `docs/dominios-e-subdominios.md`. **Pendência conhecida:** servir o Console na raiz do domínio dedicado (sem o `/console/`) exigiria um segundo build com `base=/` — muda `install.sh`/`upgrade.sh` e fica como frente própria.

## v0.10.29 - 2026-08-07 (Endereço entra no ar pelo painel — sem terminal)

Sem `db push`. Backend + Console.

A v0.10.28 deixou o endereço cadastrável, mas para ele **entrar no ar** era preciso rodar um script no servidor. Isso era meia funcionalidade — e não era o que estava decidido (a escolha tinha sido **automatizar a emissão**). Corrigido:

- **Botão "Verificar e ativar"** em cada endereço (`POST /console/domains/:id/activate`): o sistema confere o DNS, publica o vhost e emite o certificado. Dispara o `domains-sync.sh` em processo **detached** — exatamente o padrão que o `upgrade.sh` já usava; não havia limitação técnica, só conservadorismo. Enquanto roda, a linha mostra "Verificando…"; ao fim, a situação vem do próprio registro.
- **Motivo da falha na tela.** O script já gravava `last_error`; agora a linha mostra (ex.: "DNS não aponta para este servidor"), em vez de deixar o operador adivinhar.
- **Reverificação automática** (`DomainVerifyCron`, 30 min) para os endereços pendentes — propagação de DNS demora e ninguém deve ficar clicando. **Nasce OFF** (automatismo é opt-in): toggle "Verificar sozinho os endereços pendentes" na tela.
- **`domains-sync.sh --host <hostname>`** (antes só varria tudo), com validação do hostname; o script segue rodável na mão como diagnóstico.
- **Correção de rota:** `GET /console/domains/auto-verify` foi declarada **antes** de `:id` — senão "auto-verify" seria capturado como id.

## v0.10.28 - 2026-08-07 (Endereços por cliente: subdomínio, domínio próprio e troca do host do Console)

⚠️ **`db push` (destrutivo, só adição)** — tabela `core_platform_domains` + enums `Domain{Scope,Surface,Kind,Status,CertStatus}`; `Organization` ganhou a relação `domains`. `slug`/`custom_domain` seguem **intactos** (coexistência).

O sistema atendia por **um** endereço e resolvia a organização só pelo JWT. Agora o endereço é um registro de primeira classe — e um cliente pode ter **subdomínio no domínio-base** ou **domínio próprio**.

- **Registro (`PlatformDomain`).** Um registro por hostname, com **escopo** (`PLATFORM` = Console/API/painel base, `organization_id` nulo · `ORGANIZATION` = do cliente), **superfície** (`ADMIN`/`CONSOLE`/`API` — é o que permite **trocar o subdomínio do Console**), **tipo** (`SUBDOMAIN` filho do domínio-base × `CUSTOM` domínio próprio, que nasce com token de posse), principal único por escopo, situação e estado de certificado. Mutations auditadas.
- **Resolução por Host** (`HostResolverService`) + `GET /public/tenant-context` (aberto, throttle, exposição mínima: nome/slug/branding/superfície). **O Host decide só a apresentação** — acesso a dado continua governado por JWT + `organization_id`. Endereço não cadastrado resolve `null` e o sistema se comporta como hoje (**nada muda em produção até cadastrar**).
- **Login white-label:** a tela de acesso veste a marca do cliente quando a URL é dele; sem endereço cadastrado, mantém a identidade da plataforma. Não bloqueia a renderização.
- **Console → Endereços** (`/dominios`): domínio-base, cadastro (subdomínio pelo nome com prévia, ou domínio próprio), promover principal e remover — com confirmação, gate e toast. Situação em linguagem de dono: *Aguardando DNS · Verificando · No ar · Falhou · Desativado*.
- **Operação (`scripts/domains-sync.sh`)**: lê o registro, cria/atualiza o vhost, valida com `nginx -t`, recarrega, emite o certificado (idempotente) e grava a situação de volta. **Certificado por host (HTTP-01)** em vez de wildcard — wildcard exigiria desafio DNS-01 e credencial do provedor de DNS. Roda **fora do deploy por tag** (o `upgrade.sh` não toca no nginx). Runbook: `docs/dominios-e-subdominios.md`.

## v0.10.27 - 2026-08-06 (Studio UX pelo GitLab próprio)

Sem `db push`. Scripts, configuração de pacote e documentação de deploy.

- O painel passa a buscar `@studio-ux-ds/*` do registro privado da Nivoo no GitLab, usando `GITLAB_PACKAGE_TOKEN` somente no `.env` do servidor.
- O instalador aceita `--gitlab-package-token` e não permite uma instalação nova sem a credencial de leitura necessária ao build.

## v0.10.26 - 2026-07-27 (Família `detail`: 5 telas de registro no molde)

Sem `db push`. Só frontend. **Sem bump do DS** — as cinco telas couberam no `DetailScreen` que já existe (v1.2.46), sem pedir nada novo. É a primeira família em que isso acontece.

`Integracoes/ConexaoDetalhe` · `IA/BaseConhecimentoDetalhe` · `Automacao/ExecucaoDetalhe` · `IA/AprovacaoDetalhe` · `IA/MemoriaEntradas`

### 🔴 Um bug de verdade, achado no caminho

`IA/AprovacaoDetalhe` tinha `breadcrumb={breadcrumb}` no `PageHeader` — **prop que o DS não tem, com uma variável que não existe no arquivo**. Isso não é prop morta silenciosa: é `ReferenceError: breadcrumb is not defined` no render. **A tela de detalhe de uma aprovação estava quebrada** — abria em branco.

O detalhe que dói: quatro linhas acima havia um comentário escrito por mim dizendo *"Breadcrumb NÃO vai no PageHeader (o componente do DS não tem essa prop)"*. O comentário estava certo e o código logo abaixo fazia exatamente o contrário. **Documentar a regra não impede de quebrá-la** — o que impede é a regra estar no componente ou numa checagem.

### O que muda nas cinco

- **"Voltar" garantido pelo molde**, fora das ações do cabeçalho. Antes ele era um `Button variant="secondary"` no meio das ações do registro, competindo com "Editar" e "Excluir" — três botões cinzas em que o de sair parecia mais uma operação.
- **As ações do cabeçalho ficaram só com o que age sobre o registro:** Testar/Editar (conexão), Cancelar/Reexecutar (execução), Excluir/Adicionar documento (base), Editar perfil (memória).
- **Carregando e erro dentro da aba**, não no lugar da tela: quem já leu o título e clicou numa aba não vê o cabeçalho sumir.
- Sumiram os dois blocos de carregando com um `PageHeader` escrito "Carregando…", e os `flex justify-center py-12` montados à mão viraram `Spinner center`.

### Verificado

Os 113 arquivos parseiam · nenhum import órfão em nenhuma tela (um achado e removido: `DescriptionList` no `BaseConhecimentoDetalhe`) · nenhum resíduo de `PageHeader`/`Tabs` nas cinco.

## v0.10.25 - 2026-07-27 (Linhas de ação alinhadas — o `FormRow`)

Sem `db push`. Só frontend. Bump do DS: `^1.2.47` → **`^1.2.49`** (`FormRow`).

### Linhas de ação alinhadas — 5 telas

Você apontou no print do `EquipeEditor`: o seletor de pessoa esticado até a borda, a dica do "Como" empurrando o controle dele para cima, o botão "Adicionar" descolado da linha. Não era daquela tela — era o `flex items-end gap-2` montado à mão, que existia em **cinco** lugares:

`WhatsApp/EquipeEditor` (adicionar pessoa) · `IA/BaseConhecimentoDetalhe` (pergunta de teste) · `IA/MemoriaEntradas` (filtrar por chave) · `ISP/IncidenteEditor` (incluir cliente) · `ISP/AberturaChamado` (par departamento/assunto)

As cinco passaram a usar **`FormRow`** (DS v1.2.47). O `AberturaChamado` tinha um `marginBottom: 1` cravado na lixeira para ela "parecer" alinhada — sintoma clássico de arranjo errado, não de botão errado; saiu junto.

### Verificado

Os 113 arquivos parseiam · **nenhum import órfão em nenhuma tela do painel** (um achado e removido: `IconButton` no `MessageComposer`) · no DS, o `FormRow` emite a etiqueta fantasma e o campo `grow`.

**Nota sobre a verificação:** o primeiro detector de import órfão acusou 6, e **5 eram falsos positivos** — ele removia `import[^;]*;` de forma gananciosa e, num arquivo com a palavra "importar" dentro de um comentário, engolia o JSX seguinte, concluindo que o componente não era usado. Corrigido para remover só linhas que **começam** com `import`. Detector que erra para mais é quase tão ruim quanto o que erra para menos: gasta confiança e ensina a ignorar o aviso.

## v0.10.24 - 2026-07-27 (Família `form`: 9 editores passam a instanciar o molde)

Sem `db push`. Só frontend. Bump do DS: `^1.2.41` → **`^1.2.47`** (os 6 moldes da v1.2.46 + `type="button"`, `canSubmit` e `bare` da v1.2.47).

Primeira família a adotar **molde** de tela, e não só componentes. Nove editores em rota:

`WhatsApp/FilaEditor` · `WhatsApp/EquipeEditor` · `Automacao/CalendarioEditor` · `Automacao/TemplateEditor` · `IA/MemoriaPerfilEditor` · `IA/FerramentaEditor` · `Integracoes/ConexaoEditar` · `PerfilEditor` · `Recursos/MapeamentoEditor`

### O que muda na tela

- **O Enter agora envia.** Antes nenhum desses formulários era um `<form>` — eram `<div>` com um botão de `onClick`. Quem preenchia pelo teclado apertava Enter e não acontecia nada. **Ninguém reporta isso**; as pessoas só param de usar o teclado.
- **As ações saíram do cabeçalho para o rodapé do cartão**, que é onde a leitura do formulário termina. É a mudança visível da entrega — no cabeçalho, num formulário longo, o Salvar fica fora da tela justamente quando você acaba de preencher.
- **Sem permissão, o Salvar não aparece** (antes ficava escondido em uns, cinza em outros). Botão cinza convida a tentar e depois nega.
- **Cada tela ganhou um "voltar" garantido**, que não depende de o breadcrumb estar certo.
- Carregando virou o esqueleto em forma de campos do molde, no lugar do spinner solto + um `PageHeader` escrito "Carregando…".

### O que a adoção devolveu para o DS

Três coisas que só apareceram ao usar o molde de verdade — e as três viraram DS v1.2.47 **antes** de qualquer improviso aqui:

1. **`Button` nascia sem `type`.** Dentro de um `<form>`, isso é `submit`: a lixeira de "remover membro" do `EquipeEditor` passaria a **salvar a equipe e navegar**. HTML correto, zero aviso. Agora `Button` e `IconButton` nascem `type="button"`.
2. **`canSubmit`** — a regra "quem não pode não vê" precisava existir no molde.
3. **`bare`** — formulário cujas seções já são cartões (`PerfilEditor`, com um cartão por grupo de permissão). Continua sendo **um** `<form>`.

### Verificado

Os 113 arquivos parseiam · nenhum import órfão **em nenhuma tela do painel** (dois achados e removidos: `Select` no `FerramentaEditor`, `Button` no `PerfilEditor`) · nenhuma referência solta a `PageHeader`/`Spinner` nas telas migradas · no DS, `FormScreen` com botões auxiliares rende **1 submit em 3 botões**.

**Nota sobre a verificação:** o primeiro detector de import órfão acusou 6 falsos positivos porque removia `import[^;]*;` de forma gananciosa — num arquivo com a palavra "importar" dentro de um comentário, ele engolia o JSX seguinte e concluía que o componente não era usado. Corrigido para remover só linhas que **começam** com `import`. Detector que erra para mais é quase tão ruim quanto o que erra para menos: gasta confiança e ensina a ignorar o aviso.

### Fora desta leva, de propósito

`IA/AgenteEditor` (998 LOC), `ISP/IncidenteEditor` (636) e `ISP/AberturaChamado` (526) têm abas e fluxo próprio — são `form` + `detail` misturados e merecem leitura tela a tela, não sweep. `ContaSenha` já era `<form>`. `ConexaoNova` é `wizard`.

## v0.10.23 - 2026-07-27 (Correção: o build da v0.10.22 parou no `vite.config.js`)

Sem `db push`. Só frontend. Mesmo DS (`^1.2.41`).

A v0.10.22 **falhou na etapa `ADMIN_BUILD`** e o painel manteve a versão anterior (fail-safe funcionando):

```
Could not resolve entry module "lucide-react".
```

### Causa

O `vite.config.js` tinha `manualChunks: { 'vendor-icons': ['lucide-react'] }`. **`manualChunks` nomeia um módulo de ENTRADA** — tirar a dependência do `package.json` sem tirar essa linha faz o Rollup abortar. Foi corrigido junto do README, que ainda listava `lucide-react` na pilha.

### A lição, que é minha

Eu varri `src/` (113 arquivos), varri o `package.json`, verifiquei parse, ícone, import órfão — **e não olhei a configuração de build.** A checagem que eu mesmo escrevi ("nenhum arquivo importa de fora") era verdadeira e insuficiente: `manualChunks` não é um `import`, é uma lista de nomes em JSON-ish dentro de um `.js`, invisível para qualquer busca por `import ... from`.

Regra que fica: **remover uma dependência é três lugares, não dois** — o código, o `package.json` e **tudo que a nomeia por string** (`vite.config.js` `manualChunks`/`optimizeDeps`, README, Dockerfile, script de build). O `grep` certo não é pelo `import`; é pelo **nome do pacote**, no repositório inteiro, ignorando só `node_modules` e `dist`. Foi assim que achei os dois pontos agora — e o mesmo `grep` mostrou que o `platform-console` **continua com a dependência de propósito** (não foi migrado ao DS), então o `vendor-icons` dele está correto e fica.

## v0.10.22 - 2026-07-27 (Fim da segunda biblioteca de ícones — 62 arquivos)

Sem `db push`. Só frontend. Bump do DS: `^1.2.40` → **`^1.2.41`** (10 glifos de mídia/gravação + `Spinner` com `size`/`center`).

Execução da lacuna medida na v0.10.21: **62 arquivos ainda importavam ícone de outra biblioteca.** Agora são zero, e a dependência **saiu do `package.json`**.

### O que mudou

| Antes | Agora | Onde |
|---|---|---|
| `<div className="flex justify-center py-16"><Loader2 size={24} .../></div>` | `<Spinner size="lg" center />` | 54 lugares |
| `<Loader2 size={13..28} className="animate-spin" .../>` | `<Spinner size="sm\|lg" />` | 17 lugares |
| `<Button disabled={saving}>{saving && <Loader2 .../>}Salvar` | `<Button loading={saving}>` | `ContaSenha` |
| 18 glifos de outra biblioteca | `<DSIcon name="…" />` | canvas, composer de áudio, anexo, player, bolha de conversa |
| `"lucide-react": "^0.383.0"` | — | `package.json` |

O `check`/`check-double`/`clock`/`alert-triangle` da **bolha de conversa** (enviado, entregue, lido, falhou, na fila) passaram a vir do DS — mantendo as cores fixas do WhatsApp, que são convenção do aplicativo e continuam em `DT-005`.

### Dois casos que o sweep quase quebrou — e por que a verificação achou

O ícone estava sendo passado **como valor**, não como elemento: `<CollapsedRail icon={Layers} />` no canvas e `{ icon: Camera, label: 'Câmera' }` no seletor de anexo. A troca mecânica cuidou do JSX (`<Layers />`), não achou uso do identificador, **removeu o `import`** — e deixou a referência viva. O resultado seria `ReferenceError` no clique: **trilho do canvas e menu de anexo em branco**, sem erro no build e sem aviso no console até alguém clicar.

Achado por uma checagem própria: *para cada nome removido de um `import`, ele ainda aparece no corpo do arquivo?* Cinco acusações, três reais. Os dois componentes passaram a receber o **nome do glifo** (`icon="layers"`, `icon: 'camera'`), que é o formato do DS e elimina o motivo de importar ícone de fora — era só para ter algo que se pudesse passar como valor.

É a terceira vez que o mesmo tipo de armadilha aparece num sweep, sempre com roupa nova: em `Checkbox` foi `children` indo pro DOM, em `Tabs` foi `id` faltando dentro de um array de dados, aqui foi identificador órfão depois de limpar `import`. **Sweep mecânico não é trivial** — e a regra prática é que a verificação tem que ser diferente da transformação: quem procura pelo mesmo padrão que trocou não acha o que escapou.

### Verificado

Todos os 113 arquivos parseiam · nenhum `Spinner`/`DSIcon` usado sem `import` · nenhum importado sem uso · nenhum nome de glifo fora do catálogo (91 glifos) · nenhum identificador órfão · `package.json` válido · `import` do `@xyflow/react` intacto (um regex meu chegou a comê-lo numa passada intermediária — refeito do zero em vez de remendado).

## v0.10.21 - 2026-07-27 (As telas de acesso passam a instanciar o molde do DS)

Sem `db push`. Só frontend. Bump do DS: `^1.2.39` → **`^1.2.40`** (`AuthScreen` + `MessageScreen`).

Sua pergunta: *"tela de login continua diferente da criada no Studio UX... essa parte que não entendo: tela de login, logout, 404 e etc não foram criadas os padrões em Studio UX?"*

**Foram.** O `STUDIO_UX_TEMPLATES` §2 especifica **9 moldes de tela** desde a era de geração, e `examples/login.html` é a referência viva do de acesso. O que não existia era a **materialização em React** — só o molde `list` tinha componente (`ListScreen`). Como este painel só consome React, os outros oito eram invisíveis na prática, e na entrega anterior eu escrevi as três telas à mão. Não foi decisão de desenho; foi eu não ter inventariado os moldes antes de escrever.

### Corrigido — Login

Agora instancia `AuthScreen`. O que a tela ganhou por vir do molde, e não da minha mão:

- **Painel de marca à esquerda** (só a partir de 900px — em tela estreita o formulário ocupa a tela inteira), com "Bem-vindo de volta", o que o produto faz e três destaques.
- **"Esqueci a senha?"** — que **não promete um e-mail que não existe**: ainda não há fluxo de recuperação, então o link explica que quem administra a organização redefine a senha em Pessoas.
- **"Manter conectado neste dispositivo"** e botão de largura cheia (`size="lg" block`).
- **Sem "entrar com Google/Microsoft"**, como você apontou: o exemplo tem o divisor de SSO porque é um exemplo genérico; aqui a autenticação é por e-mail e senha da organização. O molde não obriga — aquilo é conteúdo, isto é arranjo.

### Corrigido — Aceitar convite

Mesmo molde, **sem o painel de marca**. Quem chega ali já foi convidado e só precisa escolher uma senha; painel de argumento no meio de um passo obrigatório é conversa de venda. Sem painel, o molde centra o formulário — o `AuthScreen` só renderiza o painel quando há conteúdo para ele.

### Corrigido — 404 e sem permissão

As duas telas de aviso (criadas na v0.10.20 à mão com `Card` + `EmptyState`) passam a instanciar `MessageScreen`, o molde `empty` de tela inteira. Mesmo comportamento, agora vindo do DS — e a regra que ele carrega ("nenhum desses casos redireciona em silêncio") deixa de morar só neste repositório.

Também movi o catch-all de rota para **dentro da casca autenticada**: o comentário dizia que o aviso aparecia com menu e caminho de volta, mas a rota estava fora do `Layout` — aparecia nua, e quem não estava logado via um 404 em vez de cair no login.

### Auditoria do que ainda falta (medida, não estimada)

Você perguntou "falta alguma coisa?" — então medi em vez de responder de cabeça. **Confirmado em ordem:** 70 de 70 rotas com casca têm breadcrumb (34 estáticas + 36 por padrão); toda tela de lista tem estado vazio; toda ação destrutiva tem `ConfirmDialog`; nenhum import inexistente no barrel do DS; nenhum nome de ícone fora do catálogo; os 113 arquivos da `src` e os 22 do `@studio-ux-ds/react` parseiam. **Duas correções de documentação viva:** o `.npmrc` **já está sem BOM** (os docs diziam que estava com — débito fechado), e a frase "o `lucide-react` sobrou só para o `Loader2`" **era falsa**.

**Duas lacunas reais, ainda abertas, cada uma frente própria:**

1. **`lucide-react` em 62 arquivos.** 57 usam `Loader2` — o DS tem `Spinner` e ninguém adotou; 14 usam glifos, sendo 5 que o DS já tem (`plus`, `square`, `play`, `layers`, `chevron-down` — duas famílias de desenho na mesma tela, sem motivo) e **9 que o DS não tem** (`pause`, `mic`, `sliders`, `rotate`, `music`, `image`, `file-text`, `clock`, `camera`). Os 9 são **vocabulário de mídia e gravação** que o composer de áudio do WhatsApp precisa — pela regra "onde o consumidor sai do DS há lacuna do DS", são pedido ao DS antes de qualquer sweep aqui.
2. **6 dos 9 moldes de tela não existem em React** (`dashboard`, `detail`, `form`, `search`, `settings`, `wizard`), e temos telas em todas essas classes: **18 detalhe/editor em rota**, 16 formulários, 1 assistente de passos, 3 painéis. Cada uma foi arranjada à mão — é **exatamente a lacuna que o login tinha**, ainda não disparada porque ninguém pôs as duas versões lado a lado.

### Lição

**Especificação sem materialização na camada que o consumidor usa não é adotada.** É a mesma família dos props mortos e dos glifos repetidos: o DS tinha a resposta, nada me levou até ela, e o desvio passou porque o resultado era plausível. A tabela de moldes materializados agora existe em `STUDIO_UX_TEMPLATES` §Estado da implementação, e consultá-la é passo obrigatório antes de escrever tela de classe recorrente.

## v0.10.20 - 2026-07-26 (Ícones, marca e os três estados que faltavam)

Sem `db push`. Só frontend. Bump do DS: `^1.2.38` → **`^1.2.39`** (26 glifos de navegação + a regra "um conceito de menu, um glifo").

Esta entrada nasce de uma cobrança justa sua: eu migrei tela por tela e **nunca auditei o conjunto**. Ícone, marca e os estados globais nunca passaram por critério nenhum.

### Corrigido — ícones do menu

O menu tinha **30 itens e 7 ícones próprios**. A medição:

| Glifo | Itens que compartilhavam |
|---|---|
| `file` | **12** — Conhecimento, Custos, Templates (×2), Marketplace, Recursos, Mapeamentos, Desenvolvedor, Bancada, Workspaces, Auditoria, Minha conta |
| `settings` | **9** — IA Studio, Memória, Habilidades, ISP, Abertura de chamado, Automação, Integrações, Conexões, Configurações |
| `lock` | 4 · `bell` 2 (Incidentes **e** Notificações) · `chart-bar` 2 · `message` 2 · `user` 2 |

- **A causa era o mapa `LUCIDE_TO_DS`** neste arquivo: ele traduzia nome do lucide → glifo do DS "por proximidade semântica" e, como o catálogo não tinha vocabulário de navegação, quase tudo caía em `file` ou `settings`. O `|| 'help'` do fim nunca era alcançado — havia sempre um glifo "mais ou menos". **Indireção que degrada em silêncio é pior que nenhuma.**
- **O mapa foi eliminado.** Cada item do menu declara o glifo do DS direto (`icon: 'coin'`), e o catálogo ganhou os 26 que faltavam (DS v1.2.39).
- **Resultado: 38 glifos distintos em 40 itens.** As duas repetições restantes são deliberadas — `bot` em Assistentes e Atendimento por IA (é o mesmo assistente visto de dois lugares) e `file` nos dois Templates.

### Corrigido — a marca

Havia **três representações diferentes** do IA Studio: um `·` (ponto tipográfico) no menu, um raio no login e a faísca de 4 pontas no favicon. Agora é **uma**: a do favicon virou o glifo `spark` do DS — com o **mesmo path**, não um desenho parecido — e é usada no menu, no login e no aceite de convite, herdando o accent do tema. O favicon manteve cor fixa (não tem tema) mas passou ao accent padrão do DS.

### Adicionado — os três estados que não tinham tela

- **Sair agora pede confirmação.** Era um item de menu ao lado de "Minha conta" que encerrava a sessão no clique; um clique errado derrubava quem estava no meio de um cadastro.
- **Endereço que não existe** tem tela (`Aviso`): diz qual endereço falhou e oferece voltar ou ir ao início. Antes redirecionava calado para o Dashboard — a pessoa digitava errado e concluía que o sistema travou.
- **Sem permissão** tem tela: explica que o endereço existe mas o perfil não inclui aquela parte, e o que fazer (pedir a permissão). Antes também redirecionava em silêncio — quem recebia um link de um colega com mais acesso clicava e "nada acontecia".

### O que dá pra verificar agora

1. **Barra lateral**: cada item com um ícone diferente e coerente — Custos é uma moeda, Incidentes é transmissão, Fluxos é ramificação, Habilidades é chave inglesa, Bancada é terminal.
2. **A marca no topo do menu** é a faísca do favicon, na cor do accent (troque o accent em Personalizar e ela acompanha).
3. **Login e aceite de convite** com a mesma faísca — não mais um raio.
4. **Menu de conta → Sair**: aparece a confirmação; cancelar mantém a sessão.
5. **Digite um endereço inexistente** (ex.: `/nao-existe`): tela explicando, dentro da casca, com Voltar e Ir para o início.
6. **Abra uma rota sem ter a permissão** (ex.: `/auditoria` num perfil sem `core.audit.read`): tela dizendo que falta acesso, não um redirecionamento mudo.

### Lição

Migrar tela a tela não audita o conjunto. Ícone, marca, 404, sem-permissão e logout **não pertencem a nenhuma família** — e foi exatamente por isso que ficaram de fora: minha unidade de trabalho era a família, e nada me obrigou a olhar o que atravessa todas elas. O que faltou foi um passo de fecho com critério medível (glifos distintos ÷ itens; quantas representações da marca; quais estados globais têm tela), não mais uma passada de migração.


## v0.10.19 - 2026-07-26 (Fecho da frente: dependência declarada e débito revisado)

Sem `db push`. Só `package.json` e documentação. Sem bump do DS (segue `^1.2.38`).

### Mudado

- **`@studio-ux-ds/icons` passou a ser declarado** no `package.json`. Ele é **peerDependency** do `@studio-ux-ds/react`, e o npm 7+ vinha instalando por conta — **funcionava por tolerância do gerenciador, não por declaração**. Num gerenciador mais estrito, ou com `--legacy-peer-deps`, o `DSIcon` não resolveria e o build quebraria com "não encontrei o módulo" numa dependência que ninguém declarou.
- **Débito da adoção revisado contra o disco**, não de memória: os itens de migração de famílias, limpeza de órfãos e aposentadoria do `Header`/`NotificationsBell` foram fechados; o do dropdown do sino ficou **decidido por ação** (o arquivo foi excluído, então o sino segue como sinal + link).

### Pendência sua

- **O `.npmrc` do `platform-admin` está gravado com BOM** (`EF BB BF` antes do `@`). O npm pode **ignorar a linha do `registry`**, cair no registry público e devolver 404 nos pacotes `@studio-ux-ds` — num servidor novo o `install.sh` quebraria por um motivo que não aparece na mensagem de erro. Hoje funciona porque o npm tolera. O caminho é protegido para o assistente, então é ação manual; comando no fim.

### Lição

Dois achados da mesma família: **coisas que funcionam por tolerância de ferramenta, não por estarem certas.** O `icons` instalava porque o npm 7+ resolve peer sozinho; o `.npmrc` é lido porque o npm engole o BOM. Nenhum dos dois aparece como erro hoje — os dois aparecem no primeiro ambiente um pouco diferente. Vale procurar por esse padrão quando uma frente parece terminada: o que está de pé só porque alguma ferramenta é generosa?


## v0.10.18 - 2026-07-26 (O menu passou a dizer o mesmo que a tela)

Sem `db push`. Só frontend. Sem bump do DS (segue `^1.2.38`).

### Corrigido

Renomeei os títulos das telas nas frentes anteriores e **não renomeei o menu**. Quem procurava "Pessoas e convites" via "Usuários e Convites" na barra lateral e tinha que traduzir de cabeça — foi exatamente a dúvida que você levantou ao tentar achar o campo de telefone. O nome do item de menu, o caminho no topo e o título da página passaram a ser a mesma informação:

| Onde clicar agora | Dizia antes |
|---|---|
| Configurações → **Pessoas e convites** | Usuários e Convites |
| Configurações → **Perfis de acesso** | Perfis de Acesso |
| Configurações → **Workspaces e ambientes** | Workspaces e Ambientes |
| Configurações → **Minha conta** | Minha Conta |
| Recursos → **Explorador** | Explorer |
| Desenvolvedor → **Bancada de testes** | Console |
| Desenvolvedor → **Chaves de API** | API Keys |
| Integrações → **Cofre de segredos** | Cofre de Segredos |

O caminho no topo acompanhou, inclusive nas rotas novas de perfil (`Configurações / Perfis de acesso / Novo`).

### O que dá pra verificar agora

1. **Barra lateral → Configurações**: os quatro itens com os nomes novos; clicar em cada um leva à tela de título idêntico.
2. **Recursos → Explorador** e **Desenvolvedor → Bancada de testes / Chaves de API**: mesma coisa.
3. **Ícones do menu intactos** — a lista usa as chaves do mapa interno (`KeyRound`), não o nome do glifo do DS; trocar isso por engano faria o ícone virar "?" (erro que cometi e conferi antes de fechar).

### Lição

Renomear é uma mudança em **dois lugares**, não em um: o título da tela e o caminho para chegar nela. Trocar só o título produz o pior tipo de confusão — a pessoa sabe o nome da coisa e não acha o caminho, e nada no sistema parece quebrado.


## v0.10.17 - 2026-07-26 (Fim do legado visual — a pasta `components/ui` morreu)

Sem `db push`. Só frontend. Bump do DS: `^1.2.37` → **`^1.2.38`** (`PhoneInput` com seletor de país de verdade).

**Não sobrou nada do padrão antigo no código vivo.** A pendência que restava era o telefone; ela caiu, e com ela a pasta inteira.

### Mudado

- **O `PhoneInput` agora é o do DS** (v1.2.38), com seletor de país, busca, máscara por país e teto de dígitos — era a única razão para manter `components/ui`. O do DS era só a casca até aqui; ganhou o seletor de verdade, então o local perdeu a razão de existir.
- **`components/ui/` ficou sem nenhum consumidor** — os 8 arquivos (Modal, Table, Tabs, FormField, ConfirmDialog, EmptyState, StatCard, PhoneInput) só são referenciados pelos 4 órfãos que já estavam marcados para exclusão.
- **`Layout.jsx` passou a usar o `Badge` do DS** e o mapa de ambiente declara **`tone`** direto (produção/homologação/desenvolvimento), fechando o último uso de `ui/Table` em código vivo.
- **Últimos `--ap-*` do código vivo traduzidos** para os tokens do DS: `Layout.jsx` (seletor de workspace e marca), `ProtectedRoute.jsx` e `Dashboard.jsx`. Sobraram duas menções em **comentário** (histórico do que foi consertado) — texto, não estilo.

### Pendência sua (comando no fim)

- **13 arquivos órfãos** para excluir: os 8 de `components/ui/`, `components/Layout/Header.jsx`, `Sidebar.jsx`, `NotificationsBell.jsx` e os dois modais de assistente (`pages/IA/editor/AgentEditorModal.jsx`, `AgentExecuteModal.jsx`). Nenhum é importado por código vivo — conferido arquivo por arquivo.
  - Junto vai a decisão do **dropdown do sino**: o `NotificationsBell.jsx` era a referência viva para trazê-lo de volta num `Drawer`. Excluindo, o caminho é o histórico do git — resgatável, mas com atrito. Se você quer o dropdown, é frente própria e o arquivo fica; se não quer, ele cai com os outros.

### O que dá pra verificar agora

1. **Pessoas → Nova pessoa → WhatsApp para avisos**: o seletor de país abre, busca por nome/DDI/código funciona, e trocar de Brasil para um país de menos dígitos corta o excedente.
2. **Barra de cima**: o selo de ambiente (Produção/Homologação/Desenvolvimento) continua colorido, agora pelo papel semântico.
3. **Seletor de workspace** e o **Dashboard**: mesma aparência, agora sobre tokens do DS — vale conferir no claro e no escuro, porque foi tradução de variável.


## v0.10.16 - 2026-07-26 (A última família — e o painel inteiro no Studio UX)

Sem `db push`. Só frontend. Bump do DS: `^1.2.36` → **`^1.2.37`** (`Checkbox indeterminate`, `ProgressBar tone`, `Button block`, glifos `history` e `upload`).

**O `platform-admin` está inteiro no Studio UX.** Últimas 8 telas: pessoas, perfis, workspaces, auditoria, minha conta — e as três públicas (login, aceitar convite, página de pagamento).

### Mudado

- **Perfis de acesso: o editor virou rota** (`/perfis/novo` e `/perfis/:id`). Era um Modal com o catálogo INTEIRO de permissões dentro, rolando dentro da rolagem. A caixa "marcar o grupo todo" agora mostra **estado misto** quando só parte do grupo está marcada — antes aparecia vazia com metade ligada, informando o contrário.
- **Perfil da plataforma abre em leitura**, e a linha é a mesma das outras: dá para ver o que o "Administrador" libera antes de copiar a ideia num perfil próprio. O legado trocava o lápis por um cadeado, fazendo a mesma coluna significar duas coisas.
- **Auditoria: a linha expansível virou Modal de leitura.** O legado abria a linha e mostrava os dois JSONs dentro da tabela — o que empurra as linhas de baixo e faz o olho perder o lugar. Agora abre com o antes/depois lado a lado e botão de copiar.
- **Minha conta: a barra de consumo é do DS, com aviso por cor** (amarelo perto do limite, vermelho no limite). Era barra desenhada à mão com hex cravado. **Cota sem limite deixou de ter barra** — o legado desenhava 4% em cinza para dizer "ilimitado", que é uma barra mentindo.
- **Pessoas e convites**: ativar/inativar e cancelar convite foram para a barra de lote, aceitando vários; o link do convite usa o botão de copiar padronizado, e a tela diz na cara que **o sistema não manda e-mail sozinho** — sem repassar o link, a pessoa não entra.
- **Workspaces continua em cartões** de propósito: cada workspace CONTÉM seus ambientes, e uma tabela plana perderia o aninhamento.
- **Login, aceitar convite e página de pagamento** (as três públicas) passaram ao DS. A de pagamento é a mais exposta do sistema — quem abre é o cliente final do provedor, no celular, com pressa: copiar virou ação de primeira classe, com **fallback** de área de transferência. Antes, o `catch` do clipboard era vazio: num celular sem permissão, o botão não fazia nada e não avisava.
- **Linguagem**: "Usuários e Convites" → **Pessoas e convites**; "Inativar/Reativar" → **Tirar o acesso / Devolver o acesso**; "Perfil de sistema" → **da plataforma**; "Ator/Entidade" (auditoria) → **Quem / Onde**; "Trial" → **em teste**; "2ª via de boleto" → **Seu boleto**; "Vencido há N dias" → **N dias em atraso**.

### Corrigido

- **Cinco ícones inexistentes em telas já migradas** desenhavam "?" havia releases: `history` no canvas, no editor de fluxo, na conversa e na linha do tempo do atendimento; `upload` em Fluxos. Os dois entraram no catálogo do DS (v1.2.37) — `refresh` não é histórico e `download` não é upload.

### O que dá pra verificar agora

1. **Perfis → abrir um perfil**: cai em `/perfis/<id>`; marcar metade de um grupo deixa a caixa do grupo em **estado misto** (um traço, não vazia). Perfil da plataforma abre com aviso azul e tudo desabilitado.
2. **Auditoria**: clicar numa linha abre o antes/depois; o filtro tem os quatro campos na mesma altura.
3. **Minha conta**: barra fica amarela acima de 70% e vermelha acima de 90%; cota sem limite mostra só o número, sem barra.
4. **Pessoas**: selecionar duas ativas → aparece *Tirar o acesso*; uma ativa + uma inativa → nenhuma das duas transições aparece (não serve para as duas).
5. **Convites**: o botão de copiar o link fica na linha e confirma no próprio botão.
6. **Login e aceitar convite**: botão de largura total, e o Enter no campo envia.
7. **`/pagar/<token>`** com token inválido: aviso amarelo com triângulo (não um "?") e a orientação de pedir link novo.
8. **Sidebar → Configurações**: os quatro itens continuam no mesmo lugar.
9. Tema escuro e 375 px em todas.

### O que só dá pra conferir com o sistema em uso

- **Página de pagamento com boleto real** — precisa de token válido gerado pelo assistente ISP; sem dado, só o caminho de erro é verificável.
- **Aceitar convite** — exige um convite criado e ainda válido (o link vence).
- **Barra de consumo em vermelho** — só quando a organização passar de 90% de alguma cota.
- **Auditoria com valores antes/depois** — depende de ação administrativa registrada.


## v0.10.15 - 2026-07-26 (O formulário agora usa a largura do card)

Sem `db push`. Só frontend. Bump do DS: `^1.2.35` → **`^1.2.36`** (o `FormGrid` deixou de limitar a própria largura).

### Corrigido

- **O formulário ficava numa faixa estreita à esquerda de um card largo** — o vazio que a v0.10.14 devia eliminar voltou maior. Causa no DS: o `FormGrid` embutia um teto de 880px "de leitura"; num card de 1580px sobrava metade da tela vazia. Corrigido no DS (v1.2.36): o grid preenche o container.
- **A linha de busca do Explorador quebrava em 2+1.** O teto de 880px não cabia três colunas com o piso de 320px, então o campo de busca caía sozinho na linha de baixo, estreito. Agora os três ficam na mesma linha.
- **Os `maxWidth: 880` que sobraram no editor de mapeamento saíram** — eram resíduo do mesmo engano, cravados por mim antes de o `FormGrid` existir.
- **Editor de mapeamento e Explorador passaram a `columns="auto"`** (quantas couberem) em vez de teto fixo: com teto de 2 num card largo, os três campos curtos deixavam metade da segunda linha vazia.

### O que dá pra verificar agora

1. **Recursos → Mapeamentos → abrir um**: Conexão, Traduz para e Operação de origem na **mesma linha**, ocupando o card; a Anotação atravessa a linha inteira.
2. **Explorador de recursos**: os três campos numa linha só, com o botão Buscar colado no campo de busca.
3. **Em 375 px**: uma coluna, como antes.


## v0.10.14 - 2026-07-26 (Formulário em duas colunas — o arranjo virou do DS)

Sem `db push`. Só frontend. Bump do DS: `^1.2.34` → **`^1.2.35`** (`FormGrid` + `Field wide`).

### Mudado

- **Todo formulário do painel passou a usar o `FormGrid`**: duas colunas em tela larga, uma em tela estreita, largura de leitura vinda do DS. Eram **20 grids montados à mão em 12 arquivos** — Automação (Templates, Gatilho), IA (Assistente, Base de conhecimento, Ferramenta, Perfil de memória, Custos), ISP (Abertura de chamado, Incidente), WhatsApp (Equipe, Template), Desenvolvedor (bancada) e Recursos (mapeamento).
- **Os `maxWidth` cravados nesses formulários saíram.** Havia 16 valores diferentes respondendo à mesma pergunta ("qual é a largura de leitura de um formulário?"); agora a resposta é do DS, num lugar só.
- **O campo em que se escreve leva `wide`** e ocupa a linha inteira (anotação, texto longo, JSON): em meia coluna virava uma faixa estreita e alta.
- Ficou de fora, deliberadamente, o grid de larguras assimétricas (Método 120px + URL) da aba HTTP — ali as colunas têm tamanhos diferentes de propósito, o que o `FormGrid` não faz nem deveria.

### Corrigido

- **A linha de busca do Explorador ficava torta** (você apontou): os três campos usavam `items-end`, que alinha pela base — e o único com dica embaixo era mais alto, empurrando o próprio controle e o botão para cima. O `FormGrid` alinha pelo topo, a dica virou **placeholder** e o botão foi para dentro do campo de busca, onde alinha sempre.

### O que dá pra verificar agora

1. **Recursos → Mapeamentos → abrir um**: Conexão, Traduz para e Operação de origem ficam em duas colunas; a Anotação ocupa a linha inteira.
2. **Explorador de recursos**: os três campos e o botão Buscar na mesma altura — sem o degrau do print anterior.
3. **Duas colunas nos demais**: assistente, base de conhecimento, ferramenta, perfil de memória, custos, abertura de chamado, incidente, equipe e template do WhatsApp, bancada de testes.
4. **Em 375 px**: todas caem para uma coluna sozinhas (não há media query no painel para isso).


## v0.10.13 - 2026-07-26 (Recursos + Desenvolvedor no DS — as duas últimas famílias)

Sem `db push`. Só frontend. Bump do DS: `^1.2.33` → **`^1.2.34`** (quatro ícones do próprio DS apontavam para nomes inexistentes).

**Com isso, o `platform-admin` inteiro está no Studio UX** — só Configurações (5 telas) fica para o fim, por ser a que mexe em coisa ligada.

### Mudado

- **Explorador de recursos** — a coluna "Ações" com um olhinho saiu: ele fazia exatamente o que o clique na linha já fazia. A tabela desktop e os cartões mobile escritos à mão também saíram (o `DataTable` do DS resolve os dois, e manter os dois era garantir que divergissem). O JSON do registro ganhou botão de copiar.
- **Mapeamentos** — o editor virou **rota** (`/recursos/mapeamentos/novo` e `/:id`). Era um Modal `xl` com dois campos de texto longo, a sugestão da IA e o editor de campos: o editor rolava dentro de um contêiner que já rolava. A linha abre o mapeamento; ativar/desativar/excluir vão para a barra de lote, e a transição só aparece quando **toda** a seleção a aceita.
- **Bancada de testes** (era "Console do Desenvolvedor") — as cinco abas passaram a usar o `Tabs` do DS com `id` (ver a correção da v0.10.12), o aviso de "SQL é somente leitura" virou `Banner`, e a resposta ganhou botão de copiar. O legado usava a prop `active` do `Tabs` **local**, que é outra coisa.
- **Chaves de API** — revogar aceita várias de uma vez, mas só as que ainda valem. A tela da chave em claro ganhou `Banner` de aviso + `CopyButton`, e **deixou de fechar por clique fora**: fechar sem copiar significa criar outra chave.
- **Linguagem**: "Explorer de Recursos" → **Explorador de recursos**; "Console do Desenvolvedor" → **Bancada de testes**; "Tipo canônico" → **Traduz para**; "Operação de origem" continua, mas com "De onde vem" na tabela; "Escopos" → **Pode fazer**; "Expira em" → **Vence em**; `Params (JSON)` → **Parâmetros**; "Temperature" → **Criatividade**; "Max tokens" → **Tamanho máximo da resposta**.

### Corrigido

- **Mais dois `toast` indefinidos**, agora nas Chaves de API: os dois modais (criar e mostrar a chave) chamavam `toast.error`/`toast.success` sem ter o hook — no caminho de erro estourava `ReferenceError` em vez de mostrar a falha, e a validação do nome derrubava a tela em vez de avisar. Com estes, são **quatro** achados na mesma varredura; passei um verificador em toda a `src` e não sobrou nenhum.
- **Quatro ícones errados no próprio DS** (v1.2.34): `Banner` pedia `circle-check` e `alert-triangle`, `AppShell` pedia `adjustments` e **`menu-2` no hambúrguer do mobile** — nomes que não existem, então desenhavam "?" na tela. O gate de publicação do DS passou a conferir isso.

### O que dá pra verificar agora (sem depender de dado real)

1. **Recursos → Mapeamentos**: a linha abre o editor em `/recursos/mapeamentos/<id>`; o botão "Novo mapeamento" abre `/recursos/mapeamentos/novo`.
2. **Barra de lote dos mapeamentos**: selecione um inativo → aparece *Ativar* (não *Desativar*); selecione um ativo e um inativo → só sobra *Excluir*, e *Editar* desaparece (é um por vez).
3. **Editor**: sem escolher o tipo, a lista de campos mostra um aviso azul explicando o que falta; com o tipo escolhido e nenhum campo, o aviso fica **amarelo com o triângulo** (era um "?" antes da v1.2.34).
4. **Bancada de testes**: as cinco abas trocam o conteúdo (Operação, SQL, HTTP, IA, Ferramenta); a aba SQL mostra o aviso amarelo de somente-consulta.
5. **Chaves de API → Nova chave**: salvar sem nome dá **toast**, não tela branca (era o `ReferenceError`); a tela da chave só fecha pelo botão "Já copiei".
6. **Explorador**: sem busca, o vazio explica o que fazer; a linha abre o registro com o JSON e o botão de copiar.
7. **Hambúrguer no celular** (375 px): agora é um traço triplo, não um "?".
8. Tema escuro em todas.

### O que só dá pra conferir com o sistema em uso

- **Preencher com IA** no mapeamento — precisa de conexão ativa que responda à operação informada; o resultado preenche a lista e diz se veio da IA ou de semelhança de nome.
- **As cinco abas da bancada** — cada uma bate de verdade no sistema do outro lado.
- **Revogar chave** — só se confirma quando a integração que usava a chave para de autenticar.
- **Explorador** — depende de mapeamento ativo para o tipo escolhido, senão não há o que traduzir.

## v0.10.12 - 2026-07-26 (As abas da conexão apagavam a tela)

Sem `db push`. Só frontend. Bump do DS: `^1.2.32` → **`^1.2.33`** (o `Tabs` passou a avisar).

### Corrigido

- **Clicar em qualquer aba da conexão esvaziava o conteúdo** — Recursos, Histórico e também Dados. Os itens do `Tabs` foram declarados como `{ value, label }`, mas o `Tabs` do DS identifica o item por **`id`**; `value` é a prop da aba ATIVA. Sem `id`, nenhuma aba casa com a ativa e o `onChange` devolve `undefined`, então nenhum bloco de conteúdo renderiza — **sem erro no console**.
  - É a **prop morta** de novo, e desta vez dentro do array de dados, onde a assinatura do componente não protege. As outras 11 telas com `Tabs` foram conferidas uma a uma: todas usam `id`.
  - O conserto de fundo foi no DS (**v1.2.33**): o `Tabs` agora avisa no console quando um item vem sem `id`, em vez de apagar a tela em silêncio.

### O que dá pra verificar agora

1. **Integrações → Conexões → abrir uma conexão**: as três abas trocam o conteúdo. **Dados** (identificador com copiar + configuração), **Recursos** (consulta ao vivo, com "Consultar de novo") e **Histórico de chamadas**.
2. Voltar para **Dados** depois de visitar as outras: o conteúdo volta (antes não voltava).

## v0.10.11 - 2026-07-26 (Família Integrações no DS — a conexão virou tela, não modal)

Sem `db push`. Só frontend. Bump do DS: `^1.2.31` → **`^1.2.32`** (`CopyButton` + glifo `copy`).

### Mudado

- **Toda a família Integrações migrada** para o Studio UX: Marketplace, Conexões, Cofre de Segredos, mais três telas novas que nasceram do desmembramento dos modais. 6 arquivos viraram 9.
- **A conexão ganhou endereço próprio.** `/integracoes/conexoes/:id` (dados, recursos, histórico), `/integracoes/conexoes/:id/editar` e `/integracoes/conexoes/nova`. Eram quatro modais empilhados: detalhe, edição, escolha do conector e o passo a passo. Os dois últimos eram **a mesma decisão partida em duas telas**, cada uma com o seu "Cancelar".
- **Seis ícones por linha viraram barra de lote.** A coluna de ações da lista de conexões tinha editar, testar, descobrir, ativar, desativar, pôr em manutenção e o botão do Google — sete alvos de 14 px na borda direita, três deles aparecendo e sumindo conforme o estado da linha. Agora a seleção é que diz o que dá para fazer: **ativar/desativar/manutenção** só aparecem quando a seleção **inteira** aceita aquela transição, e **editar** exige uma conexão só.
- **"Descobrir recursos" virou aba da conexão.** Era um ícone na linha que abria outro modal com o resultado — e o resultado (os identificadores de setores, assuntos, planos e números, que existem para ser copiados) sumia ao fechar. Agora carrega sob demanda e fica onde se procura.
- **Copiar identificador ficou padronizado** pelo `CopyButton` do DS: confirma no próprio botão e tem o fallback para quando o navegador não libera a área de transferência.
- **Os mapas de estado desta família declaram `tone`** direto, sem passar pela ponte `lib/tone.js`. É o começo do fim da ponte — uma família de cada vez.

### Corrigido

- **`TOKEN_EXPIRED` era o único estado que saía cinza.** O mapa declarava `variant: 'orange'`, e `orange` **não existe** na ponte de cores (`lib/tone.js`) — caía no `|| 'neutral'`. Ou seja: exatamente o estado que precisa gritar (a credencial venceu, a integração parou) era o mais discreto da tela. Agora é `warning`, e "papel desconhecido" deixou de ser possível.
- **Dois `toast` indefinidos** — `Marketplace.load()` e o modal de rotação do Cofre chamavam `toast.error(...)` sem que o arquivo tivesse `useToast()`. No caminho de erro, o `catch` estourava `ReferenceError: toast is not defined`: **o tratamento do erro era o erro**. Só aparecia quando a chamada falhava, que é justamente quando ninguém está olhando o console.
- **Editar conexão era um modal que não podia fechar por clique fora** — e o legado já desligava o `dismissable` por isso. Um formulário que precisa se defender do próprio contêiner está dizendo que não é modal: virou rota.

### O que dá pra verificar agora (sem depender de dado real)

1. **Integrações → Conexões**: a linha abre `/integracoes/conexoes/<id>` — barra de endereço muda, F5 recarrega a mesma conexão, "voltar" do navegador volta para a lista.
2. **Caminho no topo**: em "Integrações / Conexões / Detalhe", clicar em **Conexões** volta para a lista (o breadcrumb navega de verdade).
3. **Barra de lote**: selecione uma conexão ativa → aparecem *Testar, Editar, Desativar, Pôr em manutenção* (não aparece *Ativar*). Selecione duas com estados diferentes → some a transição que não serve para as duas, e **Editar** some (é uma por vez).
4. **Identificador**: na aba Dados, clicar em copiar troca o ícone por um ✓ e o texto para "Copiado" por 2 s.
5. **Nova conexão**: `/integracoes/conexoes/nova` mostra o trilho de etapas; escolher o conector renomeia as etapas do meio conforme o schema dele; "Avançar" sem preencher obrigatório dá toast e **não** avança.
6. **Marketplace → Conectar** leva para `/integracoes/conexoes/nova?provider=<chave>` com o conector já escolhido.
7. **WhatsApp → Números**: a linha abre direto a conexão daquele número. Links antigos com `?open=<id>` continuam funcionando (encaminham).
8. **Cofre**: a linha não abre nada (não há mais o que mostrar do que já está nas colunas); selecionar uma habilita *Trocar os valores*; salvar sem preencher dá **toast**, não tela branca (era o `ReferenceError`).
9. **Tema escuro e 375 px** em todas as telas da família.

### O que só dá pra conferir com o sistema em uso

- **Testar em lote** — precisa de conexão real respondendo; o resumo distingue quantas passaram e mostra o motivo da primeira que não passou.
- **Aba Recursos** — depende de um conector que exponha descoberta (IXC, Meta). Com conexão desativada, a resposta esperada é o vazio explicando que ela não responde.
- **Trocar segredo** — só se confirma testando a conexão logo depois.
- **Entrar com Google** — exige o app OAuth configurado e a janela de consentimento.
- **Credencial vencida em laranja** — só aparece quando um token realmente expira.

### Pendência sua

- `platform-admin/src/pages/Integracoes/ConnectionWizard.jsx` ficou **órfão** (foi absorvido pelo `ConexaoNova.jsx`) e o sandbox não consegue apagar arquivo no repositório montado. Comando no fim desta entrega, junto dos demais órfãos.

## v0.10.10 - 2026-07-25 (Clicar num número abre a conexão dele, não a lista)

Sem `db push`. Só frontend. Sem bump do DS (segue `^1.2.31`).

### Corrigido

- **Clicar num número levava para a lista de Conexões**, obrigando a procurar de novo o que já tinha sido escolhido. A linha prometia "abrir este número" e entregava "abrir a tela onde ele está em algum lugar".
  - Agora vai direto: `/integracoes/conexoes?open=<id>`. Deu para fazer porque o **id do número é o id da própria conexão** — o backend deriva a lista das conexões `whatsapp-meta` (`WhatsappNumbersController.list` mapeia cada `Connection`), coisa que eu não tinha conferido quando escrevi a navegação.
  - A tela de Conexões (ainda no padrão antigo — migra na próxima família) passou a aceitar `?open=<id>`: abre o detalhe daquela conexão e limpa o parâmetro da URL, para o F5 não reabrir o modal. Quando Integrações for migrada, o contrato se mantém — igual ao `?open=` das Execuções.

### O que dá pra verificar agora

1. **WhatsApp → Números**: clicar na linha abre o **detalhe daquela conexão** já aberto, não a lista.
2. Recarregar a página depois disso: o modal **não** reabre (o parâmetro sai da URL).
3. Um id que não existe mais → toast dizendo que a conexão não foi encontrada, em vez de tela parada.

## v0.10.9 - 2026-07-25 (Família WhatsApp inteira no DS — 11 telas, com o chat)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.31`**.

> Feita **numa frente só**, a seu pedido. Executada em ordem segura (DS → 4 telas de configuração → contact center), com verificação arquivo por arquivo. O rollback é `git checkout v0.10.8`.

### A tela de conversas ocupa a área inteira

O chat calculava a própria altura: `100dvh - 8.5rem` — onde 8,5rem é a soma da barra de cima com o padding da casca. Número que erra sempre que a barra muda de altura, e erra diferente no celular. O **DS ganhou `fullBleed`** (v1.2.31): a região de conteúdo vem sem espaçamento e sem rolagem própria, e a tela ocupa a altura toda por `flex: 1`. A lista de rotas full-bleed vive no `Layout.jsx`, deliberadamente curta — hoje só `/whatsapp/conversas`.

### Configuração (4 telas)

- **Números** — a grade de cards virou tabela: os números ficam comparáveis lado a lado, que é o que se quer num painel de saúde ("qual está com qualidade baixa?"). **Sincronizar** saiu do card e foi pra barra de lote, aceitando vários de uma vez; só aparece quando toda a seleção está ativa (a Meta recusa conexão desativada). O erro de sincronização aparece **na tabela**, não em tooltip. A qualidade deixou de ser `#22c55e`/`#eab308`/`#ef4444` cravados.
- **Templates** — criar virou rota (`/whatsapp/templates/novo`): o corpo é TextArea, e o formulário ganhou espaço para exemplos das variáveis e até 3 botões. A lista **não** tem linha clicável nem seleção, de propósito: template publicado na Meta não se edita, e não há exclusão na API — oferecer clique prometeria uma tela que não existe. O motivo da recusa da Meta aparece embaixo do nome. Tipo e idioma agora em português ("Utilidade", "Divulgação", "Código de acesso").
- **Equipes e Filas** — as **três ações por linha** da equipe (lápis, pessoas, lixeira) saíram; a linha abre o editor em rota, que reúne dados **e** membros — os membros eram um terceiro modal aberto por um ícone. Desativar/reativar foi pra barra de lote, e a ação **muda de rótulo conforme a seleção**: "Desativar" se tudo está ativo, "Reativar" se tudo está inativo, **nenhuma** se a seleção mistura os dois (aí não existe ação única correta). O sininho de "alerta de incidente" era um botão cujo significado só existia no `title`; virou um `Switch` com rótulo escrito.
- **Atendimento por IA** — o interruptor era uma pílula desenhada à mão (52×30px, `translateX` calculado, índigo cravado); virou `Switch` do DS. E **desligar passou a pedir confirmação**: ligar já pedia, desligar rodava direto no clique — e é a ação que para o atendimento automático de um canal em produção.

### Contact center (7 arquivos)

- **O composer foi partido por responsabilidade** — eram 640 linhas com sete grupos de estado independentes:
  - `composer/useAudioRecorder.js` — gravar, pausar, escutar, descartar (o cleanup do microfone e do blob vive junto de quem os cria);
  - `composer/AudioRecorderBar.jsx` — o desenho da gravação e da prévia;
  - `composer/AttachPicker.jsx` — botão “+”, menu, inputs de arquivo e prévia do anexo;
  - `MessageComposer.jsx` — texto, envio, janela de 24h, template e takeover.
- **Lista e cabeçalho da conversa** — avatar com degradê verde cravado virou `Avatar` do DS; a bolinha de não lidas e a contagem por aba viraram `Badge`; `input`/`select` crus viraram os do DS. As 6 ações do cabeçalho (assumir, liberar, transferir, encerrar, reabrir, histórico) viraram `Button`/`IconButton`, com os textos na língua de quem atende ("Devolveu para o grupo", não "liberada pro pool").
- **Histórico do atendimento** — a lista com bolinha feita à mão virou o `Timeline` do DS.
- **Transferir** — segue Modal (campos curtos), agora dizendo o que cada destino faz: para uma pessoa a conversa passa a ser dela; para fila ou equipe volta a ficar sem dono. Avisa quando não há destino cadastrado.

### O que ficou fixo de propósito

As **cores da conversa** — balão verde à direita, branco à esquerda, fundo bege, tique azul de "lido" — e o **verde do botão de enviar**. Não é sobra do padrão antigo: é a convenção do WhatsApp, e o atendente passa o dia no aplicativo de verdade. Tematizar faria a mesma mensagem ter cor diferente aqui e lá. Tudo em volta (cabeçalho, ações, situação, avatar) é interface do painel e foi tematizado.

**Consequência conhecida:** no tema escuro a área da conversa continua clara. Registrado como `DT-005` na dívida técnica — a decisão (imitar o WhatsApp escuro ou tematizar o balão) é sua.

### O que dá pra verificar agora

1. **WhatsApp → Conversas**: a tela ocupa a área inteira, sem moldura e sem faixa sobrando embaixo. Redimensione a janela: a altura acompanha (era aqui que o cálculo de 8,5rem errava).
2. **Números**: tabela em vez de cards; marcar dois números ativos mostra **Sincronizar agora**; marcar um desativado junto faz a ação desaparecer.
3. **Equipes**: clicar numa equipe abre a rota com dados **e** pessoas na mesma tela. Marcar uma ativa e uma inativa juntas → nenhuma ação de lote aparece.
4. **Atendimento por IA**: desligar agora pergunta antes, e o texto diz o que acontece com as mensagens que chegarem.
5. **Templates → Novo template**: rota própria; digite `{{1}}` no corpo e o campo de exemplos aparece exigindo um por variável.
6. **Claro/escuro** em todas as 11 — exceto a área da conversa, pelo motivo acima.

### O que só dá pra verificar com conversa real

Assumir, liberar, transferir, encerrar e reabrir; o takeover ("assumir ao responder"); enviar texto, anexo e áudio; o aviso da janela de 24h e o envio por template; o "digitando…" no aparelho do cliente; e o histórico do atendimento.

## v0.10.8 - 2026-07-25 (Degradê do card igual ao do console — os valores, não a impressão)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.30`**.

### Corrigido

- **O degradê estava claro demais e não parecia degradê.** Causa: eu calibrei valores próprios em vez de **traduzir** os do card do console, que era a referência que você me deu — e ainda passei duas versões ajustando por tentativa (16%, depois 10%), cada uma mais clara.
  - Traduzido de verdade (DS v1.2.30): **20% de cor no início, 5% no fim**, transição no trajeto inteiro, borda a 20%, caixa do ícone a 10%. O erro comum às duas tentativas era **terminar em cor zero** antes do fim — aí metade do card fica branco e a peça deixa de ler como degradê.

### O que dá pra verificar agora

1. **Painel** e **Configurações → Atualização**: o degradê é visível de ponta a ponta do card, sem a metade branca.
2. Comparar lado a lado com **/console/dashboard**: os cards devem parecer da mesma família.
3. **Claro/escuro**: no escuro a matiz é o tom claro da paleta, então o degradê aparece sobre a superfície escura.

## v0.10.7 - 2026-07-25 (Cards com cor por assunto, como no console)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.29`**.

### Alterado

- **Cada card de indicador voltou a ter a sua cor** — como nos prints do console. O que mudou no DS para isso não ser decoração: a cor do `StatCard` deixou de ser `tone` (papel semântico: bom/ruim) e passou a ser **`hue`** (matiz **categórica**: de que assunto o número é). Sete matizes fixas, independentes do accent.
- **A matiz é estável por assunto, não por posição:** consumo de IA é roxo no Painel *e* em Custos de IA; custo é verde-água nos dois lugares; gente é azul; execuções, verde-água. É isso que faz a cor virar informação — dá para reencontrar o assunto entre telas — em vez de enfeite que muda de lugar.
- Aplicado no Painel (4 cards), em Custos de IA (3) e no simulador de custo (2).

### Por que isso é diferente de "colorir por gosto"

Na v0.10.6 eu tinha deixado tudo numa cor só, argumentando que sete cores viram decoração. O princípio estava certo e o mecanismo errado: o problema nunca foi cor variada — foi **usar a prop de status para conseguir cor** (`tone="success"` só para ter verde, o que estraga o significado de `success` em todo o sistema). Faltava um conceito no DS, não disciplina no consumidor. Agora existe: `tone` responde "é bom ou ruim?", `hue` responde "de que assunto é?".

### O que dá pra verificar agora

1. **Painel**: os 4 cards em cores diferentes (roxo, azul, verde-água, índigo), cada um com ícone.
2. **IA Studio → Custos**: "Custo total" **verde-água** e "Tokens" **roxo** — as mesmas cores que consumo/custo têm no Painel.
3. **Claro/escuro**: as matizes têm tom próprio por tema (as do escuro são mais claras para contrastar com o fundo).
4. **Trocar o accent**: os cards com `hue` **não** mudam (a cor é do assunto); um card sem `hue` acompanha o accent.

## v0.10.6 - 2026-07-25 (Cards de indicador: uma cor só, com ícone)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.28`**.

### Corrigido

O desenho novo do card (v0.10.5) ficou estranho no painel, e não era o degradê em si — eram três coisas somadas:

- **Nenhum card passava `icon`.** O desenho tem o ícone à esquerda como âncora; sem ele o conteúdo encostava na borda e sobrava um vazio grande à direita, com o degradê correndo solto por ele. Os 4 do Painel e os 5 de Custos ganharam ícone.
- **Quatro cards, quatro cores, nenhuma dizendo nada.** Os tones eram `info`/`info`/`success`/`neutral`, herdados de quando a cor só tocava a borda — e nenhum daqueles indicadores é "bom" ou "ruim": são contagens (usuários, workspaces, execuções, consumo). Com o card inteiro tingido, virou decoração. **Todos passaram a `neutral`**, que usa o accent: o painel fica coeso e acompanha a personalização. Mesma correção em Custos de IA (custo, tokens, assistentes) e no simulador.
- **O degradê era forte para card largo** — corrigido no DS (v1.2.28): 10% de cor terminando em 55% do trajeto, em vez de 16% até 72%. Num card de ~400px, a diagonal longa deixava metade da peça colorida.

Vale a nota: eu já tinha escrito no DS que "sete indicadores em sete cores não é o que o componente faz" e deixei quatro cores no Painel na mesma leva. A regra estava certa; faltou aplicá-la onde eu já estava mexendo.

### O que dá pra verificar agora

1. **Painel**: os 4 cards com ícone à esquerda, **todos na mesma cor** (a do accent), degradê perceptível mas discreto, e "Limite: N" em cinza.
2. **IA Studio → Custos**: os 3 cards do topo e os 2 do simulador iguais entre si.
3. **Trocar o accent**: os cards acompanham — agora todos, porque nenhum tem cor própria.
4. **Estreitar a janela** até os cards ficarem em 1 ou 2 colunas: o degradê continua discreto (era aí que ele dominava).

## v0.10.5 - 2026-07-25 (Cards de indicador com o desenho novo do DS)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.27`**.

### Alterado

- **Os cards de indicador ganharam o desenho do console** (ícone à esquerda em caixa tonalizada, rótulo em caixa alta, número em destaque, degradê leve da cor do papel). O desenho subiu para o **DS** (v1.2.27), então valem em qualquer tela que use `StatCard` — hoje o Painel e Custos de IA — e nos outros sistemas do ecossistema.
  - A regra que ficou junto: **o tom pinta o entorno, nunca o número** (sobre fundo tonalizado, número colorido perde contraste) e o tom continua **semântico** — `neutral` (que agora usa o accent) para indicador que não é bom nem ruim. O card do console escolhe cor por gosto; isso não subiu, de propósito: quando cada card tem sua cor, nenhuma cor é sinal.
- **Corrigido: "Limite: N" estava escrito em verde** nos 4 cards do Painel e em 2 de Custos. O `delta` do `StatCard` é a **variação** e por isso é colorido — mas ali era legenda. O DS ganhou `sub` (linha secundária neutra) e os 6 callsites passaram a usá-la. Estava verde desde a v0.9.80.

### Também no DS (v1.2.27)

- **Storybook do Studio UX voltou a funcionar** — estava com "React is not defined" em toda story que renderiza ícone. O pacote de ícones era o único `.jsx` sem `import React`, e o pré-bundle do Vite compila JSX no runtime clássico.
- **Ícone com nome errado não derruba mais a tela** — desenha "ajuda" e avisa no console, em vez de lançar exceção no render (que desmontava a árvore inteira).
- **Gradiente deixou de ser proibido no DS** (decisão sua): permitido tonal e discreto, com régua escrita — uma matiz de token, baixa saturação, peça pequena. Saturado/multicor/de marca seguem vetados. Reconciliado nos 5 documentos que repetiam a proibição.

### O que dá pra verificar agora

1. **Painel**: os 4 cards com ícone à esquerda, degradê suave e **"Limite: N" em cinza**, não em verde.
2. **IA Studio → Custos**: os 3 cards do topo com o mesmo desenho; "prompt + resposta" agora neutro.
3. **Trocar o accent** na personalização: o card `neutral` ("Consumo de IA") acompanha a cor escolhida.
4. **Claro/escuro**: o degradê é derivado da superfície, então clareia/escurece junto.

## v0.10.4 - 2026-07-25 (Automação sub-frente C — o canvas. Família Automação concluída)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.26`**.

### O achado: os campos do passo existiam DUAS vezes, e já tinham divergido

O canvas e o editor em lista tinham cada um o seu renderizador dos campos de configuração de um passo. Não era só duplicação: o canvas entendia o tipo **`agent`** (lista os assistentes num select) e a lista **não** — nela o mesmo campo caía num input de texto, pedindo que o usuário digitasse o **id do assistente na mão**. O mesmo passo, configurado de duas formas, dependendo da tela em que se abriu.

Agora existe `editor/NodeFields.jsx`, usado pelos dois. Passo novo no backend aparece igual nas duas telas, e o tipo `agent` passou a funcionar na lista sem nenhuma mudança lá.

### Alterado

- **Canvas migrado pro DS** — nenhuma cor cravada sobrou (o nó, os conectores, o fundo, o minimapa e a borda de selecionado agora vêm do tema; antes eram `#64748b`, `#ef4444`, `rgba(...)` fixos, que no escuro ficavam errados). Cabeçalho virou `PageHeader`; os botões, `Button` do DS.
- **O painel de PROPRIEDADES continua fixo à direita** (recolhível), como você decidiu — num canvas, cobrir o desenho tira justamente o que se precisa ver enquanto se configura um nó: as ligações dele. Ganhou largura (260 → 320px, porque JSON em 260 quebra em toda linha) e os campos do DS.
- **As duas vistas do mesmo fluxo passaram a ter as mesmas ações** — alternador **Desenho / Lista**, Gatilho, Exportar, Versões, Rodar agora, **Ligar/Desligar** e Salvar versão. Antes só o canvas ligava/desligava: quem estivesse na lista precisava descobrir que a ação morava na outra tela. O alternador é `SegmentedControl`, porque são duas vistas do mesmo objeto — não dois lugares diferentes.
- **Desligar passou a pedir confirmação.** Rodava direto no clique, sem ConfirmDialog — e é a ação que **para um fluxo em produção**. Agora tem os 5 patrasques nos dois sentidos, e o texto diz o que acontece: "para de rodar; nada é apagado; pode ligar de novo".
- **"Despublicar" virou "Desligar"** e "Publicar" virou **"Ligar"** — em Versões, "Publicar" virou "Pôr no ar". O dono do negócio liga e desliga automação; publicar é vocabulário de quem escreveu o sistema.
- A **paleta de passos** e os trilhos recolhidos seguem escritos no painel, com tokens do DS: são infra de canvas/node-editor, que o DS ainda não cobre (está registrado no audit dele; dois produtos já a têm escrita à mão — aqui e no AquaPark).
- **DS v1.2.26**: glifos `power` e `zap`. Faltavam para "ligar/desligar" e "gatilho" — os dois conceitos mais centrais de uma tela de automação, e sem eles o ícone caía no "?".

### O que dá pra verificar agora

1. **Abrir um fluxo** (o canvas): o alternador **Desenho / Lista** troca de vista mantendo o fluxo; a situação, a versão no ar e "alterações não salvas" estão em etiquetas ao lado.
2. **Clicar num passo do desenho**: o painel da direita mostra os campos; o de JSON agora tem largura de sobra. Recolher e reabrir os dois painéis (Passos à esquerda, Propriedades à direita) funciona pelos trilhos.
3. **Num passo de IA** (ex.: "Assistente responde"): o campo do assistente é um **select com os nomes** — e agora também no editor em lista, que antes pedia o id na mão. É a correção mais concreta desta versão.
4. **Ligar / Desligar**: pede confirmação nos dois sentidos, o botão fica vermelho quando a ação é desligar, e o texto diz o que acontece. A mesma ação existe nas duas vistas.
5. **Claro/escuro** no canvas — antes o nó e os conectores tinham cor fixa e o escuro ficava com contraste errado.
6. **Trocar o accent** (efeito da v0.10.3): a borda do passo selecionado e o fundo da categoria aberta na paleta acompanham.

### O que só dá pra verificar com fluxo montado

- salvar versão a partir do desenho (posição dos passos entra no grafo), publicar e reverter;
- ligar um fluxo de verdade e ver o gatilho disparar;
- exportar do canvas e reimportar.

## v0.10.3 - 2026-07-25 (Uma cor de ação só no painel + o caminho no topo passa a navegar)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.25`**.

### Corrigido

- **Duas cores de ação convivendo no mesmo painel.** O botão principal aparecia **verde** nas telas migradas (accent do Studio UX) e **azul-índigo** nas que ainda não migraram — o mesmo "Salvar versão" com cor diferente entre o editor em lista e o canvas. Causa: o padrão antigo cravava `#6366f1` em dois lugares (`--ap-accent` no `index.css` e a cor `brand` no `tailwind.config.js`), enquanto o accent do DS já era outro.
  - Agora os dois **herdam o accent do DS**: `--ap-accent: var(--su-action)` e `brand: rgb(var(--su-action-rgb) / <alpha-value>)`. São duas linhas que acertam as ~40 telas ainda não migradas **sem tocar em nenhuma** — inclusive o canvas, o `text-brand` e o `bg-brand/5`. Trocar o accent no painel de personalização passa a mudar o painel inteiro, não só a parte nova.
  - Isso exigiu evolução do DS (**v1.2.25**): os accents passaram a expor também os **canais RGB** (`--su-action-rgb` etc.). Sem eles o Tailwind não consegue compor opacidade a partir da cor do tema, e o app é **obrigado** a cravar o hex — a raiz do problema estava lá.
- **O caminho no topo (breadcrumb) não navegava.** Os itens iam sem `href`, então era texto decorativo. Passou desapercebido enquanto toda tela tinha o seu próprio "Voltar"; quando o editor de passos (v0.10.2) passou a confiar nele, **a tela ficou sem saída**. Agora o caminho é clicável de verdade: o link sai do mesmo mapa que escreve o rótulo (sem uma segunda tabela para manter em sincronia), o último item nunca é link, e o clique usa o router em vez de recarregar a aplicação — Ctrl+clique continua abrindo em nova aba.
- **Voltar de volta no editor de passos.** Reposto ao lado das outras ações. Eu o havia tirado supondo que o breadcrumb resolvia — não resolvia, e a suposição custou uma tela sem saída. As outras 10 telas de detalhe/editor já tinham Voltar ou Cancelar; agora as 11 têm.

### O que dá pra verificar agora

1. **Personalização → trocar o accent**: o botão principal muda de cor em **todo** o painel — inclusive no canvas de fluxo, em WhatsApp, Integrações, Configurações (as telas ainda não migradas). Antes só as migradas mudavam.
2. **Canvas de um fluxo**: "Salvar versão" agora tem a mesma cor do "Salvar versão" do editor em lista.
3. **Editor de passos**: o botão **Voltar** está lá, à esquerda das outras ações.
4. **Caminho no topo** (ex.: "Automação / Fluxos / Passos"): clicar em "Fluxos" leva pra lista **sem recarregar** a página; o último item não é clicável; Ctrl+clique em "Fluxos" abre em outra aba.
5. **Claro/escuro** depois de trocar o accent — o accent tem tom próprio para cada tema, e os dois vêm do DS.

## v0.10.2 - 2026-07-25 (Automação sub-frente B — Fluxos e o editor de passos)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.24`**.

### A decisão desta frente: onde configurar um passo

A regra do Modal do DS tinha duas saídas — Modal (campos curtos) ou rota. A configuração de um passo do fluxo não cabe em nenhuma: tem texto longo e JSON (fora do Modal), e é **rascunho da sessão** — só existe no servidor quando você salva uma versão, então rota exigiria persistir rascunho. Você escolheu o **painel lateral**, que é o padrão *inspetor* que a spec de Desktop do DS já declarava. Virou a **terceira via da regra**, escrita no DS v1.2.24:

| Container | Quando |
|---|---|
| **Modal** | leitura, confirmação, formulário de campo curto |
| **Rota** | um registro que existe por si — cadastro, edição, detalhe |
| **Inspetor** (painel lateral) | propriedade de um item **dentro de um editor**, que não tem URL própria e cujo contexto em volta precisa continuar à vista |

### Alterado

- **Fluxos (lista)** — arquivar e excluir saíram da linha (eram uma pastinha âmbar e uma lixeira vermelha em cada uma) e foram pra barra de lote, as duas aceitando vários. "Arquivar" **desaparece** quando a seleção inclui algo já arquivado, em vez de falhar depois. Colunas em português de gente: "Situação", "Versão no ar", "Últimas vezes que rodou" (com "nunca rodou" quando é o caso).
- **Novo fluxo → rota** `/automacao/fluxos/novo` (tinha TextArea de descrição). **Importar → rota** `/automacao/fluxos/importar` — importar cria um registro, e o campo era um JSON de 12 linhas dentro de um Modal.
- **Editor de passos** — cabeçalho virou `PageHeader` com as 4 ações (Exportar, Versões, Rodar agora, Salvar versão). O botão "voltar" saiu: o breadcrumb já leva pra lista, e ter os dois era o mesmo caminho duas vezes. Situação/versão no ar/"alterações não salvas" viraram `Badge` em vez de texto solto.
- **Configurar passo → inspetor lateral** (`NodeInspector`, 520px de largura porque JSON em 360 quebra em toda linha). O corpo continua **declarativo**: renderiza os campos que vêm do catálogo do backend, sem código por tipo de passo — passo novo no backend aparece aqui sozinho.
- **Rodar agora → inspetor lateral** (`ExecuteDrawer`). O botão diz o que vai acontecer: **"Simular"** ou **"Rodar de verdade"** (vermelho), conforme a caixa de simulação — que nasce marcada. A opção virou card com a explicação embaixo, em vez de um checkbox cru com um parágrafo colado ao lado. Ao terminar, vai direto pra tela da execução (a rota nova da sub-frente A).
- **O que dispara o fluxo** — os 4 tipos eram `<button>` com borda e fundo cravados imitando escolha única; agora são opção-em-card do DS (círculo = cabe um), e a explicação de cada tipo saiu do `title` (só no hover) pra tela. Os rótulos falam a língua do dono: "Só quando eu mandar", "Quando algo acontecer", "Em horários certos", "Quando outro sistema chamar".
- **Versões** — segue Modal, e está certo: não tem campo de escrita, é leitura + duas confirmações. O diff usava `#22c55e` e `#ef4444` cravados; agora vem do tema e funciona no escuro. "Ativa" virou **"No ar"**; "Publicar" virou **"Pôr no ar"**; "Reverter" virou **"Voltar para esta"**.
- **`WorkflowStatusBadge`** ganhou arquivo próprio. Estava dentro de `Fluxos.jsx` e era importado de lá pelo editor e pelo canvas — três telas dependendo de um componente exportado por uma **página**, o que arrasta o arquivo inteiro por causa de 4 linhas.
- **O canvas (sub-frente C) ganhou o inspetor de execução de graça** — passou a usar o `ExecuteDrawer`. É troca de uma linha e o resto dele fica para a frente C.
- **DS v1.2.24**: `Drawer` com `width` + `aria-labelledby` no título, e **3 glifos novos** (`play`, `archive`, `save`) — faltavam para vestir um produto de automação, e sem eles o ícone cai no "?" silencioso.

### O que dá pra verificar agora

1. **Automação → Fluxos**: nenhuma linha tem botão. Marcar um fluxo faz aparecer a barra com **Arquivar** e **Excluir**; marcar um já arquivado junto com outros faz **Arquivar desaparecer** (fica só Excluir).
2. **Novo fluxo**: abre em rota (`/automacao/fluxos/novo`), com asterisco no Nome. Salvar sem nome → toast. Sem workspace/ambiente escolhido no topo → toast explicando.
3. **Abrir um fluxo → Rodar agora**: painel entra pela direita, o fluxo continua visível atrás. Desmarcar "Só simular" pinta o botão de vermelho e aparece o aviso de execução real. **Esc** fecha.
4. **Adicionar passo**: o Modal lista os passos por categoria; escolher um **já abre o inspetor** do passo criado. No inspetor, o campo de JSON tem largura de sobra. Aplicar com um campo obrigatório vazio → toast dizendo qual.
5. **O que dispara**: as 4 opções são cards com círculo; **Tab** entra no grupo e as **setas** trocam a opção. Escolhendo "Em horários certos", os campos mudam conforme a frequência, e "Ver as próximas vezes" traz 5 datas.
6. **Salvar versão**: o Modal diz que a versão nasce fora do ar; depois de salvar, o toast lembra de publicar em Versões.
7. **Claro/escuro** nas 6 telas — inclusive o diff de versões, que antes tinha verde e vermelho fixos.

### O que só dá pra verificar com fluxo montado

- publicar / voltar para uma versão anterior (mexe no que está no ar);
- o diff entre duas versões (precisa de duas versões salvas);
- rodar de verdade (dispara efeito real) e o passo a passo da execução;
- exportar e reimportar o arquivo.

## v0.10.1 - 2026-07-25 (Correção: "Novo calendário" abria em branco)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.23`**.

> Numeração: depois do `v0.9.99` vem `v0.10.1` — o patch para no 99, não existe `v0.9.100`.

### Corrigido

- **`/automacao/calendarios/novo` abria a página em branco** (sem casca, sem menu). Eu escrevi o rótulo de cada dia da semana como filho do componente — `<Checkbox>Segunda</Checkbox>` — e o `Checkbox` do DS só lia rótulo de `label`: o `children` era repassado ao `<input>`, que é elemento vazio, e o React lançava exceção **durante o render**, desmontando a árvore inteira. Não era erro de dado nem de permissão: era a tela quebrando ao montar.
  - Consertado nos dois lados, como manda a frente: no **DS** (v1.2.23) `label` e `children` passaram a ser equivalentes e `children` nunca chega ao `<input>`; aqui, o callsite passou a usar `label={d.label}`. Varri os outros 14 usos de `Checkbox`/`Radio` do painel — **nenhum outro** passava filho, então esta era a única tela afetada.

### Diagnóstico registrado (ainda NÃO implementado)

- **Não há como descobrir, pela tela, quais variáveis um template aceita.** O editor só traz dois exemplos na dica, e quem vem do WhatsApp escreve `{{1}}` por hábito — que **não resolve nada** (sai string vazia no envio, sem aviso). O que o motor realmente entende num corpo de template é `{{input.…}}` (o que o gatilho trouxe), `{{vars.<id-do-nó>.…}}` (saída de um passo anterior) e o que o próprio nó "Montar mensagem de um modelo" passar em "Dados extras (JSON)". Já existe base para resolver: o `variable-resolver` do backend declara os namespaces conhecidos (`KNOWN_NAMESPACES`) e tem `unknownTokens()`, usado na validação do publish do fluxo. Falta trazer isso pro editor. Frente própria — ver a pendência nº 13 em `docs/adocao-studio-ux.md`.

## v0.9.99 - 2026-07-25 (Automação — as 5 telas independentes migradas pro DS)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.22`**.

### Origem

Sétima família da adoção do Studio UX. A Automação foi partida em três: **A** (estas 5 telas, que não dependem umas das outras), **B** (Fluxos + editor de lista + os 4 arquivos de `editor/`) e **C** (o canvas, 773 linhas). Esta é a A.

### Alterado

- **Notificações** — o log de envios. Lista pura: sem linha clicável, sem seleção, sem ação. É registro de coisa que já aconteceu — não há o que abrir nem o que fazer, e oferecer clique seria prometer uma tela que não existe.
- **Eventos** — o log do Event Bus. A linha abre um Modal de leitura (metadados + o conteúdo do evento em JSON). **O "Reprocessar" saiu da linha e foi pro rodapé desse Modal**: reprocessar re-emite o evento para assinantes e fluxos publicados, ou seja, dispara efeito de verdade — não se faz sem ler primeiro o que vai ser re-emitido. Sem barra de lote, de propósito.
- **Execuções** — virou lista, e o detalhe virou **rota** `/automacao/execucoes/:id`. Era um Modal `size="xl"` aberto por `?open=<id>`: a URL já carregava o id, então o requisito de endereçar uma execução já existia — só faltava a URL ser honesta. O `?open=<id>` antigo **continua funcionando** (redireciona para a rota), então link em notificação ou e-mail não quebra.
- **Execução (detalhe, novo)** — situação, tempo, código de rastreio, o que entrou, o que saiu, e o **passo a passo no `Timeline` do DS**. O legado desenhava a bolinha de cada passo com hex cravado (`#ef4444`/`#eab308`/`#22c55e`), fora do tema — agora o nível do passo é um `Badge`. Reexecutar e Cancelar no cabeçalho, com os 5 patrasques.
- **Agendamentos** — os calendários saíram da grade de cards com lápis e lixeira no canto e viraram tabela: a linha abre, as ações vivem na barra de lote (excluir aceita vários; "Editar" aparece só com 1 marcado). O **editor de calendário virou rota** — o campo de feriados é uma lista de datas escrita à mão, exatamente o caso que a regra do Modal do DS proíbe. Os 7 dias da semana eram `<button>` com borda inline imitando checkbox; agora são `Checkbox` do DS num `CheckGroup`. A aba de agendamentos segue **só leitura**: a recorrência mora no gatilho do fluxo, então a linha leva pro fluxo.
- **Templates** — mesma história: lista com linha clicável + barra de lote, e o **editor virou rota** (o corpo da mensagem é um TextArea de 12 linhas). O filtro de canal foi pra toolbar da tabela, em vez de grudado no título. As variáveis detectadas ganharam um cartão próprio, explicando que o passo falha se o nome estiver errado.
- `extractTemplateVars` foi extraído para `template.helpers.js` — com o editor virando rota, a função ficaria duplicada em dois arquivos.
- **Breadcrumbs e rotas** das 5 telas novas registrados no `Layout.jsx` e no `App.jsx`, com gate de permissão (`automation.calendars.manage` para criar calendário, `automation.templates.write` para criar template).

### Corrigido de arrasto — o achado grande: 47 badges cinza

Auditando os editores novos, descobri que **`<Badge tone=...>` não fazia nada**: o `Badge` do DS chamava a prop de `status` (só ele — `StatCard` e `Banner` já chamavam `tone`), então tudo que escrevi por analogia caía no vazio. Resultado: **47 badges em 19 arquivos** — telas já validadas e no ar — renderizando **cinza neutro**. "Falhou", "Concluída", "Enviada", "sem permissão", canal, situação de execução: tudo sem cor, sem erro de build, sem aviso no console. Passou por validação visual porque um badge cinza **parece uma escolha de design**.

Corrigido no DS (**v1.2.22**): `tone` é o nome canônico e `status` fica como apelido. As 47 ocorrências voltam a colorir **sem eu tocar em nenhum arquivo** — o que é a prova de que o lugar do conserto era o DS, não o consumidor. Só padronizei os 7 lugares que ainda usavam `status` (Dashboard e a página de demonstração) para o codebase falar um nome só.

- **`<Tabs active={tab}>` em Agendamentos** — o `Tabs` do DS usa `value`, não `active` (o `Tabs` local usa `active`). A aba nunca ficaria marcada como ativa. Varri o resto: os outros `active=` que existem são arquivos que **ainda usam o Tabs local**, não migrados — legítimos.
- **`<Field required>` era prop morta** no DS (corrigido lá na v1.2.22, ver o CHANGELOG do Studio UX). Já estava vazendo em `ContaSenha.jsx` desde a v0.9.87 — os 3 campos obrigatórios de lá agora mostram o asterisco sem nenhuma mudança no arquivo.

### O que dá pra verificar agora (sem dado no sistema)

1. **Automação → Notificações / Eventos / Execuções**: as três abrem com o texto de lista vazia certo, cada um explicando o que faria aquela linha aparecer. Nenhuma delas mostra lápis ou lixeira em linha.
2. **Automação → Agendamentos**: as duas abas trocam de verdade e a aba ativa fica marcada (era o bug do `active`). Em Calendários, o botão **"Novo calendário"** abre a rota `/automacao/calendarios/novo`, com breadcrumb "Automação / Agendamentos / Novo calendário".
3. **No editor de calendário**: os 7 dias são quadradinhos do DS, em colunas; **Tab** percorre com anel de foco visível; "Nome" e "Dias úteis" mostram **asterisco** de obrigatório. Salvar sem nome → toast pedindo o nome. Escrever `25/12/2026` nos feriados → toast dizendo o formato certo. Desmarcar todos os dias → toast pedindo pelo menos um.
4. **Automação → Templates → Novo template**: rota própria (não Modal), TextArea grande, e o cartão de variáveis reagindo enquanto se digita `{{alguma.coisa}}` no conteúdo. Criar sem workspace/ambiente escolhido no topo → toast explicando.
5. **Badges com cor de volta em TODO o sistema** (efeito do conserto do DS, não desta família): IA Studio → Pendências, Habilidades, Custos, Assistentes; ISP → Incidentes; Painel. Antes tudo cinza; agora "Falhou" vermelho, "Concluída" verde, "Executando" amarelo, "Na fila" azul. Vale a olhada porque é a mudança visual mais ampla desta versão.
6. **Claro/escuro** nas 7 telas: nenhuma cor cravada sobrou (o vermelho/amarelo/verde do passo a passo e o roxo do canal agora vêm do tema).
7. **Deep-link antigo**: abrir `/automacao/execucoes?open=qualquer-coisa` na barra do navegador redireciona para `/automacao/execucoes/qualquer-coisa` — que vai dar "não encontrado" e voltar pra lista, o que é o comportamento correto para um id inventado.

### O que só dá pra verificar quando houver movimento

Estas dependem de dado real e ficam para quando o sistema estiver rodando fluxo:

- linha na tabela de Notificações / Eventos / Execuções, e a **paginação com contagem** ("N execuções") — a contagem e a janela de páginas só aparecem com volume;
- o **passo a passo** de uma execução (precisa de um fluxo que rodou e gerou log);
- **Reprocessar** um evento e **Reexecutar/Cancelar** uma execução — os dois disparam efeito de verdade, então não são teste de tela;
- o **badge de nível** (erro/aviso) no passo a passo.

## v0.9.98 - 2026-07-25 (Opção em card virou padrão — sweep nos dois lugares que tinham o cenário)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.20`**.

### Origem

Comparando duas telas lado a lado, o Robson cravou o padrão: as habilidades do assistente (opção em **card** com borda que acende) contra as opções de comportamento do incidente (opção **nua**) — *"ficou muito mais elegante e isso tem que ser padrão do DS"*. Virou `variant="card"` + `meta` no `Checkbox`/`Radio` (DS v1.2.20), com a regra escrita no catálogo: quando a borda ganha da opção nua, quando ela é só moldura, e os anti-padrões.

### Alterado

- **Incidente → "Comportamento do assistente"**: as 4 opções viraram **card em 4 colunas** (a densidade que o Robson aprovou). A condição de aplicação saiu do meio do rótulo e foi pra `meta` — em vez de "Avisar quando normalizar (só nos modos proativo e combinado)" numa linha só, o rótulo virou **"Avisar quando normalizar"** com *"Só nos modos proativo e combinado"* embaixo. Mesma informação, hierarquia legível.
- **Editor de assistente → habilidades / bases / memória**: o card **montado à mão** (um `<label>` com borda e `<input>` solto) foi substituído pelo componente do DS. Não é só cosmético — ganhou **foco visível** por teclado, a borda de "marcado" deixou de ser sincronizada por JS, e o motivo do bloqueio saiu do `title` (só no hover) para um `Badge "sem permissão"` **na tela**, seguindo a regra do DS de que informação essencial não vive em tooltip. `columns="auto"` mantém a densidade original.
- Varri as demais telas migradas: os outros `Checkbox` são **toggles soltos de configuração** (salvar como versão, ocultar dados pessoais, exigir aprovação, ativar orçamento) e pela regra do DS **não** levam card — ali a borda seria moldura sem função. O `Radio` do par padrão em Abertura de chamado também segue nu, porque já vive dentro do card do par. Nenhuma grade de opção montada à mão restou no consumidor (conferido por `grep`).

### Testar após aplicar

1. **Incidente → Informativo → "Comportamento do assistente"**: 4 cards em 4 colunas, cada um com rótulo curto + condição embaixo. Marcar acende a **borda** no accent. **Tab** percorre os quatro com anel de foco visível.
2. **Editor de assistente → "O que pode fazer"**: mesma aparência de antes, mas agora com anel de foco ao navegar por Tab. Sem a permissão de ações, as habilidades que gravam dados mostram **`sem permissão`** escrito no card (antes era só tooltip).
3. Estreitando a janela, os dois grupos caem para menos colunas sozinhos.

## v0.9.97 - 2026-07-25 (Mesmo conteúdo da v0.9.96, apontando para o DS `^1.2.19`)

Sem `db push`. **Mesmo código da v0.9.96** — o que muda é a faixa da dependência.

### Por que existe

A v0.9.96 pinava `^1.2.18`, e **essa versão do DS nunca chegou ao registry**: a tag `v1.2.18` foi criada, mas eu esqueci de bumpar os `package.json` do monorepo (continuaram em `1.2.17`), então o workflow republicou `1.2.17` com o CI verde e o número `1.2.18` não passou a existir. O `npm install` do `ADMIN_BUILD` respondeu `ETARGET — No matching version found for @studio-ux-ds/components@^1.2.18`. O conteúdo que era pra ser a 1.2.18 saiu como **DS v1.2.19**.

Como a tag `v0.9.96` aponta para um commit que pede uma versão inexistente, ela é irrecuperável — daí a v0.9.97 com a mesma coisa e a faixa certa.

**Gate criado no DS para não repetir:** o `check-packages.mjs` (que o workflow de publish já roda) agora **falha se a tag não bater com a versão dos pacotes**. Republicar uma versão existente não é erro para o npm — era por isso que passava verde.

### Alterado

- Faixa `@studio-ux-ds/*` de `^1.2.18` para **`^1.2.19`**.

### Testar após aplicar

1. Os 3 pontos do `CheckGroup`, ainda não vistos no ar: **incidente → "Comportamento do assistente"** em 2 colunas; **editor de assistente → "O que pode fazer"** em 3 colunas; nenhuma opção encostando na vizinha.
2. **O rollback do upgrade** (entrou na v0.9.96, chega ao ar agora): na próxima vez que um upgrade falhar depois do checkout, o log deve terminar com duas linhas `[ROLLBACK]`, o card "Versão atual" deve continuar na versão **anterior** e a que falhou deve seguir **listada como disponível** — sem precisar de tag nova.

## v0.9.96 - 2026-07-25 (Upgrade que falha volta o repo — fim do "atual = versão nova, código antigo") — NÃO APLICADA

**Não entrou em produção:** falhou no `ADMIN_BUILD` porque pinava `@studio-ux-ds/*@^1.2.18`, versão que nunca foi publicada (ver v0.9.97). O código é o mesmo que a v0.9.97 entrega.

Sem `db push`. Mexe em `scripts/upgrade.sh` (mecanismo de deploy) + faixa do DS.

### Corrigido — a dívida que apareceu duas vezes seguidas

O `upgrade.sh` fazia `GIT_CHECKOUT` **antes** de construir. Quando o build falhava depois, o repo ficava na versão nova mas o `dist` servido continuava o da anterior. Efeito colateral cruel: o `GET /system/version` (que lê a tag do deploy) passava a responder a versão nova, o painel via "atual = versão nova" e mostrava **"Nenhuma versão disponível"** — **impedindo reaplicar**. Duas vezes seguidas isso obrigou a publicar tag nova só pra reexecutar o mesmo código (v0.9.94 → v0.9.95 → v0.9.96). E é a forma clássica do **release fantasma**: versão nova anunciada com código antigo rodando.

- **`revert_checkout()` novo, chamado pelo `mark_failed()`** antes de gravar `FAILED`: se a falha aconteceu depois do checkout (flag `CHECKED_OUT`), o repo volta para a `FROM_VERSION` que o `PREFLIGHT` já detectava. Duas linhas novas em `log_lines` (`[ROLLBACK] voltando o repo para vX` / `[ROLLBACK] repo de volta em vX — a versão segue disponível para reaplicar`), então o operador **vê** o que aconteceu no mesmo log. Se não der para identificar a origem, registra o aviso e segue — nunca troca uma falha de build por um repo em estado desconhecido.
- **O script agora se copia para `/tmp` e reexecuta de lá** (`UPGRADE_SELF_COPIED`, idempotente). Motivo: o `git checkout` **reescreve o próprio `upgrade.sh`** enquanto o bash o executa, e o bash lê o script em pedaços conforme avança — trocar o arquivo no meio pode fazê-lo continuar num offset que agora aponta pra outro conteúdo. Vinha funcionando por sorte (o arquivo cabia no buffer); com o script crescendo, deixa de ser sorte confiável. Rodando de `/tmp`, o arquivo em execução não é mais o que o git substitui.

### Alterado

- Faixa `@studio-ux-ds/*` para **`^1.2.18`** (mantida da v0.9.95, que não entrou).

### Pré-requisito

**O DS `v1.2.18` precisa estar publicado antes de aplicar esta versão.** Foi o que derrubou a v0.9.95: o `npm install` respondeu `ETARGET — No matching version found for @studio-ux-ds/components@^1.2.18` porque a tag do DS ainda não tinha subido. Confira no GitHub Packages antes de aplicar.

### Testar após aplicar

1. Os 3 pontos do `CheckGroup`, que ainda não foram vistos no ar: **incidente → "Comportamento do assistente"** em 2 colunas; **editor de assistente → "O que pode fazer"** em 3 colunas; nenhuma opção encostando na vizinha.
2. **O comportamento novo do upgrade** (vale testar de propósito na próxima release): se um upgrade falhar no build, o log deve terminar com duas linhas `[ROLLBACK]`, o card "Versão atual" deve continuar mostrando a **versão anterior**, e a versão que falhou deve seguir **listada como disponível** para reaplicar sem precisar de tag nova.

## v0.9.95 - 2026-07-25 (Reaplica a v0.9.94 com o DS corrigido — `^1.2.18`)

Sem `db push`. Só frontend. **Mesmo código da v0.9.94**; o que muda é a faixa da dependência.

### Por que existe

A v0.9.94 **falhou no `ADMIN_BUILD`** e não entrou. A causa não estava no IA Studio: o `@studio-ux-ds/react@1.2.17` foi publicado com o `Controls.jsx` **sintaticamente inválido** — um JSDoc escrito com `**3**/**4**` contém a sequência `*/`, que fecha o comentário de bloco no meio da frase, e o resto virou código. O esbuild do Vite quebrou exatamente nesse trecho (`ERRO: vite build falhou: , quando o grupo tem`). Corrigido no DS **v1.2.18**.

**Por que não bastava reaplicar a v0.9.94:** o `upgrade.sh` faz `GIT_CHECKOUT` **antes** do build. Como o checkout passou e o build quebrou depois, o marcador de versão avançou para v0.9.94 enquanto o `dist` servido continuou o da v0.9.93 — e o painel, vendo "atual = v0.9.94", passou a mostrar **"Nenhuma versão disponível"**. Sem tag nova não havia o que aplicar. (Registrado como dívida: o upgrade deveria voltar o checkout ao falhar, ou construir antes de mover o marcador — ver `docs/adocao-studio-ux.md`.)

### Alterado

- Faixa `@studio-ux-ds/*` de `^1.2.17` para **`^1.2.18`**. `^1.2.17` já pegaria a 1.2.18 no `npm install` (não há lockfile no `platform-admin`), mas deixar explícito documenta qual versão o build exige e não depende de resolução implícita.

### Testar após aplicar

Os mesmos 3 pontos da v0.9.94, que ainda não foram vistos no ar:

1. **Incidente → aba Informativo → "Comportamento do assistente"**: as 4 opções em **2 colunas**, preenchendo o card. Estreitando a janela, caem pra 1 sozinhas.
2. **Editor de assistente → "O que pode fazer"**: habilidades em **3 colunas**.
3. Em ambas: nenhuma opção encostando na vizinha, e rótulo que quebra em duas linhas alinhando a caixa com a **primeira** linha.

## v0.9.94 - 2026-07-25 (Grupos de opções em colunas — `CheckGroup` do DS) — NÃO APLICADA

**Esta versão não entrou em produção:** falhou no `ADMIN_BUILD` por causa do `@studio-ux-ds/react@1.2.17` quebrado (ver v0.9.95). O código é o mesmo que a v0.9.95 entrega.

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.17`**, que trouxe o `CheckGroup`.

### Alterado

Empilhar uma opção por linha desperdiçava a tela larga — as 4 opções de comportamento do incidente ocupavam ~40% do card, o resto vazio. O DS ganhou o **`CheckGroup`** (v1.2.17), que distribui a lista em colunas por `auto-fill` + `minmax` (sem media query, cai pra uma coluna sozinho em tela estreita), e as duas telas passaram a usá-lo:

- **Incidente → "Comportamento do assistente"**: `columns={2}`. Escolhi 2 e não 3 porque os rótulos são frases inteiras ("Detectar instabilidade automaticamente — só sugere um rascunho, nunca ativa sozinho") — em 3 colunas cada uma quebraria em três linhas e ficaria pior que o vazio.
- **Editor de assistente → listas de habilidades / bases / memória**: `columns={3}`, e a **grade `auto-fill` que eu tinha montado à mão** na v0.9.91 foi **deletada**. O responsivo virou responsabilidade do componente, não da tela: se o comportamento de coluna mudar, muda no DS e chega em todo mundo.

O grupo também recebe `role="group"` + `aria-labelledby` apontando pro título visível da seção, então o leitor de tela anuncia "Comportamento do assistente, grupo" antes das opções.

### Testar após aplicar

1. **Incidente → aba Informativo → "Comportamento do assistente"**: as 4 opções em **2 colunas**, preenchendo o card. Estreitando a janela, caem pra 1 sozinhas.
2. **Editor de assistente → "O que pode fazer"**: habilidades em **3 colunas** (visualmente igual à v0.9.91 — a diferença é que agora quem faz é o DS).
3. Em ambas: nenhuma opção deve encostar na vizinha, e rótulo que quebra em duas linhas alinha a caixa com a **primeira** linha.

## v0.9.93 - 2026-07-25 (Correções da revisão visual do ISP)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.16`**. Três achados do Robson revisando a v0.9.92 no ar — todos do DS, e viraram a release **v1.2.16** dele (rótulo de opção deixa de ser inline; ✓ centralizado nas duas formas).

### Corrigido

- **As 4 opções de "Comportamento do assistente" (incidente) apareciam em duas linhas corridas**, com o rótulo de uma encostando no controle da próxima: *"…por este incidente✓ Informar a previsão…"*. Era do DS — o rótulo de `Checkbox`/`Radio` era `display: inline-flex`, e elemento inline **não quebra linha**, então nem o `space-y-3` que eu pus no container tinha efeito. Corrigido no DS v1.2.16: o default virou `flex` (empilha), com a prop `inline` para o caso raro de opções lado a lado. Ganhou também `align-items: flex-start`, então rótulo longo que quebra em duas linhas alinha o controle com a **primeira** linha.
- **O "Padrão do suporte" (abertura de chamado) ficava estranho de ler.** Estava encaixado no fim da linha dos dois selects: sem rótulo de cabeçalho como os vizinhos, num baseline diferente e disputando espaço com a lixeira. Ganhou **linha própria** dentro do card do par, com rótulo explícito *"Usar este par como padrão do suporte"* — é uma decisão **sobre o par inteiro**, não um terceiro campo dele. Passou a usar o componente `Radio` do DS em vez do `<input>` montado à mão. **Funcionava** desde a v0.9.92 (marcar um desmarcava o outro); o problema era só visual.
- **O ✓ do círculo estava desalinhado** — a posição era um offset em px calibrado para o quadrado. Corrigido no DS v1.2.16 com centralização por `transform`, que serve às duas formas.

### Testar após aplicar

1. **Incidente → aba Informativo → card "Comportamento do assistente"**: as 4 opções **empilhadas**, uma por linha, com espaço entre elas. A última (texto longo) deve alinhar a caixa com a primeira linha do texto.
2. **Abertura de chamado → card de pares**: o "Usar este par como padrão do suporte" em **linha própria** abaixo dos dois selects. Marcar num par desmarca no outro. Funciona por **Tab + Espaço**.
3. O ✓ dentro do **círculo** deve estar centralizado (compare com o do quadrado na tabela de Assistentes).

## v0.9.92 - 2026-07-25 (Família ISP migrada — 2ª família concluída)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.15`** (seleção real na `DataTable` + `.su-checkbox`/`.su-radio` desenhados pelo DS).

Segunda família migrada.

### Incidentes (`pages/ISP/Incidentes.jsx` + `IncidenteEditor.jsx`)

A lista tinha **cinco botões por linha** (Afetados, Editar, Disparar, Ativar, Encerrar), com visibilidade variando por status *e* por permissão: o pior caso de coluna de ações do sistema. Agora a lista é só listagem e a linha abre `/isp/incidentes/:id`.

O editor novo absorveu **três overlays**:

- **`IncidentModal`** (tinha `TextArea` da mensagem) → é a aba **Informativo**, agora em 3 cards: o aviso, o escopo de rede, e o comportamento do assistente.
- **`TargetsModal`** → é a aba **Afetados**. Era uma bancada inteira dentro de um Modal `size="lg"`: tabela com scroll interno de 320px, botão de resolver, e um form de 4 campos comprimido no rodapé. Agora a tabela respira e o "incluir um cliente à mão" é um card próprio, com explicação de quando usar.
- **Os 5 botões da linha** → cabeçalho do editor, onde a decisão é tomada vendo o modo de comunicação e a contagem de afetados. Um card de status mostra situação + quantos afetados + um aviso explícito quando o modo é proativo.

**Sem barra de lote, de propósito.** Ativar um incidente proativo dispara WhatsApp em massa; encerrar pode disparar o aviso de normalização. É o caso que a regra do DS cita como o que não se faz em lote — a tabela não tem nem coluna de seleção.

**O que seguiu Modal, corretamente:** o passo do disparo (só um `NumericInput` de limite por segundo) e o `ConfirmDialog`. A mensagem do confirm agora diz **o número exato** de clientes que vão receber e a taxa de envio — antes dizia só "todos os afetados incluídos".

### Abertura de chamado (`pages/ISP/AberturaChamado.jsx`)

Tela de configuração com 5 assuntos, cada um com endpoint próprio de gravação. Migrada para 5 `Card`s com `Field`/`Input`/`Select`/`Button` do DS. **Cada card mantém seu próprio botão de salvar** — não é violação de P6: cada card é um contexto, e o rótulo diz o que grava ("Salvar filas", "Salvar limite", "Salvar plantão") em vez de um "Salvar" ambíguo. Um botão único daria a impressão falsa de que tudo grava junto, e um erro num assunto derrubaria a gravação dos outros.

- Os `<select className="input">` e `<input className="input">` crus (classe legada do projeto) e os `<label>` montados à mão viraram `Field` + `Select`/`Input` do DS.
- **A estrela virou radio.** "Qual par é o padrão de suporte" é escolha **única** — e pela regra que acabou de entrar no DS (v1.2.15), escolha única tem forma de **círculo**. A estrela amarela (`#f59e0b` hardcoded) não comunicava "só um" e não era alcançável por teclado.
- Linguagem do usuário nos títulos: "Filas de setor" → **"Para onde encaminhar a conversa"**; "Envio de boletos" → **"Quantos boletos por mensagem"**; "Equipe de plantão (alerta de incidente)" → **"Quem é avisado de instabilidade na rede"**; "Setor" → **"Departamento"** (o próprio texto do legado já avisava que era o departamento do atendimento).

### Adicionado

- `pages/ISP/IncidenteEditor.jsx`, `pages/ISP/isp.constants.js` (os mapas de status/modo/escopo saíram de dentro do `Incidentes.jsx` porque o editor também usa), `pages/ISP/Incidentes.legacy.jsx` e `pages/ISP/AberturaChamado.legacy.jsx` (backups).
- 2 rotas em `App.jsx` + 2 padrões de breadcrumb no `Layout.jsx`.

### Testar após aplicar

**Incidentes**
1. Lista: colunas Título (com previsão embaixo) / Comunicação / Afetados / Situação. **Nenhum botão na linha.** Clicar na linha abre o incidente.
2. **Novo incidente** → aba Informativo com 3 cards. O seletor "Como comunicar" diz a consequência no próprio rótulo ("Proativo — dispara aviso em massa").
3. Salvar um incidente novo → a URL troca de `/novo` para `/isp/incidentes/<id>` **sem recarregar**, e a aba **Afetados** aparece.
4. Aba **Afetados** → "Buscar afetados no ERP" popula a tabela. A coluna **Incluir** marca/desmarca quem recebe (é edição de dado, não seleção em lote — por isso não há barra).
5. **Incluir um cliente à mão**: card próprio embaixo da tabela, com os 3 campos e o botão.
6. **Ativar** um incidente **reativo** → ConfirmDialog dizendo que **nenhuma mensagem é disparada**.
7. **Ativar** um incidente **proativo** → botão fica **vermelho** e o ConfirmDialog diz o **número exato** de clientes que vão receber. (Cuidado: dispara de verdade.)
8. Com o incidente ativo e proativo → botão **Disparar aviso** na aba Afetados: modal com o limite por segundo → ConfirmDialog com a contagem e a taxa.
9. **Encerrar** → ConfirmDialog avisando que o aviso de normalização sai agora se estiver ligado.
10. **F5** em `/isp/incidentes/<id>` → recarrega certo.

**Abertura de chamado**
11. Os 5 cards, cada um com seu botão de salvar e spinner próprio ao gravar.
12. No card de pares: o "Padrão do suporte" agora é **círculo** (radio) — marcar um desmarca o outro, e funciona por **Tab + Espaço**.
13. Sem conexão de provedor ativa → `EmptyState` no primeiro card, os outros 4 continuam funcionando.

### Estado da adoção

**2 famílias concluídas:** IA Studio (6 telas) e ISP (2 telas). Restam: Configurações (5), Integrações (6), Recursos (2), Desenvolvedor (2), Automação (12, com o Canvas), WhatsApp (11, com o chat).

## v0.9.91 - 2026-07-24 (Barra de ações em lote + 3 colunas nas habilidades + Enter volta a funcionar)

Sem `db push`. Só frontend. Bump `@studio-ux-ds/*` para **`^1.2.14`**, que trouxe o `selectionMode` do `DataTable`, a largura dos controles de formulário e a taxonomia de ações reescrita.

### 1. Barra de ações em lote (a correção que o Robson pediu)

Na v0.9.90 eu tirei os 4 botões da linha de Assistentes e mandei dois deles (Versões, Exportar) pro cabeçalho do editor. Estava **errado pela metade**: a regra que eu tinha escrito no DS (v1.2.12) não citava a **barra de lote**, que é o comportamento canônico do `DataTable` — está no JSDoc do componente desde sempre. Corrigido no DS (v1.2.14) e aplicado aqui:

- **Assistentes** — a tabela ganhou seleção. Marcar caixas → barra contextual com **Exportar** (roda em N: baixa um arquivo por assistente, com toast dizendo quantos) e, **só com 1 marcado**, **Versões**. Ver versões de cinco assistentes ao mesmo tempo não significa nada, então o botão não aparece — é o `bulkActions` ramificando em `ids.length === 1`. **Testar não entra na barra**: é sobre o assistente aberto, com o resultado na frente — vive na aba Testar do editor.
- **Habilidades → Servidores MCP** — barra com **Sincronizar** (roda em N, em sequência) e, com 1 marcado, **Ver habilidades**. O erro por servidor **não** some em silêncio: se falha em alguns, o toast diz **quais** pelo nome.
- **Assistentes** manteve o Versões/Exportar **também** no cabeçalho do editor. Não é duplicação sem propósito: na lista você age sobre a seleção; dentro do editor você age sobre o assistente que está aberto. São os dois lugares que a taxonomia prevê.

**As tabelas que NÃO ganharam barra, e por quê** (a taxonomia foi aplicada a todas as 11):

| Tabela | Ação que existia | Onde ficou |
|---|---|---|
| Custos → Orçamentos | editar | é o clique na linha — nada pra barra |
| Custos → Consumo | nenhuma | linha sem destino, sem seleção |
| Memória → Perfis | editar | clique na linha abre as entradas; editar está lá dentro |
| Memória → Entradas | nenhuma | leitura |
| Pendências → Fila | aprovar / rejeitar | **deliberadamente fora da barra** — aprovar em massa uma ação de IA é exatamente o que não se faz sem ler cada caso. Fica no detalhe, com o contexto na frente |
| Pendências → Políticas | nenhuma | backend não tem update |
| Habilidades → Catálogo | editar | é o clique na linha |
| Conhecimento → Bases | excluir | pela taxonomia iria pra barra, mas **o backend não tem DELETE** (dívida registrada, decisão de não mexer). Segue no cabeçalho do detalhe até o endpoint existir |
| Conhecimento → Documentos | nenhuma | sem endpoint individual |

### 2. Habilidades em 3 colunas

As listas de marcar (habilidades, bases de conhecimento, perfis de memória) no editor de assistente ocupavam **uma coluna** com rótulos curtos ("2ª via de boleto", "Data e hora atual") — dois terços da largura vazios e uma lista longa pra rolar. Agora é grade responsiva (`auto-fill` + `minmax(260px, 1fr)`): 3 colunas no desktop largo, 2 no médio, 1 no mobile. Sem media query.

### 3. Enter volta a funcionar nos campos "um por linha"

**Bug que existia desde antes da migração** e que o Robson pegou: nos campos Sempre / Nunca / Palavras bloqueadas era **impossível pular linha**. O campo fazia round-trip `array → join('\n')` no `value` e `split('\n') + filter(Boolean)` no `onChange` — e o `filter(Boolean)` **descarta linha vazia**. No instante em que você aperta Enter, `"aa\n"` virava `["aa"]` e voltava como `"aa"`: a quebra era apagada no mesmo keystroke, e a segunda regra nunca podia ser escrita.

Corrigido com um `LinesTextArea`: o texto cru vive num state local **enquanto o campo está focado** (aí a quebra sobrevive) e só é convertido para array no `blur`. O array do pai re-hidrata o texto apenas quando o campo **não** está sendo editado, então os dois não brigam.

### 4. Largura dos controles (vinha do DS)

Os `Input`/`TextArea` das linhas de **Passo** e **Situação** apareciam com ~180px, esmagados. Não era esta tela: `.su-input`/`.su-textarea` do DS só preenchiam **dentro** do `Field` (o stretch vinha do flex do wrapper). Corrigido no DS v1.2.14 (`width: 100%` + `box-sizing`), chega aqui pelo bump.

### 5. Ações do cabeçalho não somem mais

`.su-pagehead__actions` era `flex: none` **sem wrap** — o cabeçalho do editor com 4 ações (Voltar · Versões · Exportar · Salvar) estourava pra fora da viewport em tela estreita, e as ações ficavam invisíveis. Isso explica provavelmente por que você não achou Versões/Exportar no editor. Corrigido no DS v1.2.14 com `flex-wrap`.

### Testar após aplicar

1. **Assistentes**: marcar 1 caixa → barra roxa "1 selecionado" com **Exportar** e **Versões**. Marcar 3 → o botão vira **"Exportar 3"** e o **Versões desaparece** (não faz sentido em três). "Limpar" à direita esvazia.
2. **Exportar 3** → baixa 3 arquivos, toast "3 assistentes exportados". A seleção limpa sozinha depois.
3. **Versões** (1 marcado) → abre o modal com a badge **Em uso** na versão certa.
4. Clicar na linha (fora da caixa) → abre o editor, sem selecionar.
5. **Habilidades → Servidores MCP**: marcar vários → **"Sincronizar N"**. Se algum falhar, o toast diz **quais** pelo nome.
6. **Editor → O que pode fazer**: as habilidades em **3 colunas** (2 em tela média, 1 no celular).
7. **Editor → Quem é**: no campo **Nunca**, escrever uma regra, apertar **Enter** e escrever a segunda. A quebra tem que ficar. Salvar, sair e voltar: as duas linhas continuam lá.
8. **Editor → O que faz**: os campos de **Passo** e **Situação** agora ocupam a largura toda do card.
9. **Editor** em janela estreita: as 4 ações do cabeçalho quebram pra segunda linha em vez de sumir.

## v0.9.90 - 2026-07-24 (Assistentes migrado — família IA Studio 6/6 CONCLUÍDA)

Sem `db push`. Só frontend. **Última tela da família.** Era a maior: um Modal `size="xl"` com 8 abas e ~12 `TextArea` dentro.

### Assistentes (`pages/IA/Agentes.jsx`)

A tela virou **só listagem**. Tudo que era overlay ou state saiu:

- **`AgentEditorModal` (8 abas, ~12 `TextArea`) → rotas `/ia/agentes/nova` e `/ia/agentes/:id`** (`AgenteEditor.jsx`). Era o caso mais extremo da regra do Modal do DS: a pessoa escreve a personalidade (sempre/nunca), o objetivo, a descrição de cada passo, o "faça" de cada situação, as instruções adicionais e as palavras bloqueadas — o roteiro inteiro de um atendente — atrás de um scrim, sem ver nada do resto do sistema. Cada aba agora vive em `Card`s próprios, com os campos respirando (as regras de persona passaram de 3 para 4 linhas, as instruções adicionais de 4 para 6, a mensagem de teste de 2 para 4).
- **`ImportAgentModal` → rota `/ia/agentes/importar`** (`AgenteImportar.jsx`). `TextArea` de JSON passou de 12 para 18 linhas. O `hint` agora avisa que segredos não viajam no arquivo e a conexão de IA precisa ser reescolhida.
- **`AgentExecuteModal` foi ABSORVIDO pela aba Testar do editor.** Havia **duas** UIs de teste no código — o `AgentExecuteModal` (aberto pelo ▶ da linha) e o `TestTab` dentro do editor —, com o mesmo propósito e comportamentos diferentes. Agora é uma. Consequência de ACL: a rota `/ia/agentes/:id` ficou como **`ai.agents.read`** (não `write`), com o Salvar gateado por `can('ai.agents.write')` — assim quem só tem `ai.agents.execute` continua alcançando o teste. Antes, um usuário só-execute testava pelo ▶ da lista; se a rota fosse `write`, ele perderia o acesso.
- **`AgentVersionsModal` segue Modal**, de propósito: não tem campo nenhum (lista de versões + publicar/reverter), então respeita a regra — que é sobre `TextArea`/escrita reflexiva, não sobre overlay em si. Migrado pros componentes do DS e agora aberto pelo **cabeçalho do editor**, não pela linha.
- **Linha clicável:** a linha tinha **4 botões** (▶ Testar, Versões, Exportar, ✎ Editar) **mais** o nome clicável — cinco alvos disputando o mesmo clique. Sobrou um: a linha inteira abre o assistente. **Versões** e **Exportar** desceram pro cabeçalho do editor, onde têm contexto (regra do `STUDIO_UX_TABLES.md` §3, caso 2).
- O checkbox **"Salvar como nova versão"** saiu do rodapé do modal e ficou ao lado da **"Nota da versão"**, na aba Visão geral — é onde ele faz sentido, junto do campo que ele controla.
- **Versão publicada agora é lida de volta.** No legado, salvar uma versão nova ou publicar/reverter não atualizava nada na tela aberta (o modal recebia `current_version` da linha da lista, que ficava velha). Agora um `refreshVersionMeta()` relê só o metadado de versão — sem re-hidratar o formulário, para não descartar edições não salvas do usuário.
- Linguagem do usuário: "Versão ativa" → **"Versão publicada"** (`nenhuma ainda` em vez de `—`), "Ativa" → **"Em uso"**, "Reverter" → **"Voltar para esta"**, "Rollback aplicado" → "Voltou para a vN", "Nome que a IA usa" → "Nome que o assistente usa", "Quantas ações a IA encadeia" → "…o assistente encadeia".

### Também corrigido

- `MultiSelectList` (as listas de marcar habilidades / bases / memória) era um `<button>` com um `<input type="checkbox" readOnly>` dentro — clicável mas semanticamente errado, e o checkbox não era focável. Virou `<label>` + checkbox real: o rótulo inteiro continua clicável, o teclado funciona, e o leitor de tela anuncia o estado.
- Último resquício de `components/ui/*` local, `text-red-500`/`text-emerald-500` hardcoded e `var(--ap-*)` legada no grupo IA — todos removidos. **O grupo IA está 100% no DS.**

### Adicionado

- `pages/IA/AgenteEditor.jsx`, `pages/IA/AgenteImportar.jsx`, `pages/IA/Agentes.legacy.jsx` (backup).
- 3 rotas em `App.jsx` + 3 padrões de breadcrumb no `Layout.jsx`.

### Órfãos para a limpeza futura

`editor/AgentEditorModal.jsx` e `editor/AgentExecuteModal.jsx` **seguem no repo** porque o `Agentes.legacy.jsx` os importa — é o que faz o rollback funcionar. Entram na sub-frente de limpeza (item 7 da tabela de dívida em `docs/adocao-studio-ux.md`) junto com os outros `.legacy`, **depois** de a família estar validada em produção.

### Testar após aplicar

**Assistentes — lista**
1. Colunas Nome (com descrição embaixo) / Modelo / Versão publicada (`nenhuma ainda` quando não há) / Status / Atualizado. **Nenhum botão na linha** e o nome **não** é um link separado. Header com **Importar** e **Novo assistente**.
2. Clicar na linha → `/ia/agentes/<id>`, breadcrumb "IA Studio / Assistentes / Editar".

**Editor — abas**
3. **Visão geral**: card "Pronto para publicar?" com os 4 itens marcando ✓ conforme você preenche. Nome, Descrição, checkbox "Salvar como nova versão" e (se marcado) Nota da versão.
4. **Quem é**: nome do assistente, tom, emojis, tamanho das respostas + Sempre/Nunca (uma regra por linha).
5. **O que faz**: Objetivo + card de Passos (adicionar, subir, descer, remover) + card de Situações (adicionar, remover). Testar o **subir/descer** de um passo do meio.
6. **O que sabe** / **O que pode fazer**: listas de marcar. Clicar em **qualquer parte da linha** marca/desmarca; navegar por **Tab** e marcar com **Espaço** também. Sem a permissão de ações, as habilidades "grava dados" ficam esmaecidas com tooltip explicando.
7. **Testar**: sem salvar ainda → EmptyState "Salve antes de testar". Depois de salvo → mensagem de teste + botão com spinner + resultado com status, tokens, custo e a resposta.
8. **Ajustes avançados**: conexão, modelo, criatividade/passos/tokens, memória (se houver perfis), instruções adicionais, limites de segurança.

**Editor — ações do cabeçalho**
9. **Salvar** com "nova versão" marcado → toast com o número da versão. Abrir **Versões** logo depois: a nova versão tem que aparecer, e a badge **Em uso** tem que estar na versão certa (era isso que ficava velho no legado).
10. **Versões** → **Publicar** numa versão mais nova, ou **Voltar para esta** numa mais antiga (esta é vermelha, com ConfirmDialog explicando que nenhuma versão é apagada). Após confirmar, reabrir Versões: a badge "Em uso" tem que ter mudado.
11. **Exportar** → baixa o `.json`. **Importar** (pela lista) → cola o conteúdo, importa e **abre o assistente importado** para revisão.
12. **Novo assistente** → salvar pela primeira vez: a URL troca de `/nova` para `/ia/agentes/<id>` **sem recarregar**, e as abas Testar/Versões/Exportar ficam disponíveis na hora.
13. **F5** em `/ia/agentes/<id>` → recarrega o assistente certo.

### Família IA Studio — concluída

`v0.9.84 Custos` · `v0.9.85 Memória` · `v0.9.86 Pendências` · `v0.9.87 Habilidades` · `v0.9.88 padronização retroativa` · `v0.9.89 Conhecimento` · **`v0.9.90 Assistentes`**. Próximas famílias (Automação, WhatsApp, Integrações, ISP, Recursos, Desenvolvedor, Configurações) seguem no legado — cada uma é uma frente própria.

## v0.9.89 - 2026-07-24 (Conhecimento migrado + bump DS ^1.2.13 + 3 bugs silenciosos corrigidos; 5/6 da família IA Studio)

Sem `db push`. Só frontend. Quinta tela da família migrada — a primeira que **nasce** já alinhada às duas regras (não precisou de refactor retroativo).

### 1. Bump `@studio-ux-ds/*` para `^1.2.13`

Traz o **`Button` com prop `loading`** (spinner real + `disabled` + `aria-busy`), que a spec do DS já declarava e o adapter não expunha. Os 3 pacotes (`tokens`, `components`, `react`) sobem juntos por lockstep.

### 2. Conhecimento migrado (`pages/IA/BasesConhecimento.jsx`)

A tela virou **só listagem**, sem nenhum overlay. Tudo que era Modal ou state virou rota:

- **`CreateBaseModal` → rota `/ia/conhecimento/nova`** (`BaseConhecimentoEditor.jsx`). Tinha `TextArea` de Descrição. Além de migrar, os campos técnicos (conexão de embeddings, modelo, chunk size/overlap) foram para um segundo card **"Ajustes avançados"** com o aviso de que os padrões servem para a maioria dos casos — e renomeados para a língua do dono do negócio: "Onde gerar a indexação", "Tamanho do trecho", "Sobreposição entre trechos".
- **`AddDocumentModal` → rota `/ia/conhecimento/:id/documentos/novo`** (`BaseDocumentoEditor.jsx`). Era o pior caso da família: colar um documento inteiro num `TextArea` de 8 linhas dentro de um Modal, sem ver a base a que pertence. Agora o campo tem 18 linhas e o cabeçalho diz *"Vai entrar na base «X»"*. Rótulos em linguagem do usuário ("De onde vem o conteúdo", "Como chamar este documento", "Endereço da página").
- **Master-detail falso → rota `/ia/conhecimento/:id`** (`BaseConhecimentoDetalhe.jsx`), mesmo tratamento que a Memória levou na v0.9.88.
- **Linha clicável:** o legado tinha `onClick` na linha **e** uma lixeira "Excluir base" na mesma linha — dois alvos disputando o clique, com o destrutivo colado no navegacional (pedindo clique errado). O excluir mudou para o detalhe, onde o operador vê **quantos documentos vai perder**: a mensagem do `ConfirmDialog` agora diz o número e o efeito ("os assistentes que consultam esta base param de encontrar essas respostas").
- **`QueryModal` ("Testar consulta") virou ABA, não Modal.** Passaria no teste mecânico da regra (não tem `TextArea`), mas é uma bancada iterativa — digita, roda, lê os trechos, refina — e os trechos podem ser longos. Aba de tela de detalhe é o padrão do DS para "entidade com múltiplas dimensões" e dá a altura que os trechos precisam. Nada inventado: `Tabs` já é do catálogo. Também ficou mais claro: "relevância 0.842" em vez de "score", "trecho 1" em vez de "chunk #0", e um `EmptyState` explicando o que fazer quando nada é encontrado.
- Tabela de documentos **sem linha clicável de propósito**: não existe endpoint de leitura de documento individual, então a linha não tem destino (caso 3 da árvore de decisão do `STUDIO_UX_TABLES.md` — não inventar rota que não existe só para cumprir a regra). Registrado no código.

### 3. Três bugs silenciosos que eu vinha propagando desde a v0.9.84

Achados auditando os nomes que eu passava contra o que o DS realmente define. Nenhum deles quebra a tela — todos falham **em silêncio**, que é o que os tornou perigosos:

- **`var(--su-text)` e `var(--su-border)` não existem.** Os nomes reais são `--su-text-primary` e `--su-border-default`. CSS com variável inexistente não dá erro: só não aplica, e o elemento herda a cor do pai. Estavam em **9 lugares** de 6 arquivos (Custos, Memória, Pendências, Habilidades e as telas novas). Todos corrigidos, e agora **toda** var usada nas telas migradas foi conferida contra o `tokens.css`.
- **`icon="refresh-cw"` e `icon="server"` não existem** no `DSIcon` — nome não resolvido cai no fallback `"help"`, ou seja, renderiza um **"?"** na interface. Estavam no botão Sincronizar e no `EmptyState` do MCP (visíveis na v0.9.88 que está no ar). Corrigidos para `refresh` e `settings`.
- **`icon={saving ? 'loader-2' : X}` era um spinner falso.** `loader-2` existe como *alias* → `refresh`, então renderizava um ícone de refresh **estático**. Trocado em 6 call-sites por `loading={saving}` do DS, que é spinner de verdade. O `icon` volta a ser sempre o ícone real da ação.

**Causa comum dos três:** eu escrevia o nome que *parecia* certo (vindo de Tailwind/lucide/outros DS) em vez de conferir no DS. E os três falham calados. Registrado como dívida do DS: avaliar `console.warn` em dev para nome de ícone e/ou var não resolvido.

### 4. Correções de props mortas (arrastadas da v0.9.88)

- `Card` não tem prop `title` — os 2 usos em `AprovacaoDetalhe` viraram `<h2>` real (como prop, ia virar atributo HTML `title`, um tooltip no card inteiro).

### Adicionado

- `pages/IA/BaseConhecimentoDetalhe.jsx`, `pages/IA/BaseConhecimentoEditor.jsx`, `pages/IA/BaseDocumentoEditor.jsx`, `pages/IA/BasesConhecimento.legacy.jsx` (backup).
- 3 rotas em `App.jsx` (`/ia/conhecimento/nova`, `/ia/conhecimento/:id`, `/ia/conhecimento/:id/documentos/novo`) + 3 padrões de breadcrumb no `Layout.jsx`.

### Testar após aplicar

**Conhecimento**
1. Lista: colunas Nome (com descrição embaixo) / Documentos / Modelo de indexação / Atualizado. **Sem lixeira na linha.** Clicar na linha → `/ia/conhecimento/<id>`.
2. Detalhe: card com resumo (documentos, modelo, tamanho do trecho, atualizada em) + 2 abas. Header com **Voltar**, **Excluir base** (vermelho) e **Adicionar documento**.
3. **Excluir base** → ConfirmDialog dizendo o número de documentos que serão perdidos. Cancelar não faz nada; confirmar volta pra lista.
4. Aba **Documentos**: tabela sem linha clicável (correto). Documento com erro mostra a mensagem em vermelho embaixo do status.
5. Aba **Testar consulta**: digitar pergunta + Enter (ou botão) → trechos em cards com "relevância" e "trecho N". Sem resultado → EmptyState explicando. Botão mostra **spinner girando** durante a consulta.
6. **Adicionar documento** → rota nova; subtítulo diz em qual base vai entrar. Trocar "De onde vem o conteúdo" para URL troca o form; para Markdown, o campo fica mono com 18 linhas.
7. **Nova base** → rota nova; segundo card "Ajustes avançados" com os campos técnicos.
8. **F5** em qualquer uma das 3 rotas novas → carrega certo (todas têm `getKnowledgeBase`).

**Regressão das 4 telas anteriores (por causa dos bugs de var/ícone)**
9. Habilidades → MCP: botão **Sincronizar** agora tem ícone de refresh (era **"?"**) e gira durante a sincronização. EmptyState do MCP com ícone de engrenagem (era "?").
10. Qualquer botão de salvar (Custos, Memória, Pendências, Habilidades): durante o salvamento aparece **spinner girando** + rótulo no gerúndio.
11. Nomes em negrito nas tabelas (Habilidades, Memória, Conhecimento, detalhe de Pendência): devem estar na cor de texto principal, com contraste — antes a var não existia e herdavam a cor do pai.

### Restante na família (1 tela)

`v0.9.90 Agentes + 3 editors` — o maior: `AgentEditorModal` tem ~12 `TextArea` (persona, roteiro, passos, situações, prompt, guardrails), `AgentExecuteModal` e `AgentVersionsModal` também são overlays, e é o último lugar do grupo IA com `components/ui/*` local, cores hardcoded (`text-red-500`, `text-emerald-500`) e `var(--ap-*)` legada.

## v0.9.88 - 2026-07-24 (Padronização pós-auditoria — linha clicável + Modal→rota retroativo nas 4 telas migradas)

Sem `db push`. Só frontend. **Nenhuma tela nova** — esta release aplica retroativamente 2 regras do DS nas telas já migradas (Custos, Memória, Pendências, Habilidades), depois de uma auditoria que encontrou violações em todas as 4.

### As 2 regras aplicadas

1. **`STUDIO_UX_TABLES.md` §3 — a linha é o alvo.** "A ação mais comum de todas — abrir o detalhe do registro — costuma ser a própria linha clicável… a linha não precisa de um botão 'abrir' redundante quando ela inteira já é o alvo." Estava sendo violada em todas as tabelas (lápis por linha, ou 2 botões grandes competindo com a linha).
2. **Modal sem `TextArea` (regra registrada na v1.2.11 do DS, endurecida na v1.2.12).** Modal serve pra form curto com campos simples (Input / NumericInput / Select / Checkbox). **Qualquer** `TextArea` — descrição, JSON, motivo, mesmo curto e opcional — vai pra tela dedicada.

### Habilidades (`pages/IA/Ferramentas.jsx`)

- Aba **Catálogo**: lápis por linha removido; a linha inteira agora abre o editor (`/ia/ferramentas/tool/:id/editar`).
- Aba **Servidores MCP**: coluna de ações removida (tinha 2 botões); a linha abre "Habilidades de …", e o **Sincronizar** desceu pro footer desse modal — recarrega a lista de habilidades descobertas no mesmo lugar.

### Memória (`pages/IA/Memoria.jsx`)

- Lápis "Editar perfil" removido da linha (competia com o clique da linha, que já abria as entradas).
- `ProfileModal` (tinha `TextArea` de Descrição) → rotas **`/ia/memoria/perfis/nova`** e **`/ia/memoria/perfis/:id/editar`** (`MemoriaPerfilEditor.jsx`). Carrega por `getMemoryProfile(id)`, então refresh/deep-link funcionam.
- **Master-detail falso promovido a rota real.** As entradas do perfil eram um `useState('selected')` com botão "voltar" fabricado: a URL não mudava, F5 perdia o contexto e o botão voltar do navegador saía da tela em vez de subir um nível. Agora é **`/ia/memoria/:id`** (`MemoriaEntradas.jsx`) — destino do clique na linha, com "Editar perfil" no header.
- Colunas em linguagem do usuário: "TTL (s)" → **Validade** (`nunca expira` quando null), "Máx. itens" mostra `ilimitado` quando null (era `—` nos dois, ambíguo).

### Pendências (`pages/IA/Aprovacoes.jsx`)

- Aba **Fila**: os 2 botões por linha (Aprovar / Rejeitar) saíram. A linha abre **`/ia/aprovacoes/:id`** (`AprovacaoDetalhe.jsx`) — página onde a decisão é tomada **com o contexto da ação na frente**, em `DescriptionList` legível (era só um `JSON.stringify` truncado na linha). Decidir passou de 1 clique cego pra 2 cliques informados: mais coerente com o peso da ação (liberar execução real de um assistente).
- **`RejectModal` absorvido** pelo detalhe: o motivo é um `TextArea` inline na página, não mais overlay.
- Aprovar mantém os 5 patrasques (`ConfirmDialog` + disclaimer + tooltip + loading + gate `can()`).
- `PolicyModal` (tinha `TextArea` de Descrição + de Condição JSON) → rota **`/ia/aprovacoes/politicas/nova`** (`AprovacaoPoliticaEditor.jsx`). Só criação — o backend expõe `POST /ai/approvals/policies` e **não tem PATCH**; por isso a tabela de políticas fica sem linha clicável (não há destino). Registrado no código.
- Esta tela ficou sendo **só listagem** — zero overlay.

### Custos (`pages/IA/Custos.jsx`)

- Lápis removido; a linha do orçamento abre o editor. **`BudgetModal` continua Modal** — só tem `NumericInput` + `Checkbox`, nenhum `TextArea`: respeita a regra.

### Corrigido — 2 props mortas que eu passei na v0.9.87

- **`PageHeader` não tem prop `breadcrumb`.** Eu estava passando em `FerramentaEditor` (v0.9.87, já no ar) — era silenciosamente ignorada. O breadcrumb vive na TopBar do `AppShell`, alimentado pelo mapa do `Layout`. Prop removida dos editores + comentário no código pra não repetir.
- **`Card` não tem prop `title`.** Ia virar atributo HTML `title` (tooltip no card inteiro). Títulos de seção agora são `<h2>` real dentro do Card.

### Alterado — infra

- `Layout.jsx`: o mapa estático de breadcrumbs não cobre rota com `:id`, e os ternários encadeados estavam crescendo a cada release. Trocado por **`BREADCRUMB_PATTERNS`** — lista ordenada de `[regex, label]` + `resolveCrumb(pathname)`. Primeiro padrão que casa ganha; mais específico primeiro. Cobre as 7 rotas dinâmicas atuais.
- `ia.constants.js`: `friendlyTarget()` e `statusToTone()` promovidos de locais do `Aprovacoes.jsx` pra compartilhados (lista + detalhe usam os dois).
- `App.jsx`: 5 rotas novas — 2 de memória (perfil nova/editar) + 1 de entradas + 1 de detalhe de pendência + 1 de nova política. Todas sob `PermissionRoute` com a perm correta (`ai.memory.write`, `ai.memory.read`, `ai.approvals.read`, `ai.approvals.decide`).

### Testar após aplicar

**Habilidades**
1. Catálogo: passar o mouse na linha → linha inteira destacada, **sem lápis**. Clicar em qualquer ponto abre o editor. Habilidade "Da plataforma" abre em modo governança (nome/descrição/schema bloqueados).
2. MCP: linha clicável abre "Habilidades de …". Dentro do modal, botão **Sincronizar** roda e atualiza a lista ali mesmo.

**Memória**
3. Lista: colunas Validade (`nunca expira` quando vazio) e Máx. itens (`ilimitado` quando vazio). **Sem lápis**. Clicar na linha → URL vira `/ia/memoria/<id>`, breadcrumb "IA Studio / Memória / Entradas".
4. Na tela de entradas: **F5** mantém a tela (antes voltava pra lista). Botão **voltar do navegador** sobe pra lista. Filtro por chave de escopo funciona.
5. "Editar perfil" → `/ia/memoria/perfis/<id>/editar`, form com Descrição em TextArea grande, Escopo desabilitado. Salvar volta pras entradas.
6. "Novo perfil" na lista → `/ia/memoria/perfis/nova`. Salvar volta pra lista.

**Pendências**
7. Fila: **sem botões na linha**. Texto de ajuda "Clique numa pendência para ver…". Clicar → `/ia/aprovacoes/<id>`.
8. No detalhe: card "O que o assistente vai fazer" com o contexto em pares chave/valor legíveis (não JSON cru). Card "Sua decisão" com TextArea de motivo + Aprovar e Rejeitar.
9. **Aprovar** → ConfirmDialog, confirmar executa e volta pra fila com toast.
10. **Rejeitar** com motivo preenchido → executa direto (sem ConfirmDialog, é a ação não-destrutiva: nada é alterado) e volta pra fila.
11. **F5** na URL do detalhe → recarrega via `listApprovals + filter`. Pendência já decidida → toast "talvez já tenha sido decidida" + volta pra fila.
12. Usuário **sem** `ai.approvals.decide` → vê o detalhe mas com aviso "não tem permissão para decidir", sem os botões.
13. Políticas: **Nova política** → `/ia/aprovacoes/politicas/nova` (Descrição e Condição JSON em TextArea grandes). Tabela de políticas **não** tem linha clicável (sem edição no backend).

**Custos**
14. Orçamentos: **sem lápis**; clicar na linha abre o modal de edição (que continua Modal, corretamente).

### Restantes na família (2 telas)

`v0.9.89 BasesConhecimento` → `v0.9.90 Agentes + 3 editors` (o maior: ~12 `TextArea` em `AgentEditorModal`).

## v0.9.87 - 2026-07-24 (Migração visual — IA/Ferramentas pro Studio UX + refactor ToolModal→rota; 4/6 da família IA Studio)

Sem `db push`. Só frontend. Quarta tela da família IA Studio migrada, com **primeira aplicação retroativa** da regra de Modal que o DS acabou de registrar (v1.2.11): form com TextArea de descrição/escrita reflexiva vai pra rota, não pra Modal.

### Alterado

- `pages/IA/Ferramentas.jsx` — reescrito com componentes do DS: `PageHeader`, `Tabs`, `Card`, `DataTable`, `EmptyState`, `Badge` (tone), `Modal` (maxWidth), `Field`, `Input`, `Select`, `Checkbox`, `Button` (variant). `useToast` já vinha do sweep.
- **Refactor ToolModal → rota dedicada.** O form de habilidade tem `TextArea` de Descrição + `TextArea` de JSON schema (parâmetros de entrada — escrita reflexiva com formato mono e várias linhas). Segundo a regra que registramos no DS na v1.2.11, esse tipo de conteúdo NÃO cabe em Modal — vai pra tela dedicada com espaço, breadcrumb e URL própria. Botões "Nova habilidade" e "Editar" da CatalogTab agora fazem `navigate('/ia/ferramentas/tool/nova')` e `navigate('/ia/ferramentas/tool/:id/editar', { state: { tool } })`.
- `McpServerModal` **mantido como Modal**: form curto (Nome, Transporte, Endpoint, Checkbox) sem escrita reflexiva — respeita a regra.
- Modal "Habilidades de `<server>`" **mantido**: leitura curta em cards de descoberta, não é form.

### Adicionado

- `pages/IA/FerramentaEditor.jsx` — página nova para criar/editar habilidade. Recebe a tool via `location.state.tool` (navegação da lista); em refresh/deep-link, cai em `listTools + filter` (não há `GET /ai/tools/:id` no backend hoje). Header com breadcrumb "IA Studio / Habilidades / Nova" (ou / Editar) + ações **Cancelar** e **Salvar**. Governança preservada 1:1 (perms `ai.tools.write`, `requires_approval`, `timeout_ms`, `is_active`).
- `pages/IA/Ferramentas.legacy.jsx` — backup literal do arquivo antigo para rollback.
- Duas rotas novas em `App.jsx`:
  - `/ia/ferramentas/tool/nova` (perm `ai.tools.write`)
  - `/ia/ferramentas/tool/:id/editar` (perm `ai.tools.write`)
- Breadcrumbs correspondentes em `Layout.jsx` (pattern matching por regex pra rota com `:id`).

### Testar após aplicar

1. **IA Studio → Habilidades**, aba **Catálogo**: `DataTable` do DS com colunas Nome/Identificador/Categoria/Origem (Da plataforma × Personalizada)/Status/Aprovação. Botão "Nova habilidade" à direita (perm `ai.tools.write`).
2. Clicar em **Nova habilidade** → navega pra `/ia/ferramentas/tool/nova` (URL muda, breadcrumb "IA Studio / Habilidades / Nova"). Header com Cancelar/Salvar. Card com Identificador, Nome, Categoria, Descrição (TextArea), Parâmetros de entrada (TextArea mono), Checkbox de aprovação, Tempo limite. Cancelar volta pra lista; Salvar valida JSON + cria + volta.
3. Clicar em **⋯ Editar** numa linha de habilidade custom → navega pra `/ia/ferramentas/tool/:id/editar` (URL com id, breadcrumb "IA Studio / Habilidades / Editar"). Form pré-preenchido. Identificador desabilitado.
4. Clicar em **⋯ Ajustes de governança** numa habilidade da plataforma (linha com badge "Da plataforma") → mesma rota, mas só os campos de governança editáveis (nome/descrição/schema bloqueados). Badge "Habilidade da plataforma" no topo do card.
5. **F5 direto na URL de editar** → carrega via `listTools + filter` (loading, depois form). Tool inexistente → toast "Habilidade não encontrada" + volta pra lista.
6. Aba **Servidores MCP**: `DataTable` com colunas Nome/Transporte/Endpoint/Status/Última sincronização. Botão "Novo servidor" abre `Modal` do DS (curto, respeita a regra) com Nome/Transporte/Endpoint/Checkbox. Botão ⋯ da linha tem "Ver habilidades" (abre Modal de leitura com cards) e "Sincronizar" (spinner enquanto rola).

### Restantes na família (2 telas)

`v0.9.88 BasesConhecimento` → `v0.9.89 Agentes + 3 editors`.

## v0.9.86 - 2026-07-24 (Migração visual — IA/Aprovacoes pro Studio UX; 3/6 da família IA Studio)

Sem `db push`. Só frontend. Terceira tela da família IA Studio migrada.

### Alterado

- `pages/IA/Aprovacoes.jsx` — reescrito com componentes do DS: `PageHeader`, `Tabs`, `Card`, `DataTable`, `EmptyState`, `Badge` (tone), `Modal` (maxWidth), `ConfirmDialog`, `Field`, `Input`, `Select`, `TextArea`, `Button` (variant), `Checkbox`. `useToast` já vinha do sweep.
- **Fix registrado na dívida técnica do IA Studio**: os 2 botões inline com Tailwind hardcoded (`bg-emerald-600` no "Aprovar" e `bg-red-600` no "Rejeitar" nas linhas 111-124 do legado + `bg-red-600` no footer do `RejectModal` linha 196) — que fugiam do sistema de `.su-btn` — foram substituídos por `<Button variant="primary">` (Aprovar, ação primária positiva) e `<Button variant="danger">` (Rejeitar, ação destrutiva). Alinhado ao padrão do DS.
- Botões na linha do DataTable renderizados via `renderRowMenu` do DS (o "…" contextual). "Aprovar" e "Rejeitar" com `title` (tooltip) preservado do legado.
- `PolicyModal`: `Textarea` com estilo mono para JSON via `style` inline (o DS não tem prop `variant="mono"` no TextArea — se surgir necessidade recorrente, sub-frente própria pra evoluir DS). `<input type="checkbox">` inline substituído por `<Checkbox>` do DS.
- Helper `statusToTone` mapeia variantes do legado (`green`/`red`/`yellow`/`blue`/`purple`/`gray`) pros tones do DS (`success`/`danger`/`warning`/`info`/`info`/`neutral`) sem alterar `APPROVAL_STATUS` (fonte compartilhada em `ia.constants`).
- Comportamento e API preservados 1:1: mesmos endpoints, mesmos payloads, mesmo fluxo de 5 patrasques (ConfirmDialog para aprovar; Modal com motivo para rejeitar), mesmas permissões (`ai.approvals.decide`).

### Adicionado

- `pages/IA/Aprovacoes.legacy.jsx` — backup literal para rollback.

### Modais siblings — nota

`Aprovacoes` está na lista das 9 páginas com modais siblings (ConfirmDialog approve + RejectModal + PolicyModal, 3 states independentes). Como todos os 3 são excludentes na prática (só um se abre por vez) e não empilham, migrei tal como estão — dívida técnica de refactor arquitetural (rotas dedicadas ou máquina de estado explícita) segue registrada em `docs/adocao-studio-ux.md` como sub-frente futura.

### Testar após aplicar

1. **IA Studio → Pendências**, aba **Fila**: se vazio, `EmptyState` "Nada pendente". Se com dados, `DataTable` com colunas Alvo/Status/Solicitada + botões Aprovar (primário roxo) / Rejeitar (vermelho) por linha.
2. Clicar em **Aprovar** → abre `ConfirmDialog` com título "Aprovar ação" + mensagem explicativa + botão vermelho "Aprovar e executar". Confirmar chama backend, toast, recarrega.
3. Clicar em **Rejeitar** → abre `Modal` com mensagem explicativa + `TextArea` de motivo opcional + botão vermelho "Rejeitar". Confirmar chama backend, toast, recarrega.
4. Aba **Políticas**: header com botão "Nova política" à direita; `DataTable` com colunas Nome/Alvo/Condição/Status; ou `EmptyState` se vazio.
5. **Nova política** → Modal com Nome/Descrição/Alvo/Condição JSON (TextArea mono) + Checkbox "Ativar imediatamente". Validar JSON errado → toast "Condição: JSON inválido.". Salvar → toast + recarrega.

### Restantes na família (3 telas)

`v0.9.87 Ferramentas` → `v0.9.88 BasesConhecimento` → `v0.9.89 Agentes + 3 editors`.

## v0.9.85 - 2026-07-24 (Bump DS ^1.2.10 + Custos.fullWidth + Memoria migrada; 2/6 da família IA Studio)

Sem `db push`. Só frontend. Release combinado com 3 mudanças acopladas:

### 1. Bump `@studio-ux-ds/*` para `^1.2.10`

- `platform-admin/package.json` — 3 deps do DS de `^1.2.9` para `^1.2.10`. A v1.2.10 do Studio UX (2026-07-24) adicionou a prop `fullWidth` no `NumericInput`, que esta release aproveita.

### 2. Custos.jsx — `fullWidth` nos 5 NumericInputs (fix visual v0.9.84)

- `pages/IA/Custos.jsx` — os 5 `<NumericInput>` (2 em `BudgetModal`, 3 em `SimulatorTab`) passaram a receber `fullWidth`. Elimina o espaço vazio à direita reportado na aplicação de v0.9.84 (o `NumericInput` default é `inline-flex` com input de 72px fixo; nas células de `grid-cols-2`/`grid-cols-3` sobrava vazio à direita).

### 3. Migração visual — Memoria (2ª tela da família IA Studio)

- `pages/IA/Memoria.jsx` — reescrito com componentes do DS: `PageHeader` (com `actions={newProfileBtn}`), `Card`, `DataTable` (colunas declarativas + `onRowClick`+`getRowLabel` + `renderRowMenu` para editar), `EmptyState` (icon string DSIcon), `Badge` (tone `info`), `Modal` (usa `maxWidth={520}`, sem `size` nem `dismissable`), `Field`+`Input`+`Select`+`NumericInput`+`TextArea`+`Button`. `useToast` já vinha do sweep.
  - **Comportamento preservado 1:1** — mesmos endpoints, mesmo master-detail via state `selected` (a migração pra rota `?open=<id>` é sub-frente arquitetural futura, registrada em `docs/adocao-studio-ux.md`), mesmo filtro de `scope_key` na EntriesView, mesma semântica de campos opcionais (TTL/max_items vazio = `null`).
  - **Ajuste técnico do NumericInput**: o legado usava prop `allowEmpty` do `NumberInput` local (que aceitava `null`). O `NumericInput` do DS não tem essa prop, mas aceita string vazia (`""`) como valor intermediário no `value`/`onChange`. Adaptação: `form.default_ttl_seconds` e `form.max_items` inicializam com `''` em vez de `null`; helper `toNullable(v)` converte `""` para `null` antes de mandar pro backend. Semântica exposta ao usuário (vazio = sem limite) preservada.
  - **`fullWidth`** nos 2 NumericInputs do modal desde já — sem regressão desde o começo.
- `pages/IA/Memoria.legacy.jsx` — backup literal para rollback (trocar 1 import em `App.jsx`).

### Testar após aplicar

1. **IA Studio → Custos**, aba **Orçamentos** e **Simulador**: os NumericInputs agora ocupam toda a largura da célula da grid (input + botões +/− esticados). Sem espaço vazio à direita.
2. **IA Studio → Memória** (lista): `PageHeader` com botão "Novo perfil" à direita. Se vazio: `EmptyState` dentro de `Card`. Se com dados: `DataTable` do DS (clique numa linha abre entries; botão "..." de editar por linha).
3. **Memória → clicar em um perfil**: master-detail abre com botão voltar + PageHeader + filtro de scope_key + botão "Filtrar". Se sem entradas: EmptyState. Se com entradas: DataTable com 5 colunas.
4. **Memória → Novo perfil**: modal com Nome + Escopo (Select, desabilitado em edit) + Descrição (TextArea) + TTL + Máx.itens (ambos NumericInput com `fullWidth`, vazios significam null).

### Restantes na família (4 telas)

`v0.9.86 Aprovacoes` → `v0.9.87 Ferramentas` → `v0.9.88 BasesConhecimento` → `v0.9.89 Agentes + 3 editors`.

## v0.9.84 - 2026-07-24 (Migração visual — IA/Custos pro Studio UX; 1/6 da família IA Studio)

Sem `db push`. Só frontend. Primeira tela migrada visualmente na nova frente (família IA Studio). Escopo: `pages/IA/Custos.jsx` — casca `<h1>`+subtitle+Tabs+StatCards+Tabelas+Modal reescrita usando componentes do `@studio-ux-ds/react`.

### Alterado

- `pages/IA/Custos.jsx` — reescrito com:
  - `PageHeader` (título + subtitle) em vez de `<h1>` + `<p>` do legado.
  - `Tabs` do DS (`value`/`onChange` em vez de `active`; removidos os `Icon` das tabs — o DS aceita `icon` como string DSIcon mas removi por sobriedade nesta tela).
  - `StatCard` do DS com `tone` (`success`, `info`, `neutral`) substituindo as 4 chamadas do legado com `icon={Users}` + `color="brand/blue/green/purple"`. Removida a prop `icon` — o `StatCard` do DS coloca o ícone à direita do label, decisão foi manter mais sóbrio sem ícone (padrão Dashboard v0.9.80).
  - `DataTable` do DS substituindo `Table/Thead/Th/Tbody/Tr/Td` — colunas declaradas via `columns=[{key, header, align?, render?}]`. Botão "Editar" da tabela de orçamentos virou `renderRowMenu` (o "…" contextual do DS).
  - `Card` do DS envolvendo o `EmptyState` (quando não há dados) e o form do Simulador.
  - `EmptyState` do DS (`icon` como string DSIcon: `chart-bar`, `file`).
  - `Badge` do DS com `tone` (`info`, `success`, `danger`, `neutral`) substituindo `variant="blue|green|red|gray"` do legado.
  - `Modal` do DS (usa `maxWidth={520}` — não `size="md"` como o legado). Sem `dismissable`.
  - `Field` + `Input` + `Select` + `NumericInput` do DS substituindo `FormField/TextInput/Select/NumberInput` locais. `NumericInput` do DS recebe number direto no `onChange` (não `event.target.value`).
  - `Button` do DS com `variant="primary|secondary|ghost"`, `icon` string. Substituiu `<button className="btn-primary/secondary/ghost">` do legado.
  - `Checkbox` do DS substituindo os `<label><input type="checkbox">` inline do legado.
  - `useToast` do DS já estava (do sweep anterior).
- Comportamento e API preservados: mesmos handlers, mesmos endpoints, mesmos corpos de request (create vs update com whitelist do backend). Único ganho funcional: `DataTable` cuida do responsivo (cards mobile) sem código duplicado.

### Adicionado

- `pages/IA/Custos.legacy.jsx` — backup literal do arquivo anterior. Não é importado enquanto o novo estiver ativo. Rollback: trocar `import Custos from './pages/IA/Custos'` por `Custos.legacy` em `App.jsx`.

### Testar após aplicar

1. Aba **Consumo**: filtro de mês (`Input type="month"`); 3 `StatCard` mostrando total/tokens/assistentes; tabela quando há dados ou EmptyState "Sem consumo no período".
2. Aba **Orçamentos**: botão "Novo orçamento" abre modal; DataTable com botão "…" de editar por linha; EmptyState quando vazio; criar/editar salva e recarrega.
3. Aba **Simulador**: form com 5 campos, botão "Simular custo", ao clicar chama backend e mostra 2 StatCards com resultado.

### Restantes na família (5 telas)

`v0.9.85 Memoria` → `v0.9.86 Aprovacoes` → `v0.9.87 Ferramentas` → `v0.9.88 BasesConhecimento` → `v0.9.89 Agentes + 3 editors`.

## v0.9.83 - 2026-07-24 (Fix workspace picker — Portal + position fixed)

Sem `db push`. Só `platform-admin/src/components/Layout/Layout.jsx`. Nasce depois que Robson viu no painel v0.9.82 que o botão "Selecionar workspace" no topbar (com title tooltip funcionando) **não abria o dropdown quando clicado**.

Causa raiz: o `AppShell` do `@studio-ux-ds/react` tem `overflow: hidden` nos ancestrais (`.su-appshell` e `.su-appshell__main`, conforme `components.css`). O dropdown do picker era renderizado como `<div className="absolute ...">` dentro do `topbarContext` — o `overflow: hidden` dos pais recortava-o e ele nunca aparecia. O botão funcionava (`onClick` disparava, `setWsOpen(true)` mudava estado), mas o DOM do menu ficava invisível.

### Alterado

- `Layout.jsx` — 4 mudanças acopladas:
  - Novo import: `import { createPortal } from 'react-dom';` + `useRef`.
  - `wsButtonRef` (ref no botão do picker) + `wsMenuPos` (state com `{top, left}` calculados via `getBoundingClientRect` do botão no momento do toggle).
  - `toggleWsMenu()` — handler que calcula posição fixa antes de abrir; fecha se já aberto.
  - Menu extraído do `topbarContext` e renderizado via `createPortal(..., document.body)` como `position: fixed`. Ignora todos os `overflow: hidden` dos ancestrais.
  - `useEffect` de "clicar fora" reescrito: como o menu vive num portal fora do container do botão, o teste passou a verificar `btnRef.contains(target) || menu.contains(target)`. Também adiciona listeners de `scroll` (capturado) e `resize` que fecham o menu — a posição `fixed` calculada perde sinc se a janela mexer.
  - `return` do componente virou Fragment (`<>`) para renderizar `{workspaceMenu}` ao lado do `<AppShell>`.

### Impacto

Zero regressão de comportamento — apenas o dropdown agora aparece. Menu do usuário (Minha conta / Trocar senha / Sair / Personalizar / Claro/Escuro) continua funcionando porque é gerenciado internamente pelo AppShell (que já usa o padrão correto). Se aparecerem outros dropdowns/menus do IA Studio dentro do AppShell sofrendo o mesmo corte (ex.: hoje o `NotificationsBell` NÃO está mais no shell — o AppShell tem seu próprio sino), a solução é a mesma: Portal + fixed calculado.

### Como aplicar

Sequência normal (o upgrade.sh v0.9.82 já está no disco fazendo `source .env`; nenhuma alteração adicional no servidor):

1. Commit + tag + push v0.9.83.
2. **Configurações → Atualização → Atualizar na v0.9.83.** Vai passar direto (só toca 1 arquivo do frontend; nem `.env` nem package.json nem schema mudaram).
3. Hard reload no navegador (Ctrl+Shift+R).
4. Clicar no botão "Principal — Produção" no topbar. O dropdown deve aparecer logo abaixo com a lista de workspaces + badges de ambiente.

## v0.9.82 - 2026-07-24 (Fix build — bump @studio-ux-ds/* de ^1.0.15 para ^1.2.9)

Sem `db push`. Só `platform-admin/package.json`. Nasce depois que a aplicação de **v0.9.81** falhou em `ADMIN_BUILD` com:

```
src/context/ThemeContext.jsx (2:9): "isDark" is not exported by
"node_modules/@studio-ux-ds/react/index.js"
```

Causa: a v0.9.80 do IA Studio (adoção do Studio UX) usou `isDark`/`setTheme` do `@studio-ux-ds/react` no `ThemeContext.jsx` — mas esses símbolos só passaram a ser exportados pelo barrel `index.js` em versão posterior a 1.0.15. O `package.json` estava pinado em `^1.0.15` desde a fase 1 do piloto (v0.9.79); o `npm install` do upgrade continuava resolvendo 1.0.15, que não tinha `isDark`/`setTheme`. Erro meu (Claude) por não ter conferido a versão instalada antes de importar.

### Alterado

- `platform-admin/package.json` — bump das 3 deps do DS de `^1.0.15` para `^1.2.9`:
  - `@studio-ux-ds/tokens`, `@studio-ux-ds/components`, `@studio-ux-ds/react` sobem em lockstep.
- Impacto: com o `^1.2.9` (que permite qualquer 1.x.y), o `npm install` resolve para a versão mais recente compatível — que exporta `isDark`, `setTheme`, `AppShell`, `PageHeader`, `Customize`, `ToastProvider`, `useToast` e tudo o mais que a fase 2 depende.

### Como aplicar no servidor

Este commit também precisa do `upgrade.sh` v0.9.81+ (que faz `source .env`) já no disco. Se ainda não trouxe:

```bash
cd /opt/iastudio
git fetch --tags origin
# Trazer upgrade.sh v0.9.82 + package.json v0.9.82 pro disco (sem mexer no HEAD):
git checkout v0.9.82 -- scripts/upgrade.sh platform-admin/package.json

# Forçar reinstall do platform-admin (o package-lock antigo travava em 1.0.15):
rm -rf /opt/iastudio/platform-admin/node_modules /opt/iastudio/platform-admin/package-lock.json

# Aplicar v0.9.82 no painel: Configurações > Atualização > Atualizar
```

O upgrade.sh vai fazer `npm install` limpo (agora resolvendo 1.2.9), depois `vite build` — dessa vez o build **vai gerar dist novo** com `AppShell`, `PageHeader`, `StatCard` etc. do DS. Data do `/opt/iastudio/platform-admin/dist/assets/*.js` vai passar a ser 24/jul.

### Nota sobre v0.9.81

O painel mostra "v0.9.81" e "Instância atualizada" — é bug de UI do painel. A tabela `system_upgrades` confirma: `v0.9.81 status=FAILED error_step=ADMIN_BUILD`. Nenhum dist novo foi gerado. O que roda em produção é ainda o dist da v0.9.79 (19/jul). v0.9.82 é a primeira aplicação que realmente vai substituir o dist.

## v0.9.81 - 2026-07-24 (Fix deploy — upgrade.sh carrega .env antes do npm install; install.sh pergunta NODE_AUTH_TOKEN)

Sem `db push`. Só scripts + docs. Nasce depois que a aplicação de **v0.9.80** falhou em `ADMIN_BUILD` no painel com **npm E401** — o `.npmrc` versionado referencia `${NODE_AUTH_TOKEN}`, mas o `upgrade.sh` é spawnado detached pelo backend PM2 e não herdava `.bashrc` do root nem tinha a var no ambiente. Correção estrutural: **fonte única de segredos = `.env` do platform-api**, o `upgrade.sh` faz `source .env` antes de qualquer build, e o `install.sh` pergunta o token durante instalação (ou aceita `--npm-token=...` em modo headless).

### Alterado

- `scripts/upgrade.sh` — 4 linhas novas após a leitura de `DATABASE_URL`: `set -a; source "$ENV_FILE"; set +a`. Exporta o `.env` inteiro pro ambiente do bash — qualquer var (NODE_AUTH_TOKEN, GOOGLE_*, futuras) fica visível para os npm install/prisma/builds das fases seguintes sem depender de herança do PM2.
- `scripts/install.sh` — 4 mudanças acopladas:
  - Nova variável `NODE_AUTH_TOKEN=""` no bloco inicial de defaults.
  - Novo arg CLI `--npm-token=...` (modo headless).
  - Novo prompt no wizard interativo (após o admin, antes da opção de Demo) — pode ser vazio; usuário adiciona depois no `.env`.
  - Nova linha no heredoc que gera `${API_DIR}/.env`: `NODE_AUTH_TOKEN=${NODE_AUTH_TOKEN}`.
- `docs/adocao-studio-ux.md` — reescrita a seção "Pré-requisito operacional — autenticar no GitHub Packages": fonte única = `.env` do platform-api (não `.bashrc`, não `ecosystem.config.js`). Comando para adicionar em servidor existente + como reiniciar PM2 corretamente.
- `docs/deploy-e-versionamento.md` — nova seção "Segredos e credenciais de build — fonte única no `.env`" documenta a garantia dada pelo `source .env` do upgrade.sh + armadilha de untracked file vs. tag (a que causou a falha do `GIT_CHECKOUT` da v0.9.80).

### Como aplicar no servidor existente (pré-requisitos operacionais)

1. Se ainda tem o `.npmrc.pre-v0.9.80` como fallback: apagar (não faz mais sentido) — `rm /opt/iastudio/platform-admin/.npmrc.pre-v0.9.80`.
2. Adicionar o token no `.env`: `echo "NODE_AUTH_TOKEN=ghp_SEU_TOKEN" >> /opt/iastudio/platform-api/.env`.
3. Reiniciar PM2 relendo o `.env` (o `pm2 restart --update-env` não relê arquivo): `cd /opt/iastudio/platform-api && pm2 delete iastudio-api iastudio-worker && pm2 start ecosystem.config.js && pm2 save`.
4. Aplicar v0.9.81 no painel: **Configurações → Atualização → Atualizar na v0.9.81**. O upgrade que roda ainda é o `upgrade.sh` v0.9.79 do disco atual, mas com `NODE_AUTH_TOKEN` no env herdado do backend PM2 (que agora relê o `.env`), o `npm install` do platform-admin passa. Depois de v0.9.81 aplicada, o `upgrade.sh` novo (com `source .env`) fica versionado para todas as versões futuras — independente de PM2/ecosystem.

Nota: aplicar v0.9.80 diretamente também funciona com o mesmo pré-requisito (env no PM2), mas v0.9.81 já traz a correção estrutural — recomendado aplicar v0.9.81 direto (o painel lista as duas tags; pode pular v0.9.80).

## v0.9.80 - 2026-07-24 (Adoção do Studio UX no platform-admin — casca AppShell + Dashboard + rota /conta/senha + sweep de Toast)

Sem `db push`. Só frontend (`platform-admin`). Primeira aplicação prática da `ia-studio.studio-ux-adoption@1.0.0` (task criada em 2026-07-23). Casca do painel migrada para o `AppShell` do `@studio-ux-ds/react`, Dashboard (primeira tela após login) reescrito com `PageHeader` + `StatCard` + `Card` do DS, rota nova `/conta/senha` substituindo o modal cross-tree do Header, e **sweep total de 55 arquivos** migrando do bus de toast local (`lib/toast`) para o `useToast()` do DS. Piloto isolado v0.9.79 (`/studio-ux-demo`) preservado. Coexistência intencional das demais telas (Automação, WhatsApp, ISP, IA, Integrações, Configurações etc.) com o padrão `--ap-*` + Tailwind dentro da nova casca.

### Alterado (infra/casca)

- `platform-admin/src/main.jsx` — importa `configureTheme`/`applyTheme`/`ToastProvider` do DS. `configureTheme({ namespace: 'ia-studio' })` + `applyTheme()` chamados **antes** do 1º render (evita flash). `<ToastProvider>` envolve o app.
- `platform-admin/src/context/ThemeContext.jsx` — reescrito como wrapper fino do mecanismo de tema do DS. Fonte única = DS; API pública (`useTheme` → `{ theme, toggle, isDark }`) preservada. Espelha `.dark` no `<html>` para compatibilidade com telas Tailwind. `MutationObserver` sincroniza tudo quando o AppShell/Customize trocam o tema.
- `platform-admin/src/components/Layout/Layout.jsx` — reescrito com `AppShell`. Slots: brand, nav (grupos com filtro por permissão), version, breadcrumb, topbarContext (seletor de workspace + badge de ambiente), user, userMenuItems (Minha conta + Trocar senha), `onNotifications` (redireciona para `/automacao/notificacoes`), `notifications` (polling 30s via `useNotificationsUnread`), `customize=true` (painel embutido), `onLogout`.
- `platform-admin/src/pages/Dashboard.jsx` — reescrito com `PageHeader` + 4 `StatCard` (tones info/success/neutral) + `Card` do DS. Dados/lógica idênticos.
- `platform-admin/src/App.jsx` — nova rota `/conta/senha`, remoção do `<UIToastContainer />` (substituído pelo `<ToastProvider>` do DS no `main.jsx`).

### Adicionado

- `platform-admin/src/pages/ContaSenha.jsx` — rota `/conta/senha`. Substitui o modal de troca de senha que vivia no `Header` legado (elimina empilhamento cross-tree — o modal ficava fora do `<Outlet/>`). Usa `PageHeader` + `Card` + `Field` + `Input` + `Button` do DS.
- Backups para rollback rápido: `Layout.legacy.jsx`, `Sidebar.legacy.jsx`, `Header.legacy.jsx`, `Dashboard.legacy.jsx` (troca o import em `App.jsx` para reverter).

### Sweep de Toast (55 arquivos)

Cada `import { toast } from '<caminho>/lib/toast'` foi substituído por `import { useToast } from '@studio-ux-ds/react'` + `const toast = useToast()` como primeira linha do componente. Subcomponentes no mesmo arquivo que chamam `toast.*` receberam cada um seu próprio `useToast()`. Nenhuma chamada `toast.error/success/warn/info` teve texto ou semântica alterados. Distribuição:

- `pages/`: `Dashboard.jsx`, `Dashboard.legacy.jsx`, `ContaSenha.jsx`, `Login.jsx`, `AcceptInvite.jsx`, `MinhaConta.jsx`, `Auditoria.jsx`, `Usuarios.jsx`, `PerfisAcesso.jsx`, `Workspaces.jsx`
- `pages/Automacao/`: `Fluxos.jsx`, `FluxoEditor.jsx`, `FluxoCanvas.jsx`, `Agendamentos.jsx`, `Execucoes.jsx`, `TemplatesAutomacao.jsx`, `Eventos.jsx`, `Notificacoes.jsx`, `editor/VersionsModal.jsx`, `editor/NodeConfigModal.jsx`, `editor/ExecuteModal.jsx`, `editor/TriggerEditor.jsx`
- `pages/WhatsApp/`: `Conversas.jsx`, `Templates.jsx`, `EquipesFilas.jsx`, `Numeros.jsx`, `AtendimentoIA.jsx`, `MessageComposer.jsx`, `ChatWindow.jsx`, `TimelineModal.jsx`, `TransferModal.jsx`
- `pages/ISP/`: `Incidentes.jsx`, `AberturaChamado.jsx`
- `pages/IA/`: `Agentes.jsx`, `BasesConhecimento.jsx`, `Memoria.jsx`, `Ferramentas.jsx`, `Aprovacoes.jsx`, `Custos.jsx`, `editor/AgentEditorModal.jsx`, `editor/AgentVersionsModal.jsx`, `editor/AgentExecuteModal.jsx`
- `pages/Integracoes/`: `Marketplace.jsx`, `Conexoes.jsx`, `Segredos.jsx`, `ConnectionWizard.jsx`, `ConnectionFields.jsx`, `GoogleOAuthButton.jsx`
- `pages/Recursos/`: `Mapeamentos.jsx`, `Explorer.jsx`
- `pages/Desenvolvedor/`: `Console.jsx`, `ApiKeys.jsx`
- `components/Layout/`: `Header.legacy.jsx`, `NotificationsBell.jsx`

Total: 55.

### Refactor pontual (1 arquivo)

- `pages/Integracoes/ConnectionFields.jsx` — a função exportada `copyToClipboard(text)` chamava `toast.success/error` fora de contexto de componente (impossível com hook). Refatorada para retornar `Promise<boolean>` sem toast interno; os 2 callsites (`WebhookUrlBox`, `ConnectionField`) chamam `useToast()` e exibem o toast eles mesmos após o `await`. Sem mudança de UX.

### Removido do runtime

- `<UIToastContainer />` do `App.jsx` (import + JSX).
- `lib/toast.js` esvaziado (comentário-marcador). Nenhum arquivo importa mais.
- `components/ui/UIToastContainer.jsx` esvaziado. Nenhum arquivo importa mais.
- `components/Layout/Header.jsx` — órfão desde a substituição da casca (o `Layout` novo não o importa; apenas `Header.legacy.jsx` é importado via `Layout.legacy.jsx`).

### Governança

- Sweep de Toast executado como **exceção deliberada** à `workflow.consuming-system-adoption@1.0.0` — registrada no ADR `docs/adocao-studio-ux.md` §5. Custo real (56 arquivos, 399 chamadas) confirmado com o dono antes da execução; alternativa (bridge module-level de 3 arquivos, risco zero) foi apresentada e rejeitada em favor do sweep.
- 9 páginas com múltiplos `<Modal>` siblings + states independentes ficam registradas como dívida técnica antes de qualquer migração visual dessas telas: `WhatsApp/EquipesFilas`, `Automacao/FluxoCanvas`, `Automacao/FluxoEditor`, `Integracoes/Conexoes`, `IA/Ferramentas`, `IA/BasesConhecimento`, `Automacao/Fluxos`, `IA/Aprovacoes`, `ISP/Incidentes` (este último se defende manualmente).

### Pendências operacionais

- **`.npmrc`** no `platform-admin/` — a sandbox de execução recusou o `Write`. Robson precisa criar manualmente antes do próximo `npm install` limpo. Conteúdo (referenciando `NODE_AUTH_TOKEN` do ambiente): ver `docs/adocao-studio-ux.md`.
- **Arquivos mortos a remover do disco** quando a casca+Dashboard novos estiverem validados: `Header.jsx`, `NotificationsBell.jsx`, `Sidebar.legacy.jsx`, `Header.legacy.jsx`, `Layout.legacy.jsx`, `Dashboard.legacy.jsx`, `lib/toast.js`, `components/ui/UIToastContainer.jsx`. Sub-frente própria — pode ser um `rm` só.
- **Multi-tenant branding** (accent/tema por organização via Customize) — quando o backend expuser preferências por org.

### Piloto preservado

- `/studio-ux-demo` (v0.9.79) — renderiza dentro do AppShell novo sem alteração.

## docs - 2026-07-23 (Novo catálogo local + `ia-studio.studio-ux-adoption@1.0.0`)

Sem `db push`. Só documentação (`docs/prompt-framework/`). O projeto ganha **catálogo local próprio** — `ia-studio.specialty-catalog@1.0.0` (`kind: shared`) — até agora inexistente (só o stub `README.md` apontava pro STUDIO-WORKFLOW). Nasce já com a primeira task: `ia-studio.studio-ux-adoption@1.0.0` (`kind: task`, `extends: workflow.consuming-system-adoption@1.0.0` do STUDIO-WORKFLOW v3.1.0). A task governa a adoção do Studio UX no `platform-admin` **contextualizando o piloto v0.9.79** (rota `/studio-ux-demo` + `docs/adocao-studio-ux.md`) — não é adoção do zero, é expansão controlada por famílias de tela, respeitando as regras do próprio DS e o contexto multi-tenant.

Criação executada pela primeira aplicação real da `workflow.specialty-creation@1.0.0` (task nova do STUDIO-WORKFLOW v3.1.0 que fecha o loop deixado aberto pelo alinhador). Nenhuma linha de código no `platform-admin` foi tocada — a task é o método; a execução em qualquer tela precisa de novo alinhamento.

- Sem release taggeada. Puramente documental.

## docs - 2026-07-23 (Adota STUDIO-WORKFLOW v3.0.0)

Sem `db push`. Só documentação. O `COMO-INTERAGIR-COM-ROBSON.md` (raiz) virou stub apontando pro SSOT agnóstico em `C:\Users\Flowspec\Documents\STUDIO-WORKFLOW\`; criado `docs/prompt-framework/README.md` como stub explicando o consumo do método (paradigma `prompt-framework/v1`, v3.0.0). O projeto ainda não tem catálogo local — quando fizer sentido, cria como `ia-studio.*` no schema formal.

**Não confundir com o piloto de adoção visual do Studio UX (v0.9.79):** aquele é sobre consumir o **design system** (`@studio-ux-ds/*`); este é sobre consumir o **método de intake** (`STUDIO-WORKFLOW`). Dois trilhos distintos.

## v0.9.79 - 2026-07-19 (Piloto de adoção do Studio UX — rota isolada /studio-ux-demo)
Sem `db push`. Só frontend (`platform-admin`). Consome os pacotes publicados `@studio-ux-ds/{tokens,components,react}` (GitHub Packages, org `studio-ux-ds`) numa rota isolada `/studio-ux-demo` — nenhuma tela existente foi tocada. Os CSS do Studio UX (`--su-*`/`.su*`) coexistem com os `--ap-*` sem colisão; o tema segue o toggle do painel. **Pré-requisito de build:** o servidor precisa de `platform-admin/.npmrc` com token `read:packages` (ver `docs/adocao-studio-ux.md`) — sem ele o `npm install` dos pacotes privados falha. Novos arquivos: `src/pages/StudioUxDemo.jsx`, `docs/adocao-studio-ux.md`; ajustes em `App.jsx` (rota), `main.jsx` (imports CSS), `package.json` (deps).

## v0.9.78 - 2026-07-19 (Frente 6: alerta de incidente à equipe + padrão de telefone + fundação do catálogo HSM)

> Destrava a Frente 6, que estava escrita mas nunca commitada desde a era v0.9.74 (as tags v0.9.75/v0.9.76/v0.9.77 foram empurradas no commit errado — apontam pro `c7afd43`, queimadas; seguimos em v0.9.78).

⚠️ **`db push` (destrutivo, mas só adição)** — colunas novas (`core_users.whatsapp_phone`, `comm_attendance_members.receive_incident_alerts`, `isp_incidents.scope_hash`/`last_team_alert_at`, `comm_whatsapp_templates.is_system_template`/`event`/`buttons_json`/`variable_map_json`) + tabela `isp_incident_team_alerts`. Backend + frontend + `CONTENT_VERSION` v30.

- **Alerta de incidente à equipe (frente 6).** Quando a IA identifica, na conversa, uma anomalia de rede na região de um cliente **sem incidente cadastrado**, o **sistema** (não o modelo) registra um rascunho de incidente por escopo e **aciona a equipe de plantão por WhatsApp**. O assistente só diz "identifiquei uma instabilidade na sua região, a equipe já foi acionada", não abre chamado e não vaza %/OLT/CTO.
  - **`status_regiao` virou determinístico e higienizado:** devolve uma `situacao` (`normal` / `anomalia_regiao` / `incidente_ativo`) + orientação — o **limiar vem da config**, não do modelo; não devolve mais percentual cru. Quando é anomalia, o sistema já aciona a equipe.
  - **Destinatário = usuário→equipe→opt-in:** os alvos são os membros da **equipe de plantão configurada** (`isp.equipe.incidente`) com **telefone cadastrado** e o **opt-in "recebe alerta de incidente" ligado** no vínculo com a equipe. Resolvido no banco (determinístico); envio via `whatsapp-smart-send` (template HSM fora da janela, 1:1, nunca grupo — limite da Meta). Sem equipe/elegível/template → degradação graciosa (alerta in-app).
  - **Cron de outage** passou a reusar o mesmo alerta à equipe (além do in-app), com a mesma dedup/cooldown e as duas travas OFF.
  - Config nova na tela **ISP → Abertura de chamado**: card "Equipe de plantão" (equipe + limiar % + template + cooldown). Campos novos: telefone no cadastro de Usuários e toggle "recebe alerta" por membro em WhatsApp → Equipes e Filas. Log por destinatário em `isp_incident_team_alerts`; auditoria `isp.incident.auto_detected`/`team_alerted`.
- **Padrão de telefone (porte do delivery-system).** Novo `components/ui/PhoneInput` (seletor de país + busca, guarda E.164 sem `+`), agora **obrigatório** para todo campo de telefone (CLAUDE.md). Backend ganhou `normalizePhoneFromUser`/`normalizePhoneFromWhatsApp`/`isValidPhone`/`phoneVariants` — o `normalizePhone` ingênuo (que corrompia número estrangeiro de 11 dígitos) foi trocado pela heurística madura; inbound do WhatsApp passou a usar `normalizePhoneFromWhatsApp`.
- **Fundação do catálogo de templates HSM (Fase A, inerte).** Porte do padrão do Aquapark (adaptado ao multi-tenant): `WhatsappTemplate` ganhou `is_system_template`/`event`/`buttons_json`/`variable_map_json`; `comm/whatsapp/template-catalog/` com `catalog.seed.ts` (só o template do **alerta de incidente**) e `template-actions.ts` (`resolveButtonUrl` ação→link + `system.public_url`). Ainda **não fiado** (sem mapper/service/boot-seeder) — arquivos puros, não referenciados, sem efeito em runtime. A fiação (seed por org + publish na Meta) é a próxima frente.
- **Regras novas no CLAUDE.md.** (1) **Templates HSM**: o sistema tem que ter um catálogo nativo de padrões prontos-pra-publicar, com botões/links de acesso via `action`→`resolveButtonUrl`; todo novo emissor fora da janela de 24h nasce com sua linha no catálogo. (2) **Rodapé da sidebar**: aviso passivo de "nova versão disponível" (via `GET /system/version`), padrão portado do delivery-system.

## v0.9.74 - 2026-07-13 (PIX copia-e-cola na página de pagamento)

Sem `db push`. Backend (provider IXC + tool) + frontend (página pública).

- **PIX copia-e-cola na página `/pagar/:token`.** Nova op canônica `financeiro.boleto_pix`: para cada boleto em aberto, chama o `get_boleto` (tipo=dados, como o botão "Copiar código PIX" do IXC) e extrai o BR Code. **Detecção determinística pelo FORMATO** (`findPixEmv`): o EMV começa com "0002" e contém `BR.GOV.BCB.PIX` — não depende do nome do campo (o IXC/gateway varia), respeitando o "não chutar IXC". A tool `gerar_link_pagamento` faz merge do PIX no snapshot por id do boleto.
- **Página:** mostra o **PIX copia e cola** (copiável, em destaque) + linha digitável + botão "Abrir boleto ou pagar com QR Code" (a página do gateway já traz o QR). Degradação graciosa: se o ERP não devolver o PIX, a página fica só com linha digitável + link.

## v0.9.73 - 2026-07-13 (Frente 5: link público de pagamento — 2ª via gerada no chat, expira sozinha)

⚠️ **`db push` (destrutivo)** — modelo novo `IspPaymentLink`. Backend + frontend + `CONTENT_VERSION` v29.

- **Página pública de 2ª via, sem login** (`/pagar/:token`). A IA gera na hora um link tokenizado (48 chars, inguessável) com o **snapshot** dos boletos em aberto; o link **expira por tempo** (janela configurável, padrão 24h) e não pede dados de acesso. Porte do `PortalAccessToken` do Aquapark — **sem** a sessão JWT. Rota pública espelha o `/convite/:token`.
- **Backend:** `IspPaymentLink` (schema), `IspPaymentLinkService` (cria com TTL+snapshot; resolve com **410 Gone** genérico se expirou/inválido — sem enumerar tokens) + repository + `IspPaymentLinkController` (`@Public GET /isp/pagamento/:token`, throttle 30/min). A org sai do próprio token.
- **IA:** tool `gerar_link_pagamento` (busca os boletos em aberto → cria o token → devolve a URL). Roteiro (bloqueio + 2ª via/fatura) passou a **preferir o link de pagamento**; se a ferramenta devolver `error` (ex.: URL pública não configurada), cai na linha digitável direto — degradação graciosa, sem inventar link.
- **Config (ISP → Abertura de chamado):** card "Link de pagamento" com validade (1h/6h/24h/48h) + endereço público do sistema. Em `system_settings` (`isp.pagamento.ttl_horas` / `isp.pagamento.base_url`), viaja no backup. A URL vem da config (a IA roda no worker, sem request — nunca de env manual).
- **Decisões do Robson:** janela de tempo + TTL configurável (24h) + snapshot.

## v0.9.72 - 2026-07-13 (Assistente não inventa "assunto em andamento" na 1ª identificação)

Sem `db push`. Backend (roteiro do assistente-exemplo) + `CONTENT_VERSION` v28.

- **Corrige o texto:** ao identificar um cliente na PRIMEIRA vez (a pessoa só mandou o CPF, sem ter pedido nada antes), o assistente não diz mais "já sigo no mesmo assunto que estava em andamento" — não havia assunto. Agora só carrega uma solicitação anterior quando ela EXISTE de fato; na 1ª identificação, confirma o cliente e segue a rotina normal (diagnóstico).

## v0.9.71 - 2026-07-13 (Fix: IA volta a marcar a conversa + Frente 4: bloqueio por inadimplência)

Sem `db push`. Backend (attendance + tools + roteiro) + `CONTENT_VERSION` v27.

- **FIX (regressão da v0.9.66): a IA voltou a marcar a conversa como "atendido pela IA".** `assignBot` usava `NOT: { owner_type: 'QUEUE' }` — gotcha de NULL no SQL: `NOT (owner_type = 'QUEUE')` com `owner_type` NULO (toda conversa NOVA) dá NULL = falso, então o update casava 0 linhas e a conversa não virava BOT (ficava em "Aguardando / sem atendente" em vez da aba IA). Trocado por OR null-safe (`AND [ OR(handler null|BOT), OR(owner null|BOT) ]`). Mesmo gotcha que o comentário do `current_handler_type` já alertava.
- **FRENTE 4 — cliente bloqueado por inadimplência.** (1) **Rotina proativa:** ao identificar o cliente, o assistente roda o diagnóstico e conduz pela situação — não devolve mais um menu genérico quando dá pra já verificar (a não ser pedido só de fatura/2ª via). (2) **Bloqueio:** o diagnóstico já expõe `contrato.bloqueado` (contrato ativo com `status_internet` ≠ 'A'); nova situação no roteiro — não trata como problema técnico, não abre chamado de suporte, tenta o desbloqueio, oferece a 2ª via e encaminha pra fila do **Financeiro**. (3) **Desbloqueio de confiança AUTÔNOMO:** `desbloqueio_confianca` entra no assistente com `requires_approval: false` — a IA executa e o **próprio ERP é o porteiro** (recusa se a regra do provedor não permitir; nesse caso a IA não promete o desbloqueio, segue com o pagamento). Constante `ASSISTANT_TOOLS` renomeada (não é mais "read only").

## v0.9.70 - 2026-07-13 (Config: quantos boletos a IA envia — vencidos primeiro)

Sem `db push`. Backend (config + projeção + tools) + frontend (tela ISP) + `CONTENT_VERSION` v26.

- **Nova config "Envio de boletos" (ISP → Abertura de chamado).** Dropdown "Máximo por mensagem" (1, 2, 3, 5, 10, Todos) — sem campo livre. Guardado em `system_settings` (`isp.boleto.max_envio`, default 3; 0 = todos), viaja no backup, ACL `isp.incidents.read/write`. Endpoints `GET/PUT /isp/os-config/boleto-max`.
- **Aplicação determinística (o modelo não decide o número).** As tools `consultar_debitos` e `segunda_via_boleto` ordenam os boletos em aberto por `limitBoletos` (vencidos primeiro, o mais atrasado no topo; depois por vencimento) e cortam no limite. Retornam `total_em_aberto` pra IA avisar quando há mais do que o mostrado. Histórico não entra no limite. Roteiro atualizado: mostra os vencidos primeiro e, se houver mais, avisa e oferece enviar o restante.

## v0.9.69 - 2026-07-13 (Assistente carrega a intenção ao trocar de CPF + marca boleto vencido)

Sem `db push`. Backend (projeção de boleto + roteiro do assistente-exemplo; `CONTENT_VERSION` v25 re-aplica no boot).

- **Boleto vencido é marcado pelo SISTEMA (determinístico).** `projectBoleto` passou a calcular `vencido` + `dias_em_atraso` comparando a data de vencimento com a data do servidor (só por data, sem hora, imune a fuso) — o modelo não compara datas. Só aparecem quando o boleto está de fato vencido. O roteiro (situação "2ª via/fatura") manda avisar com clareza que o cliente está EM ATRASO (há quantos dias) e oferecer a 2ª via pra regularizar — sem afirmar que o acesso está bloqueado (o contrato pode seguir ativo; bloqueio só se confirma pelo diagnóstico). Era o caso da Faiani: boleto vencido em 10/07 mostrado neutro como "em aberto".
- **Ao trocar de CPF no meio, o assistente carrega a solicitação em curso.** Situação "conversa em andamento": se a pessoa já tinha pedido algo (boleto, 2ª via, sem internet, chamado) e envia outro CPF, o assistente re-identifica e **segue com a MESMA solicitação** pro novo assinante (ou confirma específico: "Quer o boleto do(a) <nome>?") — não volta pro menu genérico "o que você precisa?".

## v0.9.68 - 2026-07-13 (À prova de erro: o modelo não escolhe conexão nem assunto inválido)

Sem `db push`. Backend (provider IXC + schema das tools ISP; worker re-sincroniza o catálogo no boot).

- **A conexão de ERP NÃO vem mais do modelo.** Todas as tools ISP expunham `connection_id`/`filial` no schema, e o modelo confundia o **login** do assinante (ex.: "torre3pratinha") com a **conexão de ERP** e passava um `connection_id` inválido → "Conexão de ERP informada não está ativa neste escopo". Removidos `connection_id`/`filial` do schema de todas as tools ISP: o agente **sempre auto-resolve** a conexão pelo escopo (org/workspace/ambiente + prioridade); só nós de workflow podem injetar explicitamente. Mesmo padrão da v0.9.67 (setor/assunto): o modelo decide só o que é dele (CPF/descrição/login), nunca ids de infraestrutura.
- **O "Descobrir recursos" traz SÓ os assuntos com processo de O.S. vinculado** (`id_processo` ≠ 0). É o processo que abre a OS a partir do atendimento; assunto sem processo faz o IXC recusar ("Departamento destino"). Filtrando na origem, o operador **não consegue escolher** um assunto inválido na config de abertura de chamado — prevenção em vez de validação depois. (O setor já era filtrado por `su_ticket_setor` ativos.)
- Regra registrada no CLAUDE.md: id que a IA consome (conexão, setor, assunto) nunca é texto livre nem escolha do modelo — vem da CONFIG curada ou é auto-resolvido; as OPÇÕES da config vêm filtradas da fonte (só as utilizáveis); config/infra quebrada → degradação graciosa (encaminha pra fila), nunca erro críptico ao cliente.

## v0.9.67 - 2026-07-13 (Intermitência da OS resolvida de vez: setor/assunto SÓ da config)

Sem `db push`. Backend (tool `abrir_os` + provider). Remove o debug da v0.9.66.

- **A causa REAL da intermitência: o modelo passava `setor="suporte"` (a palavra).** O log de debug pegou o body: `id_ticket_setor:"suporte"` em vez de `"2"`. O `abrir_os` deixava o modelo **sobrescrever** o setor/assunto (params opcionais "para sobrescrever"), e às vezes o modelo mandava a palavra "suporte" — que o IXC recusa como departamento ("Departamento destino"). Quando não mandava, usava a config (id "2") e abria — daí a intermitência. Agora **setor e assunto vêm SÓ da config** (ids curados); os params de override saíram do schema — o modelo só decide CPF/descrição/login. (O `id_wfl_processo=1` sempre esteve certo — o retry da v0.9.66 era defesa extra, mantido; não era a causa.)

## v0.9.66 - 2026-07-13 (Intermitência da OS: retry na leitura do processo do assunto + debug)

Sem `db push`. Backend (provider IXC). Inclui o fix do assignBot da v0.9.65.

- **Corrige a intermitência do "Departamento destino".** A OS abria às vezes e falhava às vezes com a MESMA config. Causa: `processoDoAssunto` lê o `id_processo` do assunto a cada abertura, e a API do IXC **erra calado** (a listagem às vezes volta vazia). Sem o `id_processo`, o ticket saía sem `id_wfl_processo` → o assunto "obriga processo" → o IXC tentava anexar sozinho e pedia o "Departamento destino". Agora a leitura **repete até 3x** quando a lista vem vazia. Log `[DBG-OS]` temporário pra confirmar (removido na próxima).
- (v0.9.65) **Handoff pra fila não é reassumido pela IA:** o `assignBot` do nó do agente não reassume conversa com `owner=QUEUE`.

## v0.9.65 - 2026-07-13 (Handoff pra fila não é mais "roubado" de volta pela IA)

Sem `db push`. Backend.

- **A conversa fica na fila depois do handoff.** A IA encaminhava pra fila (`encaminhar_para_fila` → `handoffToQueue` → `owner=QUEUE`, solta o handler), mas o nó do Agente chama `assignBot` ao FIM do turno para marcar "atendido pela IA" — e isso rodava DEPOIS do handoff, reassumindo a conversa pro BOT (ela voltava pra aba "IA"). Agora o `assignBot` **não reassume conversa com `owner=QUEUE`** (`NOT owner_type QUEUE` no lock condicional): entregou pra fila, fica na fila para o atendente humano.

## v0.9.64 - 2026-07-13 (Remove o log de debug do su_ticket)

Sem `db push`. Backend (provider IXC). Tira o `[DBG-OS]` temporário da v0.9.63.

- **Debug removido.** O log do corpo do `su_ticket` (v0.9.63) confirmou que o body é o correto (`id_ticket_setor=2`, `id_wfl_processo=1`) e a OS abre (chamado 3943). O "Departamento destino" que aparecia era o **worker rodando estado antigo** (config `setor=4` de antes do re-pick / código desatualizado) — o restart do deploy o atualizou. Não há cache de config no código (lê do banco a cada abertura), então mudar só a config já vale sem deploy; mudar código exige o restart do worker (que o `upgrade.sh` worker-first já faz).

## v0.9.63 - 2026-07-13 (debug temporário — log do corpo do su_ticket) [substituída pela v0.9.64]

## v0.9.62 - 2026-07-13 (Config de OS = departamento do atendimento + negrito sem e-mail/link)

Sem `db push`. Backend (conteúdo `v24`) + front do admin.

- **Rótulo da config de OS clarificado.** Depois da frente 2 o "Setor" da config passou a ser o **departamento do atendimento** (`su_ticket_setor`: Suporte/Financeiro), não o `empresa_setor` antigo. A tela ISP → Abertura de chamado agora explica isso e pede para re-escolher o departamento se a config é anterior à atualização. (Quem tinha o id antigo — ex.: `4` — recebia do IXC "Preencha o campo Departamento destino" ao abrir; a correção é re-escolher o departamento na tela.)
- **Negrito não vaza em e-mail/login/link.** O login pode ser um e-mail (`x@dominio.com`); o WhatsApp linkifica e o `*negrito*` em volta aparece literal. Regra na persona (`v24`): não usar negrito em texto com `@` ou `http`.

## v0.9.61 - 2026-07-12 (Frente 3 — UI de mapeamento setor→fila)

Sem `db push`. Backend + front do admin.

- **Tela para mapear setor→fila** (em ISP → Abertura de chamado). Dois seletores — "Fila de Suporte" e "Fila do Financeiro" — populados com as filas cadastradas (WhatsApp → Equipes e Filas); salva o mapa em `system_settings` (`isp.fila.suporte`/`isp.fila.financeiro`). Antes só o seed auto-mapeava e ajustar exigia mexer no settings na mão. Endpoints `GET/PUT /isp/os-config/filas` (perm `isp.incidents.read/write`); `IspOsConfigService.getQueueMapping/setQueueMapping`.

## v0.9.60 - 2026-07-12 (Frente 3 — handoff do bot para a fila de setor (Suporte/Financeiro))

Sem `db push`. Backend. Conteúdo do assistente re-aplicado (`v23`).

- **A IA agora ENCAMINHA de verdade para a fila do setor** (antes só dizia "vou deixar na fila"). Nova tool `encaminhar_para_fila(setor)` + método `ChatAssignmentService.handoffToQueue` (bot-autorizado, ação segura: devolve ao time humano; solta o handler, põe a conversa na fila `owner=QUEUE`, volta pra OPEN pra um atendente assumir; grava evento `TRANSFERRED` ator=BOT). A mensagem de "está na fila, aguarde" a própria IA envia na resposta (não é envio de sistema — não fura o reply gate). Roteiro (`v23`): ao abrir o chamado, informa nº+72h+fila e **chama `encaminhar_para_fila('suporte')`**.
- **Filas de setor por config (DECISÃO B).** O seed cria "Fila Setor de Suporte" e "Fila Setor Financeiro" (vazias) e mapeia setor→fila em `system_settings` (`isp.fila.suporte`/`isp.fila.financeiro` = id da AttendanceQueue). Idempotente. O operador pode re-mapear/renomear na tela WhatsApp → Equipes e Filas. Se a fila não estiver configurada, a tool devolve "não configurada" e a IA encaminha para um atendente genérico.
- A fila do Financeiro já fica pronta para a frente 4 (bloqueio/inadimplência → fila financeiro). Sem UI dedicada de mapeamento ainda (o seed auto-mapeia; ajuste via settings) — pendência menor.

## v0.9.59 - 2026-07-12 (Atendimento: envia o processo do assunto (id_wfl_processo))

Sem `db push`. Backend (provider IXC). Fix da v0.9.57/58.

- **`su_ticket` recusava com "Por favor preencha um processo!".** O assunto tem "Obrigar processo no atendimento"=Sim, então via API o IXC exige `id_wfl_processo` explícito. Agora o provider lê o processo configurado no próprio assunto (`su_oss_assunto.id_processo`, ex.: O.S. OPA SUITE) e o envia — determinístico, sem config extra. Novo helper `processoDoAssunto`.

## v0.9.58 - 2026-07-12 (Atendimento: `titulo` obrigatório no su_ticket)

Sem `db push`. Backend (provider IXC). Fix da v0.9.57.

- **`su_ticket` recusava com "faltando a descrição do assunto".** Faltava o campo `titulo` (a "Descrição do assunto", obrigatório no IXC). Agora o ticket manda `titulo` (a descrição do problema, curta até 200 chars); a mensagem completa segue em `menssagem`.

## v0.9.57 - 2026-07-12 (Frente 2 — abrir OS pelo fluxo de ATENDIMENTO do IXC (su_ticket + processo))

Sem `db push`. Backend (provider IXC). **Exige RE-CONFIGURAR o setor da OS após o deploy** (ver abaixo).

- **OS nasce do atendimento (`su_ticket`), não mais do insert direto.** O insert direto em `su_oss_chamado` abria a OS mas o IXC ignorava o contrato e não copiava o endereço. Agora o `os.cadastrar` do provider IXC: `gerar_protocolo_atendimento` → insere um `su_ticket` cujo **assunto tem um processo vinculado** ("O.S. OPA SUITE") → **o processo abre a OS com contrato + endereço no contexto** (do jeito OpaSuite). Campos do ticket: protocolo, tipo=C, id_cliente, id_login (id num), id_contrato (id num do login), id_filial, id_assunto, id_ticket_setor, origem_endereco (L se login tem endereço próprio, senão C), menssagem (descrição), su_status=N, status=T, atualizar_cliente/login=S.
- **Setor agora é o DEPARTAMENTO do atendimento (`su_ticket_setor`), não `empresa_setor`.** O "Descobrir recursos" passou a listar `su_ticket_setor` (ex.: Financeiro=1, Suporte=2). ⚠️ **A config de OS precisa ser RE-CONFIGURADA:** rodar "Descobrir recursos" na conexão IXC e escolher de novo o **setor (departamento)** e o **assunto** (um com processo vinculado, ex.: LENTIDÃO). O `assunto_id` antigo (su_oss_assunto) continua válido; o `setor_id` antigo (empresa_setor) precisa virar um `su_ticket_setor`.
- **Anti-duplicidade agora por login** (o setor do ticket ≠ setor da OS, então o escopo por setor saiu). O helper `abrirOs` virou `abrirAtendimento`; novo `gerarProtocolo`. Tabelas novas no provider: `su_ticket`, `su_ticket_setor`.

## v0.9.56 - 2026-07-12 (OS completa: contrato + origem do endereço automáticos; negrito do WhatsApp)

Sem `db push`. Backend (provider IXC) + conteúdo do assistente (`v22`).

- **OS sai com o contrato preenchido (automático).** Ao resolver o login, o provider já traz o contrato do próprio login (`radusuarios.id_contrato`) e preenche o `id_contrato` da OS — o agente não precisa acertar. (Antes a OS abria com o Contrato vazio.)
- **Origem do endereço correta.** O `origem_endereco` passa a ser `'L'` (Login) só quando o login tem endereço PRÓPRIO; quando ele herda o endereço do cadastro (`endereco_padrao_cliente='S'`, caso comum), usa `'C'` (Cliente). Antes marcava sempre 'L' quando havia login, mesmo o endereço vindo do cliente. O helper `resolveLoginId` virou `resolveLogin` e devolve id + contrato + flag de endereço próprio.
- **Negrito do WhatsApp (1 asterisco).** O assistente usava `**texto**` (Markdown), que o WhatsApp mostra literal. Regra de formato na persona: negrito é `*texto*` (um asterisco de cada lado).

## v0.9.55 - 2026-07-12 (Abrir OS: resolve o login pelo id — não pelo nome)

Sem `db push`. Backend (provider IXC).

- **Abertura de OS falhava por causa do login.** O `abrir_os` passava o NOME do login (ex.: "torre3pratinha") em `id_login`, mas no IXC `su_oss_chamado.id_login` é FK pro **id numérico** de `radusuarios` — a abertura era recusada. Agora o provider resolve o nome do login pro id (novo helper `resolveLoginId`) antes de abrir; se não encontrar, abre sem login (origem no endereço do cliente) em vez de falhar. A anti-duplicidade de OS (`os.listar_abertas`) recebeu a mesma tradução — antes o filtro por login nunca casava (nome ≠ id). O agente continua trabalhando com o NOME do login; a tradução pro id é do provider.
- **`id_contrato` também é id (guarda numérica).** O diagnóstico já entrega o `id_contrato` como id numérico, mas a abertura ganhou uma guarda: só envia `id_contrato` se for numérico — evita mandar o nome do plano por engano (o IXC recusaria, como no login).

## v0.9.54 - 2026-07-12 (Deploy: worker reinicia no upgrade + diagnóstico mostra opções para o cliente escolher)

Sem `db push`. Backend + `scripts/upgrade.sh`. Conteúdo do assistente re-aplicado (`v21`).

- **Bug de deploy: o worker não reiniciava.** O `upgrade.sh` mandava `pm2 restart iastudio-api iastudio-worker` num comando só, com o **api primeiro** — e o worker ficava de fora (rodou 19h sem reiniciar enquanto o api reiniciava a cada deploy). Como o worker roda o assistente e registra as tools **em memória**, a tool nova do diagnóstico (`diagnosticar_conexao`, v0.9.50) nunca entrou nele → dava "sem handler builtin". Agora o upgrade reinicia o **worker primeiro** e o **api por último**, cada um em seu comando (o restart do api é o momento de risco pro próprio script de upgrade). Mudanças de roteiro/persona não sofriam disso (vivem no banco, lidas a cada run); só tool/código novo exigia o restart do worker.
- **Diagnóstico: mostrar as opções e o cliente escolhe (nunca pedir login/endereço digitado).** O assistente pedia para o cliente digitar o login ou o endereço do ponto — dados que ele pode não saber e que podem não bater com o cadastro. Agora sempre LISTA as opções que a ferramenta traz e o cliente escolhe pelo número. Opções de contrato passam a trazer **plano + número do contrato + endereço** (o número do contrato desempata quando dois têm o mesmo plano, ex.: dois "600 MEGAS FIBRA"); opções de conexão trazem login + referência + endereço.

## v0.9.53 - 2026-07-12 (Abertura mais natural — reconhece o número na saudação + cumprimenta uma vez só)

Sem `db push`. Backend. Conteúdo do assistente re-aplicado (`v20`).

- **Reconhece o número já na saudação.** Se o WhatsApp é de um número salvo no cadastro de um cliente, a abertura já reconhece na primeira mensagem ("Olá! Vejo que este número está salvo para <nome>. É sobre a conexão dele(a) ou de outro cliente?") em vez de saudar genérico e só identificar depois. Se o número não é conhecido, cumprimenta e pergunta o motivo.
- **Cumprimenta uma vez só.** A IA saudava duas vezes (na 1ª e na 2ª mensagem) — nada natural. Agora é regra de estilo na persona ("cumprimentar uma única vez, não repetir 'olá/oi'"), numa casa só.

## v0.9.52 - 2026-07-12 (Consolidação do agente ISP — fim da duplicidade + identificação determinística + persona padrão)

Sem `db push`. Backend. Conteúdo do assistente re-aplicado (`v19`).

- **Fim da duplicidade de lógica do agente.** A mesma regra vivia em 3-6 lugares (system_prompt + roteiro passos + roteiro situações + persona) com frases diferentes — o modelo recebia instruções redundantes/conflitantes e produzia respostas sem lógica. Agora cada assunto tem UMA casa: **persona** = só tom/formato; **system_prompt** = 3 guardrails transversais (quem você é / dado é do titular / não invente); **roteiro** = casa única do fluxo (triar → identificar → diagnóstico + situações), cada regra uma vez. Sem regra de negócio na persona nem no system_prompt.
- **Identificação determinística (raiz do "CPF enviado" fantasma).** A tool `identificar_cliente` passou a devolver COMO identificou (`identificado_por: 'telefone' | 'documento'`). O assistente apresenta a verdade — se foi pelo telefone, diz "este número está salvo para o cliente X"; nunca mais afirma que um CPF foi enviado quando não foi. Mesma filosofia da frente 1 (sistema decide, modelo apresenta).
- **"Nome que a IA usa" agora funciona.** O campo `name` da persona era ignorado pelo backend (não chegava no prompt). Agora o `compilePersona` injeta "Você se chama <nome>" — o assistente se apresenta pelo nome de verdade (genérico, vale para todo agente).
- **Persona padrão do exemplo ISP:** nasce como NETE, tom amigável, emojis moderado, respostas médias (4-6 frases) — os padrões pedidos. Como viajam no CONTENT_VERSION, não "resetam" a cada atualização. Modelo padrão do exemplo ajustado para `gpt-5.4` (confirmado respondendo; o `gpt-5.5` não retornou nos testes).

## v0.9.51 - 2026-07-12 (Identidade — documento manda sobre telefone + transparência na identificação por telefone)

Sem `db push`. Backend. Conteúdo do assistente re-aplicado (`v18`).

- **CPF/CNPJ digitado tem PRIORIDADE sobre o telefone.** A tool `identificar_cliente` buscava por telefone com precedência ("o dado que o atendimento possui") — mas o número do WhatsApp pode estar salvo no cadastro de OUTRA pessoa no ERP. Resultado real: o cliente enviava um CNPJ e a IA respondia com o titular do telefone (outra pessoa), ignorando o documento. Agora, se há um CPF/CNPJ informado, a identificação é por ele; o telefone só vale quando nenhum documento foi enviado (1º contato).
- **Transparência na identificação por telefone.** Quando o número está salvo no cadastro de um cliente, o assistente não presume mais que o atendimento é para ele: informa "vejo que este número está salvo para o cliente <nome>" e pergunta se é sobre a conexão desse cliente ou de outro — se for outro, pede o CPF/CNPJ para localizar. Roteiro (`v18`) + system_prompt atualizados; a situação "número salvo/vinculado" passou a exigir a confirmação antes de seguir.

## v0.9.50 - 2026-07-12 (Frente 1 — diagnóstico determinístico + funil + modelo forte + encerrar conversa da IA)

Sem `db push`. Backend + front do admin. Conteúdo do assistente re-aplicado (`v17`). Primeira frente do redesenho do assistente ISP (spec-assistente-isp §2). **Substitui a v0.9.49**, cuja tag caiu no commit da v0.9.48 (um `index.lock` órfão travou o commit local, então a frente 1 nunca subiu — nenhuma linha desta frente estava em produção).

- **Diagnóstico determinístico contrato→login (tira a lógica multi-passo do modelo).** Nova tool `diagnosticar_conexao` + `IspDiagnosisService`: o **sistema** decide as etapas e o modelo só apresenta. Recebe o CPF (e, nas re-chamadas, a escolha do cliente) e devolve a próxima etapa — `escolher_contrato` (opções pelo **plano**), `escolher_login` (pelo **login + referência** do ponto) ou `resolvido` (status do login online/desde + situação do contrato). Suprime **contratos inativos** (`status ≠ 'A'`) e **logins inativos** (`ativo ≠ 'S'`); filtra os logins pelo contrato escolhido (`id_contrato`). Compõe os ops canônicos (`cliente.dados`+`cliente.planos`+`cliente.acesso`) — vale para IXC e Altarede sem tocar provider.
- **Funil: `diagnosticar_conexao` é a ÚNICA porta.** O assistente ISP deixou de ter `consultar_contrato` e `status_conexao` na lista de ferramentas — com elas, o modelo pegava o atalho e nunca chegava ao login certo (anunciava "conexão ativa" mesmo com vários contratos). As duas seguem registradas no catálogo para workflows/outros agentes; só saíram deste assistente.
- **Modelo forte por padrão (porte do Aquapark).** O assistente-exemplo ISP nasce com `gpt-5.5` (o mini não sustenta o encadeamento de ferramentas do diagnóstico). E o campo **Modelo** do editor virou **dropdown curado** (sem digitação livre — jargão perigoso pro usuário), com `gpt-5.5`/`gpt-5.4` na lista; um modelo legado fora da lista é preservado como opção "(atual)".
- **Rótulo que distingue de verdade.** Como o endereço quase sempre é **herdado** do cliente (confirmado na base real: `endereco_padrao_cliente='S'`, campos vazios), rotular por endereço não separava as opções. Agora contrato mostra o **plano** e login mostra **login + referência**; o **endereço** entra só quando é próprio do ponto. Endereço efetivo: próprio do login → próprio do contrato → do cliente (DECISÃO A). Acima de 5 logins, `muitos=true` e o assistente pede um dado para estreitar em vez de listar tudo.
- **Encerrar conversa atendida pela IA (bug de permissão).** O botão "Encerrar" barrava ("Sem permissão para encerrar esta conversa") quando a IA estava no comando: o gate tratava o handler **BOT** como se fosse humano. Agora só barra quando um **humano** (`current_handler_type='USER'`) está atendendo — encerrar uma conversa da IA ou sem handler não rouba trabalho de ninguém, então quem tem permissão de encerrar encerra sem precisar assumir antes.
- **Roteiro do assistente (`v17`).** O passo "chegar até o login" manda **usar a ferramenta de diagnóstico** (não raciocinar os passos) e apresentar só o que está fora do normal. As projeções `projectContrato`/`projectConexao` passaram a expor endereço/referência/`endereco_proprio` (ponto único de normalização dos dois ERPs).

## v0.9.48 - 2026-07-12 (fix do build da v0.9.47 + aprovar executa + OS com endereço + saudação/login/72h)

Sem `db push`. Backend + front do admin. Conteúdo do assistente re-aplicado (`v15`). **Substitui a v0.9.47**, cujo build abortou (fail-safe manteve a produção na v0.9.46): o contexto de execução da ação aprovada não incluía `agentId`/`traceId` (obrigatórios em `ToolExecutionContext`) — corrigido guardando-os no pedido de aprovação e reconstruindo-os na execução.

- **Aprovar agora EXECUTA a ação (bug crítico).** O `decide` só mudava o status para APROVADO e **nunca rodava a ação** (a OS nunca abria no IXC mesmo após aprovar). Agora, ao aprovar, a ação é executada de verdade sob o mesmo escopo do run (via `ToolRuntime.runApproved`), com o escopo (workspace/ambiente/conexão) guardado no pedido de aprovação. Falha na execução fica registrada no próprio pedido. (Com o `abrir_os` automático da v0.9.46 isso nem é mais o caminho comum — mas o botão Aprovar precisava funcionar.)
- **OS sai com o endereço certo.** O provider abria a OS com `origem_endereco = Manual` (endereço/lat-long vazios). Agora usa o endereço do **login** (quando informado) ou do **cliente** — nunca Manual. E o roteiro leva a IA a chegar até o **login específico** (um cliente pode ter 2 contratos e vários logins por contrato) e passar o login/contrato daquela conexão na abertura.
- **Saudação e fluidez.** A abertura fala em "conexão/internet de um assinante" (não "conta") e, na venda, **orienta o próximo passo** (escrever cidade/endereço + plano que procura) em vez de só dizer "não precisa de CPF". Guardrail de **quebra de linha**: separar pontos/passos em linhas para ficar legível no WhatsApp (o envio já preserva `\n`; era o modelo escrevendo grudado).
- **Fechamento do chamado.** Ao abrir, a IA informa o número, o prazo de **até 72h** e que vai deixar o atendimento na fila da supervisão. (A ação de mover a conversa para a fila da supervisão + a mensagem automática de "seu chamado está na fila de supervisão" é uma capacidade nova de atendimento — **fica para a próxima versão**; nesta a IA só comunica.)
- **Varredura de contratos front↔back (parcial).** Corrigidos os 400 de whitelist em **Custos** (criar/editar orçamento não mistura mais `is_active`/`period_kind`; simulador manda `runs_per_month` sem `provider_kind`). Restam da varredura: MCP/Política/Memória (campo a mais no create/update), Incidente (`auto_detect`), Ambiente (`type`→`kind`), Workspace (`slug` obrigatório sem campo na UI) — **fila da próxima versão**.

## v0.9.46 - 2026-07-12 (suporte a GPT-5.x na API (porte Aquapark) + guardrails sucinto/nome≠CPF)

Sem `db push`. Backend. O modelo do assistente troca-se na aba Ajustes (sem deploy).

- **Suporte aos modelos GPT-5.x / série "o" na chamada da OpenAI (porte do Aquapark).** Esses modelos mudam o contrato da API: só aceitam `temperature` padrão (qualquer valor custom → HTTP 400) e usam `max_completion_tokens` em vez de `max_tokens`. O provider da OpenAI agora detecta `gpt-5*`/`o<n>*` e **omite a temperature** + usa o parâmetro certo. Sem isto, escolher um modelo GPT-5.x quebrava a chamada. Agora dá pra apontar o assistente pra um modelo mais forte na aba **Ajustes** (o gpt-4o-mini é fraco pra nuance — foi o que fez ele reler "sou o cliente Fabricia" como "cliente da Fabricia" e alucinar um CPF que ninguém enviou).
- **Guardrails do assistente (re-aplicados, `v14`):** responder **em 1–3 frases**, direto; **nome não é CPF** — se a pessoa diz o próprio nome ("sou o cliente Fabricia Bastos") ela está se identificando (ela É essa pessoa), e ainda assim é preciso o CPF/CNPJ pra localizar; **nunca** dizer "não localizei com o CPF informado" quando nenhum CPF foi enviado.
- **Lógica de conversação (fluidez).** A abertura já orienta: "se for sobre a conta de um assinante (sem internet, fatura, 2ª via, chamado), me envie o CPF/CNPJ do titular; se for para contratar, não precisa". E o gate fica explícito no roteiro: **assunto de assinante só avança com o CPF** — se não veio, pede e aguarda, sem tentar consultar/resolver antes de identificar. Assim a pessoa manda o CPF de imediato, sem a IA ficar repetindo "em que posso ajudar".
- **Abrir OS volta a ser AUTOMÁTICO (aprovação é opt-in).** O `abrir_os` estava caindo em "Pendências" (aguardando aprovação) porque o catálogo de tools era *create-if-missing*: o `requires_approval` antigo ficava preso no banco e a mudança pra `false` no código nunca propagava. Agora o seed **sincroniza os campos code-owned das tools builtin** (o código é a fonte da verdade) — o `abrir_os` abre direto. Quem quiser revisão antes de executar liga uma **Política** em IA Studio → Pendências → Políticas (opt-in), sem mexer no código.
- **Anti-duplicidade de OS escopada por SETOR.** Antes de abrir, a IA **sempre** verifica se já existe chamado aberto para o cliente — mas agora só conta como duplicado o chamado **do mesmo setor** da abertura. Uma OS aberta em outro setor (ex.: financeiro) não bloqueia mais um chamado de suporte. Se existir um no mesmo setor, a IA informa o número em vez de abrir outro.
- **Pendências (Aprovações) — aprovar/rejeitar quebrado corrigido.** O front mandava `{ decision: 'APPROVED'/'REJECTED' }` mas o backend espera `{ approve: boolean }` — dava o erro "property decision should not exist, approve must be a boolean value" e nada acontecia. Corrigido para `approve: true/false`. Também: a ação passa a aparecer com **nome amigável** (ex.: "Abrir chamado" em vez de `abrir_os`) e o texto de rejeitar foi corrigido — rejeitar **não** é destrutivo (só recusa a execução, nada é alterado), a redação anterior dizia o contrário.

## v0.9.45 - 2026-07-12 (agrupamento de mensagens na origem (porte Aquapark) + re-aplica prompt do assistente)

Sem `db push`. Backend + front do admin. Corrige o que a v0.9.44 não resolveu.

- **Agrupamento de mensagens picadas refeito — na ORIGEM, igual ao Aquapark.** A v0.9.44 ainda tinha o debounce DENTRO do nó Assistente: cada mensagem virava um run que dormia e comparava ids, e a própria resposta da IA "superava" a mensagem seguinte do cliente — resultado, respondia só a saudação e perdia contexto. Agora o agrupamento é no **dispatch** (`AutomationProcessors`), portando o padrão do SDR do Aquapark: um timer **por conversa** que REINICIA a cada mensagem nova e dispara **UMA vez** quando o cliente para de digitar. Chega **um** run só ao assistente, que lê o histórico completo e responde **juntando tudo**. Janela por `WHATSAPP_DEBOUNCE_MS` (default 8s). O debounce interno do nó foi removido.
- **Comportamento do assistente movido para o LUGAR CERTO (Passos + Situações).** Antes o comportamento vivia num blocão em "Instruções adicionais (avançado)" — só o dev entendia. Agora vive no **roteiro estruturado** (aba "O que faz"): Passos na ordem (entender motivo · continuar de onde parou · identificar · venda não pede CPF · escolher a conexão certa) e Situações "Quando… faça…" (sem internet, incidente na região, abrir chamado no "sim", 2ª via, venda). O dono do negócio abre o assistente e **lê/edita a lógica nas caixinhas**. "Instruções adicionais" ficou com 3 guardrails gerais só.
- **Prompt volta a ser re-aplicado no assistente existente.** A v0.9.44 marcou o conteúdo `v11` como semeado, então os ajustes não pegavam (por isso ainda anunciava "contrato ativo"). Bump para `v13-roteiro-estruturado` força a re-aplicação: **não anuncia o normal** (só o oposto — bloqueio/cancelado/incidente), **não recomeça a saudação** depois de identificar, **pergunta qual login** (com o endereço) quando há mais de um, e **abre a OS na mesma resposta** ao "sim".
- **Tick azul + "digitando"** (já descritos na v0.9.44) seguem: a IA marca lida + "digitando" ao começar; o atendente marca lida ao abrir e dispara "digitando" ao escrever.

## v0.9.44 - 2026-07-12 (WhatsApp: tick azul + "digitando" · assistente menos engessado · OS mais robusta)

Sem `db push` (nenhuma mudança de schema). Backend + front do admin.

- **Tick azul (lida) + "digitando…" no WhatsApp do cliente** — porte do padrão do Aquapark pra estrutura do IA Studio (Provider Registry). Um único POST à Meta (`status:'read'` + `typing_indicator`) marca a mensagem como lida e mostra "digitando" (some ao enviar a resposta ou em ~25s), ancorado no wamid da última mensagem recebida.
  - **A IA** marca lida + "digitando" assim que começa a processar a mensagem (o cliente vê o feedback enquanto a IA pensa).
  - **O atendente** marca lida ao abrir a conversa (tick azul) e dispara "digitando" enquanto escreve no campo de mensagem (throttle, só dentro da janela de 24h).
  - Novo: `markMessageRead` no cliente Graph, operação `markRead` no provider `whatsapp-meta`, `markRead`/`markReadByChat` no orquestrador, endpoint `POST /comm/whatsapp/chats/:id/typing`. Tudo best-effort — UX nunca quebra o atendimento.
- **Assistente menos engessado (continuidade/memória)** — depois de identificar/confirmar o cliente, a IA NÃO recomeça com a saudação nem repergunta "em que posso ajudar" quando o motivo já foi dito: dá andamento ao que a pessoa já pediu. E só informa o **oposto** do normal — não fica anunciando "seu contrato está ativo" (o esperado), só sinaliza bloqueio/cancelamento/incidente.
- **Múltiplos logins no mesmo contrato** — quando o cadastro tem mais de uma conexão, a IA PERGUNTA a qual login o cliente se refere, **listando o endereço** de cada um, antes de tratar status ou abrir chamado (não age no login errado).
- **Abertura de OS mais robusta** — a IA passou a **chamar a ferramenta de abrir OS na mesma resposta** ao "sim" (não protela com "já volto com o número"); e a checagem anti-duplicidade agora é **tolerante a falha** (se a listagem de OS abertas der erro, abre mesmo assim em vez de travar — erro silencioso não bloqueia o chamado). Refresh do conteúdo do assistente-exemplo: `v11-continuidade-os`.

## v0.9.43 - 2026-07-11 (dropdown de Setor da OS: lê empresa_setor, só ativos + fallback)

- **A causa do Setor vazio: eu lia a tabela errada.** A doc do IXC mostra que o campo `setor` da OS (`su_oss_chamado`) referencia **`empresa_setor.id`**, não `su_oss_setor` (que fica vazio em muitas bases). Troquei o discover (e o `atendimento.listar_setor`) para ler `empresa_setor` — agora o dropdown popula com os setores reais, e **só os ativos** (`ativo='S'`).
- **Fallback** (rede de segurança): se ainda assim nenhum setor for descoberto, o campo vira um **input pra digitar o id do setor** — não trava a config.
- Backend + front do admin, sem `db push`.

## v0.9.42 - 2026-07-11 (fix: ".map is not a function" na tela de Abertura de chamado)

- A tela de Abertura de chamado quebrava ao carregar a config: `getOsConfig`/`saveOsConfig` devolviam o envelope `{ items }` do `normalizeList` em vez do array, e a página fazia `.map` no objeto. Corrigido para devolver `.items` (o array). Só front do admin, sem `db push`.

## v0.9.41 - 2026-07-11 (a IA ABRE o chamado — config de setor/assunto + anti-duplicidade)

Precisa de `db push` (nova tabela `isp_os_config` — só adiciona). Fecha o ciclo de suporte técnico.

- **Config de abertura de OS (curada pelo operador).** Nova tela **ISP → Abertura de chamado**: um botão descobre os **setores e assuntos** direto do ERP (IXC), o operador escolhe quais a IA pode usar (pares setor↔assunto) e marca um como **padrão de suporte**. Assim a IA nunca chuta id — só usa valores válidos.
- **A IA abre a OS de verdade.** A ferramenta `abrir_os` foi habilitada no assistente-exemplo e **abre direto** (sem aprovação) após o cliente confirmar: preenche **setor+assunto pela config**, **CPF+filial** do cadastro, **login+contrato** da conexão com problema (essencial quando há mais de uma) e a **descrição** do problema (que a IA resume). Refresh `v10-abre-os`.
- **Sem duplicidade + guard de incidente.** Antes de abrir, checa se já existe **OS aberta** pra essa conexão/cliente (nova operação `os.listar_abertas` no IXC) — se existir, passa o número existente em vez de abrir outra. E o guard de incidente ativo já evitava OS duplicada em manutenção de região. Se a config não estiver pronta, a IA encaminha para um humano.
- Provider IXC: `os.listar_abertas` (anti-dup) + `id_contrato` na abertura de OS.

## v0.9.40 - 2026-07-11 (ajustes finos do assistente: abertura, CPF, status, chamado)

Cumulativa — garante no ar os ajustes de comportamento do assistente-exemplo (alguns já descritos na v0.9.39; esta versão assegura que todos entraram no build):

- **Abertura neutra:** cumprimenta e pergunta o motivo sem presumir que já identificou ("Robson" é só o nome do WhatsApp) — nada de "sua conta" antes de identificar.
- **Não inventa CPF:** ao não achar pelo telefone, apenas pede o CPF educadamente; não diz "não localizei este CPF" quando ninguém enviou CPF.
- **Sem contradição de status:** não fala "conexão ativa" e "conexão offline" na mesma frase — separa **contrato ativo** de **conexão offline no momento**.
- **Chamado sem beco sem saída:** em problema técnico, se a pessoa quer chamado, **encaminha claramente para um atendente humano** abrir a OS (a IA não abre a OS diretamente) — nunca um vago "acompanhe pelo suporte" nem promessa de chamado não aberto.

## v0.9.39 - 2026-07-11 (CPF com mais de um cadastro/contrato — pergunta qual)

- **Múltiplos cadastros/contratos no mesmo CPF/CNPJ.** O auto-vínculo só liga sozinho quando há **exatamente 1** cadastro. Se a identificação retorna **mais de um** (endereços/instalações diferentes), o assistente **não escolhe sozinho** e **não pede pra a pessoa digitar o endereço** (o que ela escreve pode não bater com o cadastro): ele **apresenta os endereços JÁ CADASTRADOS numa lista numerada** (como vieram do sistema) e a pessoa **escolhe pelo número**; só depois vincula o cadastro escolhido (pelo id). Idem para um cadastro com **vários contratos/conexões**. (Refresh `v9-multiplos-cadastros`.)
- **Abertura mais clara (sem parecer que já identificou).** A saudação dizia "Olá, Robson! ...suporte com sua conta" dando a entender que já sabia quem era — mas "Robson" é só o nome do WhatsApp e ninguém foi identificado ainda. Agora o assistente cumprimenta de forma **neutra** e pergunta **claramente o motivo**, sem falar "sua conta/seu cadastro" antes de identificar; enquanto o número não está vinculado, trata como desconhecido (descobre se é suporte de assinante ou interesse em contratar).
- **Fim da mensagem confusa "não localizei este CPF" quando ninguém deu CPF.** O assistente tentava identificar pelo telefone do WhatsApp; ao não achar, dizia "não consegui localizar um cadastro associado a este CPF" — sem a pessoa ter enviado CPF nenhum. Agora, se não encontra pelo telefone, ele apenas **pede o CPF/CNPJ educadamente**; só fala em "cadastro não encontrado" depois de um CPF de verdade não bater.
- **Suporte técnico: fim da contradição e do beco sem saída.** Não fala mais "conexão ativa" e "conexão offline" na mesma frase (separa **contrato ativo** de **conexão offline no momento**). E, quando é problema técnico e a pessoa quer chamado, em vez de "não posso abrir... acompanhe pelo suporte" (vago), ele **encaminha claramente para um atendente humano** dar sequência/abrir o chamado — nunca promete um chamado que não foi aberto.
- Cumulativa com a v0.9.38 (auto-vínculo ao identificar) e v0.9.37 (assume da IA + close→pool + fluxo técnico).

## v0.9.38 - 2026-07-11 (vínculo AUTOMÁTICO ao identificar + garante close→pool)

- **Vínculo agora é determinístico.** Antes dependia do modelo lembrar de chamar a ferramenta `vincular_cliente` — pouco confiável (às vezes não vinculava, e o "desvincular" nem aparecia). Agora a ferramenta **`identificar_cliente`** grava o vínculo automaticamente quando acha **exatamente 1 cliente**: aparece "Cliente: <nome>" + **desvincular** no cabeçalho, e a IA não re-pede o CPF. Outro CPF depois re-identifica e re-vincula sozinho.
- Cumulativa com a v0.9.37: **garante** no ar o *encerrar solta o atendente → volta pro pool* e o *fluxo de suporte técnico* (nomeia a conexão + oferece chamado), caso não tenham entrado no seu build da v0.9.37.

## v0.9.37 - 2026-07-11 (atendente assume da IA + fluxo de suporte técnico melhor)

- **"Assumir" numa conversa que a IA está conduzindo dava erro** ("Conversa já foi assumida por outro atendente"), porque o `claim` só aceitava conversa sem atendente (`current_handler_id = null`) e a IA está com ela (handler BOT). Agora o humano pode assumir de **null OU BOT** (tomar a frente da IA — normal, a IA para pelo gate); só bloqueia se **outro humano** já pegou. Corrige os toasts vermelhos ao clicar em Assumir numa conversa da IA.
- **Fluxo de suporte técnico mais completo (assistente-exemplo).** Ele dizia genérico "uma das conexões está offline" sem nomear e não sugeria chamado. Agora, ao verificar conexão, ele **diz qual conexão caiu (login) e desde quando**, dá a orientação básica, checa a região e **oferece abrir um chamado técnico** para aquela conexão (registrar/encaminhar). Refresh `v8-conexao-chamado`. (Obs.: o exemplo segue em modo leitura — ele *oferece/encaminha* o chamado; pra ele ABRIR a OS de fato precisaria habilitar a ferramenta de escrita `abrir_os`, com confirmação — decisão pendente do Robson.)
- **Encerrar solta o atendente → a conversa volta pro pool.** Antes, se um humano assumia (ou recebia por transferência) e depois **encerrava**, o handler continuava preso nele — quando o cliente voltava a escrever, a conversa reabria "atribuída" ao humano e a **IA não pegava de volta**. Agora o `close` limpa `current_handler`; ao reabrir por inbound, a conversa está sem atendente (pool) e a IA volta a atender.

## v0.9.36 - 2026-07-11 (vínculo CPF ↔ WhatsApp — a IA sabe de quem é o número)

Precisa de `db push` (só ADICIONA colunas — não perde dado). Cumulativa com a v0.9.35 (debounce + consistência de status/identidade).

- **Vínculo estruturado (raiz da confusão de identidade).** `WhatsappChat` ganhou `linked_customer_document/ref/name/linked_at` (o telefone → titular). A IA, depois de identificar e **confirmar** o CPF, chama a ferramenta **`vincular_cliente`** → o número fica ligado àquele cliente. Nas conversas seguintes ela **não pede o CPF de novo** e não mistura identidade (o nó Assistente injeta "esta conversa é do cliente X" no contexto).
- **Trocar de cliente:** se a pessoa quiser atender OUTRO cliente, o assistente avisa "é só me enviar o CPF" e, ao receber, **re-vincula** ao novo titular.
- **Desvincular pelo atendente:** no cabeçalho da conversa aparece "Cliente: <nome>" com um botão **desvincular** (perm `comm.whatsapp.claim`) — endpoint `POST /comm/whatsapp/chats/:id/unlink-customer`.
- Ferramenta `vincular_cliente` adicionada ao assistente-exemplo (refresh `v7-vinculo-cliente`). Sem válvula de segurança de CPF por ora (decisão do Robson) — o 2º fator pode ser plugado depois, como a spec previa.

## v0.9.35 - 2026-07-11 (debounce: agrupa mensagens picadas numa resposta só)

- **A IA deixa de responder 3x pra 3 mensagens seguidas.** Quando o assistente vai responder um inbound de WhatsApp, ele espera uma janela curta (~7s); se nesse meio-tempo chegou uma mensagem MAIS NOVA na conversa, esta execução não responde — quem responde é a execução da última mensagem, já com todo o histórico junto. Uma resposta por rajada. O evento inbound passou a carregar o `external_id` (wamid) pra essa comparação. (Porte do debounce do SDR do Aquapark.)
- **Assistente mais consistente sobre status.** Ele estava se contradizendo ("cadastro está ativo" e logo depois "sua conta está inativa") e concluindo "inativo" só porque não havia conexão ativa. Agora o system_prompt manda basear a conclusão no **status do CONTRATO** (não na mera ausência de conexão): sem conexão pode ser problema técnico (contrato ativo), bloqueio por pagamento, OU cancelamento — verificar antes de afirmar, e não dizer "inativa" se o cadastro está ativo.
- **Não misturar identidades.** Quando a pessoa no WhatsApp consulta o CPF de OUTRA pessoa (ex.: Robson pergunta pelo CPF da Fabricia), o assistente estava misturando ("Robson, sua conta..."). Agora ele separa: quem está no WhatsApp ≠ titular do cadastro consultado; refere-se ao titular pelo nome e não atribui a conta/conexão a quem está falando. (Refresh `v6-status-identidade`.)
- Sobe em cima da v0.9.34 (que já está em produção): adiciona debounce + os dois ajustes de comportamento acima.

## v0.9.34 - 2026-07-11 (corrige o TS que barrou a v0.9.33)

- **A v0.9.33 falhou no `API_BUILD`** (erro de tipo em `builtin-tools.ts`: `.catch(() => [])` fazia o TS inferir `never[]`, então `m.content` não existia em `never`). O painel de Atualização **mostrou a falha** e a produção ficou na versão anterior (fail-safe funcionando). Corrigido tipando o retorno como `WhatsappMessage[]` (em `builtin-tools.ts` e `agent.nodes.ts`). Cumulativa — traz tudo da v0.9.33 (IA assume conversa, aba IA/Aguardando, inativo→venda).

## v0.9.33 - 2026-07-11 (a IA ASSUME a conversa — "atendido pela IA" + regra: inativo vira venda)

- **assignBot: a IA passa a "atender" a conversa (BOT).** Quando o assistente responde de verdade numa conversa de WhatsApp, ele **assume o atendimento** (`current_handler_type=BOT`) — a conversa deixa de ficar solta em "Não atribuídas" e passa a mostrar **"atendido pela IA"**. Não rouba de humano (se um atendente está no comando, a IA não assume); e um humano pode **assumir** a qualquer momento (aí a IA para). Porte do `assignBot` do Aquapark (o schema já suportava BOT — sem `db push`).
- **Regra de negócio: cadastro/contrato INATIVO → VENDA, não 2ª via.** O assistente aprendeu a diferença: **bloqueado por inadimplência** (suspenso, reativa pagando) → oferece 2ª via; **inativo/cancelado** (contrato encerrado, não reativa pagando boleto antigo) → **não** oferece 2ª via, trata como **venda/negociação** e oferece um novo plano. (Refresh `v4-inativo-venda` no assistente-exemplo.)
- **Fila do atendente sem confusão: nova aba "IA" + "Aguardando".** As conversas que a IA está conduzindo saem da fila humana e vão pra uma aba **"IA"** própria (não poluem mais). A aba "Não atribuídas" virou **"Aguardando"** (quem realmente espera um humano — sem handler). Então o atendente vê claro: **Minhas** (o que atendo) · **Aguardando** (fila) · **IA** (a IA cuida) · Minha equipe · Todas. "Encerradas" segue no filtro de status (dropdown), não foi removido.

## v0.9.32 - 2026-07-11 (memória = o registro REAL das conversas + datas — como foi documentado)

A decisão documentada (`aquapark-commercial-memory.md`, textual: *"a memória de conversa efetiva da IA é o histórico real do WhatsApp — manter como fonte primária"*) não tinha sido portada. Agora está:

- **Ferramenta `conversation_history`** (memória primária): a IA lê o **registro real** das mensagens desta conversa de WhatsApp — quantas interações atrás precisar — **com data e hora**. É assim que ela lembra o que já foi tratado, se a pessoa **já é cliente**, o que ela já pediu, etc. Porte do `conversation_history` dos agentes do Aquapark.
- **Ferramenta `current_datetime`**: a IA sabe "hoje" (fuso America/Sao_Paulo) — pra raciocinar sobre prazos e sobre as datas do histórico ("você falou com a gente há 3 dias"). Porte do `current_datetime`.
- As duas entram no **assistente-exemplo** (`allowed_tools`) e o system prompt instrui a consultá-las. Aplica no assistente já criado (refresh `v3-memoria`). Sem `db push`.
- Continua valendo a injeção automática dos últimos turnos (v0.9.31) para continuidade imediata; o `conversation_history` é a leitura sob demanda, mais profunda e com datas — a **fonte primária** documentada. Os perfis de memória (chave-valor CONTACT/SESSION) seguem para **fatos estruturados** (ex.: "titular confirmado"), não para a transcrição.

## v0.9.31 - 2026-07-11 (assistente com MEMÓRIA da conversa — continuidade)

- **A raiz do "coloquei um CPF que não existe e ele não soube tratar": cada mensagem virava um run STATELESS.** O assistente esquecia o que já tinha sido dito (pediu CPF → recebeu CPF → mas já tinha "esquecido" o "estou sem internet" → voltava a cumprimentar). Agora o nó Assistente **carrega os turnos anteriores da conversa** (do chat de WhatsApp, via `scope_session=chat_id`) e injeta como histórico no assistente. Com contexto, ele: lembra do problema, chama a ferramenta de identificar quando o CPF chega e, se o CPF não existir, sabe responder "não localizei esse cadastro".
- Técnico: `AgentRunnerService.run` aceita `history[]` (semeia as mensagens antes do input); o nó AGENT carrega via `WhatsappInboxService.listMessages` (best-effort, tira a mensagem atual). `CommModule` passou a exportar o `WhatsappInboxService`. Sem `db push`.
- **Ainda pendente (frente aprovada):** IA assumir a conversa como **BOT** (filtro "IA" + "atendido pela IA") e **debounce** (agrupar mensagens picadas em uma resposta) — próximas.

## v0.9.30 - 2026-07-11 (assistente-exemplo: triar motivo → suporte identifica, venda não pede CPF)

- **O assistente conversava mas não conduzia.** Agora ele **entende o motivo do contato primeiro** e ramifica: (a) **assinante com suporte** (internet, fatura, contrato) → pede o CPF/CNPJ do titular para identificar e confirma antes de tratar dos dados; (b) **quem quer contratar / saber de planos** → é **VENDA**, **não** pede CPF, conduz como comercial (pergunta cidade/endereço e o que procura). A regra de ouro embutida: *nunca pedir CPF a quem só quer contratar*.
- Reforço via `system_prompt` directivo + roteiro estruturado reescrito (triagem cliente×venda) + persona com as regras. O texto que o fluxo manda ao assistente virou neutro ("atenda seguindo o seu roteiro") — antes o "responda de forma útil" fazia o modelo só cumprimentar.
- **Aplica no assistente JÁ criado:** o seed re-aplica o conteúdo (roteiro/persona/system_prompt) uma vez por versão (marcador `isp_example_content_v2-identifica`) no boot — sem o usuário reeditar, sem `db push`.

## v0.9.29 - 2026-07-11 (pente-fino: a automação por evento volta a FUNCIONAR + caça a erros silenciosos)

Auditoria do código inteiro, área por área. A "IA não respondia no WhatsApp" tinha DUAS causas reais (não era config) — as duas corrigidas:

**Por que nenhuma execução acontecia (evento→fluxo morto):**
- **Corrida no broker** (`bullmq.broker.ts`): `ensureConnection` marcava `connectAttempted` no topo, então a 2ª/3ª fila (EVENTS/NOTIFICATIONS) registravam com `available=false` (conexão ainda em voo) e **o consumidor da fila de eventos nunca era criado**. Worker de pé, Redis de pé, e mesmo assim ninguém consumia. Agora todos esperam a MESMA conexão; `process()` re-tenta criar o consumidor se o Redis ainda sobe no boot; falha de conexão libera a re-tentativa (não fica preso em fallback pra sempre).
- **Worker sem o nó Assistente** (`worker.module.ts`): o processo `iastudio-worker` (que roda a engine em produção) não importava `AiModule`/`IspModule` → o nó AGENT e as ferramentas não existiam lá → o fluxo chegava em "Assistente responde", caía em nó desconhecido e **seguia calado** mandando vazio. Corrigido o import.
- **Nó desconhecido agora FALHA a execução** (`workflow-engine`) em vez de "seguir pela saída padrão" — nunca mais mascara fluxo quebrado como concluído (aparece FAILED no monitor).

**Erros silenciosos caçados (a mesma classe que vinha mordendo):**
- Nó Assistente com aprovação-pendente / texto vazio / estouro de passos agora vai pra saída de **erro** (não manda mensagem em branco); estouro de `max_steps` virou ERRO.
- **Conexão de IA**: resolução por escopo exato não achava a OpenAI da org se o assistente estivesse em outro workspace/ambiente — agora cai pra org inteira.
- **Segredos**: decifração que falha (ENCRYPTION_KEY divergente pós-restore) não é mais engolida pra `{}` — propaga (evita o merge sobrescrever/apagar o segredo) e loga na view.
- **Permissões**: um blip do Postgres não tranca mais o usuário por 60s (não cacheia conjunto vazio quando a query falha).
- **Cron de sync WhatsApp** rodava em DOBRO (API + worker) — gated pra um processo só.
- **Front (dado errado plausível):** progresso de backup/restauração no console (lia `data.status` em vez de `data.operation`); dashboard consolidado com Execuções=NaN e custo/tokens zerados (shape aninhado); Dashboard/Minha Conta do cliente zerando plano/limites/consumo (envelope de licença achatado).

**UX (crítica do Robson):** publicar fluxo saiu de dentro de "Versões" — agora tem botão **Publicar/Despublicar** direto na barra do canvas (padrão Aquapark), com ícone de power.

**Pendências mapeadas (precisam de schema/`db push` ou frente própria):** IA assumir a conversa como atendente **BOT** (aparecer "atendido pela IA" + filtro "IA") — porte do `assignBot` do Aquapark; `@@unique` em `external_id` da mensagem + publicar evento sempre (dedup só no bus); `WHATSAPP_SEND` usar o envio inteligente (janela 24h/HSM); enforce de `action_permissions` do agente.

## v0.9.28 - 2026-07-11 (a IA responde no WhatsApp — fluxo + toggle)

Frente nova: o assistente de IA responde as mensagens do WhatsApp automaticamente. Porta a *lógica* do SDR do Aquapark num formato declarativo (o fluxo fica visível no canvas), sem clonar o SDR gigante. Sem mudança de schema (não precisa `db push`).

- **Fluxo semeado "IA responde no WhatsApp (exemplo)"** (por organização, junto do assistente-exemplo ISP): gatilho *mensagem recebida* → condição *ninguém humano atendendo* → **assistente responde** → **enviar WhatsApp** (texto = resposta do assistente). Nasce **DRAFT/desligado** e não ressuscita se apagado (marcador em `system_settings`). Marcado com a tag `ia-whatsapp`.
- **Gate humano como DADO:** o evento `whatsapp.inbound.message` passou a carregar `handler_type` (quem atende) e `contact_name`. A condição do fluxo (`{{input.handler_type}} != USER`) evita responder por cima de um atendente — o executor segue genérico (não conhece atendimento).
- **Toggle "Atendimento por IA"** (WhatsApp → Atendimento por IA): liga = publica o fluxo / desliga = despublica (novo `unpublish` no workflows service/controller, volta a DRAFT mantendo o fluxo visível — diferente de arquivar). Interruptor em linguagem do usuário, com confirmação ao ligar (os 5 patrasques) e explicação de quando a IA responde.
- **Decisões por regra:** nasce **OFF** (regra "todo automatismo nasce OFF" + IA agindo é alto risco — o Aquapark é ON, aqui é opt-in consciente); resposta em **texto livre** (o gatilho é um inbound → janela de 24h aberta, sem template HSM); usa o **nó de envio** (envia como sistema, sem pausa de aprovação) em vez da tool interna do agente.
- Novo item de menu + rota + breadcrumb `/whatsapp/atendimento-ia`; front acha o fluxo pela tag e publica/despublica.

## v0.9.27 - 2026-07-11 (painel de Atualização com o VISUAL do Aquapark: 2 modos)

- **Portado o visual do Aquapark (não só a lógica).** Robson apontou certo: a lógica veio de lá, o visual tinha que vir junto — eu tinha reusado uma caixa de log única pra tudo, então um upgrade **histórico** que falhou parecia um **alarme atual**. Agora são dois modos distintos, como no Aquapark:
  - **Enquanto roda:** caixa escura de console com o log ao vivo + "em execução…".
  - **Terminado (não rodando):** card calmo **"Último upgrade: vX → vY"** — ícone verde (SUCCESS) ou vermelho (FAILED), status, iniciado/concluído; se falhou, uma faixa vermelha discreta com a etapa. **Não** é mais a mesma caixa grande e alarmante.
- **Elemento novo (adição, não mudança de lógica):** dentro do card de resultado, um expander **"Ver log completo"** — mantém o diagnóstico sem poluir a tela. O service passou a trazer `from_version` e `finished_at` pro card.
- **Layout em 2 colunas (como o Aquapark):** "Versões disponíveis" e "Último upgrade" ficam **lado a lado** (`xl:grid-cols-2`), cada um em card próprio — em vez de empilhados na vertical, o que reduz a sobrecarga visual. Detalhe pequeno, impacto grande na leitura da tela.
- **Alinhamento fino ao Aquapark:** durante um upgrade em execução, a grade de versões **some** — fica só o console ao vivo no topo (sem poluir com a lista). E entrou o **Histórico de atualizações** colapsável no rodapé (from → to + data + badge de status), que o painel não tinha.

## v0.9.26 - 2026-07-11 (upgrade destravado: build da API + painel que PARA e MOSTRA a falha)

- **A CAUSA-RAIZ de "o upgrade não muda nada há tempo": a build da API vinha falhando calada.** Quando humanizei o editor de automação, criei o campo `type: 'agent'` no nó do Assistente (`agent.nodes.ts`) mas **nunca adicionei `'agent'` ao union `NodeFieldType`** (`node-registry.service.ts`). O `nest build` estourava `TS2322` — e como o `upgrade.sh` tem `set -euo pipefail` + `mark_failed` no passo `API_BUILD`, **todo upgrade abortava ali** (fail-safe: produção seguia na versão anterior). Corrigido: `'agent'` adicionado ao `NodeFieldType`.
- **O painel também lia o status do lugar errado — por isso a tela "sumia como se concluído".** O backend responde `{ upgrade, orphaned }`, mas o `getCurrentUpgrade` (console `services/system.js`) lia `data.status`/`data.log_lines` do **nível de cima** — sempre `undefined`. O painel **nunca** via RUNNING/SUCCESS/FAILED (status sempre `null`): não mostrava progresso, não recarregava no fim, não exibia falha. Corrigido conforme o Aquapark (que guarda o status em `.upgrade`): o service desembrulha `data.upgrade` e lê o órfão de `data.orphaned`.
- **Falha agora PARA e APARECE (padrão Aquapark):** o log passa a exibir também quando o upgrade terminou `FAILED`/`SUCCESS` (não só com linhas), e o estado `FAILED` mostra bloco vermelho explícito — "falhou na etapa X e foi interrompida; o sistema continua na versão anterior; revise o log e publique nova versão". Fim da falha silenciosa.
- Doc: regra de ouro reforçada — **antes de qualquer correção, olhar como o Aquapark faz** (prática obrigatória, não só em feature nova).

## v0.9.25 - 2026-07-11 (acesso ao /console corrigido + base amarrada na doc)

- **`studio.nivoo.dev.br/console` levava ao login do CLIENTE (bug de roteamento nginx).** A regra era `location /console/` (com barra final); `/console` **sem** a barra não casava e caía no `location /` → servia o painel do cliente. Adicionado redirect exato `location = /console { return 301 /console/; }` no `install.sh`. **Instalação existente não regenera o nginx sozinha** — aplicar o patch ao vivo no servidor (comando no handoff) + `nginx -t && systemctl reload nginx`.
- **Base do projeto amarrada na doc (porte do Aquapark):** `CLAUDE.md` ganhou **Pensar antes de codar** (checklist de 10 pontos), **Definição de pronto** e a regra **pós-compactação = re-ancorar antes de agir** (reler CLAUDE.md + topo do CHANGELOG e conferir estado real antes de agir; nunca cravar versão/arquivo de cabeça). `docs/base-doc-e-portes-aquapark.md` = mapa/backlog de porte. (Só doc + script — sem `db push`.)

## v0.9.24 - 2026-07-10 (o erro silencioso da versão + reload robusto)

- **A correção da versão da v0.9.23 caiu num erro silencioso.** O `vite.config` lia `readFileSync('../CHANGELOG.md')` com caminho **relativo ao diretório onde o build roda** — se esse caminho não batesse, o `try/catch` engolia a falha e caía calado no `package.json` (0.1.0). Resultado: a barra continuava em v0.1.0 mesmo com a v0.9.23 aplicada. Agora o caminho é resolvido a partir do **próprio arquivo** (`import.meta.url`), independente do diretório de build. (Exatamente o tipo de erro silencioso que vinha mascarando tudo: o upgrade concluía e recarregava, mas a barra presa em v0.1.0 fazia parecer que nada acontecia.)
- **Tela de Atualização: portado o padrão comprovado do Aquapark** em vez de remendar o meu. Polling **contínuo** (2s enquanto roda, 30s parado — nunca para) com `loadAll` buscando versão + status juntos, cada um com `catch`: durante o restart do backend a API cai, os fetches viram null, o estado anterior é preservado, e quando a API volta com SUCCESS o próximo ciclo detecta a transição e recarrega. O meu iniciava/parava o polling — era aí que se perdia o momento do SUCCESS e a tela "sumia como se tivesse concluído". Removido o banner "reiniciando" e o estado `restarting` (o polling contínuo já cobre).

## v0.9.23 - 2026-07-10 (versão real na barra + excluir fluxo de verdade)

- **A versão exibida na barra lateral estava presa em `v0.1.0`.** O `__APP_VERSION__` (barra lateral dos dois painéis) lia a versão do `package.json`, que nunca foi atualizado de `0.1.0`. Ou seja: por mais que você aplicasse v0.9.x, a barra sempre mostrava v0.1.0 — não dava para saber se o painel tinha atualizado (o backend mostrava a versão certa; só o rótulo da barra mentia). Agora o `vite.config` lê a versão real do **CHANGELOG.md** (a fonte da verdade do release; no build o repositório já está na tag certa), com fallback para o package.json. Vale para o painel do cliente e o console.
- **Fluxo só podia ser arquivado, nunca excluído.** Um rascunho que nunca rodou virava lixo permanente na tela — "arquivar" faz sentido para coisas com histórico, mas para um fluxo descartável é dogma sem visão de negócio. Adicionado **Excluir de verdade** (ícone lixeira, ao lado de Arquivar): `DELETE /automation/workflows/:id` apaga o fluxo e tudo que é dele (execuções, logs, versões, agendamento) numa transação — se qualquer passo falhar, nada é apagado. ConfirmDialog com aviso de que é permanente. Arquivar continua existindo para quem quer só tirar das listas ativas sem perder o histórico.

## v0.9.22 - 2026-07-10 (editor de automação humanizado + 3 buracos corrigidos)

O pente-fino anterior não cobriu o editor de fluxos — que estava cheio de jargão de desenvolvedor na cara. Corrigido, e no caminho apareceram dois buracos funcionais reais.

**Bugs funcionais (não só texto):**
- **O card do nó mostrava o tipo técnico cru** (`AGENT`, `TRIGGER_EVENT`, `WHATSAPP_SEND`) em fonte monoespaçada abaixo do nome, e o inspetor mostrava `agent_2 · AGENT`. Removido — o card agora mostra a descrição amigável; o tipo é exclusivamente interno.
- **O campo "Assistente" do nó de IA estava VAZIO** — não dava para escolher o assistente no fluxo. O inspetor carregava conexões e templates, mas nunca os assistentes. Corrigido: novo tipo de campo `agent` + carga dos assistentes no inspetor.
- **O campo de evento do gatilho era texto livre** que exigia digitar `whatsapp.inbound.message` exatamente — virou um **select** com rótulos humanos ("Nova mensagem de WhatsApp chegou") e o valor real por baixo, tanto no nó quanto no gatilho do fluxo.

**Linguagem (todos os 13 nós + editor):** rótulos e descrições reescritos sem jargão — "Event Bus"→"algo acontece na plataforma", "Meta/Email Orchestrator"→"envia WhatsApp/e-mail", "loop de raciocínio + ferramentas"→"responde ou executa uma tarefa", "Requisição HTTP"→"Chamar sistema externo", "Publicar evento"→"Anunciar acontecimento", "Renderizar template"→"Montar mensagem de um modelo", "Timeout/Headers/Payload"→"Tempo limite/Cabeçalhos/Dados". "Agente de IA"→**Assistente de IA** (nó, paleta, card, inspetor). "Rollback/diff/imutável" e sintaxe crua de variável (`{{vars.passo_1.status}}`) trocados por linguagem de negócio. Grupo "IA" entrou na ordem oficial da paleta.

## v0.9.21 - 2026-07-10 (tela de Atualização sem pânico + pente-fino passada 2)

- **Tela de Atualização não entra mais em pânico durante o restart.** Ao aplicar um upgrade, o backend reinicia e a API cai por 1–2 min — o polling antes disparava um `toast.error` vermelho a cada 2s, parecendo falha. Agora, durante um upgrade em curso, a falha de rede é tratada como **esperada**: mostra um aviso azul calmo ("Aplicando a atualização e reiniciando os serviços… a página recarrega sozinha") e segue tentando em silêncio. Quando a API volta com status SUCCESS, **recarrega a página sozinha**. Fora de um upgrade, erro de rede continua sendo erro.
- **Pente-fino passada 2:** Aprovações ("execução do agente"→"o assistente"), Auditoria (placeholders "user.create"/"User"→"Filtrar por ação"/"item afetado"), Execuções ("trace_id"→"Código de rastreio"), assistente de conexão (hint "Provider → Instância nomeada"→"nome para identificar esta conexão"), Custos (campo "YYYY-MM"→seletor de mês nativo).

## v0.9.20 - 2026-07-10 (pente-fino de UX, passada 1)

Auditoria de linguagem tela a tela (regra máxima: língua do usuário, nunca do desenvolvedor). Confirmado limpo: nenhum `confirm()/alert()` nativo, nenhum banner de erro de submit inline. Corrigido nesta passada (só texto visível — sem mudança de comportamento):

- **Nomenclatura padronizada:** "agente"→**assistente** e "ferramenta"/"tool"→**habilidade** em títulos, botões, toasts, tooltips, colunas e empty states (Assistentes, Habilidades, Custos, Memória, Conhecimento, Pendências, Versões, Incidentes; e no console: Consumo, Dashboard). Antes o produto só tinha renomeado os títulos.
- **Chaves cruas escondidas:** `provider_key` na coluna "Conector" agora mostra o nome amigável do conector (via marketplace, com fallback prettificado) em vez de `whatsapp-meta`; tooltip de permissão em Perfis não expõe mais a chave `core.users.read`.
- **Jargão fora:** "Tokens no mês"→**Consumo de IA** (Dashboard/Console), "Builtin"/"Custom"→**Da plataforma**/**Personalizada**, "Último health"→**Última verificação**, "health check" removido, "Rollback"→**Reverter**, "Timeout (ms)"→**Tempo limite (ms)**, "Provider"→**Provedor**.
- Áreas genuinamente técnicas (Desenvolvedor, API Keys, editor de fluxos avançado, JSON Schema de habilidade custom, MCP endpoint) mantidas — público técnico. Ficam mapeadas para passadas futuras se necessário.

## v0.9.19 - 2026-07-09 (menu humano + perfis com rótulos legíveis)

- **Bug: a tela de Perfis mostrava a chave crua da permissão (`core.users.read`) num balaio único "permissions 10/83".** O backend sempre mandou grupos + rótulos humanos (`{permissions, groups, labels}`), mas o `normalizeCatalog` do front não tratava esse formato — caía no fallback e imprimia a chave. Corrigido: agora renderiza os grupos ("Usuários e Acessos", "IA"…) com os rótulos humanos ("Ver usuários", "Conceder à IA ações que gravam dados"). As 83 permissões já tinham label no backend. Exemplo clássico de tela feita para desenvolvedor virando tela para usuário.
- **Menu de IA na língua do usuário (fatia 5).** Grupo "IA" → **IA Studio**; itens: Agentes→**Assistentes**, Bases de Conhecimento→**Conhecimento**, Ferramentas→**Habilidades**, Aprovações→**Pendências** (Memória e Custos mantidos). Só rótulos — as rotas `/ia/*` (internas, invisíveis) ficam iguais, sem risco de navegação. Breadcrumbs de `/ia/*` adicionados (não existiam). Títulos e textos das páginas atualizados para casar com o menu ("Assistentes", "Novo assistente", empty states).

## v0.9.18 - 2026-07-09 (anti-escalada nas ações da IA)

- **Trava anti-escalada nas ferramentas que gravam dados (fatia 3).** Marcar uma habilidade **"grava dados"** (`abrir_os`, `desbloqueio_confianca` — as `requires_approval`) num assistente passou a exigir a nova permissão `ai.agents.actions` ("Conceder à IA ações que gravam dados"). Sem ela, o operador só concede habilidades de **consulta** — no backend (rejeita no save de create/update/import, `ForbiddenException` com mensagem clara) **e** no front (checkbox desabilitado com o motivo). Ninguém eleva o poder da IA além do próprio. No runtime, a ação ainda passa por aprovação humana (`requires_approval`) — são duas travas em série.
- **Descoberta honesta:** `AiAgent.action_permissions` (campo herdado do conceito do Aquapark) **nunca foi lido em execução** no IA Studio — construir só a UI dele seria decorativo. Em vez disso, a lógica "operador autoriza o que a IA pode, sem conceder além do próprio poder" foi aplicada onde o IA Studio de fato controla: o grant das ferramentas. Perm nova seguiu os 5 passos do ACL (constante + grupo IA + label + Administrador herda via `ALL_PERMISSIONS`; fora dos demais perfis por ser opt-in).

## v0.9.17 - 2026-07-09 (exemplo já nasce quebrado em passos)

- **Assistente-exemplo ISP já nasce quebrado em passos.** O exemplo passou a ser semeado com o `roteiro` estruturado (objetivo + 3 passos + 3 situações), não mais com prompt cru — ao abrir "O que faz" você vê a lógica em caixinhas, sem precisar quebrar à mão. Backfill único no seed preenche o roteiro do exemplo já criado por versão anterior (só se estiver vazio — nunca sobrescreve edição sua).

## v0.9.16 - 2026-07-09 ("O que faz": roteiro em vez de prompt)

- **"O que faz" virou roteiro estruturado (fatia 2).** Em vez de um textão de prompt, o usuário monta **Objetivo + Passos (na ordem, reordenáveis) + Situações (Quando… faça…)** — descreve o assistente como instruiria um funcionário novo. Nova coluna `AiAgent.roteiro Json?` (`{objetivo, passos[], situacoes[]}`); compilador puro `agent-roteiro.ts` (espelha `agent-persona.ts`) injeta no system prompt como `## Objetivo / ## Passos / ## Situações`. A fonte da verdade é a estrutura; o texto é derivado. O `goal` legado é herdado pelo `objetivo` (migração suave, sem duplicar campo). O **prompt cru** saiu da vista: virou "Instruções adicionais (avançado)" em Ajustes avançados. Roteiro entra no snapshot de versão e no export/import. `db push` adiciona coluna nullable — **não destrutivo**.

## v0.9.15 - 2026-07-09 (editor do assistente na língua do usuário)

- **Editor do assistente na língua do usuário (fatia 1).** As oito abas técnicas (Geral/Persona/Prompt/Ferramentas/Conhecimento/Memória/Guardrails/Custos) viraram humanas: **Visão geral** (checklist "pronto para publicar?"), **Quem é**, **O que faz**, **O que sabe**, **O que pode fazer**, **Quem atende**, **Testar**, **Ajustes avançados**. Todo o jargão (conexão, modelo, temperatura, tokens, limites) foi para "Ajustes avançados"; as ferramentas aparecem pelo nome com marca "grava dados" nas de escrita, não mais por `tool.key`. **Só frontend** — nenhuma mudança no salvamento nem no schema. Nova regra máxima no CLAUDE.md: superfície sempre na língua do usuário, nunca do desenvolvedor.
- Nota de versão deixou de repetir em cada aba — agora aparece uma vez, na Visão geral.

## v0.9.14 - 2026-07-09 (assistente-exemplo ISP no painel)

- **Assistente "Atendimento (exemplo ISP)" nasce pronto no painel.** Seed idempotente (`isp-example-assistant.seed.ts`) que cria um `AiAgent` real — editável e removível — para você ver a lógica montada. Nasce **só** em organização que já tem uma conexão ISP ativa (Altarede/IXC), no mesmo workspace/ambiente da conexão. Modo **leitura**: `allowed_tools` traz as seis consultas (identificar/contrato/débitos/conexão/região/2ª via) e **não** inclui `abrir_os` nem `desbloqueio_confianca`. O fluxo "pede CPF → confirma nome → atende" vive no `system_prompt` por ora (a Frente B o torna estrutural + com gate). Marca-se como semeado em `system_settings` → **não ressuscita** se você apagar. Vem com modelo `gpt-4o-mini` e a conexão de IA da org (se houver só uma) — a descrição avisa para revisar modelo/conexão antes de usar.

## v0.9.13 - 2026-07-09 (agente ISP em leitura + o agente sabe com quem fala)

### Frente A — o agente passa a saber com quem fala

- **O nó AGENT não propagava `scope_keys`.** `AgentRunnerService` e `ToolExecutionContext` já previam o campo; ninguém o preenchia. Ou seja: o agente nunca soube o telefone de quem estava falando, e a memória de contato/sessão caía no fallback do `agent_run_id` (memória nova a cada mensagem). Agora o nó expõe dois campos de template — **Identificação do contato** (`{{input.phone}}`) e **Identificação da conversa** (`{{input.chat_id}}`) — visíveis e editáveis no canvas.
- **`resume()` perdia o escopo.** Um run pausado por aprovação retomava com `scopeKeys: {}` — e a retomada é exatamente o caminho das ações destrutivas (`desbloqueio_confianca`). A ação aprovada seria a única a rodar sem saber com quem falava. Novo campo `AiAgentRun.scope_keys Json?` persiste o escopo; `resume()` o recupera. (`db push` adiciona coluna nullable — **não destrutivo**.)

### Agente ISP em modo leitura

- **`identificar_cliente` aceita telefone.** Quem chega pelo WhatsApp traz o número, não o CPF — a tool só sabia buscar por CPF, então o agente não conseguia identificar com quem falava. Agora aceita `cpf` **ou** `telefone` (inclusive `5527999998888`, como a Meta entrega) e usa `cliente.por_telefone`. O Altarede, que não busca por telefone, responde com uma mensagem útil em vez de despejar o catálogo de operações.
- **Nova tool `consultar_contrato` (leitura).** Mostra o plano e o `status_internet` — ou seja, se o acesso está **bloqueado por inadimplência**. Sem ela o agente via "offline" e sugeria ordem de serviço técnica para um problema financeiro.
- **Tools ISP passaram a projetar a saída (`isp-projections.ts`).** O ERP devolve a linha inteira da tabela: o `cliente` do IXC tem ~150 colunas (`crm_data_sondagem`, `emp_remuneracao`, `ref_pes_fone2`...). Isso ia todo para o contexto do modelo — milhares de tokens de ruído por chamada, e cada campo é algo a mais que o LLM pode repetir ao cliente. A redação no provider tira o **perigoso** (senhas); a projeção tira o **irrelevante**. O provider segue devolvendo a linha crua para workflows e `ixc.listar`; quem estreita é a tool, que é a fronteira com o modelo.
- Modo leitura não exigiu código: `AiAgent.allowed_tools` é uma lista — basta não incluir `abrir_os` nem `desbloqueio_confianca`. O gate de aprovação do `ToolRuntimeService` segue como segunda trava.

### Outros

- Doc: como conferir o efeito do desbloqueio de confiança no IXC — `dt_ult_ativacao` (data de hoje) e `nao_bloquear_ate` (o prazo). **Não** `desbloqueio_confianca_ativo` nem `dt_ult_des_bloq_conf`: parecem os campos certos pelo nome, e ficam inalterados após um desbloqueio bem-sucedido. Verificado em base real (contrato bloqueado em 03/07, desbloqueado por 5 dias em 09/07).

## v0.9.12 - 2026-07-09 (boletos abertos, telefone e desbloqueio corretos)

- **"Boleto em aberto" não é `status = 'A'` (IXC).** O exemplo oficial "Listar boletos abertos" filtra `liberado = 'S'` **e** `status != 'C'` (cancelado) **e** `status != 'R'` (recebido). Meu filtro por `status = 'A'` perdia títulos abertos noutro estado (renegociado, em cobrança) e incluía títulos **não liberados** — o cliente veria dívida a menos, ou receberia cobrança de um boleto que o provedor não liberou. Afeta `consultar_debitos`, `segunda_via_boleto` e `financeiro.boleto_base64`.
- **Nova operação `cliente.por_telefone` (IXC).** O telefone do cliente mora em `telefone_celular`, `whatsapp`, `fone` e `telefone_comercial`, e o IXC não tem `OR` — a busca tenta coluna a coluna. Trata o número do WhatsApp (DDI 55, sem máscara) e a máscara do IXC (`(27) 99947-2853`). É a porta de entrada do atendimento: quem manda mensagem não digita CPF. Sem equivalente no Altarede, então **não** virou tool do agente ainda.
- **`desbloqueio_confianca` era chamado errado.** O exemplo oficial em PHP usa `$api->get('desbloqueio_confianca', ['id' => <id_contrato>])` — e o `get()` do `WebserviceClient` é o **modo listar** (header `ixcsoft: listar`). O provider chamava como insert (`POST` sem header). Corrigido com `callListar()`. O `id` é mesmo o id do contrato. (`desbloqueio_confianca` é também o nome de uma coluna de `cliente_contrato`; quem indica o estado é `desbloqueio_confianca_ativo`.)
- **`desbloqueio_confianca` sem fallback.** Acabou o "se nenhum contrato estiver ativo, usa o primeiro" — desbloquear o contrato errado é pior que não desbloquear. Agora exige exatamente um contrato ativo (`status = 'A'`) e falha alto nos demais casos. Verificação obrigatória no IXC: `desbloqueio_confianca_ativo` deve virar `'S'`.
- **`os.cadastrar` não abria OS no IXC.** A API recusava com `Preencha Filial<br />Preencha Setor` — dois campos que a collection oficial mostra vazios e que eu não enviava. Agora `setor` é obrigatório (é decisão de operação; vem do Descobrir recursos) e `id_filial` sai do cadastro do cliente (`cliente.filial_id`), com override opcional. Ambos entraram no schema da tool `abrir_os`, senão o agente tomaria 400 sem saber por quê. Notável: **foi o primeiro erro alto do IXC** em toda a integração.

## v0.9.10 - 2026-07-09 (o `rp` do IXC também trunca calado)

- **Paginação de verdade nas consultas de escopo (IXC).** `rp: 1000` trunca em silêncio: um bairro com 1200 clientes devolvia 1000 e nenhum aviso. `listAll()` percorre as páginas até vir menos que uma página cheia, com teto de 20 páginas (avisa no log ao bater). O CENTRO, com 768 clientes, passava raspando.
- **O lote que busca nome/telefone dos afetados usava um `IN` longo.** Com os 497 logins do CENTRO ele voltaria vazio: o incidente sairia sem nome e sem telefone, e o disparo proativo notificaria ninguém com aparência de sucesso. Agora vai em lotes de 100, como o resto.

## v0.9.9 - 2026-07-09 (o `IN` do IXC falha calado)

- **`IN` com muitos ids devolve lista vazia, sem erro (IXC).** A união geográfica da v0.9.8 montava um `IN` com os ~768 ids de clientes do bairro numa string única. O IXC não recusa: responde `registros: []`. Resultado: `herdados` vazio, união sem efeito, e o `bairro` continuava devolvendo os mesmos 38 logins de endereço próprio — um número plausível, produzido por uma falha silenciosa. Agora o `IN` vai em **lotes de 100** (`IN_CHUNK_SIZE`). Confirmado que `grid_param` e `financeiro.boleto_aberto_todos` estavam corretos — o culpado era só o tamanho da lista.
- IXC: `segunda_via_boleto` com `formato: "linha"` devolve `linha_digitavel` **e** `gateway_link` (link do boleto no gateway). **Não há PIX copia-e-cola** em `fn_areceber` (o `pix_txid` vem vazio) — a descrição da tool prometia algo que o IXC não entrega.

## v0.9.8 - 2026-07-09 (escopo geográfico correto no IXC)

- **Escopo geográfico contava só uma fração dos afetados (IXC).** `radusuarios.bairro`/`cidade` só vêm preenchidos quando o login tem endereço **próprio** (`endereco_padrao_cliente = 'N'`); a maioria herda o endereço do cliente e deixa esses campos vazios (`cidade = "0"`). Filtrar por bairro devolvia apenas os logins de endereço próprio — num incidente, notificaria uma fração dos afetados **sem sinal de erro**, com um número plausível. Agora `conectividade.listar_com_status` une duas fontes: `radusuarios` (endereço próprio) + `cliente` (endereço de cadastro, restrito aos logins com `endereco_padrao_cliente = 'S'`), já que o IXC não tem operador `OR`. A resolução dos logins saiu para `resolveLogins()` — `conectividade` estava respondendo três perguntas.
- IXC: `cidade` entrou em `ZERO_MEANS_UNSET` (`"0"` é "não configurado", casaria com a base toda).
- Confirmado contra base real: `id_porta_pon` (atalho de 1 requisição, via `radusuarios.interface_transmissao`) devolve **exatamente** a mesma lista que `porta_pon` (2 requisições, via `radpop_radio_cliente_fibra.ponid`) — 106 logins idênticos na PON `0/1/1`.

## v0.9.7 - 2026-07-09 (redação de senhas + escopo de rede)

- **Vazamento de senha do cliente para o LLM (IXC).** A tabela `cliente` do IXC devolve `senha` (senha da central do assinante) em texto claro, e `radusuarios` devolve a senha PPPoE e as do roteador/Wi-Fi. Essas linhas iam inteiras para a tool `identificar_cliente` — ou seja, para o contexto do modelo, que poderia repeti-las ao próprio cliente no WhatsApp. Agora `IxcProvider.list()` redige todo campo cujo nome case com `senha|password|secret|token|api_key`, no ponto único por onde toda leitura passa (adicionar operação nova não reintroduz o vazamento).
- IXC: `cnpj_cpf` sem máscara é o caso comum. A ordem de tentativa passou a ser valor-como-veio → só-dígitos → mascarado (antes começava pelo mascarado e gastava uma requisição em toda busca).
- ISP: `IspConnectivityService` agora usa o booleano `online` quando o provider o fornece, em vez de reinferir o estado com regex sobre o rótulo de texto. Funcionava por coincidência (`/online/i` não casa com `"Offline"`) — traduzir o rótulo inverteria a contagem de offline em silêncio.
- **Escopo de incidente por topologia, não por geografia.** `SCOPE_KEYS` ganhou `porta_pon` e `vlan`, e `id_slot` deixou de ser ignorado no IXC. Falha de rede afeta uma PON/CTO/OLT inteira, não um bairro — vizinhos de rua podem estar em PONs distintas. A descrição da tool `status_regiao` agora ordena a precisão (`porta_pon > id_cto > id_olt > vlan > bairro`) e avisa que `interface_concentrador` só discrimina clientes quando há uma interface por VLAN. - **Escopo PON: consulta em dois estágios (IXC).** A topologia PON **não** está em `radusuarios` (`id_porta_transmissor` vale `"0"` em toda a base; `interface_transmissao_fibra` nem existe na leitura) — está em `radpop_radio_cliente_fibra`, ligada por `id_login`. `conectividade.listar_com_status` agora filtra a tabela de fibra (`ponid`/`slotno`/`ponno`/`porta_ftth`), colhe os `id_login` e só então busca os logins (`radusuarios.id IN`). Novas chaves canônicas: `porta_pon` (o `ponid`, uma **string** `frame/slot/pon` como `"0/1/1"`), `numero_pon`, `porta_cto` e `id_porta_pon`. Esta última é o atalho de uma requisição só: `radusuarios.interface_transmissao` guarda o mesmo valor que `radpop_radio_cliente_fibra.id_radpop_radio_porta` (ambos `42` no login conferido).
- **Guarda contra incidente de escopo total (IXC).** Filtro de escopo com valor `"0"` (o `"não configurado"` do IXC) casaria com **todos** os logins. Como o escopo do incidente vira a lista do disparo proativo em massa por WhatsApp, a consulta agora recusa `"0"` — **por chave**, não universalmente: slot 0 e PON 0 existem de verdade e continuam válidos.

## v0.9.6 - 2026-07-09 (IXC conferido contra as collections oficiais)

- IXC: rótulo errado no Descobrir recursos. O IXC devolve `""` (string vazia) nos campos não preenchidos e o fallback usava `??`, que só pula `null`/`undefined` — planos sem `descricao` apareciam em branco. Pior: a ordem de preferência era global, então planos mostravam `descricao` (código interno, ex. `2MG(Outros)`) em vez do `nome` que o operador vê na tela do IXC (`AGUARDANDO5`). Agora a ordem de rótulos é **por tabela** (`vd_contratos` → `nome`; `su_oss_assunto` → `assunto`; `su_oss_setor` → `setor`) e ignora string vazia, caindo em `(sem nome) #id`.
- Conexões: o **id da conexão** não aparecia em lugar nenhum da UI. Agora está no modal de detalhe (clique na linha), com botão de copiar — é ele que vai nas chamadas de API e ao fixar a conexão em tools/fluxos.
- IXC, correções a partir das collections oficiais da API (`radusuarios`, `fn_areceber`, `cliente_contrato`, `su_oss_chamado`):
  - `radusuarios.online` vale **`'SS'`**, não `'S'` — o `isYes` comparava por igualdade estrita e leria **toda** conexão como offline (o `status_regiao` reportaria 100% offline). Agora aceita qualquer valor iniciado por `S`.
  - `ip_concentrador` e `interface` **existem** em `radusuarios` — a doc dizia que não tinham equivalente e os dois filtros de escopo eram descartados silenciosamente. Mapeados. Só `id_slot` segue sem equivalente.
  - `os.cadastrar` passou a enviar os defaults documentados (`tipo`, `prioridade`, `melhor_horario_agenda`) e aceita `id_login` para vincular a OS ao login do cliente.

## v0.9.5 - 2026-07-08 (Schema Discovery ligado)

- **"Descobrir recursos" nunca existiu.** O `IProvider.discover()` estava implementado em todos os providers e declarado na interface desde a Fase 2, mas **nenhum endpoint e nenhuma tela jamais o chamavam** — era código morto. Agora: `POST /integration/connections/:id/discover` (perm `integrations.connections.read`, read-only, grava só `last_sync_at` + `IntegrationLog`) e a ação **Descobrir recursos** (ícone bússola) na tela de Conexões, com modal agrupado por tipo e botão de copiar id. É por aí que se obtém o `id_assunto` que o `abrir_os` do IXC exige.

## v0.9.4 - 2026-07-08 (card de backups retidos)

- **Card "Backups retidos" mostrava 0 fixo.** O endpoint `GET /console/system/version` nunca devolveu `backups_retained` — o Console fazia `?? 0` sobre um campo inexistente, então o número era zero mesmo com backups em disco. Agora o controller compõe a resposta com `BackupService.count()` (dumps `.sql.gz` da rotação do upgrade + pacotes `.tar.gz` de migração).

## v0.9.3 - 2026-07-08 (a tela de Atualização enxerga versões novas)

- **Tela de Atualização não via versões novas.** O `VersionService` rodava `git tag --list` no clone de `/opt/iastudio` sem nunca fazer `git fetch` — a instância só enxergava as tags que existiam no momento da instalação e dizia "Instância atualizada" para sempre. Agora faz `git fetch --tags --force` (best-effort, timeout de 20s) antes de listar; se o fetch falhar, cai nas tags locais e a tela mostra um aviso de "repositório remoto inacessível" (`remote_synced: false`) em vez de mentir. Botão **Verificar agora** (`GET /console/system/version?force=1`) ignora o cache de 5 min.
- Nota: como a v0.9.1 e a v0.9.2 não têm esse fetch, a primeira aparição de uma tag nova nessas versões exige um `git fetch --tags` manual no servidor (ou passa a funcionar sozinha após o primeiro upgrade, já que o `upgrade.sh` faz fetch na fase `GIT_FETCH`).

## v0.9.2 - 2026-07-08 (WhatsApp em produção + port do Aquapark + ERP IXC Soft)

### WhatsApp (Meta Cloud API) — primeiro fluxo ponta a ponta em produção

- **Causa-raiz do webhook mudo:** a WABA não estava inscrita no app (`subscribed_apps`). O `connect()` do `WhatsappMetaProvider` agora chama `subscribeAppToWaba` (best-effort) — nenhuma conexão nova nasce sem receber inbound.
- **Envio de mídia por upload real do aparelho:** `uploadMedia` no `meta-graph.client.ts` (FormData/Blob nativos, limites da Meta por tipo), `POST /comm/whatsapp/chats/:id/media/upload` (multipart) e `WhatsappInboxService.uploadAndSendMedia` — passa pela **mesma porta** do `/send` (reply gate + janela de 24h + takeover 409).
- **UX portada do Aquapark:** `MessageComposer` (menu de anexo, gravação de áudio com pausa/retomar/preview/regravar, troca enviar↔microfone), `AudioPlayer` próprio (resolve duração de opus/blob da Meta, que o `<audio>` nativo não consegue), cores oficiais do WhatsApp nos balões/fundo/ticks, avatares e **badges de contagem** por aba (`GET /comm/whatsapp/chats/counts`).

### Conexões e wizard

- Wizard não fecha mais ao clicar fora (`dismissable={false}`) e bloqueia **autofill do navegador** em campos de segredo (`autoComplete="new-password"` + `data-1p-ignore`/`data-lpignore`) — o gerenciador de senhas preenchia WABA ID e Access Token.
- Campo `generatable` com botões **Gerar** e **Copiar** (verify token) + caixa com a **URL do webhook** pronta pra colar na Meta.
- **Editar conexão** (antes só criar): `PATCH` com merge raso de config e atualização só das chaves de segredo preenchidas.
- `/auth/me` passou a devolver os **ambientes** do workspace (o seletor do topo ficava vazio e travava o wizard em "Selecione workspace e ambiente").

### IA Studio e Automação — port do Aquapark

- `FluxoCanvas` reescrito com a UX do Aquapark (paleta agrupada por categoria e colapsável, inspetor inline, nó customizado, auto-centralização) mantendo o motor **declarativo** do IA Studio: catálogo vem do `getNodesCatalog()`, grafo persistido é a fonte da verdade.
- Editor de assistente (persona guiada + aba "Testar" embutida), tela de Ferramentas com governança (`is_active`/`timeout_ms`/`requires_approval`) e Bases de Conhecimento.

### ERP IXC Soft (novo provider)

- `IxcProvider` (`integration/registry/providers/ixc.provider.ts` + `ixc.helpers.ts`) — segundo ERP de provedor. A API do IXC é CRUD sobre tabelas (`/webservice/v1/<tabela>`), Basic auth com token `id:chave`, header `ixcsoft: listar` nas listagens. Wizard: URL do IXC + token (validado no formato). `health()` distingue token recusado de IP fora das "Redes permitidas". `discover()` traz setores, assuntos de OS e planos.
- **Solução ISP virou multi-ERP:** Altarede e IXC implementam o **mesmo contrato canônico** de operações (`cliente.dados`, `financeiro.*`, `conectividade.listar_com_status`, `os.cadastrar`…), cada um traduzindo pra sua API. `IspConnectionResolver` resolve qualquer conexão de ERP ativa (`ISP_ERP_PROVIDER_KEYS`), com pin opcional por `erp`/`filial`/`connection_id`. **Nenhuma tool do agente mudou** — trocar de ERP é trocar a conexão.
- Limitações assumidas do IXC (documentadas no README do módulo ISP): sem envio de boleto por e-mail; filtros de escopo `ip_concentrador`/`interface_concentrador`/`id_slot` sem equivalente; `abrir_os` exige `id_assunto` (vem do Descobrir recursos).

### Correções

- `whatsapp-inbox.controller.ts`: erro de build no union `Multipart` (`MultipartFile | MultipartValue`) ao ler campos do formulário.

## v0.9.1 - 2026-07-04 (primeiro deploy em produção + correções)

Primeira instalação real (Debian 13, `studio.nivoo.dev.br`) e a rodada de ajustes de primeiro-deploy:

- **Scripts:** `install.sh` detecta a porta real do cluster PostgreSQL (não assume 5432) e restaura `/etc/nginx/nginx.conf` ausente (conffile removido por purge anterior). `SEED_DEMO` gate (produção sem org Demo). Endpoint público `GET /api/v1/health`. Console com `basename` (serve em `/console/` no modo single).
- **Build (gate no servidor):** correções de tipo que só apareceram no `nest build` real — `@fastify/multipart` cast; `ResourceMapping.connection_id` `String?`→`String @default("")` (não pode ser nullable em `@@unique`) + sentinela `''` no service/seed/repo; `bullmq` connection cast (skew de ioredis).
- **Login:** os dois painéis liam `data.token`, mas o backend retorna `access_token` — corrigido (o login não funcionava).
- **Console:** rotas corrigidas — `console/plans` e `console/licenses` (antes `console/licensing/*`, davam 404); endpoint `GET /console/usage` (consumo global) criado; **licença agora resolvida por organização** (o Console passa o org_id, não o license_id) — a aba Licença carrega e os botões de ação renderizam.
- **Console — Usuários do cliente (novo):** aba "Usuários" no detalhe do cliente para o operador editar nome/e-mail e **resetar a senha** de um usuário do tenant (reset revoga sessões).
- **UX:** sidebar do Painel do Cliente vira accordion de um grupo só (abre um, fecha o outro) em vez de tudo aberto.

## v0.9.0 - 2026-07-03 (Fases 3-8)

> ⚠️ **Fases 5-8 ainda sem verificação estática executada** (`prisma generate` + `tsc --noEmit` + `vite build`): o mount do workspace↔sandbox não serviu conteúdo de arquivos nesta sessão, impedindo o build. Código escrito e revisado estaticamente (seams de integração conferidos), mas o gate de 0 erros roda no servidor via `scripts/install.sh` (primeira instalação) ou `scripts/upgrade.sh` (atualização). `db push` das Fases 5-8 é destrutivo; a Fase 5 exige `CREATE EXTENSION IF NOT EXISTS vector;` (o `install.sh` já cria); a Fase 7 exige envs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_OAUTH_REDIRECT` (Gmail OAuth).

- Fase 8 (FINAL): Instalação, Atualização, Backup e Dashboards (modelo Aquapark; deploy SaaS `/opt/iastudio`, PM2 `iastudio-api`+`iastudio-worker`):
  - `scripts/` (padrão Aquapark, **wizard interativo**): `install.sh` — menu interativo (modo single/multi, domínios, SSL Let's Encrypt, nome/e-mail/senha do admin, org Demo s/N, keep-deps/keep-db) que instala Node 20, PM2, PostgreSQL+pgvector, Redis, Nginx, Certbot; gera `.env` (segredos aleatórios + `PLATFORM_ADMIN_EMAIL/PASSWORD` + `SEED_DEMO` + `GOOGLE_*`); `db push`; build api+admin+console; PM2 `iastudio-api`+`iastudio-worker`; seed verificado (aguarda a API e aborta se o admin não existir em `core_users`); Nginx (single: painel em `/`, Console em `/console/`, API em `/api`; multi: 3 domínios) + SSL. `uninstall.sh` — wizard (PURGE/keep-deps/keep-db/keep-all, confirma com `REMOVER`). `upgrade.sh <tag> <id>` — args posicionais (como o `SystemService` chama), 13 fases com log por fase em `system_upgrades.log_lines` (String[] via `array_append`), backup antes de tudo, rebuild dos 3 apps, `pm2 restart`; falha = fica na versão anterior. `backup-full.sh`/`restore-full.sh` (pacote db+storage+manifest; restore via systemd-run), `restore-backup.sh` (só banco), `ecosystem.config.js`. Backups em `/opt/iastudio-backups` (mesma pasta que o Console lê). Build sempre no servidor.
  - Extras de deploy: endpoint público `GET /api/v1/health` (nginx/monitoramento/install); gate `SEED_DEMO` no seed (produção não cria org Demo); Console com `basename={import.meta.env.BASE_URL}` (permite servir em `/console/` no modo single).
  - Schema `system_*`: `SystemUpgrade` (`system_upgrades`) e `SystemRestore` (`system_restores`) — infra global (sem tenant).
  - Módulo `system/` (`@PlatformAdminOnly() /console/system/*`): versão atual + tags disponíveis (cache 5min), `POST upgrade` (spawn detached de `upgrade.sh` + polling do log ao vivo), lock órfão liberável, backups (gerar/listar/baixar-stream/subir-multipart/excluir/restaurar) com guard anti path-traversal e 1 operação por vez, tudo auditado. `@fastify/multipart` adicionado.
  - Dashboards (`dashboards/`, diretriz 34 — só agregações): `GET /console/dashboards/overview` (orgs, execuções+erros, custo IA+tokens, WhatsApp, emails, health de conexões, filas) e `GET /dashboards/summary` (org-scoped).
  - Console: `pages/Atualizacao.jsx` (aba Atualização com log ao vivo + banner de lock; aba Backup/Restauração com 5 patrasques) + `pages/DashboardConsolidado.jsx` + rotas/nav. Permissões `system.upgrade`/`system.backup`/`system.restore` (bypass de platform admin no Console).

- Fase 7: Email Platform + Resource Model + DevTools (diretrizes 9/23/24/25/28/56/57):
  - Email: provider `google-workspace` (Gmail via REST/HTTP, sem SDK) com OAuth2 real — infra nova no Integration Manager (`GET /api/integrations/oauth/google/start` autenticado + `GET /api/integrations/oauth/google/callback` público; troca code→access+refresh, grava no Secret com `oauth_meta`, PENDING_AUTH→ACTIVE; refresh automático; TOKEN_EXPIRED quando o refresh falha); `execute` email.send/list/search/get/labels/threads. Provider `smtp` real via `nodemailer` (health = verify(); envio via transporter). Nó `EMAIL_SEND` real (resolve conexão + template EMAIL), canal email do Notification Center real, tool IA `enviar_email` real. Metering `emails`/`email_sends_month` + limite `google_accounts`. Front: botão "Entrar com Google" no wizard (popup + polling).
  - Resource Model (`resource/`, diretriz 9): catálogo canônico EM CÓDIGO (Customer/Person/Company/Product/Order/Invoice/Payment/Contract/Ticket/ServiceOrder/Lead) + extensões verticais (ISP). Schema `resource_mappings` (só o mapeamento — a plataforma nunca é dona do dado). Mapper (`toCanonical`) + **Mapper Inteligente** (IA sugere field_map, nunca aplica sozinho — diretriz 25) + seed dos mappings Altarede de exemplo. Resource Explorer read-only (`GET /resource/explore` via `IProvider.execute`). Schema Discovery via `discover()`.
  - Console do Desenvolvedor (`devtools/`, diretriz 28): "Postman interno" — testar execute/HTTP/SQL(read-only)/tool/IA via conexões, auditado, sem persistir dado de negócio.
  - Developer Center (`developer/`, diretriz 57): `developer_api_keys` (prefix + hash SHA-256; chave em claro só 1x; revogar = estado). Public API versionada `/api/v1/public/*` (`ping`/`me`) protegida por `ApiKeyGuard` (header `x-api-key`/Bearer `ias_...`). Fachada estável — nunca reexpõe endpoints internos.
  - ACL: grupos "Recursos" (`resource.mappings.read/write`, `resource.explore.read`, `resource.mapper.suggest`) e "Desenvolvedor" (`devtools.use`, `developer.apikeys.read/manage`). Front: páginas Recursos (Mapeamentos + Explorer) e Desenvolvedor (Console + API Keys) + rotas/nav. Dep nova: `nodemailer`.

- Fase 6: Solução ISP / Altarede (primeira solução oficial — como extensão, nada de ISP no core):
  - AltaredeProvider completo (categoria ERP): correção da auth (appkey+token no CORPO JSON, não headers), catálogo de 15 operações, `discover()` (setores/motivos), tratamento do envelope `{data}`/`{message}`/`{error}`.
  - Tools do agente ISP (no catálogo `ai_tools` da Fase 5, via ToolRegistry): `identificar_cliente`, `consultar_debitos`, `status_conexao`, `status_regiao`, `segunda_via_boleto` (+PIX), `desbloqueio_confianca` (requires_approval), `abrir_os` (requires_approval + suprime OS duplicada consultando incidente ativo). Conexão Altarede resolvida por `IspConnectionResolver` — a IA nunca chama a API direto (sempre `ConnectionsService.execute`).
  - Módulo `isp/` — Manutenção/Incidentes (painel na plataforma): schema `isp_incidents`/`isp_incident_targets`/`isp_incident_dispatches`; escopo selecionável (cidade/bairro/OLT/slot/CTO) + conexão; resolver afetados via conectividade com checkbox include/exclude + vínculo manual; modos **reativo (default)** / proativo / combinado; `IncidentLookupService` que as tools consultam; disparo em massa (Meta Orchestrator + Notification Center) com confirmação + rate limit + log (OFF por default); detecção automática de outage dupla-OFF (só sugere rascunho); toggles (suprimir OS/previsão/normalização). ACL grupo "ISP". Front: `pages/ISP/Incidentes.jsx` + nav. Conector PHP de contingência só documentado.

- Fase 5: AI Platform + Studio — módulo `ai` (diretrizes 10/15/16/17/26/29/31/32):
  - Schema: pgvector habilitado (`previewFeatures=["postgresqlExtensions"]` + `extensions=[vector]`); 16 models `ai_*` (agents, agent_prompt_versions, agent_runs, tools, tool_call_logs, knowledge_bases/documents/chunks/query_logs, memory_profiles/entries, approval_policies, action_approvals, collaboration_rules, cost_records, budgets, mcp_servers). Chunk com `embedding Unsupported("vector(1536)")?` + espelho `embedding_json` (fallback cosseno em app quando não há pgvector). Índice HNSW criado por SQL idempotente no boot.
  - Providers multi-LLM: `LlmProviderRegistryService` (registry declarativo) + fachada `LlmProviderService` (resolve Connection categoria AI → Secret → HTTP puro, sem SDK; cálculo de `cost_usd` por tabela de preços). Implementações OpenAI, Anthropic, Gemini, Ollama; OpenRouter/Groq/DeepSeek/Mistral/Azure reusam o provider OpenAI-compatible via `base_url`. AI Orchestrator (fallback/menor custo entre conexões AI ativas).
  - Agentes: CRUD + versões imutáveis (draft/publish/rollback — diretriz 3) + export/import JSON sem secrets. `AgentRunnerService` = loop tool-calling (RAG injetado no prompt, tools, gate de aprovação que pausa o run, guardrail de custo por run, registro de custo/consumo, evento `ai.agent.run.completed`, `resume()` pós-aprovação). Persona compilada + prompt-security básico.
  - Tools genéricas (diretriz 10): `consultar_faq` (RAG), `memory_read/write`, `http_request` (anti-SSRF), `connection_execute`, `enviar_whatsapp` (Meta Orchestrator), `enviar_notificacao` (Notification Center), `executar_sql` (read-only default; escrita exige aprovação), `gerar_documento`, `consultar_especialista` (colaboração). Registry + runtime com `AiToolCallLog` + retenção por cron.
  - RAG (pgvector): ingest (parse TXT/MD/URL + PDF/DOCX opcionais → chunk → embed) e query por similaridade `<=>` com fallback JSON. Memória 4 escopos (SESSION/CONTACT/WORKFLOW/AGENT) com TTL e max_items.
  - Aprovações genéricas (diretriz 31): `ApprovalPolicy` (TOOL/SQL_WRITE/MASS_SEND/COST/ADMIN) + fila `AiActionApproval` (nasce OFF). Custos (diretriz 17): agregação por org×workspace×agente×provider×modelo×mês, orçamentos com alerta/bloqueio (OFF) e simulador pré-publicação (diretriz 32). Colaboração multi-agente (diretriz 16). MCP Client (diretriz 15): cadastro de servers + descoberta de tools (HTTP/SSE; STDIO só metadado; MCP Server = pós-V1).
  - Nó `AGENT` no NodeRegistry (integra a Fase 4): `AutomationModule` passa a exportar `NodeRegistryService`; `AiModule` registra o nó. Sem dependência circular.
  - ACL: grupo "IA" (17 permissões `ai.*`) + perfil de sistema "Operador de IA". Limites de plano `ai_agents`/`ai_knowledge_bases` (+ `ai_tokens_month`) e features `ai_studio`/`ai_rag`/`ai_mcp`.
  - Painel do Cliente: grupo **IA** — Agentes (editor 8 abas + versões/publicar/rollback + testar com transcript/tokens/custo + export/import), Bases de Conhecimento (documentos + testar consulta), Memória, Ferramentas (catálogo + MCP), Aprovações (fila + políticas), Custos (consumo + orçamentos + simulador). **Canvas React Flow** (`@xyflow/react`) em `FluxoCanvas.jsx` substituindo o editor em lista da Fase 4 (mesmo grafo JSON; `__pos` guardado no config; editor em lista mantido como fallback em `/automacao/fluxos/:id/lista`).

- Fase 4: Automation Platform — módulo `automation` + infra `shared/broker` e `shared/events`:
  - Event Bus central (diretriz 7): `EventBusService.publish(envelope)` com persistência em `automation_event_log` (dedup por `source_event_id` único), emissão EventEmitter2 (compat) + fila do broker; replay por endpoint (perm `automation.events.retry`); `whatsapp.inbound.message` migrado pro bus.
  - Message Broker abstraído (diretriz 8): interface `IMessageBroker` (token `MESSAGE_BROKER`) + `BullMqBroker` (bullmq + ioredis, prefixo `iastudio`, retry com backoff exponencial, DLQ `<fila>:dlq`, idempotência por jobId); sem Redis loga warn e usa fallback em memória (dev).
  - Worker separado (diretriz 33): `src/worker.ts` (`npm run start:worker`) processa execuções/eventos/notificações + SchedulerCron; fallback dev `WORKER_INLINE` (default on — API processa inline; produção liga off e sobe `iastudio-worker`).
  - Workflow Engine (diretrizes 3/27/49): `automation_workflows` + versões IMUTÁVEIS (`automation_workflow_versions` — publicar = apontar `current_version`; rollback = repontar), execuções (`automation_executions` + logs por nó), engine agnóstica (DAG com edges condicionais, variáveis `{{input.*}}/{{vars.*}}`, dry-run, DELAY longo re-agendado via broker), metering `executions` + limites `flows`/`executions_month`.
  - NodeRegistry (definition+executor+validator): TRIGGER_MANUAL/EVENT/SCHEDULE/WEBHOOK, CONDITION, DELAY, HTTP_REQUEST (conexão OU URL direta com guarda anti-SSRF), CONNECTION_EXECUTE, WHATSAPP_SEND (Meta Orchestrator), EMAIL_SEND (stub Fase 7), NOTIFY, TEMPLATE_RENDER, EVENT_PUBLISH.
  - Scheduler visual (diretriz 12): trigger amigável (diário/semanal/mensal/intervalo/primeiro-último dia útil/CRON) + `computeNextRuns` com calendários de feriados (`automation_calendars`), `automation_schedules` persistido, preview das próximas 5, cron por minuto idempotente entre processos.
  - Execution Monitor (diretriz 13): filtros status/fluxo/período/trace_id, detalhe com timeline por nó, retry e cancel (cooperativo).
  - Catálogo de Templates (diretriz 11): `automation_templates` multi-canal (WhatsApp/Email/SMS/Push/PDF/HTML/Markdown) + render `{{variáveis}}`.
  - Notification Center (diretriz 22): `notify()` com canal explícito > fallback whatsapp→email→in-app, entrega via fila, sino in-app (`automation_notifications`) + log (`automation_notification_log`).
  - Webhook público `POST /api/webhooks/flows/:token` (TRIGGER_WEBHOOK, token por fluxo, idempotência via `x-idempotency-key`); export/import JSON versionado sem secrets (diretriz 29).
  - ACL: grupo "Automação" (12 permissões) + perfil de sistema "Operador de Automação".
  - Painel do Cliente: grupo Automação — Fluxos (lista + editor em lista vertical de passos + versões/publicar/rollback/diff + executar com dry-run + export/import), Agendamentos (+ calendários), Execuções (monitor + timeline), Templates, Eventos (log + replay), Notificações (log) + sino no Header (polling 30s). Canvas React Flow fica pra Fase 5 (mesmo grafo).

- Fase 3: Communication Platform / WhatsApp Meta Cloud API (oficial-only) — módulo `comm`:
  - Provider `whatsapp-meta` real no registry (connect/health/execute/discover) + wizard manual (Access Token/Phone Number ID/WABA/App Secret/Verify Token) com passo informativo do Embedded Signup ("em breve"); limite de plano `whatsapp_numbers` por conexão.
  - Meta Orchestrator (roteamento por tag/departamento/padrão/prioridade — o fluxo nunca conhece o número), smart-send com janela de 24h + fallback 131047, metering `whatsapp_messages`.
  - Webhook público `GET/POST /api/webhooks/whatsapp` multi-tenant (HMAC por app_secret, roteado por phone_number_id), inbox de conver
