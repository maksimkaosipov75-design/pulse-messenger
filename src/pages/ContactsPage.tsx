import { useEffect, useState } from 'react';
import { useContactsStore } from '@/stores/contactsStore';
import { useChatStore } from '@/stores/chatStore';
import { useUserStore } from '@/stores/userStore';
import { useNetworkStore } from '@/stores/networkStore';
import { Search, UserPlus, Trash2, Ban, MessageCircle, QrCode, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Contact } from '@/types';
import { MyCodeDialog } from '@/components/contacts/MyCodeDialog';
import { AddContactDialog } from '@/components/contacts/AddContactDialog';
import { useCallStore } from '@/stores/callStore';

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

  const findOrCreateChat = async (contact: Contact) => {
    if (!user) return null;
    const existing = chats.find(
      (c) => c.chatType === 'private' && c.participantIds.includes(contact.user.id)
    );
    return (
      existing ??
      (await createChat('private', contact.user.displayName || contact.user.username, [
        user.id,
        contact.user.id,
      ]))
    );
  };

  const handleStartChat = async (contact: Contact) => {
    const chat = await findOrCreateChat(contact);
    if (!chat) return;
    navigate('/');
    useChatStore.getState().setCurrentChat(chat);
  };

  const handleCall = async (contact: Contact) => {
    if (!user) return;
    const chat = await findOrCreateChat(contact);
    if (!chat) return;
    const peerId = useContactsStore.getState().peerIdentities[contact.user.id]?.peerId;
    if (!peerId) return;
    const callerName = user.displayName || user.username;
    await useCallStore
      .getState()
      .startCall(chat.id, peerId, contact.user.displayName || contact.user.username, 'audio', user.id, callerName);
  };

  return (
    <div className="flex-1 h-full w-full overflow-y-auto overflow-x-hidden bg-bg">
      <div className="w-full px-4 md:px-8 py-5 md:py-7">
        {/* Header: title + counter + actions */}
        <div className="flex items-center gap-3 mb-5">
          <h1 className="text-[22px] font-extrabold tracking-tight">{t('contacts.title')}</h1>
          <span className="px-2 py-0.5 rounded-full bg-surface text-xs font-bold text-ink-dim">
            {contacts.length}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setShowMyCode(true)}
            className="inline-flex items-center justify-center leading-none gap-[7px] px-3.5 py-2 text-[13.5px] font-bold bg-surface rounded-em-md hover:bg-surface-2 transition-colors"
          >
            <QrCode size={15} /> {t('contacts.myCode')}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center justify-center leading-none gap-[7px] px-3.5 py-2 text-[13.5px] font-extrabold bg-accent text-accent-ink rounded-em-md hover:brightness-110 transition"
          >
            <UserPlus size={15} /> {t('contacts.add')}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('contacts.searchPlaceholder')}
            className="w-full pl-10 pr-3 py-2.5 bg-elev border rounded-em-md text-[14.5px] placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {/* List */}
        <div className="bg-elev border rounded-em-lg overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-ink-faint">
              <UserPlus size={44} className="mb-3 opacity-50" />
              <p className="text-sm">{t('contacts.noContacts')}</p>
            </div>
          ) : (
            filtered.map((contact, i) => (
              <ContactItem
                key={contact.user.id}
                contact={contact}
                divider={i > 0}
                onStartChat={() => handleStartChat(contact)}
                onCall={() => handleCall(contact)}
                onRemove={() => removeContact(contact.user.id)}
                onBlock={(blocked) => blockContact(contact.user.id, blocked)}
              />
            ))
          )}
        </div>

        {showMyCode && <MyCodeDialog onClose={() => setShowMyCode(false)} />}
        {showAdd && <AddContactDialog onClose={() => setShowAdd(false)} />}
      </div>
    </div>
  );
}

function ContactItem({
  contact,
  divider,
  onStartChat,
  onCall,
  onRemove,
  onBlock,
}: {
  contact: Contact;
  divider: boolean;
  onStartChat: () => void;
  onCall: () => void;
  onRemove: () => void;
  onBlock: (blocked: boolean) => void;
}) {
  const { t } = useTranslation();
  const peerIdentities = useContactsStore((s) => s.peerIdentities);
  const connectedPeers = useNetworkStore((s) => s.peers);
  const u = contact.user;
  const displayName = contact.nickname || u.displayName || u.username;
  const peerId = peerIdentities[u.id]?.peerId;
  const online = !!peerId && connectedPeers.includes(peerId);

  return (
    <div
      className={`group flex items-center gap-[13px] px-4 py-3 hover:bg-surface transition-colors ${
        divider ? 'border-t' : ''
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
          <span className="text-[17px] font-bold text-ink">{displayName[0]?.toUpperCase()}</span>
        </div>
        {online && (
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-online border-2 border-elev" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[15px] font-bold truncate ${
            contact.isBlocked ? 'text-ink-faint line-through' : ''
          }`}
        >
          {displayName}
        </p>
        <p className="text-[12.5px] text-ink-dim truncate">@{u.username}</p>
      </div>

      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button
          onClick={onStartChat}
          className="w-10 h-10 min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-em-sm hover:bg-surface-2 transition-colors"
          title={t('contacts.startChat')}
        >
          <MessageCircle size={17} className="text-ink-dim" />
        </button>
        <button
          onClick={onCall}
          disabled={!online}
          className="w-10 h-10 min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-em-sm hover:bg-surface-2 transition-colors disabled:opacity-30"
          title={t('chat.audioCall')}
        >
          <Phone size={17} className="text-ink-dim" />
        </button>
        <button
          onClick={() => onBlock(!contact.isBlocked)}
          className="w-10 h-10 min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-em-sm hover:bg-surface-2 transition-colors"
          title={contact.isBlocked ? t('contacts.unblock') : t('contacts.block')}
        >
          <Ban size={17} className={contact.isBlocked ? 'text-danger' : 'text-ink-dim'} />
        </button>
        <button
          onClick={onRemove}
          className="w-10 h-10 min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-em-sm hover:bg-surface-2 transition-colors"
          title={t('contacts.remove')}
        >
          <Trash2 size={17} className="text-ink-dim" />
        </button>
      </div>
    </div>
  );
}
