// === User ===

export interface User {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  publicKey: string;
  lastSeen: string;
  isOnline: boolean;
}

// === Message ===

export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'video' | 'sticker' | 'system';

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content?: string;
  messageType: MessageType;
  timestamp: string;
  isRead: boolean;
  replyToId?: string;
  mediaUrl?: string;
  metadata?: Record<string, unknown>;
}

// === Chat ===

export type ChatType = 'private' | 'group' | 'channel';

export interface Chat {
  id: string;
  chatType: ChatType;
  name?: string;
  avatarUrl?: string;
  participantIds: string[];
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: string;
  isPinned: boolean;
  isMuted: boolean;
  ownerId?: string;
  groupSettings?: GroupSettings;
}

// === Group Chat ===

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  userId: string;
  displayName: string;
  role: GroupRole;
  joinedAt: string;
}

export interface GroupInvite {
  code: string;
  chatId: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  maxUses?: number;
  useCount: number;
}

export interface GroupSettings {
  onlyAdminsSend: boolean;
  onlyAdminsEditInfo: boolean;
  onlyAdminsPin: boolean;
  slowModeSeconds?: number;
}

// === Contact ===

export interface Contact {
  user: User;
  isBlocked: boolean;
  nickname?: string;
  addedAt: string;
}

// === Settings ===

export interface Settings {
  theme: string;
  isDark: boolean;
  language: string;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
}

// === Theme ===

export interface ThemeOption {
  id: string;
  name: string;
  color: string;
}

// === Peer ===

export interface Peer {
  peerId: string;
  x25519Pubkey?: string;
  ed25519Pubkey?: string;
  multiaddr?: string;
  isOnline: boolean;
  lastSeen?: string;
}

// === Network ===

export type NetworkStatus = 'offline' | 'starting' | 'online';
