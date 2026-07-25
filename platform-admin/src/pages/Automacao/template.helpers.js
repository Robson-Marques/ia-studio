// Helpers puros do catálogo de templates de automação.
//
// `extractTemplateVars` estava duplicado dentro de `TemplatesAutomacao.jsx` (a
// lista chamava, o modal chamava). Com o editor virando rota própria, seriam dois
// arquivos com a mesma função — que é justo o anti-padrão "código duplicado entre
// módulos" do CLAUDE.md. Fica aqui, num único lugar.

/**
 * Nomes das {{variáveis}} usadas no assunto + no corpo, sem repetir.
 * Ex.: "Olá {{contato.nome}}" → ['contato.nome'].
 */
export function extractTemplateVars(t) {
  const out = new Set();
  const re = /\{\{\s*([\w.[\]-]+)\s*\}\}/g;
  const text = `${t?.subject ?? ''} ${t?.body ?? ''}`;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1]);
  return [...out];
}
