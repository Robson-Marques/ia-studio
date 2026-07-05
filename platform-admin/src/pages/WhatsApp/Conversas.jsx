import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  getChat, getChatCounts, getChatWindow, getWhatsappScope, listChats, listMessages,
  listTemplates, markChatRead,
} from '../../services/whatsapp';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import TransferModal from './TransferModal';
import TimelineModal from './TimelineModal';

const POLL_MS = 5000; // realtime desta fase = polling 5s (sem WebSocket — ver README do módulo comm)

// Conversas WhatsApp — contact center: lista (abas por escopo) + janela da
// conversa + composer com janela de 24h + ações de atendimento.
export default function Conversas() {
  const { user, me } = useAuth();
  const meId = me?.user?.id || user?.id || user?.sub || null;

  const [scope, setScope] = useState(null);
  const [tab, setTab] = useState('mine');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [chats, setChats] = useState([]);
  const [counts, setCounts] = useState({ mine: 0, unassigned: 0, team: 0, all: 0 });
  const [loadingList, setLoadingList] = useState(true);

  const [selected, setSelected] = useState(null); // chat aberto (objeto completo)
  const [messages, setMessages] = useState([]);
  const [windowInfo, setWindowInfo] = useState(null);
  const [templates, setTemplates] = useState([]);

  const [transferOpen, setTransferOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const selectedRef = useRef(null);
  selectedRef.current = selected;

  // Escopo (abas visiveis) + templates aprovados (composer fora da janela).
  useEffect(() => {
    getWhatsappScope()
      .then((s) => {
        setScope(s);
        if (!(s.view?.assigned || s.isSuper)) {
          if (s.view?.unassigned) setTab('unassigned');
          else if (s.view?.team) setTab('team');
          else if (s.view?.all) setTab('all');
        }
      })
      .catch((err) => toast.error(err.message));
    listTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setLoadingList(true);
    try {
      const filters = { status: status || undefined, search: search || undefined };
      const [{ items }, tabCounts] = await Promise.all([
        listChats({ ...filters, tab, take: 100 }),
        getChatCounts(filters).catch(() => null), // badges — best-effort, nao trava a lista
      ]);
      setChats(items);
      if (tabCounts) setCounts(tabCounts);
    } catch (err) {
      if (!silent) toast.error(err.message);
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, [tab, status, search]);

  const loadChat = useCallback(async (chatId, silent = false) => {
    try {
      const [chat, msgs, win] = await Promise.all([
        getChat(chatId),
        listMessages(chatId, { take: 100 }),
        getChatWindow(chatId),
      ]);
      setSelected(chat);
      setMessages(msgs);
      setWindowInfo(win);
    } catch (err) {
      if (!silent) toast.error(err.message);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // Polling 5s: lista + conversa aberta (sem WebSocket nesta fase).
  useEffect(() => {
    const timer = setInterval(() => {
      loadList(true);
      const current = selectedRef.current;
      if (current) loadChat(current.id, true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadList, loadChat]);

  async function handleSelect(chat) {
    await loadChat(chat.id);
    markChatRead(chat.id); // best-effort
  }

  const refreshAll = useCallback(async () => {
    await loadList(true);
    const current = selectedRef.current;
    if (current) await loadChat(current.id, true);
  }, [loadList, loadChat]);

  return (
    <div
      className="flex h-[calc(100dvh-8.5rem)] min-h-[420px] rounded-xl overflow-hidden"
      style={{ backgroundColor: 'var(--ap-surface)', border: '1px solid var(--ap-border)' }}
    >
      {/* Lista (esconde no mobile quando ha conversa aberta) */}
      <div
        className={`${selected ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 shrink-0 min-h-0`}
        style={{ borderRight: '1px solid var(--ap-border)' }}
      >
        <ChatList
          scope={scope}
          tab={tab} onTab={setTab}
          status={status} onStatus={setStatus}
          search={search} onSearch={setSearch}
          chats={chats} loading={loadingList}
          counts={counts}
          selectedId={selected?.id}
          onSelect={handleSelect}
        />
      </div>

      {/* Janela */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0 min-h-0`}>
        {selected ? (
          <>
            {/* Voltar (mobile) */}
            <button
              type="button"
              className="md:hidden text-left text-xs px-3 py-2"
              style={{ color: 'var(--ap-text-3)', borderBottom: '1px solid var(--ap-border)', minHeight: 40 }}
              onClick={() => setSelected(null)}
            >
              ← Voltar pra lista
            </button>
            <ChatWindow
              chat={selected}
              messages={messages}
              windowInfo={windowInfo}
              templates={templates}
              scope={scope}
              meId={meId}
              onRefresh={refreshAll}
              onOpenTransfer={() => setTransferOpen(true)}
              onOpenTimeline={() => setTimelineOpen(true)}
              onSent={refreshAll}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageCircle}
              title="Selecione uma conversa"
              description="Escolha uma conversa na lista ao lado para atender."
            />
          </div>
        )}
      </div>

      {selected && (
        <TransferModal
          open={transferOpen}
          chat={selected}
          onClose={() => setTransferOpen(false)}
          onDone={() => { setTransferOpen(false); refreshAll(); }}
        />
      )}
      {selected && (
        <TimelineModal open={timelineOpen} chat={selected} onClose={() => setTimelineOpen(false)} />
      )}
    </div>
  );
}
