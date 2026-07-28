import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormScreen, Card, FormGrid, Field, Input, Checkbox, CheckGroup, Badge, Banner, useToast } from '@studio-ux-ds/react';
import {
  listProfiles, createProfile, updateProfile, getPermissionsCatalog,
} from '../services/profiles';
import { usePermissions } from '../hooks/usePermissions';

// PerfilEditor — compor um perfil de acesso (v0.10.16).
//
// Rotas `/perfis/novo` e `/perfis/:id`. Era um Modal `lg` com o catálogo inteiro
// de permissões dentro, rolando dentro da rolagem do modal.
//
// **A caixa "marcar o grupo todo" usa `indeterminate`** (DS v1.2.37): com parte
// do grupo marcada, a caixa fica no estado misto. Antes o consumidor caía no
// `<input>` cru justamente por isso — sem o estado misto, meia seleção aparece
// como caixa VAZIA, que informa o contrário do que está acontecendo.
//
// Perfil da plataforma abre em **leitura**: é útil ver o que o "Administrador"
// libera antes de copiar a ideia num perfil próprio. Nada de esconder a tela.

export default function PerfilEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const isEdit = Boolean(id);

  const [catalogo, setCatalogo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [deSistema, setDeSistema] = useState(false);

  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [marcadas, setMarcadas] = useState(() => new Set());

  // Somente leitura quando é perfil da plataforma OU quando falta permissão.
  const soLeitura = deSistema || !can('core.profiles.write');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const [cat, lista] = await Promise.all([
          getPermissionsCatalog(),
          isEdit ? listProfiles() : Promise.resolve({ items: [] }),
        ]);
        if (cancelado) return;
        setCatalogo(cat || []);
        if (isEdit) {
          // Não há endpoint de "um perfil": a lista é a fonte.
          const p = (lista.items || []).find((x) => x.id === id);
          if (!p) {
            toast.error('Perfil não encontrado — ele pode ter sido excluído.');
            navigate('/perfis', { replace: true });
            return;
          }
          setNome(p.name || '');
          setDescricao(p.description || '');
          setMarcadas(new Set(Array.isArray(p.permissions) ? p.permissions : []));
          setDeSistema(Boolean(p.is_system || p.system));
        }
      } catch (err) {
        if (!cancelado) {
          toast.error(err.message);
          navigate('/perfis', { replace: true });
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(
    () => catalogo.reduce((n, g) => n + (g.permissions || []).length, 0),
    [catalogo],
  );

  function alternar(chave) {
    if (soLeitura) return;
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  function alternarGrupo(grupo) {
    if (soLeitura) return;
    const chaves = (grupo.permissions || []).map((p) => p.key);
    const todasOn = chaves.every((k) => marcadas.has(k));
    setMarcadas((prev) => {
      const next = new Set(prev);
      chaves.forEach((k) => { if (todasOn) next.delete(k); else next.add(k); });
      return next;
    });
  }

  async function salvar() {
    if (!nome.trim()) { toast.error('Dê um nome ao perfil.'); return; }
    if (!marcadas.size) {
      toast.error('Marque pelo menos uma permissão — perfil sem permissão não dá acesso a nada.');
      return;
    }
    setSalvando(true);
    try {
      const body = {
        name: nome.trim(),
        description: descricao.trim(),
        permissions: Array.from(marcadas),
      };
      if (isEdit) {
        await updateProfile(id, body);
        toast.success('Perfil salvo.');
      } else {
        await createProfile(body);
        toast.success('Perfil criado.');
      }
      navigate('/perfis');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <FormScreen
      back={{ label: 'Voltar para perfis', onClick: () => navigate('/perfis') }}
      title={isEdit ? (nome || 'Perfil') : 'Novo perfil'}
      subtitle={`${marcadas.size} de ${total} permissões marcadas`}
      loading={loading}
      saving={salvando}
      canSubmit={!soLeitura}
      onSubmit={salvar}
      onCancel={() => navigate('/perfis')}
      banner={deSistema ? (
        <Banner tone="info">
          Este perfil é mantido pela plataforma: dá para consultar o que ele libera, mas não para mudar. Se precisa de
          algo parecido com ajustes, crie um perfil próprio.
        </Banner>
      ) : null}
      /* `bare`: cada grupo de permissão já é um cartão. Continua sendo UM
         formulário — o Salvar submete os grupos todos juntos. */
      bare
    >
      <Card>
        <div style={{ padding: 20 }}>
          <FormGrid columns="auto">
            <Field label="Nome" required hint="Como este perfil aparece na hora de dar acesso a alguém.">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={soLeitura} autoFocus={!soLeitura} />
            </Field>
            <Field label="Para que serve" hint="Uma linha ajudando a escolher entre os perfis. Ex.: atende, mas não mexe em cobrança.">
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={soLeitura} />
            </Field>
          </FormGrid>
        </div>
      </Card>

      {!catalogo.length ? (
        <Card>
          <div style={{ padding: 20 }}>
            <Banner tone="warning">
              O catálogo de permissões não veio do servidor. Sem ele não dá para montar perfil — recarregue a página.
            </Banner>
          </div>
        </Card>
      ) : (
        catalogo.map((grupo) => {
          const chaves = (grupo.permissions || []).map((p) => p.key);
          const ligadas = chaves.filter((k) => marcadas.has(k)).length;
          const todas = ligadas === chaves.length && chaves.length > 0;
          const algumas = ligadas > 0 && !todas;
          return (
            <Card key={grupo.id}>
              <div style={{ padding: 20 }} className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* A caixa do grupo em estado MISTO quando só parte está
                      marcada — sem isso ela apareceria vazia com metade ligada. */}
                  <Checkbox
                    label={grupo.label}
                    checked={todas}
                    indeterminate={algumas}
                    disabled={soLeitura}
                    onChange={() => alternarGrupo(grupo)}
                  />
                  <Badge tone={ligadas ? 'info' : 'neutral'}>{ligadas} de {chaves.length}</Badge>
                </div>
                <CheckGroup columns="auto" role="group" aria-label={grupo.label}>
                  {(grupo.permissions || []).map((perm) => (
                    <Checkbox
                      key={perm.key}
                      label={perm.label}
                      checked={marcadas.has(perm.key)}
                      disabled={soLeitura}
                      onChange={() => alternar(perm.key)}
                    />
                  ))}
                </CheckGroup>
              </div>
            </Card>
          );
        })
      )}
    </FormScreen>
  );
}
