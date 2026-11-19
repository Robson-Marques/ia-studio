import React from 'react';
import { Tabs, Input, Select, Badge, EmptyState, Avatar, DSIcon, Spinner } from '@studio-ux-ds/react';
import { ATTENDANCE_STATUS, CHAT_TABS, contactInitials, formatPhone } from './whatsapp.constants';
import { statusToTone } from '../../lib/tone';

// WhatsApp/ChatList — a coluna de conversas. Migrada pro DS na v0.10.9.
//
// Decisões de composição:
//
//  · **O avatar era um degradê verde cravado** (`from-emerald-400 to-emerald-600`)
//    imitando o WhatsApp. Virou `Avatar` do DS com as iniciais: acompanha o tema,
//    e o painel deixa de fingir ser outro produto.
//  · **A bolinha de não lidas** usava `bg-brand` + branco fixo; agora é `Badge`
//    com o papel de ação. A contagem por aba também.
//  · `input`/`select` crus (classe local `.input`) → `Input`/`Select` do DS.
//  · A busca fica **sem ícone dentro do campo**: o placeholder já diz o que
//    fazer, e ícone decorativo dentro de campo estreito rouba espaço do texto.
//
// A lista NÃO usa DataTable de propósito: cada item é um cartão de conversa com
// quatro informações em duas linhas, não uma linha de tabela — e a seleção aqui é
// "o que estou lendo agora", não "o que vou processar em lote".

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function ChatList({
  scope, tab, onTab, status, onStatus, search, onSearch,
  chats, loading, counts = {}, selectedId, onSelect,
}) {
  const visibleTabs = CHAT_TABS.filter((t) => {
    if (!scope) return t.id === 'mine';
    if (t.id === 'mine') return scope.view?.assigned || scope.isSuper;
    if (t.id === 'unassigned') return scope.view?.unassigned || scope.isSuper;
    if (t.id === 'ia') return scope.view?.all || scope.view?.unassigned || scope.isSuper;
    if (t.id === 'team') return (scope.view?.team && (scope.myTeamIds?.length > 0)) || scope.isSuper;
    if (t.id === 'all') return scope.view?.all || scope.isSuper;
    return false;
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div style={{ padding: 'var(--su-space-3) var(--su-space-3) 0' }}>
        <Tabs
          variant="pills"
          value={tab}
          onChange={onTab}
          items={visibleTabs.map((t) => ({
            id: t.id,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {counts[t.id] > 0 && (
                  <Badge tone={tab === t.id ? 'neutral' : 'info'}>
                    {counts[t.id] > 99 ? '99+' : counts[t.id]}
                  </Badge>
                )}
              </span>
            ),
          }))}
        />
      </div>

      <div className="flex items-center gap-2" style={{ padding: 'var(--su-space-2) var(--su-space-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar nome ou telefone…"
            aria-label="Buscar conversa"
          />
        </div>
        <div style={{ width: 130 }}>
          <Select value={status} onChange={(e) => onStatus(e.target.value)} aria-label="Filtrar por situação">
            <option value="">Todas</option>
            <option value="OPEN">Abertas</option>
            <option value="IN_PROGRESS">Em andamento</option>
            <option value="CLOSED">Encerradas</option>
          </Select>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && chats.length === 0 && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!loading && chats.length === 0 && (
          <EmptyState
            icon="message"
            title="Nenhuma conversa aqui"
            description="Quando um cliente mandar mensagem para o número conectado, a conversa aparece nesta aba."
          />
        )}

        {chats.map((chat) => {
          const st = ATTENDANCE_STATUS[chat.attendance_status] || ATTENDANCE_STATUS.OPEN;
          const nome = chat.contact_name || formatPhone(chat.phone);
          const ativo = selectedId === chat.id;
          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelect(chat)}
              className="w-full text-left flex items-start gap-2.5"
              style={{
                minHeight: 44,
                padding: '10px 12px',
                border: 0,
                borderBottom: '1px solid var(--su-border-subtle)',
                font: 'inherit',
                cursor: 'pointer',
                background: ativo ? 'var(--su-action-tint)' : 'transparent',
              }}
              aria-current={ativo ? 'true' : undefined}
            >
              <Avatar initials={contactInitials(chat.contact_name, chat.phone)} size="sm" alt="" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--su-text-primary)' }} className="truncate">
                    {nome}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--su-text-muted)' }} className="shrink-0">
                    {timeLabel(chat.last_message_at)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2" style={{ marginTop: 2 }}>
                  <span style={{ fontSize: 12, color: 'var(--su-text-muted)' }} className="truncate">
                    {chat.last_message || '—'}
                  </span>
                  {chat.unread_count > 0 && (
                    <span className="shrink-0">
                      <Badge tone="info">{chat.unread_count}</Badge>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 4 }}>
                  <Badge tone={statusToTone(st.variant)}>{st.label}</Badge>
                  {chat.current_handler_name && (
                    <span
                      className="inline-flex items-center gap-1"
                      style={{ fontSize: 10, color: 'var(--su-text-muted)' }}
                    >
                      <DSIcon name="user" size="sm" /> {chat.current_handler_name}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
