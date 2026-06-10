import { useState, useEffect, useRef } from 'react';
import { Search, X, MessageSquare } from 'lucide-react';
import { useSearchStore, SearchResultItem } from '@/stores/searchStore';
import { useChatStore } from '@/stores/chatStore';
import { format } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

export function SearchPanel() {
  const { t, i18n } = useTranslation();
  const { query, results, isSearching, setQuery, search, close } = useSearchStore();
  const { chats, setCurrentChat, loadChats } = useChatStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => search(value), 300);
    setDebounceTimer(timer);
  };

  const handleSelectResult = async (result: SearchResultItem) => {
    await loadChats();
    const chat = chats.find(c => c.id === result.message.chatId);
    if (chat) setCurrentChat(chat);
    close();
  };

  const highlightMatch = (text: string, q: string) => {
    if (!q.trim()) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <span className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">{match}</span>
        {after}
      </>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700">
        <Search size={18} className="text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={t('search.placeholder')}
          className="flex-1 bg-transparent text-white placeholder-gray-400 text-sm focus:outline-none"
        />
        <button onClick={close} className="p-1 rounded hover:bg-gray-800">
          <X size={18} className="text-gray-400" />
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-pulse-500 border-t-transparent rounded-full" />
          </div>
        )}

        {!isSearching && query && results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <MessageSquare size={40} className="mb-3 opacity-50" />
            <p className="text-sm">{t('search.noResults')}</p>
          </div>
        )}

        {!isSearching && !query && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Search size={40} className="mb-3 opacity-50" />
            <p className="text-sm">{t('search.searchMessages')}</p>
          </div>
        )}

        {results.map((result, i) => (
          <button
            key={`${result.message.id}-${i}`}
            onClick={() => handleSelectResult(result)}
            className="w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors border-b border-gray-800"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-pulse-400">{result.chatName}</span>
              <span className="text-xs text-gray-500">
                {format(new Date(result.message.timestamp), 'dd MMM HH:mm', { locale: i18n.language === 'en' ? enUS : ru })}
              </span>
            </div>
            <p className="text-sm text-gray-300 line-clamp-2">
              {highlightMatch(result.message.content || '', query)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
