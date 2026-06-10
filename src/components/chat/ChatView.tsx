import { useChatStore } from '@/stores/chatStore';
import { useUserStore } from '@/stores/userStore';
import { useContactsStore } from '@/stores/contactsStore';
import { useNetworkStore } from '@/stores/networkStore';
import { useFileStore } from '@/stores/fileStore';
import { useCallStore } from '@/stores/callStore';
import { useGroupStore } from '@/stores/groupStore';
import { invoke } from '@tauri-apps/api/core';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Paperclip, Phone, Video, ArrowLeft, Trash2, Mic, Square, Users } from 'lucide-react';
import { Message, MessageType } from '@/types';
import { format } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { FileMessage } from './FileMessage';
import { GroupSettingsPanel } from '@/components/group/GroupSettingsPanel';

export function ChatView({ onBack }: { onBack?: () => void } = {}) {
  const { currentChat, messages, sendChat, deleteMessage, markRead, loadMoreMessages, isLoadingMessages } = useChatStore();
  const { user } = useUserStore();
  const { peerIdentities, loadPeerIdentities } = useContactsStore();
  const connectedPeers = useNetworkStore((s) => s.peers);
  const { selectAndSendFile } = useFileStore();
  const { startCall } = useCallStore();
  const { members, loadMembers } = useGroupStore();
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const groupMembers = currentChat?.chatType === 'group' ? members[currentChat.id] || [] : [];
  const memberNameMap = Object.fromEntries(groupMembers.map(m => [m.userId, m.displayName]));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (currentChat) {
      markRead(currentChat.id);
      if (currentChat.chatType === 'group') {
        loadMembers(currentChat.id);
      }
    }
  }, [currentChat?.id]);

  // Peer mapping is needed to route messages for 1:1 chats
  useEffect(() => {
    if (Object.keys(peerIdentities).length === 0) loadPeerIdentities();
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  if (!currentChat) return null;

  // Resolve the network peer for this chat: participant IDs are user
  // UUIDs that map to libp2p peers via peer_identities. Legacy chats
  // created from a raw PeerId still work via the fallback.
  const otherUserId = currentChat.participantIds.find((id) => id !== user?.id) || '';
  const peerId =
    peerIdentities[otherUserId]?.peerId ||
    (otherUserId.startsWith('12D3Koo') ? otherUserId : '');
  const peerOnline = !!peerId && connectedPeers.includes(peerId);

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    try {
      const networkPeer = currentChat.chatType === 'private' ? peerId : '';
      await sendChat(currentChat.id, networkPeer, inputValue.trim(), replyTo?.id);
      setInputValue('');
      setReplyTo(null);
    } catch {
      // error handled in store
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setReplyTo(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, message: Message) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message });
  };

  const handleDeleteMessage = async () => {
    if (contextMenu) {
      await deleteMessage(currentChat.id, contextMenu.message.id);
      setContextMenu(null);
    }
  };

  const handleReply = () => {
    if (contextMenu) {
      setReplyTo(contextMenu.message);
      setContextMenu(null);
    }
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (container && container.scrollTop === 0 && !isLoadingMessages) {
      loadMoreMessages();
    }
  };

  const handleFilePick = async () => {
    if (!peerId) return;
    await selectAndSendFile(currentChat.id, peerId);
  };

  // Voice recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

        // Save to temp file via Tauri command
        const reader = new FileReader();
        reader.onload = async () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          const uint8 = new Uint8Array(arrayBuffer);
          try {
            const tempDir = await invoke<string>('get_temp_dir');
            const tempPath = `${tempDir}/pulse_voice_${Date.now()}.webm`;
            await invoke('write_temp_file', { path: tempPath, data: Array.from(uint8) });

            if (peerId) {
              const { sendFileFromPath } = useFileStore.getState();
              await sendFileFromPath(currentChat.id, peerId, tempPath);
            }
          } catch (err) {
            console.error('Failed to save voice message:', err);
          }
        };
        reader.readAsArrayBuffer(blob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, [currentChat?.id, peerId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const peerName = currentChat.name || peerId;

  const handleAudioCall = async () => {
    if (!user || !peerId) return;
    const callerName = user.displayName || user.username;
    await startCall(currentChat.id, peerId, peerName, 'audio', user.id, callerName);
  };

  const handleVideoCall = async () => {
    if (!user || !peerId) return;
    const callerName = user.displayName || user.username;
    await startCall(currentChat.id, peerId, peerName, 'video', user.id, callerName);
  };

  const chatName = currentChat.name || t('chatList.private');

  return (
    <>
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-2 mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 md:hidden">
              <ArrowLeft size={20} className="text-gray-500" />
            </button>
          )}
          <div
            className={`flex items-center ${currentChat.chatType === 'group' ? 'cursor-pointer hover:opacity-80' : ''}`}
            onClick={() => currentChat.chatType === 'group' && setShowGroupSettings(true)}
          >
            <div className="w-10 h-10 rounded-full bg-pulse-100 dark:bg-pulse-900 flex items-center justify-center">
              {currentChat.avatarUrl ? (
                <img
                  src={currentChat.avatarUrl}
                  alt={chatName}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : currentChat.chatType === 'group' ? (
                <Users size={20} className="text-pulse-600 dark:text-pulse-400" />
              ) : (
                <span className="text-lg font-semibold text-pulse-600 dark:text-pulse-400">
                  {chatName[0]?.toUpperCase() || '?'}
                </span>
              )}
            </div>
            <div className="ml-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                {chatName}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {currentChat.chatType === 'group'
                  ? t('chat.members', { count: currentChat.participantIds.length })
                  : peerOnline
                  ? t('chat.online')
                  : t('chat.offline')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button onClick={handleAudioCall} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" title={t('chat.audioCall')}>
              <Phone size={20} className="text-gray-500" />
            </button>
            <button onClick={handleVideoCall} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" title={t('chat.videoCall')}>
              <Video size={20} className="text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2"
      >
        {isLoadingMessages && (
          <div className="flex justify-center py-2">
            <div className="animate-spin w-6 h-6 border-2 border-pulse-500 border-t-transparent rounded-full" />
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isOwn={message.senderId === user?.id}
            showSender={currentChat.chatType === 'group'}
            senderNameMap={memberNameMap}
            onContextMenu={(e) => handleContextMenu(e, message)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleReply}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            {t('chat.reply')}
          </button>
          {contextMenu.message.senderId === user?.id && (
            <button
              onClick={handleDeleteMessage}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500 flex items-center space-x-2"
            >
              <Trash2 size={14} />
              <span>{t('chat.delete')}</span>
            </button>
          )}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-pulse-500 font-medium">
              {t('chat.replyTo')} {replyTo.senderId === user?.id ? t('chat.replySelf') : t('chat.replyOther')}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {replyTo.content}
            </p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ArrowLeft size={16} className="text-gray-400" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleFilePick}
            disabled={!peerId}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
            title={t('chat.attachFile')}
          >
            <Paperclip size={20} className="text-gray-500" />
          </button>

          <div className="flex-1 relative">
            {isRecording ? (
              <div className="w-full px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm text-red-600 dark:text-red-400 font-mono">
                  {formatRecordingTime(recordingTime)}
                </span>
                <span className="text-xs text-red-400">{t('chat.recording')}</span>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('chat.messagePlaceholder')}
                  autoFocus
                  className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pulse-500 dark:text-white"
                />
              </>
            )}
          </div>

          {isRecording ? (
            <button
              onClick={stopRecording}
              className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              <Square size={20} />
            </button>
          ) : inputValue.trim() ? (
            <button
              onClick={handleSend}
              className="p-2 rounded-lg bg-pulse-500 text-white hover:bg-pulse-600 transition-colors"
            >
              <Send size={20} />
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title={t('chat.voiceMessage')}
            >
              <Mic size={20} className="text-gray-500" />
            </button>
          )}
        </div>
      </div>
    </div>
    {showGroupSettings && currentChat.chatType === 'group' && (
      <div className="w-80 flex-shrink-0">
        <GroupSettingsPanel
          chat={currentChat}
          onClose={() => setShowGroupSettings(false)}
        />
      </div>
    )}
    </>
  );
}

