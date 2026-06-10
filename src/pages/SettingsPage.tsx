import { useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUserStore } from '@/stores/userStore';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useTranslation } from 'react-i18next';
import {
  Sun,
  Moon,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Globe,
  Palette,
  User,
  Shield,
  Wifi,
  Info,
  LogOut,
  QrCode,
  Trash2,
} from 'lucide-react';
import { MyCodeDialog } from '@/components/contacts/MyCodeDialog';

export function SettingsPage() {
  const { t } = useTranslation();
  const { settings, themes, setTheme, toggleDark, updateSettings } = useSettingsStore();
  const { user, updateProfile, logout, deleteAccount } = useUserStore();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saved, setSaved] = useState(false);
  const [showMyCode, setShowMyCode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSaveProfile = async () => {
    await updateProfile({
      displayName: displayName.trim() || undefined,
      bio: bio.trim() || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h1>

        {/* Profile */}
        <Section icon={<User size={20} />} title={t('settings.profile')}>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-16 h-16 rounded-full bg-pulse-500 flex items-center justify-center text-white text-2xl font-bold">
                {(user?.displayName || user?.username || '?')[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {user?.displayName || user?.username}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  @{user?.username}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{t('settings.displayName')}</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-pulse-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{t('settings.bio')}</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-pulse-500 focus:outline-none resize-none"
              />
            </div>

            <button
              onClick={handleSaveProfile}
              className="px-4 py-2 bg-pulse-500 text-white text-sm rounded-lg hover:bg-pulse-600 transition-colors"
            >
              {saved ? t('settings.profileSaved') : t('group.save')}
            </button>
          </div>
        </Section>

        {/* Appearance */}
        <Section icon={<Palette size={20} />} title={t('settings.appearance')}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">{t('settings.darkMode')}</span>
              <button
                onClick={toggleDark}
                className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                {settings.isDark ? <Moon size={18} /> : <Sun size={18} />}
              </button>
            </div>

            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{t('settings.theme')}</p>
              <div className="flex gap-2">
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setTheme(theme.id)}
                    className={`w-10 h-10 rounded-full border-2 transition-all ${
                      settings.theme === theme.id
                        ? 'border-gray-900 dark:border-white scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: theme.color }}
                    title={theme.name}
                  />
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Notifications */}
        <Section icon={<Bell size={20} />} title={t('settings.notifications')}>
          <div className="space-y-3">
            <ToggleRow
              icon={settings.notificationsEnabled ? <Bell size={18} /> : <BellOff size={18} />}
              label={t('settings.enableNotifications')}
              checked={settings.notificationsEnabled}
              onChange={(v) => updateSettings({ notificationsEnabled: v })}
            />
            <ToggleRow
              icon={settings.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              label={t('settings.notificationSounds')}
              checked={settings.soundEnabled}
              onChange={(v) => updateSettings({ soundEnabled: v })}
            />
          </div>
        </Section>

        {/* Language */}
        <Section icon={<Globe size={20} />} title={t('settings.language')}>
          <select
            value={settings.language}
            onChange={(e) => {
              updateSettings({ language: e.target.value });
            }}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-pulse-500 focus:outline-none"
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </Section>

        {/* Security */}
        <Section icon={<Shield size={20} />} title={t('settings.security')}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">{t('settings.encryption')}</span>
              <span className="text-xs text-green-500 font-medium">{t('settings.encryptionEnabled')}</span>
            </div>
            {user?.publicKey && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Public Key</p>
                <code className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded block break-all">
                  {user.publicKey}
                </code>
              </div>
            )}
          </div>
        </Section>

        {/* Network */}
        <Section icon={<Wifi size={20} />} title={t('settings.network')}>
          <ConnectionStatus />
        </Section>

        {/* Account */}
        <Section icon={<LogOut size={20} />} title={t('settings.account')}>
          <div className="space-y-2">
            <button
              onClick={() => setShowMyCode(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <QrCode size={16} />
              {t('contacts.myCode')}
            </button>
            <button
              onClick={logout}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <LogOut size={16} />
              {t('settings.logout')}
            </button>
            {confirmDelete ? (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400 mb-2">{t('profile.resetWarning')}</p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    {t('group.cancel')}
                  </button>
                  <button
                    onClick={deleteAccount}
                    className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
                  >
                    {t('profile.resetConfirm')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={16} />
                {t('settings.deleteAccount')}
              </button>
            )}
          </div>
        </Section>

        {showMyCode && <MyCodeDialog onClose={() => setShowMyCode(false)} />}

        {/* About */}
        <Section icon={<Info size={20} />} title={t('settings.about')}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">{t('settings.version')}</span>
              <span className="text-sm text-gray-500">{t('settings.appVersion')}</span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-pulse-500">{icon}</span>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-gray-500">{icon}</span>
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-pulse-500' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}
