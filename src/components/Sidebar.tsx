import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Users, Settings, Search, Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchStore } from '@/stores/searchStore';
import { useNetworkStore } from '@/stores/networkStore';
import { useUserStore } from '@/stores/userStore';
import { useChatStore } from '@/stores/chatStore';
import { useIsMobile } from '@/hooks/useIsMobile';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, open, close } = useSearchStore();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { status, peerCount } = useNetworkStore();
  const { user } = useUserStore();
  const unread = useChatStore((s) => s.chats.reduce((n, c) => n + (c.unreadCount || 0), 0));

  const tabs = [
    { id: '/', icon: MessageCircle, label: t('nav.chats'), badge: unread },
    { id: '/contacts', icon: Users, label: t('nav.contacts'), badge: 0 },
    { id: '/settings', icon: Settings, label: t('nav.settings'), badge: 0 },
  ];

  // Mobile: bottom tab bar
  if (isMobile) {
    return (
      <div className="flex-shrink-0 bg-elev border-t safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-1">
          {tabs.map(({ id, icon: Icon, label, badge }) => {
            const isActive =
              id === '/' ? location.pathname === '/' : location.pathname.startsWith(id);
            return (
              <button
                key={id}
                onClick={() => { navigate(id); if (isOpen) close(); }}
                className={`relative flex flex-col items-center py-2 px-3 rounded-em-sm transition-all ${
                  isActive && !isOpen ? 'text-accent' : 'text-ink-faint'
                }`}
              >
                <Icon size={22} />
                {badge > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-accent-ink text-[10px] font-bold flex items-center justify-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                <span className="text-[10px] mt-0.5 font-semibold">{label}</span>
              </button>
            );
          })}
          <button
            onClick={() => (isOpen ? close() : open())}
            className={`flex flex-col items-center py-2 px-3 rounded-em-sm transition-all ${
              isOpen ? 'text-accent' : 'text-ink-faint'
            }`}
          >
            <Search size={22} />
            <span className="text-[10px] mt-0.5 font-semibold">{t('nav.search')}</span>
          </button>
        </div>
      </div>
    );
  }

  // Desktop: 76px rail — logo, nav, network chip + avatar at the bottom
  return (
    <div className="w-[76px] bg-rail flex flex-col items-center py-4 gap-1">
      <div className="w-11 h-11 mb-3 rounded-em-md bg-accent-soft flex items-center justify-center">
        <Flame size={22} className="text-accent" />
      </div>

      {tabs.map(({ id, icon: Icon, label, badge }) => {
        const isActive =
          id === '/' ? location.pathname === '/' : location.pathname.startsWith(id);
        return (
          <button
            key={id}
            onClick={() => { navigate(id); if (isOpen) close(); }}
            className={`relative w-12 h-12 rounded-em-md flex items-center justify-center transition-all ${
              isActive && !isOpen
                ? 'bg-accent-soft text-accent'
                : 'text-ink-faint hover:bg-surface hover:text-ink'
            }`}
            title={label}
          >
            <Icon size={23} />
            {badge > 0 && (
              <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-accent text-accent-ink text-[10px] font-bold flex items-center justify-center">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        );
      })}

      <button
        onClick={() => (isOpen ? close() : open())}
        className={`w-12 h-12 rounded-em-md flex items-center justify-center transition-all ${
          isOpen ? 'bg-accent-soft text-accent' : 'text-ink-faint hover:bg-surface hover:text-ink'
        }`}
        title={t('nav.search')}
      >
        <Search size={23} />
      </button>

      <div className="flex-1" />

      {/* network chip: одна точка — вся правда о p2p */}
      <div
        className="flex flex-col items-center gap-0.5 mb-2"
        title={status === 'online' ? t('status.online', { count: peerCount }) : t('status.offline')}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            status === 'online' ? 'bg-online' : status === 'starting' ? 'bg-warn' : 'bg-ink-faint'
          }`}
        />
        <span className="text-[10px] font-mono text-ink-faint">{peerCount}</span>
      </div>

      <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center text-ink font-bold">
        {(user?.displayName || user?.username || '?')[0]?.toUpperCase()}
      </div>
    </div>
  );
}
