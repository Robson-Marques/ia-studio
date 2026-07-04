import React from 'react';
import { Loader2, MessageCircle, Search, User } from 'lucide-react';
import clsx from 'clsx';
import Tabs from '../../components/ui/Tabs';
import EmptyState from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Table';
import { ATTENDANCE_STATUS, CHAT_TABS, formatPhone } from './whatsapp.constants';

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Lista de conversas com abas (Minhas/Não atribuídas/Minha equipe/Todas)
// derivadas do escopo de permissões + busca + filtro de status.
export default function ChatList({
  scope, tab, onTab, status, onStatus, search, onSearch,
  chats, loading, selectedId, onSelect,
}) {
  const visibleTabs = CHAT_TABS.filter((t) => {
    if (!scope) return t.id === 'mine';
    if (t.id === 'mine') return scope.view?.assigned || scope.isSuper;
    if (t.id === 'unassigned') return scope.view?.unassigned || scope.isSuper;
    if (t.id === 'team') return (scope.view?.team && (scope.myTeamIds?.length > 0)) || scope.isSuper;
    if (t.id === 'all') return scope.view?.all || scope.isSuper;
    return false;
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3">
        <Tabs
          items={visibleTabs.map((t) => ({ id: t.id, label: t.label }))}
          active={tab}
          onChange={onTab}
          variant="pills"
          bleed={false}
        />
      </div>

      <div className="px-3 py-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ap-text-4)' }} />
          <input
            className="input pl-8 w-full text-sm"
            placeholder="Buscar nome ou telefone…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <select className="input text-sm w-auto" value={status} onChange={(e) => onStatus(e.target.value)}>
          <option value="">Todas</option>
          <option value="OPEN">Abertas</option>
          <option value="IN_PROGRESS">Em andamento</option>
          <option value="CLOSED">Encerradas</option>
        </select>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto divide-y" style={{ borderColor: 'var(--ap-border)' }}>
        {loading && chats.length === 0 && (
          <div className="py-10 text-center"><Loader2 size={18} className="animate-spin inline" style={{ color: 'var(--ap-text-4)' }} /></div>
        )}
        {!loading && chats.length === 0 && (
          <EmptyState
            icon={MessageCircle}
            title="Nenhuma conversa aqui"
            description="Quando um cliente mandar mensagem pro número conectado, a conversa aparece nesta aba."
          />
        )}
        {chats.map((chat) => {
          const st = ATTENDANCE_STATUS[chat.attendance_status] || ATTENDANCE_STATUS.OPEN;
          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelect(chat)}
              className={clsx('w-full text-left px-3 py-2.5 transition-colors', selectedId === chat.id && 'bg-brand/10')}
              style={{ minHeight: 44 }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>
                  {chat.contact_name || formatPhone(chat.phone)}
                </span>
                <span className="text-[10px] shrink-0" style={{ color: 'var(--ap-text-4)' }}>
                  {timeLabel(chat.last_message_at)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-xs truncate" style={{ color: 'var(--ap-text-4)' }}>
                  {chat.last_message || '—'}
                </span>
                {chat.unread_count > 0 && (
                  <span className="shrink-0 text-[10px] font-bold text-white bg-brand rounded-full px-1.5 py-0.5">
                    {chat.unread_count}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={st.variant}>{st.label}</Badge>
                {chat.current_handler_name && (
                  <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--ap-text-4)' }}>
                    <User size={10} /> {chat.current_handler_name}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
