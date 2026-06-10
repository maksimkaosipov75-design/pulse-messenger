import { useEffect, useState } from 'react';
import { useContactsStore } from '@/stores/contactsStore';
import { useChatStore } from '@/stores/chatStore';
import { useUserStore } from '@/stores/userStore';
import { Search, UserPlus, Trash2, Ban, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Contact } from '@/types';

export function ContactsPage() {
  const { t } = useTranslation();
  const { contacts, isLoading, loadContacts, addContact, removeContact, blockContact } = useContactsStore();
  const { createChat } = useChatStore();
  const { user } = useUserStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addNickname, setAddNickname] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const filtered = search
    ? contacts.filter(
        (c) =>
          c.user.username.toLowerCase().includes(search.toLowerCase()) ||
          c.user.displayName?.toLowerCase().includes(search.toLowerCase())
      )
    : contacts;

  const handleStartChat = async (contact: Contact) => {
    if (!user) return;
    const chat = await createChat('private', contact.user.displayName || contact.user.username, [
      user.id,
      contact.user.id,
    ]);
    navigate('/');
    useChatStore.getState().setCurrentChat(chat);
  };

  const handleAddContact = async () => {
    if (!addUserId.trim()) return;
    try {
      const newUser = { id: addUserId.trim(), username: addUserId.trim(), publicKey: '', lastSeen: '', isOnline: false } as import('@/types').User;
      await addContact(newUser, addNickname.trim() || undefined);
      setAddUserId('');
      setAddNickname('');
      setShowAdd(false);
    } catch (e) {
      console.error('Failed to add contact:', e);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('contacts.title')}</h1>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <UserPlus size={20} className="text-gray-500" />
          </button>
        </div>

        {showAdd && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-2">
            <input
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              placeholder={t('contacts.userId')}
              className="w-full px-3 py-2 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pulse-500"
            />
            <input
              value={addNickname}
              onChange={(e) => setAddNickname(e.target.value)}
              placeholder={t('contacts.nickname')}
              className="w-full px-3 py-2 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pulse-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowAdd(false); setAddUserId(''); setAddNickname(''); }}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {t('group.cancel')}
              </button>
              <button
                onClick={handleAddContact}
                className="px-3 py-1.5 text-sm bg-pulse-500 text-white rounded-lg hover:bg-pulse-600"
              >
                {t('contacts.add')}
              </button>
            </div>
          </div>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('contacts.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pulse-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin w-6 h-6 border-2 border-pulse-500 border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <UserPlus size={48} className="mb-3 opacity-50" />
            <p className="text-sm">{t('contacts.noContacts')}</p>
          </div>
        ) : (
          filtered.map((contact) => (
            <ContactItem
              key={contact.user.id}
              contact={contact}
              onStartChat={() => handleStartChat(contact)}
              onRemove={() => removeContact(contact.user.id)}
              onBlock={(blocked) => blockContact(contact.user.id, blocked)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ContactItem({
  contact,
  onStartChat,
  onRemove,
  onBlock,
}: {
  contact: Contact;
  onStartChat: () => void;
  onRemove: () => void;
  onBlock: (blocked: boolean) => void;
}) {
  const { t } = useTranslation();
  const u = contact.user;
  const displayName = contact.nickname || u.displayName || u.username;

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-full bg-pulse-500 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold">{displayName[0]?.toUpperCase()}</span>
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-medium truncate ${contact.isBlocked ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>
            {displayName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">@{u.username}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onStartChat}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          title={t('contacts.startChat')}
        >
          <MessageCircle size={18} className="text-gray-400" />
        </button>
        <button
          onClick={() => onBlock(!contact.isBlocked)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          title={contact.isBlocked ? t('contacts.unblock') : t('contacts.block')}
        >
          <Ban size={18} className={contact.isBlocked ? 'text-red-400' : 'text-gray-400'} />
        </button>
        <button
          onClick={onRemove}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          title={t('contacts.remove')}
        >
          <Trash2 size={18} className="text-gray-400" />
        </button>
      </div>
    </div>
  );
}
