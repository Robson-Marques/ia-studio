import React, { useEffect, useMemo, useState } from 'react';
import { Blocks, Download, Loader2, PlugZap, Search, Trash2 } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Badge } from '../../components/ui/Table';
import { Select } from '../../components/ui/FormField';
import { getMarketplace, installProvider, uninstallProvider } from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '@studio-ux-ds/react';
import { CATEGORY_LABELS, categoryLabel } from './integration.constants';
import ConnectionWizard from './ConnectionWizard';

// Marketplace de Conectores (diretriz 1): galeria por categoria com busca,
// badge Instalado e ações Instalar / Conectar (wizard) / Desinstalar.
export default function Marketplace() {
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [acting, setActing] = useState(null); // key em ação
  const [uninstalling, setUninstalling] = useState(null); // item aguardando ConfirmDialog
  const [wizardFor, setWizardFor] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await getMarketplace();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category && i.category !== category) return false;
      if (q && !`${i.name} ${i.description} ${i.key}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, category]);

  const byCategory = useMemo(() => {
    const map = new Map();
    filtered.forEach((i) => {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category).push(i);
    });
    return Array.from(map.entries());
  }, [filtered]);

  async function handleInstall(item) {
    setActing(item.key);
    try {
      await installProvider(item.key);
      toast.success(`Conector "${item.name}" instalado.`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(null);
    }
  }

  async function handleUninstall() {
    if (!uninstalling) return;
    setActing(uninstalling.key);
    try {
      await uninstallProvider(uninstalling.key);
      toast.success(`Conector "${uninstalling.name}" desinstalado.`);
      setUninstalling(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Marketplace</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Instale conectores e crie conexões pelo wizard — sem deploy, tudo online.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ap-text-5)' }} />
            <input
              className="input pl-8 w-56"
              placeholder="Buscar conector…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !filtered.length ? (
        <div className="card">
          <EmptyState icon={Blocks} title="Nenhum conector encontrado" description="Ajuste a busca ou a categoria." />
        </div>
      ) : (
        byCategory.map(([cat, list]) => (
          <div key={cat} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ap-text-4)' }}>
              {categoryLabel(cat)}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {list.map((item) => (
                <div key={item.key} className="card p-4 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-brand/10 text-brand shrink-0">
                      <Blocks size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold truncate" style={{ color: 'var(--ap-text-1)' }}>{item.name}</p>
                        {item.installed && <Badge variant="green">Instalado</Badge>}
                        {!item.has_implementation && <Badge variant="gray">Em breve</Badge>}
                      </div>
                      <p className="text-xs mt-1 line-clamp-3" style={{ color: 'var(--ap-text-4)' }}>{item.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-auto">
                    {!item.installed && can('integrations.marketplace.manage') && (
                      <button
                        className="btn-primary disabled:opacity-60"
                        disabled={acting === item.key}
                        title="Habilita este conector para a organização"
                        onClick={() => handleInstall(item)}
                      >
                        {acting === item.key ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        Instalar
                      </button>
                    )}
                    {item.installed && can('integrations.connections.write') && (
                      <button
                        className="btn-primary disabled:opacity-60"
                        disabled={!item.has_implementation}
                        title={item.has_implementation
                          ? 'Abre o wizard de conexão deste conector'
                          : 'Conexão disponível em fase futura'}
                        onClick={() => setWizardFor(item)}
                      >
                        <PlugZap size={14} /> Conectar
                      </button>
                    )}
                    {item.installed && can('integrations.marketplace.manage') && (
                      <button
                        className="btn-ghost text-red-500 disabled:opacity-60"
                        disabled={acting === item.key}
                        title="Desinstala o conector (exige todas as conexões desativadas)"
                        onClick={() => setUninstalling(item)}
                      >
                        <Trash2 size={14} /> Desinstalar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <ConfirmDialog
        open={Boolean(uninstalling)}
        danger
        loading={Boolean(acting)}
        title="Desinstalar conector"
        message={`Desinstalar "${uninstalling?.name}" da organização? As conexões existentes não são apagadas, mas precisam estar desativadas. Você pode reinstalar a qualquer momento.`}
        confirmLabel="Desinstalar"
        onClose={() => setUninstalling(null)}
        onConfirm={handleUninstall}
      />

      <ConnectionWizard
        open={Boolean(wizardFor)}
        provider={wizardFor}
        onClose={() => setWizardFor(null)}
        onCreated={() => { /* estado atualizado ao abrir Conexões */ }}
      />
    </div>
  );
}
