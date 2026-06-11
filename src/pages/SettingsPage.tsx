import { useState, ReactNode } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUserStore } from '@/stores/userStore';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useTranslation } from 'react-i18next';
import {
  Sun,
  Moon,
  Bell,
  Palette,
  User,
  Shield,
  Wifi,
  LogOut,
  QrCode,
  Trash2,
  Pencil,
  Check,
  Lock,
} from 'lucide-react';
import { MyCodeDialog } from '@/components/contacts/MyCodeDialog';
import { Identicon } from '@/components/Identicon';

const ACCENTS: { id: string; color: string }[] = [
  { id: 'orange', color: '#FF7A45' },
  { id: 'telegram', color: '#2AABEE' },
  { id: 'purple', color: '#7C5CFF' },
  { id: 'green', color: '#19C37D' },
  { id: 'red', color: '#F25F8E' },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const { settings, setTheme, toggleDark, updateSettings } = useSettingsStore();
  const { user, updateProfile, logout, deleteAccount } = useUserStore();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [showMyCode, setShowMyCode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSaveProfile = async () => {
    await updateProfile({
      displayName: displayName.trim() || undefined,
      bio: bio.trim() || undefined,
    });
    setEditing(false);
  };

  const fingerprint = (user?.publicKey || '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();

  return (
    <div className="flex-1 h-full w-full overflow-y-auto bg-bg">
      <div className="w-full px-8 py-7">
        <h1 className="text-[22px] font-extrabold tracking-tight mb-5">{t('settings.title')}</h1>

        <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-[14px] items-start">
          {/* Профиль */}
          <Card icon={<User size={16} />} title={t('settings.profile')}>
            <div className="flex items-center gap-[13px]">
              <div className="w-14 h-14 rounded-full bg-accent-soft text-accent flex items-center justify-center text-[22px] font-bold flex-shrink-0">
                {(user?.displayName || user?.username || '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-extrabold truncate">
                  {user?.displayName || user?.username}
                </p>
                <p className="text-[12.5px] text-ink-dim">@{user?.username}</p>
              </div>
              <button
                onClick={() => setEditing(!editing)}
                className="p-2 rounded-em-sm hover:bg-surface text-ink-dim transition-colors"
              >
                <Pencil size={16} />
              </button>
            </div>

            {editing ? (
              <div className="mt-4 space-y-2.5">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('settings.displayName')}
                  className="w-full px-3 py-2 bg-surface rounded-em-sm text-sm focus:ring-2 focus:ring-accent focus:outline-none"
                />
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  placeholder={t('settings.bio')}
                  className="w-full px-3 py-2 bg-surface rounded-em-sm text-sm focus:ring-2 focus:ring-accent focus:outline-none resize-none"
                />
                <button
                  onClick={handleSaveProfile}
                  className="px-4 py-1.5 bg-accent text-accent-ink text-[13px] font-bold rounded-em-sm hover:brightness-110 transition"
                >
                  {t('group.save')}
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-[11.5px] text-ink-faint mb-0.5">{t('settings.bio')}</p>
                <p className="text-[13.5px] text-ink-dim">{user?.bio || '—'}</p>
              </div>
            )}
          </Card>

          {/* Уведомления и звук */}
          <Card icon={<Bell size={16} />} title={t('settings.notifications')}>
            <Row label={t('settings.enableNotifications')}>
              <Switch
                checked={settings.notificationsEnabled}
                onChange={(v) => updateSettings({ notificationsEnabled: v })}
              />
            </Row>
            <Row label={t('settings.notificationSounds')}>
              <Switch
                checked={settings.soundEnabled}
                onChange={(v) => updateSettings({ soundEnabled: v })}
              />
            </Row>
            <Row label={t('settings.language')}>
              <select
                value={settings.language || 'ru'}
                onChange={(e) => updateSettings({ language: e.target.value })}
                className="bg-surface text-ink min-w-[110px] px-2.5 py-1 rounded-em-sm text-[13.5px] font-bold focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </Row>
          </Card>

          {/* Внешний вид */}
          <Card icon={<Palette size={16} />} title={t('settings.appearance')}>
            <Row label={t('settings.theme')}>
              <div className="flex gap-1 p-0.5 bg-surface rounded-full">
                <button
                  onClick={() => settings.isDark && toggleDark()}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12.5px] font-bold transition-colors ${
                    !settings.isDark ? 'bg-accent-soft text-accent' : 'text-ink-dim'
                  }`}
                >
                  <Sun size={13} /> {t('settings.light')}
                </button>
                <button
                  onClick={() => !settings.isDark && toggleDark()}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12.5px] font-bold transition-colors ${
                    settings.isDark ? 'bg-accent-soft text-accent' : 'text-ink-dim'
                  }`}
                >
                  <Moon size={13} /> {t('settings.dark')}
                </button>
              </div>
            </Row>
            <Row label={t('settings.accent')}>
              <div className="flex gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setTheme(a.id)}
                    className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                    style={{ backgroundColor: a.color }}
                    title={t(`theme.${a.id}`)}
                  >
                    {settings.theme === a.id && <Check size={13} className="text-white" />}
                  </button>
                ))}
              </div>
            </Row>
          </Card>

          {/* Безопасность */}
          <Card icon={<Shield size={16} />} title={t('settings.security')}>
            <Row label={t('settings.encryption')}>
              <span className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-online">
                <Lock size={12} /> {t('settings.encryptionEnabled')}
              </span>
            </Row>
            {user?.publicKey && (
              <div className="flex items-center gap-3 mt-3">
                <Identicon value={user.publicKey} size={44} />
                <div className="min-w-0">
                  <p className="text-[11.5px] text-ink-faint mb-0.5">
                    {t('settings.fingerprint')} · Ed25519
                  </p>
                  <code className="text-[13px] font-mono text-ink">{fingerprint}</code>
                </div>
              </div>
            )}
            <p className="text-[11.5px] text-ink-faint mt-3">{t('settings.fingerprintHint')}</p>
          </Card>

          {/* Сеть — на всю ширину */}
          <div className="md:col-span-2 2xl:col-span-3">
            <Card icon={<Wifi size={16} />} title={t('settings.network')}>
              <ConnectionStatus />
            </Card>
          </div>

          {/* Аккаунт */}
          <div className="md:col-span-2 2xl:col-span-3">
            <Card icon={<LogOut size={16} />} title={t('settings.account')}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowMyCode(true)}
                  className="flex items-center gap-2 px-3.5 py-2 text-[13.5px] font-bold bg-surface rounded-em-md hover:bg-surface-2 transition-colors"
                >
                  <QrCode size={15} /> {t('contacts.myCode')}
                </button>
                <button
                  onClick={logout}
                  className="flex items-center gap-2 px-3.5 py-2 text-[13.5px] font-bold bg-surface rounded-em-md hover:bg-surface-2 transition-colors"
                >
                  <LogOut size={15} /> {t('settings.logout')}
                </button>
                <div className="flex-1" />
                {confirmDelete ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-danger-soft rounded-em-md">
                    <span className="text-[12.5px] text-danger">{t('profile.resetWarning')}</span>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-2.5 py-1 text-[12.5px] text-ink-dim hover:text-ink"
                    >
                      {t('group.cancel')}
                    </button>
                    <button
                      onClick={deleteAccount}
                      className="px-2.5 py-1 text-[12.5px] font-bold bg-danger text-white rounded-em-sm hover:brightness-110"
                    >
                      {t('profile.resetConfirm')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-2 px-3.5 py-2 text-[13.5px] font-bold text-danger bg-danger-soft rounded-em-md hover:brightness-110 transition"
                  >
                    <Trash2 size={15} /> {t('settings.deleteAccount')}
                  </button>
                )}
              </div>
              <p className="text-[11.5px] text-ink-faint mt-3">{t('settings.appVersion')}</p>
            </Card>
          </div>
        </div>

        {showMyCode && <MyCodeDialog onClose={() => setShowMyCode(false)} />}
      </div>
    </div>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="bg-elev border rounded-em-lg p-4">
      <div className="flex items-center gap-[9px] mb-3.5">
        <span className="w-7 h-7 rounded-em-sm bg-accent-soft text-accent flex items-center justify-center">
          {icon}
        </span>
        <h2 className="text-[15px] font-extrabold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[13.5px] text-ink-dim">{label}</span>
      {children}
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={`w-10 h-[22px] rounded-full p-[3px] transition-colors ${
        checked ? 'bg-accent' : 'bg-surface-2'
      }`}
    >
      <span
        className={`block w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : ''
        }`}
      />
    </button>
  );
}
