// Ponte entre o vocabulário LEGADO de cor e o `tone` do Studio UX.
//
// Os mapas de status das famílias (`ia.constants`, `automation.constants`, …)
// nasceram declarando `variant: 'green' | 'red' | 'yellow' | …` — cor crua, do
// tempo do `components/ui/Table` local. O DS não aceita cor: ele aceita
// **papel** (`success`, `danger`, `warning`, `info`, `neutral`), e é o tema que
// decide qual cor cada papel tem — é o que faz o accent do usuário funcionar e
// o dark mode não precisar de exceção.
//
// Enquanto os mapas não declararem `tone` direto, esta função traduz na borda
// de renderização. Está em `lib/` porque MAIS DE UMA família precisa dela:
// nasceu no `ia.constants`, e quando a Automação também precisou, copiar seria
// duplicar helper — o anti-padrão que o CLAUDE.md proíbe explicitamente.
//
// Fim de jogo: cada mapa de status passa a declarar `tone` e esta ponte morre.
// Enquanto existir, é um só lugar para mudar.
export function statusToTone(variant) {
  return {
    green:  'success',
    red:    'danger',
    yellow: 'warning',
    blue:   'info',
    purple: 'info',
    gray:   'neutral',
  }[variant] || 'neutral';
}
