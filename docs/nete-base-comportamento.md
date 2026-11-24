# Nete — base de comportamento robusta (conhecimento × memória × comportamento)

> Documento de re-ancoragem (ver CLAUDE.md §DOCUMENTAÇÃO VIVA e `docs/ESTADO-e-handoff.md`).
> Nasceu da sessão de 2026-11-23 (Robson). Captura o DIAGNÓSTICO de por que a Nete
> é inconsistente e o PLANO para torná-la robusta como o Aquapark. Não é código
> aplicado ainda — é a frente estrutural a executar.

## O insight do Robson (a distinção que resolve)

São TRÊS coisas diferentes, e estavam sendo tratadas como uma só:

1. **Conhecimento** — o que a IA sabe (fatos, como diagnosticar). Já existe.
2. **Memória** — o estado do cliente no sistema (online/offline, bloqueio,
   boletos, OS/chamados, incidente, histórico recente). Já construída: camada 2,
   `buildSystemMemory()` em `connectchat-auto-responder.service.ts`, alimentada por
   `ConnectchatSupportContextService`. Efêmera por atendimento, relida a cada turno.
3. **Comportamento** — a espinha determinística que faz a Nete SEMPRE seguir o
   processo certo. **É a camada que está faltando.**

## A causa raiz da inconsistência ("8 ou 80")

Hoje o comportamento é dado por **prompt** (`channelPolicy()`): a "ESTRUTURA DE
ANÁLISE" é uma *sugestão de texto* que o modelo às vezes segue, às vezes não.
Resultado observado em produção (2026-11-23):

- Num atendimento de lentidão, a Nete viu o chamado recente e comentou; no
  seguinte, com o mesmo perfil, nem mencionou. Mesmo input, caminhos diferentes.

