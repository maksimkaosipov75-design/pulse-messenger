import { create } from 'zustand';
import { User } from '@/types';
import { invoke } from '@tauri-apps/api/core';

const LOGGED_OUT_KEY = 'pulse-logged-out';

interface UserState {
  user: User | null;
  isLoading: boolean;
  isSetup: boolean;
  /** Profile exists on disk but the user logged out of the session */
  isLoggedOut: boolean;

  loadUser: () => Promise<void>;
  createUser: (username: string, displayName?: string) => Promise<User>;
  updateProfile: (data: { displayName?: string; avatarUrl?: string; bio?: string }) => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  isLoading: true,
  isSetup: false,
  isLoggedOut: localStorage.getItem(LOGGED_OUT_KEY) === '1',

  loadUser: async () => {
    set({ isLoading: true });
    try {
      const user = await invoke<User | null>('get_current_user');
      const loggedOut = localStorage.getItem(LOGGED_OUT_KEY) === '1';
      set({
        user,
        isLoading: false,
        isSetup: !!user && !loggedOut,
        isLoggedOut: !!user && loggedOut,
      });
    } catch {
      set({ isLoading: false, isSetup: false });
    }
  },

  createUser: async (username: string, displayName?: string) => {
    const user = await invoke<User>('create_user_profile', { username, displayName });
    localStorage.removeItem(LOGGED_OUT_KEY);
    set({ user, isSetup: true, isLoggedOut: false });
    return user;
  },

  updateProfile: async (data) => {
    const user = await invoke<User>('update_user_profile', data);
    set({ user });
  },

  login: async () => {
    localStorage.removeItem(LOGGED_OUT_KEY);
    set({ isLoggedOut: false });
    await get().loadUser();
    // Restart the network session under this identity
    const { useNetworkStore } = await import('@/stores/networkStore');
    useNetworkStore.getState().startNetwork();
  },

  logout: async () => {
    try {
      await invoke('logout');
    } catch {
      // in-memory only; safe to continue
    }
    const { useNetworkStore } = await import('@/stores/networkStore');
    await useNetworkStore.getState().stopNetwork();
    localStorage.setItem(LOGGED_OUT_KEY, '1');
    set({ isSetup: false, isLoggedOut: true });
  },

  deleteAccount: async () => {
    await invoke('delete_account');
    const { useNetworkStore } = await import('@/stores/networkStore');
    await useNetworkStore.getState().stopNetwork();
    localStorage.clear();
    // Full reload: every store resets to the empty state
    window.location.reload();
  },
}));
