import { describe, it, expect, beforeEach, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/i18n', () => ({ default: { t: (k: string) => k } }));

import { useChatStore } from './chatStore';
import { useToastStore } from './toastStore';

const initialState = useChatStore.getState();

function message(id: string, chatId = 'c1') {
  return {
    id,
    chatId,
    senderId: 'me',
    content: 'hi',
    messageType: 'text',
    timestamp: new Date().toISOString(),
    isRead: true,
  };
}

describe('chatStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState({ ...initialState, chats: [], messages: [], outbox: [] });
    useToastStore.setState({ toasts: [] });
    invokeMock.mockReset();
  });

  describe('sendChat', () => {
    it('sends over the network when a peer is given', async () => {
      invokeMock.mockResolvedValueOnce(message('m1'));
      await useChatStore.getState().sendChat('c1', 'peer1', 'hi');
      expect(invokeMock).toHaveBeenCalledWith('send_network_message', {
        chatId: 'c1',
        toPeer: 'peer1',
        content: 'hi',
      });
      expect(useChatStore.getState().outbox).toHaveLength(0);
    });

    it('falls back to local save and queues when network send fails', async () => {
      invokeMock
        .mockRejectedValueOnce('peer unreachable') // send_network_message
        .mockResolvedValueOnce(message('m2')); // send_message
      await useChatStore.getState().sendChat('c1', 'peer1', 'hi');

      const outbox = useChatStore.getState().outbox;
      expect(outbox).toEqual([{ messageId: 'm2', chatId: 'c1', toPeer: 'peer1', content: 'hi' }]);
      // Persisted for the next launch
      expect(JSON.parse(localStorage.getItem('pulse-outbox')!)).toEqual(outbox);
    });

    it('sends local-only when no peer (groups)', async () => {
      invokeMock.mockResolvedValueOnce(message('m3'));
      await useChatStore.getState().sendChat('c1', '', 'hi');
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock.mock.calls[0][0]).toBe('send_message');
      expect(useChatStore.getState().outbox).toHaveLength(0);
    });
  });

  describe('flushOutbox', () => {
    it('resends queued messages with their original IDs and clears the queue', async () => {
      useChatStore.setState({
        outbox: [{ messageId: 'm1', chatId: 'c1', toPeer: 'p1', content: 'hi' }],
      });
      invokeMock.mockResolvedValueOnce(message('m1'));

      await useChatStore.getState().flushOutbox();

      expect(invokeMock).toHaveBeenCalledWith('send_network_message', {
        chatId: 'c1',
        toPeer: 'p1',
        content: 'hi',
        messageId: 'm1',
      });
      expect(useChatStore.getState().outbox).toHaveLength(0);
    });

    it('keeps items that still fail', async () => {
      useChatStore.setState({
        outbox: [
          { messageId: 'm1', chatId: 'c1', toPeer: 'p1', content: 'a' },
          { messageId: 'm2', chatId: 'c1', toPeer: 'p2', content: 'b' },
        ],
      });
      invokeMock.mockResolvedValueOnce(message('m1')).mockRejectedValueOnce('still offline');

      await useChatStore.getState().flushOutbox();

      expect(useChatStore.getState().outbox).toEqual([
        { messageId: 'm2', chatId: 'c1', toPeer: 'p2', content: 'b' },
      ]);
    });
  });

  describe('handleIncomingMessage', () => {
    it('appends to open chat without unread increment', () => {
      useChatStore.setState({
        currentChat: { id: 'c1' } as never,
        chats: [{ id: 'c1', unreadCount: 0 } as never],
      });
      useChatStore.getState().handleIncomingMessage(message('m1') as never);
      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(1);
      expect((state.chats[0] as { unreadCount: number }).unreadCount).toBe(0);
    });

    it('increments unread for background chats', () => {
      useChatStore.setState({
        currentChat: { id: 'other' } as never,
        chats: [{ id: 'c1', unreadCount: 1 } as never],
      });
      useChatStore.getState().handleIncomingMessage(message('m1') as never);
      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(0);
      expect((state.chats[0] as { unreadCount: number }).unreadCount).toBe(2);
    });
  });
});
