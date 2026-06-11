import { useChatStore } from '@/stores/chatStore';
import { useUserStore } from '@/stores/userStore';
import { useNetworkStore } from '@/stores/networkStore';
import { useContactsStore } from '@/stores/contactsStore';
import { Search, Plus, X, Users, Image as ImageIcon, FileText, Mic, Clock } from 'lucide-react';
import { useState } from 'react';
import { Chat } from '@/types';
import { format, isToday } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { CreateGroupDialog } from '@/components/group/CreateGroupDialog';
import { useIsMobile } from '@/hooks/useIsMobile';

export function ChatList() {
  const { t } = useTranslation();
  const { chats, currentChat, setCurrentChat, createChat, outbox } = useChatStore();
  const { user } = useUserStore();
  const { status, peerCount } = useNetworkStore();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatType, setNewChatType] = useState<'private' | 'group'>('private');

  const filteredChats = searchQuery
    ? chats.filter((chat) => chat.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : chats;

  const handleCreateChat = async () => {
    try {
      const chat = await createChat(
        newChatType,
        newChatName.trim() || undefined,
        user ? [user.id] : []
      );
      setCurrentChat(chat);
      setShowNewChat(false);
      setNewChatName('');
    } catch {
      // error handled in store
    }
  };

  return (
    <div className="h-full flex flex-col bg-elev relative">
      {/* Header */}
      <div className="p-4 border-b flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold tracking-tight">ember</h1>
            <span
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface text-[11px] font-mono text-ink-dim"
              title={t('status.peerId')}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  status === 'online' ? 'bg-online' : status === 'starting' ? 'bg-warn' : 'bg-ink-faint'
                }`}
              />
              {peerCount}
            </span>
          </div>
          {!isMobile && (
            <button
              onClick={() => setShowNewChat(true)}
              className="p-2 rounded-em-sm hover:bg-surface transition-colors"
            >
              <Plus size={20} className="text-ink-dim" />
            </button>
          )}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('chatList.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 bg-surface rounded-em-md text-sm placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-ink-faint">
            <Users size={48} className="mb-3 opacity-50" />
            <p className="text-sm">{t('chatList.noChats')}</p>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isActive={currentChat?.id === chat.id}
              queued={outbox.filter((o) => o.chatId === chat.id).length}
              onClick={() => setCurrentChat(chat)}
            />
          ))
        )}
      </div>

      {/* Mobile FAB */}
      {isMobile && (
        <button
          onClick={() => setShowNewChat(true)}
          className="absolute bottom-5 right-5 w-14 h-14 rounded-full bg-accent text-accent-ink shadow-lg shadow-accent-glow flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus size={26} />
        </button>
      )}

      {/* New chat modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50">
          <div className="bg-elev rounded-em-lg p-6 w-96 max-w-[90vw] border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{t('chatList.newChat')}</h2>
              <button onClick={() => setShowNewChat(false)}>
                <X size={20} className="text-ink-faint" />
              </button>
            </div>

            <div className="flex gap-2 mb-4 p-1 bg-surface rounded-em-md">
              <button
                onClick={() => setNewChatType('private')}
                className={`flex-1 py-2 rounded-em-sm text-sm font-semibold transition-colors ${
                  newChatType === 'private' ? 'bg-accent-soft text-accent' : 'text-ink-dim'
                }`}
              >
                {t('chatList.private')}
              </button>
              <button
                onClick={() => { setNewChatType('group'); setShowCreateGroup(true); setShowNewChat(false); }}
                className={`flex-1 py-2 rounded-em-sm text-sm font-semibold transition-colors ${
                  newChatType === 'group' ? 'bg-accent-soft text-accent' : 'text-ink-dim'
                }`}
              >
                {t('chatList.group')}
              </button>
            </div>

            <input
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              placeholder={t('chatList.searchPlaceholder')}
              className="w-full px-3 py-2 bg-surface rounded-em-md text-sm placeholder:text-ink-faint mb-4 focus:outline-none focus:ring-2 focus:ring-accent"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateChat()}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewChat(false)}
                className="px-4 py-2 text-sm text-ink-faint hover:text-ink transition-colors"
              >
                {t('group.cancel')}
              </button>
              <button
                onClick={handleCreateChat}
                className="px-4 py-2 text-sm font-semibold bg-accent text-accent-ink rounded-em-md hover:brightness-110 transition"
              >
                {t('group.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateGroup && (
        <CreateGroupDialog
          onClose={() => setShowCreateGroup(false)}
          onCreated={() => setShowCreateGroup(false)}
        />
      )}
    </div>
  );
}

function ChatItem({
  chat,
  isActive,
  queued,
  onClick,
}: {
  chat: Chat;
  isActive: boolean;
  queued: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const peerIdentities = useContactsStore((s) => s.peerIdentities);
  const connectedPeers = useNetworkStore((s) => s.peers);
  const { user } = useUserStore();
  const lastMsg = chat.lastMessage;
  const ts = lastMsg ? new Date(lastMsg.timestamp) : null;
  const time = ts ? (isToday(ts) ? format(ts, 'HH:mm') : format(ts, 'dd.MM')) : '';

  const otherId = chat.participantIds.find((id) => id !== user?.id) || '';
  const peerId = peerIdentities[otherId]?.peerId;
  const online = !!peerId && connectedPeers.includes(peerId);

  const previewIcon =
    lastMsg?.messageType === 'image' ? (
      <ImageIcon size={13} className="inline -mt-0.5 mr-1" />
    ) : lastMsg?.messageType === 'file' ? (
      <FileText size={13} className="inline -mt-0.5 mr-1" />
    ) : lastMsg?.messageType === 'voice' ? (
      <Mic size={13} className="inline -mt-0.5 mr-1" />
    ) : null;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
        isActive ? 'bg-accent-soft' : 'hover:bg-surface'
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
          {chat.chatType === 'group' ? (
            <Users size={20} className="text-ink-dim" />
          ) : (
            <span className="text-lg font-bold text-ink">{(chat.name || '?')[0]?.toUpperCase()}</span>
          )}
        </div>
        {online && (
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-online border-2 border-elev" />
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold truncate">
            {chat.name || (chat.chatType === 'group' ? t('chatList.group') : t('chatList.private'))}
          </h3>
          {time && <span className="text-[11px] font-mono text-ink-faint ml-2 flex-shrink-0">{time}</span>}
        </div>
        {queued > 0 ? (
          <p className="text-[12.5px] text-warn truncate mt-0.5 flex items-center gap-1">
            <Clock size={12} /> {t('chat.queuedCount', { count: queued })}
          </p>
        ) : (
          lastMsg && (
            <p className="text-[12.5px] text-ink-dim truncate mt-0.5">
              {previewIcon}
              {lastMsg.messageType === 'image'
                ? t('chat.msgPhoto')
                : lastMsg.messageType === 'file'
                ? t('chat.msgFile')
                : lastMsg.messageType === 'voice'
                ? t('chat.msgVoice')
                : lastMsg.content || ''}
            </p>
          )
        )}
      </div>
      {chat.unreadCount > 0 && (
        <span className="bg-accent text-accent-ink text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
          {chat.unreadCount}
        </span>
      )}
    </button>
  );
}
