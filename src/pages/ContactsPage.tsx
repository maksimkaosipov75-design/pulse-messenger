import { useEffect, useState } from 'react';
import { useContactsStore } from '@/stores/contactsStore';
import { useChatStore } from '@/stores/chatStore';
import { useUserStore } from '@/stores/userStore';
import { Search, UserPlus, Trash2, Ban, MessageCircle, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Contact } from '@/types';
import { MyCodeDialog } from '@/components/contacts/MyCodeDialog';
import { AddContactDialog } from '@/components/contacts/AddContactDialog';

export function ContactsPage() {
  const { t } = useTranslation();
  const { contacts, isLoading, loadContacts, removeContact, blockContact } = useContactsStore();
  const { createChat, chats, loadChats } = useChatStore();
  const { user } = useUserStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showMyCode, setShowMyCode] = useState(false);

  useEffect(() => {
    loadContacts();
    if (chats.length === 0) loadChats();
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
    // Reuse the existing 1:1 chat if there is one
    const existing = chats.find(
      (c) => c.chatType === 'private' && c.participantIds.includes(contact.user.id)
    );
    const chat =
      existing ??
      (await createChat('private', contact.user.displayName || contact.user.username, [
        user.id,
        contact.user.id,
      ]));
    navigate('/');
    useChatStore.getState().setCurrentChat(chat);
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="p-4 bg-elev border-b">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-ink">{t('contacts.title')}</h1>
          <div className="flex gap-1">
            <button
              onClick={() => setShowMyCode(true)}
              className="p-2 rounded-em-sm hover:bg-surface"
              title={t('contacts.myCode')}
            >
              <QrCode size={20} className="text-ink-dim" />
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="p-2 rounded-em-sm hover:bg-surface"
              title={t('contacts.addTitle')}
            >
              <UserPlus size={20} className="text-ink-dim" />
            </button>
          </div>
        </div>

        {showMyCode && <MyCodeDialog onClose={() => setShowMyCode(false)} />}
        {showAdd && <AddContactDialog onClose={() => setShowAdd(false)} />}

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('contacts.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 bg-surface rounded-em-sm text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-ink-faint">
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
    <div className="flex items-center justify-between px-4 py-3 hover:bg-surface transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold">{displayName[0]?.toUpperCase()}</span>
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-medium truncate ${contact.isBlocked ? 'text-ink-faint line-through' : 'text-ink'}`}>
            {displayName}
          </p>
          <p className="text-xs text-ink-dim truncate">@{u.username}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onStartChat}
          className="p-2 rounded-em-sm hover:bg-surface"
          title={t('contacts.startChat')}
        >
          <MessageCircle size={18} className="text-ink-faint" />
        </button>
        <button
          onClick={() => onBlock(!contact.isBlocked)}
          className="p-2 rounded-em-sm hover:bg-surface"
          title={contact.isBlocked ? t('contacts.unblock') : t('contacts.block')}
        >
          <Ban size={18} className={contact.isBlocked ? 'text-danger' : 'text-ink-faint'} />
        </button>
        <button
          onClick={onRemove}
          className="p-2 rounded-em-sm hover:bg-surface"
          title={t('contacts.remove')}
        >
          <Trash2 size={18} className="text-ink-faint" />
        </button>
      </div>
    </div>
  );
}
