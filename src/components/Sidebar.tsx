import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Users, Settings, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchStore } from '@/stores/searchStore';
import { useIsMobile } from '@/hooks/useIsMobile';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, open, close } = useSearchStore();
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const tabs = [
    { id: '/', icon: MessageCircle, label: t('nav.chats') },
    { id: '/contacts', icon: Users, label: t('nav.contacts') },
    { id: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  // Mobile: bottom tab bar
  if (isMobile) {
    return (
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-1">
          {tabs.map(({ id, icon: Icon, label }) => {
            const isActive =
              id === '/' ? location.pathname === '/' : location.pathname.startsWith(id);
            return (
              <button
                key={id}
                onClick={() => { navigate(id); if (isOpen) close(); }}
                className={`flex flex-col items-center py-2 px-3 rounded-lg transition-all ${
                  isActive && !isOpen
                    ? 'text-pulse-500'
                    : 'text-gray-400'
                }`}
              >
                <Icon size={22} />
                <span className="text-[10px] mt-0.5">{label}</span>
              </button>
            );
          })}
          <button
            onClick={() => isOpen ? close() : open()}
            className={`flex flex-col items-center py-2 px-3 rounded-lg transition-all ${
              isOpen ? 'text-pulse-500' : 'text-gray-400'
            }`}
          >
            <Search size={22} />
            <span className="text-[10px] mt-0.5">{t('nav.search')}</span>
          </button>
        </div>
      </div>
    );
  }

  // Desktop: left sidebar
  return (
    <div className="w-16 bg-gray-900 dark:bg-gray-950 flex flex-col items-center py-4 space-y-2">
      {tabs.map(({ id, icon: Icon, label }) => {
        const isActive =
          id === '/' ? location.pathname === '/' : location.pathname.startsWith(id);

        return (
          <button
            key={id}
            onClick={() => { navigate(id); if (isOpen) close(); }}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
              isActive && !isOpen
                ? 'bg-pulse-500 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
            title={label}
          >
            <Icon size={24} />
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        onClick={() => isOpen ? close() : open()}
        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
          isOpen
            ? 'bg-pulse-500 text-white'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
        title={t('nav.search')}
      >
        <Search size={24} />
      </button>
    </div>
  );
}
