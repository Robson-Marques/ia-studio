// Leva o Console para o ENDERECO DEDICADO quando ele existe.
//
// Depois de cadastrar um endereço só do Console (Endereços → superfície Console),
// abrir o caminho antigo `/<dominio principal>/console/` deve levar ao endereço
// novo — sem precisar mexer no vhost principal (que o certbot gerencia).
//
// Salvaguardas, porque redirecionar sozinho pode trancar o operador para fora:
//   * só redireciona se o endereço canônico estiver ATIVO (o backend só devolve
//     hosts com situação "No ar");
//   * `?stay=1` (ou #stay) desliga o redirecionamento naquela visita;
//   * qualquer falha na consulta = não redireciona (fica onde está);
//   * nunca redireciona se já estiver no host canônico (evita laço).
import api from './api';

const BYPASS = 'stay';

export async function redirectToCanonicalHost() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(BYPASS) === '1' || url.hash.includes(BYPASS)) return false;

    const { data } = await api.get('/public/console-location');
    const canonical = (data?.hostname || '').trim().toLowerCase();
    if (!canonical) return false;                       // sem endereço dedicado
    if (url.hostname.toLowerCase() === canonical) return false; // já estamos nele

    // Preserva a rota atual, tirando o prefixo /console/ do caminho antigo — no
    // endereço dedicado o Console mora na raiz.
    const path = url.pathname.replace(/^\/console\/?/, '/') || '/';
    window.location.replace(`https://${canonical}${path}${url.search}${url.hash}`);
    return true;
  } catch {
    return false; // erro de rede não pode impedir o acesso pelo caminho atual
  }
}
