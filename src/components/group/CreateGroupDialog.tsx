import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, UserPlus } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useUserStore } from '@/stores/userStore';

interface CreateGroupDialogProps {
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateGroupDialog({ onClose, onCreated }: CreateGroupDialogProps) {
  const { t } = useTranslation();
  const { createChat } = useChatStore();
  const { user } = useUserStore();
  const [name, setName] = useState('');
  const [memberInput, setMemberInput] = useState('');
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);

  const handleAddMember = () => {
    const id = memberInput.trim();
    if (!id || members.some((m) => m.id === id)) return;
    setMembers([...members, { id, name: id }]);
    setMemberInput('');
  };

  const handleRemoveMember = (id: string) => {
    setMembers(members.filter((m) => m.id !== id));
  };

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const participantIds = members.map((m) => m.id);
      if (user && !participantIds.includes(user.id)) {
        participantIds.push(user.id);
      }
      await createChat('group', name.trim(), participantIds);
      onCreated?.();
      onClose();
    } catch (e) {
      console.error('Failed to create group:', e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-elev rounded-em-md w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-white">{t('group.createGroup')}</h2>
          <button onClick={onClose} className="p-1 rounded-em-sm hover:bg-surface">
            <X size={20} className="text-ink-faint" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-surface-2 flex items-center justify-center flex-shrink-0">
              <Users size={24} className="text-ink-faint" />
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('group.groupName')}
              className="flex-1 px-3 py-2 bg-surface-2 border border-gray-600 rounded-em-sm text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-ink-faint mb-1.5 block">{t('group.addParticipants')}</label>
            <div className="flex gap-2">
              <input
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                placeholder={t('group.userId')}
                className="flex-1 px-3 py-2 bg-surface-2 border border-gray-600 rounded-em-sm text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
              />
              <button
                onClick={handleAddMember}
                className="p-2 bg-surface-2 rounded-em-sm hover:bg-surface-2"
              >
                <UserPlus size={18} className="text-gray-300" />
              </button>
            </div>
          </div>

          {/* Members list */}
          {members.length > 0 && (
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-surface-2 rounded-em-sm">
                  <span className="text-sm text-white">{m.name}</span>
                  <button onClick={() => handleRemoveMember(m.id)} className="p-1 hover:bg-surface-2 rounded">
                    <X size={14} className="text-ink-faint" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            {t('group.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="px-4 py-2 bg-accent text-accent-ink text-sm rounded-em-sm hover:brightness-110 transition-colors disabled:opacity-50"
          >
            {creating ? t('profile.creating') : t('group.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