const MEDIA_TYPES: MessageType[] = ['image', 'file', 'voice', 'video'];

function MessageBubble({
  message,
  isOwn,
  onContextMenu,
  showSender,
  senderNameMap,
}: {
  message: Message;
  isOwn: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  showSender?: boolean;
  senderNameMap?: Record<string, string>;
}) {
  const { t, i18n } = useTranslation();
  const isMedia = MEDIA_TYPES.includes(message.messageType);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        onContextMenu={onContextMenu}
        className={`max-w-[70%] rounded-2xl cursor-default ${
          isOwn
            ? 'bg-pulse-500 text-white rounded-br-md'
            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md shadow-sm'
        } ${isMedia ? 'p-1' : 'px-4 py-2'}`}
      >
        {showSender && !isOwn && message.senderId && (
          <p className="text-xs font-semibold text-violet-500 dark:text-violet-400 mb-0.5 px-1">
            {senderNameMap?.[message.senderId] || t('chat.unknownUser')}
          </p>
        )}
        {isMedia ? (
          <FileMessage message={message} isOwn={isOwn} />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        )}
        <div
          className={`flex items-center justify-end mt-1 space-x-1 px-2 pb-1 ${
            isOwn ? 'text-pulse-100' : 'text-gray-400'
          }`}
        >
          <span className="text-xs">
            {format(new Date(message.timestamp), 'HH:mm', { locale: i18n.language === 'en' ? enUS : ru })}
          </span>
          {isOwn && <DeliveryStatus message={message} />}
        </div>
      </div>
    </div>
  );
}

/** Honest delivery state: queued -> sent -> acked by the peer */
function DeliveryStatus({ message }: { message: Message }) {
  const queued = useChatStore((s) => s.outbox.some((o) => o.messageId === message.id));
  const delivered = (message.metadata as { delivered?: boolean } | null)?.delivered;
  return <span className="text-xs">{queued ? '🕓' : delivered ? '✓✓' : '✓'}</span>;
}
