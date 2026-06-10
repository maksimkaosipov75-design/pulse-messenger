import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { appCacheDir } from '@tauri-apps/api/path';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Message } from '@/types';
import i18n from '../i18n';
import { toast } from '@/stores/toastStore';
import { formatError } from '@/services/api';

interface FileTransfer {
  messageId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkCount: number;
  senderId: string;
  senderName: string;
  chatId: string;
  progress: number;
  status: 'pending' | 'transferring' | 'completed' | 'failed';
}

interface FileState {
  transfers: Map<string, FileTransfer>;
  fileOfferUnlisten: UnlistenFn | null;
  fileChunkUnlisten: UnlistenFn | null;
  fileCompleteUnlisten: UnlistenFn | null;

  setupFileListeners: () => Promise<void>;
  selectAndSendFile: (chatId: string, toPeer: string) => Promise<Message | null>;
  sendFileFromPath: (chatId: string, toPeer: string, filePath: string) => Promise<Message>;
  getFileUrl: (messageId: string, fileName: string) => Promise<string | null>;
  saveToDownloads: (messageId: string, fileName: string) => Promise<string>;
}

export const useFileStore = create<FileState>((set, get) => ({
  transfers: new Map(),
  fileOfferUnlisten: null,
  fileChunkUnlisten: null,
  fileCompleteUnlisten: null,

  setupFileListeners: async () => {
    const state = get();
    if (state.fileOfferUnlisten) return;

    const offerUnlisten = await listen<{
      messageId: string;
      chatId: string;
      senderId: string;
      senderName: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      chunkCount: number;
      timestamp: number;
    }>('file-offer', (event) => {
      const t = event.payload;
      const transfers = new Map(get().transfers);
      transfers.set(t.messageId, {
        messageId: t.messageId,
        fileName: t.fileName,
        fileSize: t.fileSize,
        mimeType: t.mimeType,
        chunkCount: t.chunkCount,
        senderId: t.senderId,
        senderName: t.senderName,
        chatId: t.chatId,
        progress: 0,
        status: 'pending',
      });
      set({ transfers });
    });

    const chunkUnlisten = await listen<{
      messageId: string;
      chunkIndex: number;
      data: number[];
    }>('file-chunk', (event) => {
      const { messageId, chunkIndex } = event.payload;
      const transfers = new Map(get().transfers);
      const transfer = transfers.get(messageId);
      if (transfer) {
        // Approximate progress from chunk index
        transfer.progress = Math.min((chunkIndex + 1) / transfer.chunkCount, 0.99);
        transfer.status = 'transferring';
        set({ transfers });
      }
    });

    const completeUnlisten = await listen<{ messageId: string }>('file-complete', (event) => {
      const transfers = new Map(get().transfers);
      const transfer = transfers.get(event.payload.messageId);
      if (transfer) {
        transfer.status = 'completed';
        transfer.progress = 1;
        set({ transfers });
      }
    });

    set({
      fileOfferUnlisten: offerUnlisten,
      fileChunkUnlisten: chunkUnlisten,
      fileCompleteUnlisten: completeUnlisten,
    });
  },

  selectAndSendFile: async (chatId, toPeer) => {
    const filePath = await open({
      multiple: false,
      title: i18n.t('chat.selectFile'),
    });
    if (!filePath) return null;
    try {
      const path = filePath as string;
      if (path.startsWith('content://')) {
        // Android: no filesystem path the backend can read. Copy the
        // bytes into the app cache through the fs plugin (efficient
        // binary IPC — videos are too big for JSON arrays), then send
        // the real path.
        const data = await readFile(path);
        const fileName = path.split(/[/\\]/).pop()?.split('?')[0] || `file_${Date.now()}`;
        const cacheName = `pulse_send_${Date.now()}_${fileName}`;
        await writeFile(cacheName, data, { baseDir: BaseDirectory.AppCache });
        const cacheDir = await appCacheDir();
        return await get().sendFileFromPath(chatId, toPeer, `${cacheDir}/${cacheName}`);
      }
      return await get().sendFileFromPath(chatId, toPeer, path);
    } catch (e) {
      toast.error(formatError(e));
      return null;
    }
  },

  sendFileFromPath: async (chatId, toPeer, filePath) => {
    const message = await invoke<Message>('send_file_message', {
      chatId,
      toPeer,
      filePath,
    });
    return message;
  },

  getFileUrl: async (messageId, fileName) => {
    return invoke<string | null>('get_file_path', { messageId, fileName });
  },

  saveToDownloads: async (messageId, fileName) => {
    return invoke<string>('save_file_to_downloads', { messageId, fileName });
  },
}));
