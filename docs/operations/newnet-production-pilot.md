# Newnet — liberação controlada da Nete em produção

> Este roteiro é para a instalação Newnet já preparada. Não cria outra instância, banco, deploy, GitHub Actions nem job de teste.

## 1. Antes de atualizar

- Confirmar backup/restauração da instância e a versão/tag anterior, para permitir rollback.
- Publicar o código do PR #32 pelo procedimento de atualização já utilizado no servidor. Não alterar o banco de dados sem migrations verificadas.
- O serviço de API deve ter as conexões **ConnectChat** e **IXC** ativas. A IA nativa precisa ter `auto_reply` habilitado e agente ativo.
- Não incluir CPF, CNPJ, chaves ou tokens nos logs de diagnóstico.

## 2. Variáveis de ambiente (API, não frontend)

| Variável | Valor no primeiro deploy | Função |
| --- | --- | --- |
| `CONNECTCHAT_AI_AUTOREPLY` | `off` ou ausente | Nete permanece desligada; somente `on` liga o polling de resposta |
| `CONNECTCHAT_AI_PILOT_IDENTITIES` | ID(s) **globalIdentityId** de contas de teste, separados por vírgula | Quando preenchida, somente essas identidades entram no polling; não usar CPF/telefone |
| `CONNECTCHAT_AI_LINKING` | `off` ou ausente | Criação/conclusão de LinkRequest fica bloqueada; somente `on` permite testar o fluxo |

**Ativação para o piloto:** depois de publicar e conferir a instalação, definir `CONNECTCHAT_AI_AUTOREPLY=on` e a allowlist; deixar `CONNECTCHAT_AI_LINKING=off` inicialmente. Após conferir no ConnectChat a prova de titularidade, ativar também `CONNECTCHAT_AI_LINKING=on`.

**Kill switch:** definir `CONNECTCHAT_AI_AUTOREPLY=off` no ambiente do processo e reiniciar/atualizar a configuração do serviço. Isso desliga o atendimento automático da Nete, sem desabilitar o ConnectChat ou o IXC.

## 3. Finalidade e prova de vínculo

- A setting `ai.connectchat.link_purpose` precisa ter um **valor efetivamente suportado** pelo endpoint `POST /integration/link-requests` da versão instalada. Não escolher um enum por suposição.
- A API usa `ttlMs=600000` ao criar a solicitação. A conclusão usa `POST /integration/link-requests/complete`, com `globalIdentityId` e `requestId`.
- **Não habilitar `CONNECTCHAT_AI_LINKING=on` até verificar que a aprovação na PWA demonstra o direito do solicitante sobre o cadastro IXC** (titular ou representante autorizado). Login ConnectChat, CPF/CNPJ e resposta «sim» não são, isoladamente, prova suficiente.
- Uma mudança de `globalIdentityId`, cliente IXC, conexão IXC, recusa ou expiração impede o reaproveitamento da autorização antiga. A Nete só retoma dados privados com `CUSTOMER/ACTIVE` na mesma referência completa.

## 4. Roteiro manual de produção com identidades de teste

1. **Desligada:** publicar a nova versão com `CONNECTCHAT_AI_AUTOREPLY=off`; confirmar que não existem mensagens automáticas novas.
2. **Piloto:** usar uma identidade de teste na allowlist e ativar `CONNECTCHAT_AI_AUTOREPLY=on`. Outra identidade, fora da lista, não deve receber mensagens da Nete.
3. **Identificação:** enviar «oi», informar o motivo, CPF válido, CNPJ válido e documento inválido. Conferir saudação sem repetição, validação de dígitos e limite de consultas.
4. **Consentimento:** testar «não» e troca de CPF/CNPJ; não deve ocorrer associação com autorização anterior.
5. **Prova PWA (somente após validação do item 3):** habilitar linking; emitir pedido, aprovar pela conta de teste com prova independente, aguardar ACTIVE/CUSTOMER e confirmar retomada do motivo.
6. **Negativas:** pedido recusado, expirado, identidade trocada, cliente IXC diferente e CNPJ de outra empresa não podem entregar dados privados nem resultar em vínculo.
7. **Financeiro:** com vínculo confirmado, pedir segunda via e conferir até cinco títulos do **próprio** cliente, valores/linhas/URLs reais; solicitar assunto financeiro sem pedir boleto e confirmar que não há exposição espontânea de títulos.
8. **Suporte:** testar sem internet, incidente ativo, OS existente, histórico, cliente com mais de um contrato e tecnologia desconhecida. Não deve abrir OS duplicada ou supor ONU/rádio.
9. **Falhas controladas:** desconectar temporariamente IXC em conta de teste e verificar resposta de indisponibilidade, sem inventar dados; depois reabilitar.
10. **Encerramento do piloto:** voltar a `CONNECTCHAT_AI_AUTOREPLY=off`, se qualquer resposta estiver incorreta ou revelar dados fora do cadastro.

## 5. Restrições intencionais nesta entrega

- A consulta financeira implementada é **somente leitura**. A Nete não emite nova cobrança, não paga, não desbloqueia e não envia o boleto se não existir linha digitável ou URL válida no IXC.
- `allowedToolsOverride: []` permanece no canal ConnectChat: escrita no IXC, abertura automática de OS e operações sensíveis NÃO ficam liberadas para o modelo.
- A ferramenta ISP `abrir_os` que já existe passou a bloquear gravações se a checagem de OS existentes falhar.
- Não há garantia de que o **código da PWA ConnectChat** comprova titularidade: esse componente está fora do repositório IA Studio disponível nesta sessão. A configuração de linking é desligada por padrão justamente por isso.
- O workflow de GitHub Actions criado para teste foi **removido do PR #32** a pedido do operador; nenhum CI de teste foi adicionado nesta entrega.

## 6. Retorno rápido

- Desativar `CONNECTCHAT_AI_AUTOREPLY=off` e `CONNECTCHAT_AI_LINKING=off` no ambiente de produção.
- Se a API não iniciar após publicar, restaurar o artefato/tag anterior pelo procedimento de deploy já existente; não apagar banco ou registros do ConnectChat.
- Inspecionar logs da API sem reproduzir tokens, CPF/CNPJ ou links de pagamento em mensagens públicas.

## Critério de aprovação

Registrar resultado das verificações 1–10 em ambiente real. Só liberar identidades fora da allowlist após validar a prova de titularidade e a revisão de dados expostos nas consultas. Isso é liberação operacional, não merge automático.
