# Newnet — independência visual gradual (Studio Workflow)

**Decisão de produto:** retirar progressivamente a identidade visual, os componentes e as dependências de runtime do Studio X / Studio UX Design System. O Studio Workflow governa **o processo, a estrutura e a validação**, não fornece CSS nem biblioteca de UI para runtime.

## Fonte normativa consultada
- `studio-workflow-main/interface-modernization.md` (capability `workflow.interface-modernization@2.0.0`, intenção `replace-studio-x`).
- `studio-workflow-main/doctrine/disciplines/visual-interface-quality.md` (`workflow.doctrine.visual-interface-quality@1.7.0`).
- `studio-workflow-main/shared/consuming-system-adoption.md` (`workflow.consuming-system-adoption@1.1.0`).

## Decisão arquitetural
1. Construir uma identidade **própria da Newnet**: escala tipográfica, densidade, cores, layout, estados, controles e componentes locais, sem reproduzir estética/gramática do Design System antigo.
2. Modernizar uma superfície coesa por vez, começando por `/ia/agentes` (Configurações da IA), já em execução como piloto. O ConnectChat terá lote separado: precisa primeiro estabilizar o comportamento de mensagem e limite de requisições; não misturar migração visual com alterações de negócio.
3. Permitir coexistência: telas ainda não migradas continuam usando `@studio-ux-ds/*` até substituição e validação próprias. Não aplicar troca global nem remover pacotes antes do último uso.
4. Usar composição semântica, feedback de estados, acessibilidade, teclado e densidade responsiva. Sem `zoom` CSS, `transform: scale` ou redução de controles móveis para forçar caber.
5. Após todos os callsites, wrappers, imports indiretos e estilos herdados terem sido migrados e validados, remover `@studio-ux-ds/*` dos manifests/lockfiles, adapters, imports e ligação de registry/conector do Design System. Essa remoção é **etapa final**, não pré-requisito do piloto.

## Critérios verificáveis para cada lote
- Inventário de rotas, componentes, imports, estilos, tokens e estados afetados, incluindo dependências transitivas.
- Mapa de equivalência entre componente antigo e componente Newnet, com comportamento, permissão e acessibilidade equivalentes.
- Build e testes da API/painel; cenários com loading, erro, vazio, sucesso, permissão negada.
- Validação visual real para desktop e mobile, incluindo 320/375/768/1024/1440 px, foco, rolagem, overlays e navegação por teclado.
- Registro de regressões, validação do piloto pelo responsável e decisão de propagação somente após esse checkpoint.

## Estratégia de rollback
Cada lote é separado em branch/PR. Reverter os componentes/telas modificados deve restabelecer a UI antiga **sem migrar banco, alterar contratos ou remover dependências utilizadas**. A remoção final dos pacotes é condicionada a inventário completo de zero referências.

## Próximas frentes
- **Piloto IA:** homologar densidade, aparência, interação, responsividade, feedback e consistência de tokens Newnet.
- **ConnectChat:** estabilizar atendimento e requests (inclusive erros de throttle); em um lote posterior substituir visualmente painel de conversas, lista, mensagens e controles.
- **Outras famílias:** migrar por módulo com inventário e checklist próprios; ordem definida após auditoria de callsites.
- **Desconexão final:** só depois de `rg -n '@studio-ux-ds|studio-x|studio-ux' platform-admin platform-api` e inspeção de dependências indiretas resultarem em ausência de uso de runtime; manter documentos históricos quando necessário, sem código dependente.

## Fora do escopo da diretriz
- O Studio Workflow não vira dependência de execução.
- Conhecimento de negócio, autenticação, dados e fluxos existentes não mudam simplesmente por modernização visual.
- Não substituir o DS antigo por **outro DS externo obrigatório**.
