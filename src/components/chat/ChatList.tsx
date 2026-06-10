import { useChatStore } from '@/stores/chatStore';
import { useUserStore } from '@/stores/userStore';
import { Search, Plus, X, Users } from 'lucide-react';
import { useState } from 'react';
import { Chat } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { CreateGroupDialog } from '@/components/group/CreateGroupDialog';

export function ChatList() {
  const { t } = useTranslation();
  const { chats, currentChat, setCurrentChat, createChat } = useChatStore();
  const { user } = useUserStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatType, setNewChatType] = useState<'private' | 'group'>('private');

  const filteredChats = searchQuery
    ? chats.filter((chat) =>
        chat.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
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
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pulse</h1>
          <button
            onClick={() => setShowNewChat(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Plus size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('chatList.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pulse-500"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Users size={48} className="mb-3 opacity-50" />
            <p className="text-sm">{t('chatList.noChats')}</p>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isActive={currentChat?.id === chat.id}
              onClick={() => setCurrentChat(chat)}
            />
          ))
        )}
      </div>

      {/* New chat modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-96 max-w-[90vw]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('chatList.newChat')}
              </h2>
              <button onClick={() => setShowNewChat(false)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setNewChatType('private')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  newChatType === 'private'
                    ? 'bg-pulse-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                {t('chatList.private')}
              </button>
              <button
                onClick={() => { setNewChatType('group'); setShowCreateGroup(true); setShowNewChat(false); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  newChatType === 'group'
                    ? 'bg-pulse-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                {t('chatList.group')}
              </button>
            </div>

            <input
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              placeholder={t('chatList.searchPlaceholder')}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 mb-4 focus:outline-none focus:ring-2 focus:ring-pulse-500"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateChat()}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewChat(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {t('group.cancel')}
              </button>
              <button
                onClick={handleCreateChat}
                className="px-4 py-2 text-sm bg-pulse-500 text-white rounded-lg hover:bg-pulse-600"
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

function ChatItem({ chat, isActive, onClick }: { chat: Chat; isActive: boolean; onClick: () => void }) {
  const { t, i18n } = useTranslation();
  const lastMsg = chat.lastMessage;
  const time = lastMsg
    ? formatDistanceToNow(new Date(lastMsg.timestamp), { addSuffix: true, locale: i18n.language === 'en' ? enUS : ru })
    : '';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
        isActive ? 'bg-pulse-50 dark:bg-pulse-900/20' : ''
      }`}
    >
      <div className="w-12 h-12 rounded-full bg-pulse-500 flex items-center justify-center flex-shrink-0">
        {chat.chatType === 'group' ? (
          <Users size={20} className="text-white" />
        ) : (
          <span className="text-lg font-bold text-white">
            {(chat.name || '?')[0]?.toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {chat.name || (chat.chatType === 'group' ? t('chatList.group') : t('chatList.private'))}
          </h3>
          {time && (
            <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{time}</span>
          )}
        </div>
        {lastMsg && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {lastMsg.messageType === 'image'
              ? t('chat.msgPhoto')
              : lastMsg.messageType === 'file'
              ? t('chat.msgFile')
              : lastMsg.messageType === 'voice'
              ? t('chat.msgVoice')
              : lastMsg.content || ''}
          </p>
        )}
      </div>
      {chat.unreadCount > 0 && (
        <span className="bg-pulse-500 text-white text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0">
          {chat.unreadCount}
        </span>
      )}
    </button>
  );
}
