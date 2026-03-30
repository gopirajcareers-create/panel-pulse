import { useState, useRef, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { chatApi } from '@/lib/api/chat.api';
import type { ChatMessage, ChatHistoryEntry, ChatSource, SearchMode, ChatSearchSettings } from '@/lib/api/chat.api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Send, Bot, User, Sparkles, ChevronDown, ChevronUp, Zap, SlidersHorizontal, X } from 'lucide-react';

// ─── Starter questions ───────────────────────────────────────────────────────

// crypto.randomUUID() requires a secure context (HTTPS/localhost).
// http://10.10.142.91 is not secure, so we need a fallback for production HTTP.
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch (_) { /* fall through */ }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const STARTER_QUESTIONS = [
  'Which panel member is most suited for Python-based interviews?',
  'Show me panels with the highest Mandatory Skill Coverage score.',
  'Who are the top 5 panels ranked by overall score?',
  'Which panels scored poorly on Technical Depth?',
];

// ─── Search mode meta ─────────────────────────────────────────────────────────

const SEARCH_MODES: {
  mode: SearchMode;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  activeClass: string;
}[] = [
  {
    mode: 'hybrid',
    label: 'Hybrid Search',
    shortLabel: 'Hybrid',
    description: 'Combines BM25 keyword index + vector semantic search. Best balanced precision.',
    color: 'indigo',
    activeClass: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300',
  },
  {
    mode: 'bm25',
    label: 'Index Search',
    shortLabel: 'Index',
    description: 'Pure BM25 full-text index search. Best for exact keyword or name lookups.',
    color: 'amber',
    activeClass: 'bg-amber-500/20 border-amber-500/50 text-amber-300',
  },
  {
    mode: 'vector',
    label: 'Vector Search',
    shortLabel: 'Vector',
    description: 'Pure semantic/vector search. Best for conceptual or meaning-based queries.',
    color: 'emerald',
    activeClass: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
  },
];

const MODE_PILL_CLASS: Record<SearchMode, string> = {
  hybrid: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  bm25: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  vector: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

const MODE_DOT_CLASS: Record<SearchMode, string> = {
  hybrid: 'bg-indigo-400',
  bm25: 'bg-amber-400',
  vector: 'bg-emerald-400',
};

// ─── Search Settings Panel ────────────────────────────────────────────────────

function SearchSettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: ChatSearchSettings;
  onChange: (s: ChatSearchSettings) => void;
  onClose: () => void;
}) {
  const bm25Pct = Math.round(settings.bm25Weight * 100);
  const vecPct = Math.round(settings.vectorWeight * 100);
  const isHybrid = settings.searchMode === 'hybrid';

  function handleSlider(e: React.ChangeEvent<HTMLInputElement>) {
    const bm25 = Number(e.target.value) / 100;
    onChange({ ...settings, bm25Weight: bm25, vectorWeight: +(1 - bm25).toFixed(2) });
  }

  function selectMode(mode: SearchMode) {
    onChange({ ...settings, searchMode: mode });
  }

  return (
    <div className="bg-[#0f1117] border border-slate-700/60 rounded-2xl p-4 text-sm shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-200 text-sm">Search Mode Settings</span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
          aria-label="Close settings"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Mode selector */}
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-2">Search Strategy</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {SEARCH_MODES.map(({ mode, shortLabel, description, activeClass }) => (
          <button
            key={mode}
            onClick={() => selectMode(mode)}
            title={description}
            className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-all duration-200 text-center ${
              settings.searchMode === mode
                ? activeClass
                : 'border-slate-700/50 text-slate-500 hover:border-slate-600/60 hover:text-slate-400 bg-slate-800/40'
            }`}
          >
            {shortLabel}
            {settings.searchMode === mode && (
              <span className="block text-[9px] mt-0.5 opacity-70">Active</span>
            )}
          </button>
        ))}
      </div>

      {/* Mode description */}
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        {SEARCH_MODES.find((m) => m.mode === settings.searchMode)?.description}
      </p>

      {/* Weight slider — only visible in hybrid mode */}
      {isHybrid && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-3">
            Weight Distribution (Hybrid only)
          </p>

          {/* Weight labels */}
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-amber-400 font-medium">Index (BM25) {bm25Pct}%</span>
            <span className="text-emerald-400 font-medium">{vecPct}% Vector</span>
          </div>

          {/* Slider */}
          <div className="relative mb-3">
            {/* Gradient track */}
            <div className="h-2 rounded-full overflow-hidden mb-1"
              style={{
                background: `linear-gradient(to right, #f59e0b ${bm25Pct}%, #10b981 ${bm25Pct}%)`
              }}
            />
            <input
              type="range"
              min={0}
              max={100}
              value={bm25Pct}
              onChange={handleSlider}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-2"
              aria-label="BM25 vs Vector weight"
            />
          </div>

          {/* Preset buttons */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Index Heavy (80/20)', b: 0.8 },
              { label: 'Balanced (50/50)', b: 0.5 },
              { label: 'Vector Heavy (20/80)', b: 0.2 },
            ].map(({ label, b }) => (
              <button
                key={label}
                onClick={() => onChange({ ...settings, bm25Weight: b, vectorWeight: +(1 - b).toFixed(2) })}
                className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${
                  settings.bm25Weight === b
                    ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                    : 'border-slate-700/50 text-slate-500 hover:border-slate-600/60 hover:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 mb-5 justify-start">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-indigo-400" />
      </div>
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Source chips ─────────────────────────────────────────────────────────────

function SourcesAccordion({ sources }: { sources: ChatSource[] }) {
  const [open, setOpen] = useState(false);
  const filtered = sources.filter(
    (s) => s.job_interview_id || s.candidate_name || s.panel_member_name
  );
  if (!filtered.length) return null;

  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-400 transition-colors"
      >
        <Zap className="w-3 h-3" />
        {filtered.length} source{filtered.length !== 1 ? 's' : ''} retrieved
        {open ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>

      {open && (
        <div className="mt-2 flex flex-wrap gap-2">
          {filtered.map((src, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 bg-slate-700/50 border border-slate-600/40 text-slate-400 rounded-lg px-2 py-1"
            >
              {src.panel_member_name && (
                <span className="text-slate-300 font-medium">{src.panel_member_name}</span>
              )}
              {src.candidate_name && (
                <span className="text-slate-500">· {src.candidate_name}</span>
              )}
              {!src.panel_member_name && !src.candidate_name && src.job_interview_id && (
                <span>{src.job_interview_id}</span>
              )}
              {src.score !== null && src.score !== undefined && (
                <span
                  className={`ml-1 font-semibold ${
                    src.score >= 8
                      ? 'text-emerald-400'
                      : src.score >= 5
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}
                >
                  {src.score}/10
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';

  return (
    <div
      className={`flex items-end gap-3 mb-5 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {/* AI avatar — left */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mb-auto mt-1">
          <Bot className="w-4 h-4 text-indigo-400" />
        </div>
      )}

      {/* Bubble */}
      <div className={`max-w-[78%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-gradient-to-br from-orange-500/25 to-orange-600/15 border border-orange-500/30 text-white rounded-br-sm'
              : 'bg-slate-800/60 border border-slate-700/50 text-slate-200 rounded-bl-sm prose prose-invert max-w-none'
          }`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{msg.content}</div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                strong: ({ children }) => <strong className="font-bold text-indigo-300 drop-shadow-sm">{children}</strong>,
                ul: ({ children }) => <ul className="list-disc ml-5 mb-4 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal ml-5 mb-4 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="pl-1">{children}</li>,
                h1: ({ children }) => <h1 className="text-xl font-bold mb-4 mt-2 text-white border-b border-slate-700/50 pb-1">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-bold mb-3 mt-4 text-white flex items-center gap-2">
                  <span className="w-1 h-4 bg-indigo-500 rounded-full" />
                  {children}
                </h2>,
                h3: ({ children }) => <h3 className="text-md font-semibold mb-2 mt-3 text-slate-200 uppercase tracking-wider text-[11px]">{children}</h3>,
                hr: () => <hr className="border-slate-700/60 my-6" />,
                code: ({ children }) => <code className="bg-slate-900/80 px-1.5 py-0.5 rounded text-indigo-400 font-mono text-xs border border-slate-700/30">{children}</code>
              }}
            >
              {msg.content}
            </ReactMarkdown>
          )}
        </div>


        {/* Timestamp */}
        <span className="text-[10px] text-slate-600 mt-1 px-1">
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* User avatar — right */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500/30 to-orange-600/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0 mb-auto mt-1">
          <User className="w-4 h-4 text-orange-400" />
        </div>
      )}
    </div>
  );
}

// ─── ChatPage ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchSettings, setSearchSettings] = useState<ChatSearchSettings>({
    searchMode: 'hybrid',
    bm25Weight: 0.4,
    vectorWeight: 0.6,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  // Close settings panel when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        showSettings &&
        settingsPanelRef.current &&
        !settingsPanelRef.current.contains(e.target as Node)
      ) {
        setShowSettings(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  const buildHistory = useCallback((): ChatHistoryEntry[] => {
    return messages
      .filter((m) => !m.isLoading)
      .map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      // Append user message
      const userMsg: ChatMessage = {
        id: genId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);

      try {
        const history = buildHistory();
        // Include the new user message in history for context
        const fullHistory: ChatHistoryEntry[] = [
          ...history,
          { role: 'user', content: trimmed },
        ];

        const response = await chatApi.sendMessage(trimmed, fullHistory.slice(0, -1), searchSettings);

        const aiMsg: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content: response.reply,
          timestamp: new Date(),
          sources: response.sources,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } catch (err: any) {
        const errMsg: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content:
            '⚠️ Sorry, I encountered an error retrieving data. Please try again in a moment.',
          timestamp: new Date(),
          sources: [],
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsLoading(false);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    },
    [isLoading, buildHistory, searchSettings]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;
  const currentModeMeta = SEARCH_MODES.find((m) => m.mode === searchSettings.searchMode)!;

  return (
    <AppShell>
      <main className="flex flex-col h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* ── Header ── */}
        <div className="bg-slate-800/40 border-b border-slate-700/50 backdrop-blur-sm flex-shrink-0">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Ask the AI</h1>
              <p className="text-xs text-slate-400">
                Query your panel evaluation data using natural language
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {/* Search mode status pill */}
              <div
                className={`flex items-center gap-1.5 text-xs border rounded-full px-3 py-1 ${MODE_PILL_CLASS[searchSettings.searchMode]}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${MODE_DOT_CLASS[searchSettings.searchMode]}`} />
                {currentModeMeta.label}
                {searchSettings.searchMode === 'hybrid' && (
                  <span className="opacity-70 ml-0.5">
                    · {Math.round(searchSettings.bm25Weight * 100)}% / {Math.round(searchSettings.vectorWeight * 100)}%
                  </span>
                )}
              </div>

              {/* Settings toggle */}
              <div className="relative" ref={settingsPanelRef}>
                <button
                  onClick={() => setShowSettings((p) => !p)}
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-200 ${
                    showSettings
                      ? 'bg-slate-700/80 border-slate-600/60 text-slate-200'
                      : 'border-slate-700/50 text-slate-500 hover:border-slate-600/60 hover:text-slate-300 hover:bg-slate-700/40'
                  }`}
                  aria-label="Search settings"
                  title="Configure search mode"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>

                {/* Settings dropdown */}
                {showSettings && (
                  <div className="absolute right-0 top-full mt-2 w-80 z-50">
                    <SearchSettingsPanel
                      settings={searchSettings}
                      onChange={setSearchSettings}
                      onClose={() => setShowSettings(false)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Message Area ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-6">

            {/* Empty state / starter chips */}
            {isEmpty && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                  <Bot className="w-8 h-8 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  PanelPulse AI Assistant
                </h2>
                <p className="text-slate-400 text-sm mb-8 max-w-sm">
                  Ask anything about your panel evaluations, candidate results, or
                  interviewer performance. Use the <SlidersHorizontal className="inline w-3.5 h-3.5 mx-0.5 text-slate-400" /> settings to control the search strategy.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                  {STARTER_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left text-sm text-slate-300 bg-slate-800/50 border border-slate-700/50 hover:border-indigo-500/40 hover:bg-slate-800/80 hover:text-white rounded-xl px-4 py-3 transition-all duration-200"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {!isEmpty && (
              <>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
                {isLoading && <TypingIndicator />}
              </>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Input bar ── */}
        <div className="flex-shrink-0 border-t border-slate-700/50 bg-slate-800/40 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="relative flex items-end gap-3 bg-slate-800/60 border border-slate-700/60 rounded-2xl px-4 py-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about panels, scores, candidates…"
                rows={1}
                disabled={isLoading}
                className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 resize-none outline-none leading-relaxed disabled:opacity-50 min-h-[24px] max-h-[160px]"
                aria-label="Chat message input"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 self-end"
                aria-label="Send message"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
            <p className="text-[10px] text-slate-600 text-center mt-2">
              Enter to send · Shift+Enter for new line · Click <SlidersHorizontal className="inline w-3 h-3 mx-0.5" /> to change search strategy
            </p>
          </div>
        </div>
      </main>
    </AppShell>
  );
}


