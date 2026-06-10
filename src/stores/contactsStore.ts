import { create } from 'zustand';
import { Contact, User } from '@/types';
import { invoke } from '@tauri-apps/api/core';

export interface PeerIdentity {
  userId: string;
  peerId: string;
  multiaddr: string | null;
}

interface ContactsState {
  contacts: Contact[];
  /** user id -> libp2p peer identity */
  peerIdentities: Record<string, PeerIdentity>;
  isLoading: boolean;

  loadContacts: () => Promise<void>;
  loadPeerIdentities: () => Promise<void>;
  addContact: (user: User, nickname?: string) => Promise<void>;
  addContactByCode: (code: string, nickname?: string) => Promise<Contact>;
  removeContact: (userId: string) => Promise<void>;
  blockContact: (userId: string, blocked: boolean) => Promise<void>;
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  peerIdentities: {},
  isLoading: false,

  loadContacts: async () => {
    set({ isLoading: true });
    try {
      const contacts = await invoke<Contact[]>('get_contacts');
      set({ contacts, isLoading: false });
      get().loadPeerIdentities();
    } catch {
      set({ isLoading: false });
    }
  },

  loadPeerIdentities: async () => {
    try {
      const list = await invoke<PeerIdentity[]>('get_peer_identities');
      set({ peerIdentities: Object.fromEntries(list.map((p) => [p.userId, p])) });
    } catch {
      // non-fatal
    }
  },

  addContact: async (user: User, nickname?: string) => {
    const contact = await invoke<Contact>('add_contact', {
      user,
      nickname: nickname ?? null,
    });
    set((state) => ({ contacts: [...state.contacts, contact] }));
  },

  addContactByCode: async (code: string, nickname?: string) => {
    const contact = await invoke<Contact>('add_contact_by_code', {
      code,
      nickname: nickname ?? null,
    });
    set((state) => ({
      contacts: [...state.contacts.filter((c) => c.user.id !== contact.user.id), contact],
    }));
    await get().loadPeerIdentities();
    return contact;
  },

  removeContact: async (userId: string) => {
    await invoke('remove_contact', { userId });
    set((state) => {
      const peerIdentities = { ...state.peerIdentities };
      delete peerIdentities[userId];
      return {
        contacts: state.contacts.filter((c) => c.user.id !== userId),
        peerIdentities,
      };
    });
  },

  blockContact: async (userId: string, blocked: boolean) => {
    await invoke('block_contact', { userId, blocked });
    set((state) => ({
      contacts: state.contacts.map((c) =>
        c.user.id === userId ? { ...c, isBlocked: blocked } : c
      ),
    }));
  },
}));
