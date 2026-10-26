# Comunicação WhatsApp — Central Nivoo (Newnet)

Este módulo usa exclusivamente a API integradora da Central WhatsApp. O contrato externo é `CONTRATO-CONSUMO-REMOTO-WHATSAPP.md` v2.6.0, mantido no projeto `PARA-SERVIDOR-INTEGRADOR/whatsapp-central/docs`. O IA Studio não recebe webhook Meta nem guarda token Meta. A chave `X-Nivoo-Internal-Key` fica no Secrets Manager e só o backend a usa.

## Preparação e ativação

1. Na Central, cadastrar a instalação Newnet em **Plataforma → Consumidores integradores**, com `installation_id`, origem HTTPS exata do painel e chave interna. Sem esses dados o canal permanece desconfigurado e não há envio.
2. Em **WhatsApp → Números → Configuração da Central**, informar `installation_id`, origem HTTPS e chave no campo secreto. O backend usa somente `https://integracoes.nivoo.dev.br`. Essa configuração técnica não aparece no gerenciador genérico de conexões.
3. Ainda em **WhatsApp → Números**, usar **Conectar número** para abrir diretamente o onboarding da Central em nova aba. O `launch_url` contém segredo no fragmento e não é persistido/logado. Após `CONNECTED`, listar as conexões da Central e sincronizar os números locais.
4. Publicar a versão e executar migração Prisma no servidor; testar onboarding, leitura, mídia, texto, template, nota de voz, job de envio e desconexão com uma instalação real antes de declarar o canal operacional.

## Donos do fluxo

| Arquivo | Responsabilidade |
| --- | --- |
| `shared/integration/nivoo-whatsapp.client.ts` | HTTP autenticado da Central, paginação, onboarding, mensagens, mídia, templates e jobs. |
| `integration/registry/providers/whatsapp-nivoo.provider.ts` | Único provider WhatsApp registrado; secret do consumidor e operações de envio. |
| `whatsapp/nivoo-connections.service.ts` | Mapeia cada número remoto à `Connection` local, confirma posse e desconexão. |
| `whatsapp/nivoo-sync.service.ts` | Sincroniza conversas e mensagens; eco de saída não dispara atendimento/IA. Faz importação inicial sem reexecutar automação histórica e reconcilia jobs. |
| `whatsapp/whatsapp-orchestrator.service.ts` | Resolve conexão ativa por ID, tag, padrão ou prioridade; recebe `job_id` do envio assíncrono. |
| `whatsapp/whatsapp-inbox.*` | Escopo de atendimento, janela de 24h, envio manual e proxy binário autenticado de mídia. |
| `whatsapp/whatsapp-templates.*` | Catálogo local e sincronização/criação/edição/exclusão por meio da Central. |
| `attendance/` | Atribuição, transferência, encerramento, reabertura, equipes e filas locais. |
| `connectchat/` | Canal interno ConnectChat via `Connection` ativa do Integration Manager, com polling incremental por `serverSequence`. |

O painel consulta e grava a configuração técnica por `GET/PUT /comm/whatsapp/numbers/setup`, cria/consulta sessões de onboarding, sincroniza e desconecta em `/comm/whatsapp/numbers`. O download de mídia passa por `GET /comm/whatsapp/chats/:id/media/:mediaId`, exige sessão e permissão locais e responde bytes. A leitura após desconexão permanece disponível para histórico pertencente à instalação; novos envios exigem conexão ativa.

`comm_whatsapp_chats` e `comm_whatsapp_messages` guardam IDs da Central, ID Meta quando existir, campos ricos e metadados de mídia. Mensagens de entrada novas mantêm `inbound_event_published=false` até o evento de atendimento ser persistido; a sincronização reprocessa as pendentes após falha. `comm_nivoo_whatsapp_sync_checkpoint` guarda o marco da importação e `comm_nivoo_whatsapp_outbound_jobs` guarda o estado dos POSTs aceitos. A Central é a fonte das mensagens; a base local sustenta atendimento e busca. POST de envio não tem retry automático para evitar duplicação.

Cada número recebe rascunhos nativos dos templates de alerta de plantão, aviso de incidente e normalização ISP. O usuário revisa e publica explicitamente esses modelos; o sync não publica rascunhos do sistema. Avisos ISP usam texto dentro da janela e template aprovado fora dela. O POST aceito gera um job `PENDING` nos logs de disparo/alerta; o cron consulta a Central e marca `SENT` ou `FAILED` somente após a resposta final.

Os providers antigos `whatsapp-meta` e `whatsapp-ycloud` são desativados e retirados do runtime. As rotas locais de webhook foram removidas. As linhas antigas de conexão, log e conversa ficam preservadas para auditoria, mas são excluídas das superfícies operacionais. Os segredos são desvinculados; os que não servem a nenhuma outra conexão ou servidor MCP são apagados. Não existe migração retroativa de histórico que a Central não recebeu.

Quando um Phone Number ID corresponde a exatamente uma conexão antiga, o espelho novo herda tags, prioridade, departamento, conexão padrão e vínculo do assistente. Correspondências ambíguas exigem conferência manual no painel.

## ConnectChat

O canal usa exclusivamente o adaptador HTTP do backend e uma **Connection**
ativa do Integration Manager (`provider_key = 'connectchat'`). Configure em
**Integrações → Conexões → Nova conexão → ConnectChat**:

- `api_url`: URL base da API, sem `/v1`;
- `actor_ref`: padrão `IA Studio:atendimento`;
- `timeout_ms`: opcional, padrão `10000`;
- `api_key`: chave técnica no campo de senha, cifrada pelo Secrets Manager.

O teste da conexão lista conversas para validar URL, chave e escopos. O
operador recebe `X-ConnectChat-Actor-Ref` derivado do usuário local. Chaves de
idempotência e `clientMessageId` são estáveis durante retries. A API atual
fornece `businessContactId` sem nome ou telefone do cliente.

## Endpoints principais

- `GET /comm/whatsapp/scope|chats|chats/:id|chats/:id/messages|chats/:id/window|chats/:id/media/:mediaId`
- `POST /comm/whatsapp/chats/:id/{send,read,claim,release,transfer,close,reopen}` e `GET :id/timeline`
- `POST /comm/whatsapp/send` — envio pelo orchestrator.
- `GET/POST /comm/whatsapp/templates` e `POST /comm/whatsapp/templates/sync`
- `GET /comm/whatsapp/numbers` e `POST /comm/whatsapp/numbers/:id/sync`
- `GET/POST/PATCH /comm/attendance/{teams,queues}` e membros.
- `GET /comm/connectchat/{health,conversations}` e `GET /comm/connectchat/conversations/:id/messages?after_sequence=`
- `POST /comm/connectchat/conversations/:id/messages|receipts/{read,delivered}` e `PATCH /comm/connectchat/messages/:id`.
