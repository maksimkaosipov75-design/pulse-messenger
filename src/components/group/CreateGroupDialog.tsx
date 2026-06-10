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
        className="bg-gray-800 rounded-xl w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">{t('group.createGroup')}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-700">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Users size={24} className="text-gray-400" />
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('group.groupName')}
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-pulse-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">{t('group.addParticipants')}</label>
            <div className="flex gap-2">
              <input
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                placeholder={t('group.userId')}
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-pulse-500"
                onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
              />
              <button
                onClick={handleAddMember}
                className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600"
              >
                <UserPlus size={18} className="text-gray-300" />
              </button>
            </div>
          </div>

          {/* Members list */}
          {members.length > 0 && (
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-gray-700 rounded-lg">
                  <span className="text-sm text-white">{m.name}</span>
                  <button onClick={() => handleRemoveMember(m.id)} className="p-1 hover:bg-gray-600 rounded">
                    <X size={14} className="text-gray-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            {t('group.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="px-4 py-2 bg-pulse-500 text-white text-sm rounded-lg hover:bg-pulse-600 transition-colors disabled:opacity-50"
          >
            {creating ? t('profile.creating') : t('group.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
