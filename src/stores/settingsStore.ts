import { create } from 'zustand';
import { Settings, ThemeOption } from '@/types';
import { invoke } from '@tauri-apps/api/core';
import i18n from '../i18n';

interface SettingsState {
  settings: Settings;
  isLoading: boolean;

  themes: ThemeOption[];

  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  setTheme: (themeId: string) => Promise<void>;
  toggleDark: () => Promise<void>;
}

function getThemes(): ThemeOption[] {
  return [
    { id: 'telegram', name: i18n.t('theme.telegram'), color: '#0088CC' },
    { id: 'green', name: i18n.t('theme.green'), color: '#4CAF50' },
    { id: 'purple', name: i18n.t('theme.purple'), color: '#7C4DFF' },
    { id: 'orange', name: i18n.t('theme.orange'), color: '#FF9800' },
    { id: 'red', name: i18n.t('theme.red'), color: '#E53935' },
  ];
}

const defaultSettings: Settings = {
  theme: 'telegram',
  isDark: true,
  language: 'en',
  notificationsEnabled: true,
  soundEnabled: true,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  isLoading: false,
  themes: getThemes(),

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const settings = await invoke<Settings>('get_settings');
      set({ settings, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  updateSettings: async (newSettings: Partial<Settings>) => {
    const settings = { ...get().settings, ...newSettings };
    await invoke('update_settings', { settings });
    set({ settings });
  },

  setTheme: async (themeId: string) => {
    await invoke('set_theme', { themeId });
    set((state) => ({
      settings: { ...state.settings, theme: themeId },
    }));
  },

  toggleDark: async () => {
    const isDark = await invoke<boolean>('toggle_dark_mode');
    set((state) => ({
      settings: { ...state.settings, isDark },
    }));
  },
}));
