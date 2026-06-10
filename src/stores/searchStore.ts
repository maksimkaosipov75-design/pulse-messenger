import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Message } from '@/types';

export interface SearchResultItem {
  message: Message;
  chatName: string;
}

interface SearchState {
  query: string;
  results: SearchResultItem[];
  isSearching: boolean;
  isOpen: boolean;

  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  clear: () => void;
  open: () => void;
  close: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  results: [],
  isSearching: false,
  isOpen: false,

  setQuery: (query) => set({ query }),

  search: async (query) => {
    if (!query.trim()) {
      set({ results: [], isSearching: false });
      return;
    }
    set({ isSearching: true });
    try {
      const results = await invoke<SearchResultItem[]>('search_messages', {
        query: query.trim(),
        limit: 50,
      });
      set({ results, isSearching: false });
    } catch (e) {
      console.error('Search failed:', e);
      set({ results: [], isSearching: false });
    }
  },

  clear: () => set({ query: '', results: [], isSearching: false }),

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, query: '', results: [], isSearching: false }),
}));
