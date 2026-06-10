import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { MessageCircle, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ProfileSetupPage() {
  const { t } = useTranslation();
  const { createUser, user, isLoggedOut, login, deleteAccount } = useUserStore();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Logged-out state with an existing profile: offer to log back in
  if (isLoggedOut && user) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="w-full max-w-md p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-4 bg-pulse-500 rounded-full flex items-center justify-center text-white text-3xl font-bold">
            {(user.displayName || user.username)[0]?.toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {user.displayName || user.username}
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">@{user.username}</p>

          <button
            onClick={login}
            className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 bg-pulse-500 text-white rounded-lg font-medium hover:bg-pulse-600 transition-colors"
          >
            <LogIn size={18} />
            {t('profile.loginAs', { name: user.displayName || user.username })}
          </button>

          {confirmReset ? (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">{t('profile.resetWarning')}</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {t('group.cancel')}
                </button>
                <button
                  onClick={deleteAccount}
                  className="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  {t('profile.resetConfirm')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="mt-4 text-sm text-red-500 hover:text-red-600"
            >
              {t('profile.resetAccount')}
            </button>
          )}
        </div>
      </div>
    );
  }

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