Comportamento por sugestão **nunca é determinístico**. O Aquapark é robusto
porque **o sistema decide o caminho e o modelo só apresenta** — exatamente o que
o CLAUDE.md prega ("o sistema decide, o modelo só apresenta"; "ID DE INFRA a IA
nunca escolhe"; `isp-diagnosis.service.ts` já faz isso para contrato→login).

## O alvo (padrão Aquapark): condutor determinístico

Separar as responsabilidades por turno:

- **Código (determinístico)** calcula, a partir da memória já carregada, o
  VEREDITO da situação e o PRÓXIMO PASSO. Não é o modelo que escolhe o caminho.
- **Modelo (LLM)** faz só duas coisas: (a) entender o texto livre do cliente
  (intenção) e (b) **falar bonito** o passo já decidido, variando as palavras.

Ou seja: continua "orientado a intenção" na leitura do cliente, mas a DECISÃO de
atendimento vira código. A variação fica só na redação, nunca no processo.

### Classificador de situação (determinístico) — a espinha

Entrada: o bloco de estado (memória camada 2) + a intenção lida. Saída: um
`caminho` + `proximo_passo` + os fatos a citar. Caminhos (já existem como texto
na política; viram decisão em código):

- Contrato BLOQUEADO (inadimplência) -> financeiro (2ª via / link / desbloqueio). Nunca técnico.
- Offline COM incidente na região -> informar manutenção. Não abrir OS.
- Offline, sem bloqueio e sem incidente -> UM reinício; persistiu -> abrir OS.
- Lentidão (online, sem bloqueio) -> UM reinício; persistiu -> abrir OS de lentidão.
- OS/chamado já aberto -> acompanhar o existente. Não duplicar.
- Quedas recorrentes (flapping) -> abrir chamado de instabilidade. (depende do #4)
- Online e em dia -> perguntar em que ajuda, sem despejar diagnóstico.
- Sempre: o diagnóstico levantado vira DESCRIÇÃO do chamado, e nunca trava a ação.

O modelo recebe: "situação = X; seu próximo passo = Y; fatos = [...]. Diga isso
de forma natural e acolhedora." Ele não pode escolher outro caminho.

## O que já existe para reaproveitar (não reinventar)

- `platform-api/src/modules/isp/isp-diagnosis.service.ts` — diagnóstico
  determinístico contrato→login (spec §2). Modelo do padrão "sistema decide".
- `ConnectchatSupportContextService` — leitura do estado operacional (camada 2).
- `connectchat-auto-responder.service.ts` — `buildSystemMemory()` (estado) e
  `channelPolicy()` (hoje sugestão; vira renderização do passo decidido).
- Config de abertura de OS: `isp-os-config.service.ts` + tela
  `platform-admin/src/pages/ISP/AberturaChamado.jsx` (par setor+assunto padrão).

## Itens em aberto (fila)

- **#3 — abrir OS**: era CONFIG faltando, não bug. Resolvido pelo operador em
  2026-11-23 (par **Suporte / LENTIDÃO** marcado como padrão). Validar que a Nete
  passa a abrir sozinha.
- **#4 — histórico de conexão do login** (plumbing no provider IXC): hoje só há o
  snapshot "online agora". Expor o log de sessões/quedas desbloqueia DUAS coisas:
  (a) verificar se o login caiu e voltou após o reinício; (b) detectar quem está
  conectado mas caindo toda hora (flapping) e abrir chamado de instabilidade.
- **Encerramento de chamado** (FEITO 2026-11-23 v0.12.57): a partir do manual
  oficial da API IXC — `POST su_oss_chamado_fechar` com `finaliza_processo: 'S'` +
  `status: 'F'`. Provider: `os.encerrar`; tool: `encerrar_os` (localiza a O.S.
  aberta, finaliza com mensagem, degrada gracioso, não encerra se houver várias).
  PENDENTE de smoke test ao vivo: se o workflow exigir `su_oss_chamado_analisar`
  (status `AN`, técnico/setor) antes de fechar, ou um técnico fixo, encaixar com
  config curada.
- **Ações IXC mapeadas para roadmap** (do manual, ainda não implementadas):
  `desconectar_clientes` (GET, id do login) = reiniciar a conexão PPPoE do cliente
  pela própria Nete (nível 2); `radpop_radio_cliente_fibra` (GET) = identificar se
  o cliente é fibra/rádio no login (destrava a distinção fibra/rádio e as funções
  de ONU); `su_oss_chamado_analisar` (POST, status `AN`) = mover a O.S. para análise.
- **Diagnóstico determinístico (parcial, feito 2026-11-23 v0.12.55)**: o
  `buildSystemMemory()` passou a montar, em código, um bloco "## Diagnóstico
  (determinístico)" com o caminho (bloqueado/incidente/offline/online + reincidência)
  e a ordem de RELATAR na primeira resposta. É o 1º degrau real do classificador.
  Falta o degrau pleno: o código TEMPLATAR a 1ª mensagem (não depender de o modelo
  seguir a diretriz).
- **Base de comportamento determinística** (ESTE documento): a frente estrutural
  que torna tudo acima consistente. É o que o Robson chama de "ficar robusto como
  no Aquapark". Fazer PORTANDO o padrão do Aquapark, não do zero.
- Futuro: ping/traceroute servidor→cliente (medir latência real); agregador de
  instabilidade de serviços (StatusGator/IsDown — NÃO Downdetector, sem API livre).

## Versões entregues nesta sessão (2026-11-23)

- v0.12.49 — hardening (não resolveu; o problema não era travar).
- **v0.12.50 — correção do `@Interval` no `poll()`**: o decorator tinha ido parar
  na `ensureNativeIspTools`; o `poll()` ficou sem agendamento e a Nete não
  respondia nada. ESTE foi o conserto do "motor desligado".
- v0.12.51 — trata o cliente pelo primeiro nome + quebra de linha por frase
  (`breakSentences`, determinístico).
- v0.12.52 — ser resolutiva (1-2 perguntas e então agir) + caminho de lentidão.
- v0.12.53 — o diagnóstico vira descrição do chamado, sem travar o andamento.

> Próximo passo natural ao retomar: implementar o classificador de situação
> determinístico no responder (a "base de comportamento"), deixando o modelo só
> com leitura de intenção + redação. Um checkpoint só disso.
