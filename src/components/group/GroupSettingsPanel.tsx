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
      navigator.clipboard.writeText(`ember://invite/${inviteResult.code}`);
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
      case 'owner': return <Crown size={14} className="text-accent" />;
      case 'admin': return <Shield size={14} className="text-ink-dim" />;
      default: return null;
    }
  };

  const tabs = [
    { id: 'members' as const, label: t('group.members') },
    { id: 'settings' as const, label: t('group.settingsTab') },
    { id: 'invite' as const, label: t('group.invite') },
  ];

  return (
    <div className="h-full flex flex-col bg-elev border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-lg font-bold text-ink">{t('group.settings')}</h2>
        <button onClick={onClose} className="p-1 hover:bg-surface rounded">
          <X size={20} className="text-ink-faint" />
        </button>
      </div>

      {/* Group info */}
      <div className="p-4 text-center border-b">
        <div className="w-16 h-16 rounded-full bg-accent-soft flex items-center justify-center mx-auto mb-2">
          <Users size={28} className="text-accent" />
        </div>
        <h3 className="text-ink font-bold">{chat.name || t('chatList.group')}</h3>
        <p className="text-sm text-ink-faint">{t('chat.members', { count: groupMembers.length })}</p>
      </div>

      {/* Segment tabs */}
      <div className="flex gap-1 p-2 m-3 mb-1 bg-surface rounded-em-md">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={`flex-1 py-1.5 rounded-em-sm text-[13px] font-semibold transition-colors ${
              tab === tabItem.id ? 'bg-accent-soft text-accent' : 'text-ink-dim hover:text-ink'
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
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-em-sm hover:bg-elev transition-colors mb-2"
              >
                <div className="w-9 h-9 rounded-full bg-accent-soft flex items-center justify-center">
                  <UserPlus size={16} className="text-accent" />
                </div>
                <span className="text-accent text-sm font-semibold">{t('group.addMember')}</span>
              </button>
            )}

            {showAddMember && (
              <div className="mb-2 p-3 bg-elev rounded-em-sm">
                <input
                  value={newMemberId}
                  onChange={(e) => setNewMemberId(e.target.value)}
                  placeholder={t('group.userId')}
                  className="w-full px-3 py-1.5 bg-surface-2 rounded-em-sm text-sm text-ink mb-2 focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder={t('group.nameOptional')}
                  className="w-full px-3 py-1.5 bg-surface-2 rounded-em-sm text-sm text-ink mb-2 focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddMember}
                    className="flex-1 py-1.5 bg-accent hover:brightness-110 text-accent-ink text-sm rounded transition-colors"
                  >
                    {t('group.add')}
                  </button>
                  <button
                    onClick={() => setShowAddMember(false)}
                    className="px-3 py-1.5 text-ink-faint text-sm hover:text-ink"
                  >
                    {t('group.cancel')}
                  </button>
                </div>
              </div>
            )}

            {groupMembers.map((member) => (
              <div key={member.userId} className="flex items-center gap-3 px-3 py-2 rounded-em-sm hover:bg-elev transition-colors">
                <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-sm font-bold text-ink">
                  {(member.displayName || '?')[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-ink font-semibold truncate">{member.displayName}</span>
                    {roleIcon(member.role)}
                  </div>
                  <span className={`text-[10.5px] px-1.5 py-px rounded-full font-semibold ${
                    member.role === 'owner'
                      ? 'bg-accent-soft text-accent'
                      : member.role === 'admin'
                      ? 'bg-surface-2 text-ink-dim'
                      : 'text-ink-faint'
                  }`}>{member.role}</span>
                </div>

                {/* Role change buttons */}
                {isAdmin && member.userId !== user?.id && member.role !== 'owner' && (
                  <div className="flex gap-1">
                    {member.role === 'member' && (
                      <button
                        onClick={() => handleChangeRole(member.userId, 'admin')}
                        className="p-1.5 hover:bg-surface rounded text-ink-faint hover:text-accent"
                        title={t('group.makeAdmin')}
                      >
                        <Shield size={14} />
                      </button>
                    )}
                    {member.role === 'admin' && isOwner && (
                      <button
                        onClick={() => handleChangeRole(member.userId, 'member')}
                        className="p-1.5 hover:bg-surface rounded text-ink-faint hover:text-warn"
                        title={t('group.demote')}
                      >
                        <ChevronRight size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      className="p-1.5 hover:bg-surface rounded text-ink-faint hover:text-danger"
                      title={t('group.remove')}
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {groupMembers.length === 0 && (
              <p className="text-sm text-ink-faint text-center py-4">{t('group.noMembers')}</p>
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
              <p className="text-sm text-ink-faint">{t('group.adminOnly')}</p>
            )}

            {/* Leave group */}
            {!isOwner && (
              <button
                onClick={handleLeave}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-em-sm bg-danger-soft hover:brightness-110 text-danger transition-colors mt-6"
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
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent hover:brightness-110 text-accent-ink rounded-em-sm transition-colors"
                  >
                    <Link size={18} />
                    <span className="text-sm font-medium">{t('group.createInvite')}</span>
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-surface rounded-em-md border">
                      <p className="text-xs text-ink-faint mb-1">{t('group.inviteLink')}</p>
                      <p className="text-sm text-ink font-mono break-all">
                        ember://invite/{inviteResult.code}
                      </p>
                    </div>
                    <button
                      onClick={handleCopyInvite}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-2 hover:brightness-110 text-ink rounded-em-sm transition-colors"
                    >
                      <Copy size={16} />
                      <span className="text-sm">{t('group.copy')}</span>
                    </button>
                    <p className="text-xs text-ink-faint">
                      {inviteResult.maxUses
                        ? t('group.maxUses', { count: inviteResult.maxUses })
                        : t('group.noLimit')}
                      {inviteResult.expiresAt && expiresLabel(inviteResult.expiresAt, t)}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-faint">{t('group.adminOnlyInvite')}</p>
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
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-em-sm bg-elev hover:bg-gray-750 transition-colors"
    >
      <span className="text-sm text-gray-200">{label}</span>
      <div className={`w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-violet-500' : 'bg-surface-2'}`}>
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
