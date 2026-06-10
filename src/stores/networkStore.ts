import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export type NetworkStatusType = 'offline' | 'starting' | 'online';

export interface NetworkStatus {
  status: NetworkStatusType;
  peerCount: number;
  localPeerId: string | null;
  listenAddress: string | null;
  peers: string[];
}

export interface NetworkEvent {
  peerConnected?: { peerId: string; multiaddr: string };
  peerDisconnected?: { peerId: string };
  messageReceived?: { fromPeer: string; data: number[] };
  messageDelivered?: { peerId: string; messageId: string };
  sendFailed?: { peerId: string; messageId: string | null; error: string };
  listenAddress?: { address: string };
  networkError?: { error: string };
}

interface NetworkState {
  status: NetworkStatusType;
  peerCount: number;
  localPeerId: string | null;
  listenAddress: string | null;
  peers: string[];
  error: string | null;
  unlisten: UnlistenFn | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;

  startNetwork: () => Promise<void>;
  stopNetwork: () => Promise<void>;
  connectPeer: (addr: string) => Promise<void>;
  refreshPeers: () => Promise<void>;
  setupEventListener: () => Promise<void>;
  scheduleReconnect: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 2000; // 2 seconds

export const useNetworkStore = create<NetworkState>((set, get) => ({
  status: 'offline',
  peerCount: 0,
  localPeerId: null,
  listenAddress: null,
  peers: [],
  error: null,
  unlisten: null,
  reconnectTimer: null,
  reconnectAttempts: 0,

  startNetwork: async () => {
    set({ status: 'starting', error: null });
    try {
      const peerId = await invoke<string>('start_network');
      set({
        status: 'online',
        localPeerId: peerId,
        reconnectAttempts: 0,
      });
      get().setupEventListener();
      // Send anything queued while we were offline
      import('@/stores/chatStore').then(({ useChatStore }) =>
        useChatStore.getState().flushOutbox()
      );
    } catch (error) {
      set({ status: 'offline', error: String(error) });
      get().scheduleReconnect();
    }
  },

  stopNetwork: async () => {
    const { reconnectTimer, unlisten } = get();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (unlisten) unlisten();
    try {
      await invoke('stop_network');
    } catch { /* already stopped */ }
    set({
      status: 'offline',
      peerCount: 0,
      peers: [],
      unlisten: null,
      reconnectTimer: null,
      reconnectAttempts: 0,
    });
  },

  scheduleReconnect: () => {
    const { reconnectAttempts, reconnectTimer, status } = get();
    if (status === 'online' || reconnectTimer) return;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      set({ error: 'Max reconnect attempts reached. Please reconnect manually.' });
      return;
    }
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000);
    const timer = setTimeout(async () => {
      set({ reconnectTimer: null, reconnectAttempts: reconnectAttempts + 1 });
      try {
        await get().startNetwork();
      } catch { /* will retry */ }
    }, delay);
    set({ reconnectTimer: timer });
  },

  connectPeer: async (addr: string) => {
    try {
      await invoke('connect_peer', { addr });
      // Refresh peers after a short delay
      setTimeout(() => get().refreshPeers(), 1000);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  refreshPeers: async () => {
    try {
      const peers = await invoke<string[]>('get_peers');
      set({ peers, peerCount: peers.length });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  setupEventListener: async () => {
    // Remove existing listener
    const { unlisten } = get();
    if (unlisten) unlisten();

    const newUnlisten = await listen<NetworkEvent>('network-event', (event) => {
      const data = event.payload;

      if (data.peerConnected) {
        set((state) => {
          const newPeers = [...new Set([...state.peers, data.peerConnected!.peerId])];
          return { peers: newPeers, peerCount: newPeers.length };
        });
        // A peer we queued messages for may have just appeared
        import('@/stores/chatStore').then(({ useChatStore }) =>
          useChatStore.getState().flushOutbox()
        );
      }

      if (data.peerDisconnected) {
        set((state) => {
          const newPeers = state.peers.filter((p) => p !== data.peerDisconnected!.peerId);
          return { peers: newPeers, peerCount: newPeers.length };
        });
      }

      if (data.listenAddress) {
        // Prefer a routable LAN address over loopback for display and
        // contact codes
        const addr = data.listenAddress.address;
        const isLoopback = (a: string) => a.includes('/127.0.0.1/') || a.includes('/::1/');
        if (!isLoopback(addr) || !get().listenAddress) {
          set({ listenAddress: addr });
        }
      }

      if (data.messageDelivered) {
        import('@/stores/chatStore').then(({ useChatStore }) =>
          useChatStore.getState().handleDelivered(data.messageDelivered!.messageId)
        );
      }

      if (data.sendFailed?.messageId) {
        import('@/stores/chatStore').then(({ useChatStore }) =>
          useChatStore.getState().handleSendFailed(data.sendFailed!.messageId!)
        );
      }

      if (data.messageReceived) {
        // Message received from network — will be handled by chatStore
        // For now, just log it
        console.log('Network message from', data.messageReceived.fromPeer);
      }

      if (data.networkError) {
        set({ error: data.networkError.error });
        // Trigger reconnect on persistent errors
        const { status } = get();
        if (status === 'online') {
          get().scheduleReconnect();
        }
      }
    });

    set({ unlisten: newUnlisten });
  },
}));
