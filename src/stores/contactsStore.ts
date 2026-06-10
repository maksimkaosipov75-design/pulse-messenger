import { create } from 'zustand';
import { Contact, User } from '@/types';
import { invoke } from '@tauri-apps/api/core';

interface ContactsState {
  contacts: Contact[];
  isLoading: boolean;

  loadContacts: () => Promise<void>;
  addContact: (user: User, nickname?: string) => Promise<void>;
  removeContact: (userId: string) => Promise<void>;
  blockContact: (userId: string, blocked: boolean) => Promise<void>;
}

export const useContactsStore = create<ContactsState>((set) => ({
  contacts: [],
  isLoading: false,

  loadContacts: async () => {
    set({ isLoading: true });
    try {
      const contacts = await invoke<Contact[]>('get_contacts');
      set({ contacts, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addContact: async (user: User, nickname?: string) => {
    const contact = await invoke<Contact>('add_contact', {
      user,
      nickname: nickname ?? null,
    });
    set((state) => ({ contacts: [...state.contacts, contact] }));
  },

  removeContact: async (userId: string) => {
    await invoke('remove_contact', { userId });
    set((state) => ({
      contacts: state.contacts.filter((c) => c.user.id !== userId),
    }));
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
