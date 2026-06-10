import { useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useSettingsStore } from './stores/settingsStore';
import { useChatStore } from './stores/chatStore';
import { useUserStore } from './stores/userStore';
import { useFileStore } from './stores/fileStore';
import { useGroupStore } from './stores/groupStore';
import { useCallStore } from './stores/callStore';
import { useNetworkStore } from './stores/networkStore';
import { useTranslation } from 'react-i18next';
import { initNotifications, setupMessageNotifications, cleanupNotifications } from './services/notifications';
import { checkForUpdates } from './services/updater';
import { ChatList } from './components/chat/ChatList';
import { ChatView } from './components/chat/ChatView';
import { Sidebar } from './components/Sidebar';
import { ThemeProvider } from './components/ThemeProvider';
import { SettingsPage } from './pages/SettingsPage';
import { ContactsPage } from './pages/ContactsPage';
import { ProfileSetupPage } from './pages/ProfileSetupPage';
import { IncomingCallDialog } from './components/call/IncomingCallDialog';
import { OutgoingCallView } from './components/call/OutgoingCallView';
import { ActiveCallView } from './components/call/ActiveCallView';
import { SearchPanel } from './components/search/SearchPanel';
import { useSearchStore } from './stores/searchStore';
import { useIsMobile } from './hooks/useIsMobile';
import { Toasts } from './components/Toasts';
import { OfflineBanner } from './components/OfflineBanner';

/** Handle Android system back button */
function AndroidBackHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentChat, setCurrentChat } = useChatStore();
  const { isOpen: isSearchOpen, close: closeSearch } = useSearchStore();

  const handleBack = useCallback(() => {
    if (isSearchOpen) {
      closeSearch();
      return;
    }
    if (currentChat) {
      setCurrentChat(null);
      return;
    }
    if (location.pathname !== '/') {
      navigate('/');
      return;
    }
    // At root with no chat open — allow default behavior (exit app)
  }, [currentChat, isSearchOpen, location.pathname, navigate, setCurrentChat, closeSearch]);

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      e.preventDefault();
      handleBack();
      // Push state back so we can catch the next back press
      window.history.pushState(null, '', window.location.href);
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [handleBack]);

  return null;
}

function AppLayout() {
  const { currentChat } = useChatStore();
  const { isOpen: isSearchOpen } = useSearchStore();
  const isMobile = useIsMobile();

  // Mobile: stack navigation — one panel at a time
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen overflow-hidden safe-area-top safe-area-bottom">
        <OfflineBanner />
        <div className="flex-1 min-h-0">
          <Routes>
            <Route
              path="/"
              element={
                currentChat ? (
                  <MobileChatView />
                ) : isSearchOpen ? (
                  <SearchPanel />
                ) : (
                  <ChatList />
                )
              }
            />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <Sidebar />
        <IncomingCallDialog />
        <OutgoingCallView />
        <ActiveCallView />
      </div>
    );
  }

  // Desktop: side-by-side layout
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <OfflineBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
      <Sidebar />
      <Routes>
        <Route
          path="/"
          element={
            <div className="flex flex-1 min-w-0">
              <div className="w-80 border-r border-gray-200 dark:border-gray-700 flex-shrink-0">
                {isSearchOpen ? <SearchPanel /> : <ChatList />}
              </div>
              <div className="flex-1 min-w-0">
                {currentChat ? <ChatView /> : <EmptyState />}
              </div>
            </div>
          }
        />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <IncomingCallDialog />
      <OutgoingCallView />
      <ActiveCallView />
      </div>
    </div>
  );
}

function MobileChatView() {
  const { setCurrentChat } = useChatStore();
  return (
    <ChatView
      onBack={() => {
        setCurrentChat(null);
        useChatStore.getState().setCurrentChat(null);
      }}
    />
  );
}

function App() {
  const { settings, loadSettings } = useSettingsStore();
  const { loadChats, setupIncomingListener } = useChatStore();
  const { isLoading: userLoading, isSetup, loadUser } = useUserStore();
  const { setupFileListeners } = useFileStore();
  const { setupGroupListeners } = useGroupStore();
  const { setupCallListeners } = useCallStore();
  const { startNetwork } = useNetworkStore();
  const { i18n } = useTranslation();

  useEffect(() => {
    loadUser();
    loadSettings();
    loadChats();
    setupIncomingListener();
    setupFileListeners();
    setupGroupListeners();
    setupCallListeners();
    initNotifications();
    setupMessageNotifications();
    startNetwork();
    checkForUpdates();
    return () => cleanupNotifications();
  }, []);

  // Sync language from settings to i18n
  useEffect(() => {
    if (settings.language && settings.language !== i18n.language) {
      i18n.changeLanguage(settings.language);
      localStorage.setItem('pulse-language', settings.language);
    }
  }, [settings.language, i18n]);

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin w-10 h-10 border-2 border-pulse-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <ThemeProvider theme={settings.theme} isDark={settings.isDark}>
      <BrowserRouter>
        <AndroidBackHandler />
        {isSetup ? <AppLayout /> : <ProfileSetupPage />}
        <Toasts />
      </BrowserRouter>
    </ThemeProvider>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-4 bg-pulse-100 dark:bg-pulse-900 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-pulse-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">
          {t('chat.selectChat')}
        </h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          {t('chat.selectChatDesc')}
        </p>
      </div>
    </div>
  );
}

export default App;
