import { useEffect, useState } from 'react';
import {
  Users, UserPlus, UserMinus, Shield, Crown, Copy, Link, X, ChevronRight, LogOut
} from 'lucide-react';
import { Chat, GroupRole, GroupSettings as GSettings, GroupInvite } from '@/types';
import { useGroupStore } from '@/stores/groupStore';
import { useUserStore } from '@/stores/userStore';
import { useTranslation } from 'react-i18next';

interface GroupSettingsPanelProps {
  chat: Chat;
  onClose: () => void;
}

export function GroupSettingsPanel({ chat, onClose }: GroupSettingsPanelProps) {
  const { t } = useTranslation();
  const { members, loadMembers, addMember, removeMember, changeRole, createInvite, leaveGroup, updateSettings } = useGroupStore();
  const { user } = useUserStore();
  const [tab, setTab] = useState<'members' | 'settings' | 'invite'>('members');
  const [inviteResult, setInviteResult] = useState<GroupInvite | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');
  const [newMemberName, setNewMemberName] = useState('');

  const groupMembers = members[chat.id] || [];
  const myMember = groupMembers.find((m) => m.userId === user?.id);
  const isOwner = myMember?.role === 'owner';
  const isAdmin = myMember?.role === 'admin' || isOwner;
  const settings = chat.groupSettings || {
    onlyAdminsSend: false,
    onlyAdminsEditInfo: false,
    onlyAdminsPin: false,
  };

  useEffect(() => {
    loadMembers(chat.id);
  }, [chat.id]);

  const handleCreateInvite = async () => {
    try {
      const invite = await createInvite(chat.id, undefined, 24);
      setInviteResult(invite);
    } catch (e) {
      console.error('Failed to create invite:', e);
    }
  };

  const handleCopyInvite = () => {
    if (inviteResult) {
      navigator.clipboard.writeText(`pulse://invite/${inviteResult.code}`);
    }
  };

  const handleAddMember = async () => {
    if (!newMemberId.trim()) return;
    try {
      await addMember(chat.id, newMemberId.trim(), newMemberName.trim() || newMemberId.trim());
      setNewMemberId('');
      setNewMemberName('');
      setShowAddMember(false);
    } catch (e) {
      console.error('Failed to add member:', e);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await removeMember(chat.id, userId);
    } catch (e) {
      console.error('Failed to remove member:', e);
    }
  };

  const handleChangeRole = async (userId: string, role: GroupRole) => {
    try {
      await changeRole(chat.id, userId, role);
    } catch (e) {
      console.error('Failed to change role:', e);
    }
  };

  const handleLeave = async () => {
    try {
      await leaveGroup(chat.id);
      onClose();
    } catch (e) {
      console.error('Failed to leave group:', e);
    }
  };

  const handleSettingToggle = async (key: keyof GSettings) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    try {
      await updateSettings(chat.id, newSettings);
    } catch (e) {
      console.error('Failed to update settings:', e);
    }
  };

  const roleIcon = (role: GroupRole) => {
    switch (role) {
      case 'owner': return <Crown size={14} className="text-yellow-400" />;
      case 'admin': return <Shield size={14} className="text-blue-400" />;
      default: return null;
    }
  };

  const tabs = [
    { id: 'members' as const, label: t('group.members') },
    { id: 'settings' as const, label: t('group.settingsTab') },
    { id: 'invite' as const, label: t('group.invite') },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-900 border-l border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">{t('group.settings')}</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
          <X size={20} className="text-gray-400" />
        </button>
      </div>

      {/* Group info */}
      <div className="p-4 text-center border-b border-gray-700">
        <div className="w-16 h-16 rounded-full bg-violet-600 flex items-center justify-center mx-auto mb-2">
          <Users size={28} className="text-white" />
        </div>
        <h3 className="text-white font-semibold">{chat.name || t('chatList.group')}</h3>
        <p className="text-sm text-gray-400">{t('chat.members', { count: groupMembers.length })}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === tabItem.id
                ? 'text-violet-400 border-b-2 border-violet-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Members tab */}
        {tab === 'members' && (
          <div className="p-2">
            {isAdmin && (
              <button
                onClick={() => setShowAddMember(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800 transition-colors mb-2"
              >
                <div className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center">
                  <UserPlus size={16} className="text-white" />
                </div>
                <span className="text-violet-400 text-sm font-medium">{t('group.addMember')}</span>
              </button>
            )}

            {showAddMember && (
              <div className="mb-2 p-3 bg-gray-800 rounded-lg">
                <input
                  value={newMemberId}
                  onChange={(e) => setNewMemberId(e.target.value)}
                  placeholder={t('group.userId')}
                  className="w-full px-3 py-1.5 bg-gray-700 rounded text-sm text-white mb-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <input
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder={t('group.nameOptional')}
                  className="w-full px-3 py-1.5 bg-gray-700 rounded text-sm text-white mb-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddMember}
                    className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded transition-colors"
                  >
                    {t('group.add')}
                  </button>
                  <button
                    onClick={() => setShowAddMember(false)}
                    className="px-3 py-1.5 text-gray-400 text-sm hover:text-white"
                  >
                    {t('group.cancel')}
                  </button>
                </div>
              </div>
            )}

            {groupMembers.map((member) => (
              <div key={member.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors">
                <div className="w-9 h-9 rounded-full bg-gray-600 flex items-center justify-center text-sm font-medium text-white">
                  {(member.displayName || '?')[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-white truncate">{member.displayName}</span>
                    {roleIcon(member.role)}
                  </div>
                  <span className="text-xs text-gray-400">{member.role}</span>
                </div>

                {/* Role change buttons */}
                {isAdmin && member.userId !== user?.id && member.role !== 'owner' && (
                  <div className="flex gap-1">
                    {member.role === 'member' && (
                      <button
                        onClick={() => handleChangeRole(member.userId, 'admin')}
                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-blue-400"
                        title={t('group.makeAdmin')}
                      >
                        <Shield size={14} />
                      </button>
                    )}
                    {member.role === 'admin' && isOwner && (
                      <button
                        onClick={() => handleChangeRole(member.userId, 'member')}
                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-yellow-400"
                        title={t('group.demote')}
                      >
                        <ChevronRight size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-red-400"
                      title={t('group.remove')}
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {groupMembers.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">{t('group.noMembers')}</p>
            )}
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div className="p-4 space-y-3">
            {isAdmin ? (
              <>
                <ToggleSetting
                  label={t('group.onlyAdminsSend')}
                  enabled={settings.onlyAdminsSend}
                  onToggle={() => handleSettingToggle('onlyAdminsSend')}
                />
                <ToggleSetting
                  label={t('group.onlyAdminsEditInfo')}
                  enabled={settings.onlyAdminsEditInfo}
                  onToggle={() => handleSettingToggle('onlyAdminsEditInfo')}
                />
                <ToggleSetting
                  label={t('group.onlyAdminsPin')}
                  enabled={settings.onlyAdminsPin}
                  onToggle={() => handleSettingToggle('onlyAdminsPin')}
                />
              </>
            ) : (
              <p className="text-sm text-gray-400">{t('group.adminOnly')}</p>
            )}

            {/* Leave group */}
            {!isOwner && (
              <button
                onClick={handleLeave}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors mt-6"
              >
                <LogOut size={18} />
                <span className="text-sm font-medium">{t('group.leaveGroup')}</span>
              </button>
            )}
          </div>
        )}

        {/* Invite tab */}
        {tab === 'invite' && (
          <div className="p-4">
            {isAdmin ? (
              <>
                {!inviteResult ? (
                  <button
                    onClick={handleCreateInvite}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
                  >
                    <Link size={18} />
                    <span className="text-sm font-medium">{t('group.createInvite')}</span>
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">{t('group.inviteLink')}</p>
                      <p className="text-sm text-white font-mono break-all">
                        pulse://invite/{inviteResult.code}
                      </p>
                    </div>
                    <button
                      onClick={handleCopyInvite}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                      <Copy size={16} />
                      <span className="text-sm">{t('group.copy')}</span>
                    </button>
                    <p className="text-xs text-gray-400">
                      {inviteResult.maxUses
                        ? t('group.maxUses', { count: inviteResult.maxUses })
                        : t('group.noLimit')}
                      {inviteResult.expiresAt && expiresLabel(inviteResult.expiresAt, t)}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">{t('group.adminOnlyInvite')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleSetting({ label, enabled, onToggle }: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-750 transition-colors"
    >
      <span className="text-sm text-gray-200">{label}</span>
      <div className={`w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-violet-500' : 'bg-gray-600'}`}>
        <div className={`w-4 h-4 rounded-full bg-white shadow mt-0.5 transition-transform ${enabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}

function expiresLabel(expiresAt: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return ` (${t('group.expired')})`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return ` (${t('group.lessThanHour')})`;
  if (hours < 24) return ` (${t('group.hoursShort', { count: hours })})`;
  return ` (${t('group.daysShort', { count: Math.floor(hours / 24) })})`;
}
