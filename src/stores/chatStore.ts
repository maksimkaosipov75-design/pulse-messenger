import { create } from 'zustand';
import { Chat, Message } from '@/types';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invokeWithRetry, formatError } from '@/services/api';
import { toast } from '@/stores/toastStore';
import i18n from '@/i18n';

interface OutboxItem {
  messageId: string;
  chatId: string;
  toPeer: string;
  content: string;
}

const OUTBOX_KEY = 'pulse-outbox';

function loadOutbox(): OutboxItem[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persistOutbox(outbox: OutboxItem[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
}

interface ChatState {
  chats: Chat[];
  currentChat: Chat | null;
  messages: Message[];
  isLoadingChats: boolean;
  isLoadingMessages: boolean;
  error: string | null;
  incomingUnlisten: UnlistenFn | null;
  outbox: OutboxItem[];

  loadChats: () => Promise<void>;
  loadMessages: (chatId: string, limit?: number, before?: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  setCurrentChat: (chat: Chat | null) => void;
  sendMessage: (chatId: string, content: string, replyToId?: string) => Promise<Message>;
  sendNetworkMessage: (chatId: string, toPeer: string, content: string) => Promise<Message>;
  /** Unified send: network when possible, otherwise save locally and queue */
  sendChat: (chatId: string, toPeer: string, content: string, replyToId?: string) => Promise<Message>;
  flushOutbox: () => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  createChat: (chatType: string, name?: string, participantIds?: string[]) => Promise<Chat>;
  deleteChat: (chatId: string) => Promise<void>;
  markRead: (chatId: string) => Promise<void>;
  setupIncomingListener: () => Promise<void>;
  handleIncomingMessage: (message: Message) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  currentChat: null,
  messages: [],
  isLoadingChats: false,
  isLoadingMessages: false,
  error: null,
  incomingUnlisten: null,
  outbox: loadOutbox(),

  loadChats: async () => {
    set({ isLoadingChats: true, error: null });
    try {
      const chats = await invokeWithRetry<Chat[]>('get_chats');
      set({ chats, isLoadingChats: false });
    } catch (error) {
      set({ error: formatError(error), isLoadingChats: false });
    }
  },

  loadMessages: async (chatId: string, limit = 50, before?: string) => {
    set({ isLoadingMessages: true, error: null });
    try {
      const messages = await invokeWithRetry<Message[]>('get_messages', {
        chatId,
        limit,
        before: before ?? null,
      });
      set({ messages, isLoadingMessages: false });
    } catch (error) {
      set({ error: formatError(error), isLoadingMessages: false });
    }
  },

  loadMoreMessages: async () => {
    const { messages, currentChat } = get();
    if (!currentChat || messages.length === 0) return;

    const oldest = messages[messages.length - 1];
    try {
      const older = await invokeWithRetry<Message[]>('get_messages', {
        chatId: currentChat.id,
        limit: 50,
        before: oldest.timestamp,
      });
      if (older.length > 0) {
        set({ messages: [...messages, ...older] });
      }
    } catch (error) {
      set({ error: formatError(error) });
    }
  },

  setCurrentChat: (chat: Chat | null) => {
    set({ currentChat: chat, messages: [] });
    if (chat) {
      get().loadMessages(chat.id);
    }
  },

  sendMessage: async (chatId: string, content: string, replyToId?: string) => {
    try {
      const message = await invoke<Message>('send_message', {
        chatId,
        content,
        messageType: 'text',
        replyToId: replyToId ?? null,
      });
      set((state) => ({
        messages: [...state.messages, message],
        chats: state.chats.map((c) =>
          c.id === chatId
            ? { ...c, lastMessage: message, updatedAt: message.timestamp }
            : c
        ),
      }));
      return message;
    } catch (error) {
      toast.error(formatError(error));
      set({ error: formatError(error) });
      throw error;
    }
  },

  sendNetworkMessage: async (chatId: string, toPeer: string, content: string) => {
    try {
      const message = await invoke<Message>('send_network_message', {
        chatId,
        toPeer,
        content,
      });
      set((state) => ({
        messages: [...state.messages, message],
        chats: state.chats.map((c) =>
          c.id === chatId
            ? { ...c, lastMessage: message, updatedAt: message.timestamp }
            : c
        ),
      }));
      return message;
    } catch (error) {
      toast.error(formatError(error));
      set({ error: formatError(error) });
      throw error;
    }
  },

  sendChat: async (chatId: string, toPeer: string, content: string, replyToId?: string) => {
    if (toPeer) {
      try {
        return await get().sendNetworkMessage(chatId, toPeer, content);
      } catch {
        // Peer unreachable or network down — fall through to local + queue
      }
    }
    const message = await get().sendMessage(chatId, content, replyToId);
    if (toPeer) {
      const outbox = [...get().outbox, { messageId: message.id, chatId, toPeer, content }];
      persistOutbox(outbox);
      set({ outbox });
      toast.info(i18n.t('chat.queuedOffline'));
    }
    return message;
  },

  flushOutbox: async () => {
    const pending = get().outbox;
    if (pending.length === 0) return;

    const stillPending: OutboxItem[] = [];
    for (const item of pending) {
      try {
        await invoke<Message>('send_network_message', {
          chatId: item.chatId,
          toPeer: item.toPeer,
          content: item.content,
          messageId: item.messageId,
        });
      } catch {
        stillPending.push(item);
      }
    }
    persistOutbox(stillPending);
    set({ outbox: stillPending });
    const sent = pending.length - stillPending.length;
    if (sent > 0) {
      toast.success(i18n.t('chat.queueFlushed', { count: sent }));
    }
  },

  deleteMessage: async (chatId: string, messageId: string) => {
    try {
      await invoke('delete_message', { chatId, messageId });
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== messageId),
      }));
    } catch (error) {
      toast.error(formatError(error));
      set({ error: formatError(error) });
    }
  },

  createChat: async (chatType: string, name?: string, participantIds?: string[]) => {
    try {
      const chat = await invoke<Chat>('create_chat', {
        chatType,
        name: name ?? null,
        participantIds: participantIds ?? [],
      });
      set((state) => ({
        chats: [chat, ...state.chats],
      }));
      return chat;
    } catch (error) {
      toast.error(formatError(error));
      set({ error: formatError(error) });
      throw error;
    }
  },

  deleteChat: async (chatId: string) => {
    try {
      await invoke('delete_chat', { chatId });
      set((state) => ({
        chats: state.chats.filter((c) => c.id !== chatId),
        currentChat: state.currentChat?.id === chatId ? null : state.currentChat,
        messages: state.currentChat?.id === chatId ? [] : state.messages,
      }));
    } catch (error) {
      toast.error(formatError(error));
      set({ error: formatError(error) });
    }
  },

  markRead: async (chatId: string) => {
    try {
      await invoke('mark_messages_read', { chatId });
      set((state) => ({
        chats: state.chats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  setupIncomingListener: async () => {
    // Remove existing listener
    const { incomingUnlisten } = get();
    if (incomingUnlisten) incomingUnlisten();

    const unlisten = await listen<Message>('incoming-message', (event) => {
      get().handleIncomingMessage(event.payload);
    });

    set({ incomingUnlisten: unlisten });
  },

  handleIncomingMessage: (message: Message) => {
    const { currentChat } = get();
    const isCurrentChat = currentChat?.id === message.chatId;

    set((state) => {
      const newMessages = isCurrentChat
        ? [...state.messages, message]
        : state.messages;

      const newChats = state.chats.map((c) => {
        if (c.id === message.chatId) {
          return {
            ...c,
            lastMessage: message,
            updatedAt: message.timestamp,
            unreadCount: isCurrentChat ? c.unreadCount : c.unreadCount + 1,
          };
        }
        return c;
      });

      return { messages: newMessages, chats: newChats };
    });

    // If chat doesn't exist in list, reload from backend
    if (!get().chats.some((c) => c.id === message.chatId)) {
      get().loadChats();
    }
  },
}));
