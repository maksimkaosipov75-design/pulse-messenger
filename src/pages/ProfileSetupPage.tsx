import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ProfileSetupPage() {
  const { t } = useTranslation();
  const { createUser } = useUserStore();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      setError(t('profile.required'));
      return;
    }
    if (trimmed.length < 3) {
      setError(t('profile.minLength'));
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setError(t('profile.rules'));
      return;
    }

    setIsCreating(true);
    setError('');
    try {
      await createUser(trimmed, displayName.trim() || undefined);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 bg-pulse-500 rounded-full flex items-center justify-center">
            <MessageCircle size={40} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('profile.welcome')}
          </h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            {t('profile.setupDesc')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('profile.username')}
            </label>
            <input
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              placeholder={t('profile.usernamePlaceholder')}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-pulse-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('profile.displayName')}
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('profile.displayNamePlaceholder')}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-pulse-500 focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={isCreating}
            className="w-full py-2.5 bg-pulse-500 text-white rounded-lg font-medium hover:bg-pulse-600 disabled:opacity-50 transition-colors"
          >
            {isCreating ? t('profile.creating') : t('profile.create')}
          </button>
        </form>
      </div>
    </div>
  );
}
