import { create } from 'zustand';
import { User } from '@/types';
import { invoke } from '@tauri-apps/api/core';

interface UserState {
  user: User | null;
  isLoading: boolean;
  isSetup: boolean;

  loadUser: () => Promise<void>;
  createUser: (username: string, displayName?: string) => Promise<User>;
  updateProfile: (data: { displayName?: string; avatarUrl?: string; bio?: string }) => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isLoading: true,
  isSetup: false,

  loadUser: async () => {
    set({ isLoading: true });
    try {
      const user = await invoke<User | null>('get_current_user');
      set({ user, isLoading: false, isSetup: !!user });
    } catch {
      set({ isLoading: false, isSetup: false });
    }
  },

  createUser: async (username: string, displayName?: string) => {
    const user = await invoke<User>('create_user_profile', { username, displayName });
    set({ user, isSetup: true });
    return user;
  },

  updateProfile: async (data) => {
    const user = await invoke<User>('update_user_profile', data);
    set({ user });
  },
}));
