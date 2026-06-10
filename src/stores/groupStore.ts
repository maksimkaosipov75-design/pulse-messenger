import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Chat, GroupMember, GroupInvite, GroupSettings } from '@/types';

interface GroupState {
  members: Record<string, GroupMember[]>;
  invites: Record<string, GroupInvite>;
  groupUnlisteners: UnlistenFn[] | null;

  loadMembers: (chatId: string) => Promise<GroupMember[]>;
  addMember: (chatId: string, userId: string, displayName: string) => Promise<void>;
  removeMember: (chatId: string, userId: string) => Promise<void>;
  leaveGroup: (chatId: string) => Promise<void>;
  changeRole: (chatId: string, targetUserId: string, newRole: string) => Promise<void>;
  createInvite: (chatId: string, maxUses?: number, expiresInHours?: number) => Promise<GroupInvite>;
  joinViaInvite: (inviteCode: string) => Promise<Chat>;
  updateSettings: (chatId: string, settings: GroupSettings) => Promise<Chat>;
  setupGroupListeners: () => Promise<void>;
  cleanupGroupListeners: () => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  members: {},
  invites: {},
  groupUnlisteners: null,

  loadMembers: async (chatId) => {
    const members = await invoke<GroupMember[]>('get_group_members', { chatId });
    set((state) => ({
      members: { ...state.members, [chatId]: members },
    }));
    return members;
  },

  addMember: async (chatId, userId, displayName) => {
    await invoke('add_group_member', { chatId, userId, displayName });
    await get().loadMembers(chatId);
  },

  removeMember: async (chatId, userId) => {
    await invoke('remove_group_member', { chatId, userId });
    await get().loadMembers(chatId);
  },

  leaveGroup: async (chatId) => {
    await invoke('leave_group', { chatId });
  },

  changeRole: async (chatId, targetUserId, newRole) => {
    await invoke('change_member_role', { chatId, targetUserId, newRole });
    await get().loadMembers(chatId);
  },

  createInvite: async (chatId, maxUses, expiresInHours) => {
    const invite = await invoke<GroupInvite>('create_group_invite', {
      chatId,
      maxUses: maxUses ?? null,
      expiresInHours: expiresInHours ?? null,
    });
    set((state) => ({
      invites: { ...state.invites, [invite.code]: invite },
    }));
    return invite;
  },

  joinViaInvite: async (inviteCode) => {
    const chat = await invoke<Chat>('join_group_via_invite', { inviteCode });
    return chat;
  },

  updateSettings: async (chatId, settings) => {
    const chat = await invoke<Chat>('update_group_settings', { chatId, settings });
    return chat;
  },

  setupGroupListeners: async () => {
    const { groupUnlisteners } = get();
    if (groupUnlisteners) return;

    const unlisteners: UnlistenFn[] = [];

    unlisteners.push(
      await listen<{ chatId: string; groupName: string; senderId: string; timestamp: number }>(
        'group-created',
        (event) => {
          console.log('Group created:', event.payload);
          // Reload chats to pick up the new group
          import('@/stores/chatStore').then(({ useChatStore }) => {
            useChatStore.getState().loadChats();
          });
        }
      )
    );

    unlisteners.push(
      await listen<{ chatId: string; senderId: string; updateType: unknown; timestamp: number }>(
        'group-updated',
        (event) => {
          console.log('Group updated:', event.payload);
          // Reload members for this group
          get().loadMembers(event.payload.chatId);
        }
      )
    );

    set({ groupUnlisteners: unlisteners });
  },

  cleanupGroupListeners: () => {
    const { groupUnlisteners } = get();
    if (groupUnlisteners) {
      groupUnlisteners.forEach((u) => u());
      set({ groupUnlisteners: null });
    }
  },
}));
