import api from '../lib/api';

/**
 * Contexto público do endereço acessado — quem é o dono da marca nesta URL.
 * Rota aberta (não exige sessão): é a tela de LOGIN que consome, antes de haver
 * usuário. Falha nunca propaga: sem resposta, o painel usa a identidade padrão
 * da plataforma (comportamento de instalação de domínio único).
 */
export async function getTenantContext() {
  try {
    const { data } = await api.get('/public/tenant-context');
    return data?.matched ? data : null;
  } catch {
    return null;
  }
}
