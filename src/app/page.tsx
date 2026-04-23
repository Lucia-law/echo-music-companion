'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type AppState = 'idle' | 'parsing' | 'searching' | 'streaming' | 'done' | 'error';
type ViewMode = 'song' | 'chat';

interface SongInfo {
  songName: string;
  artist: string;
  platform: string;
  songId?: string;
}

interface SongMood {
  keywords: string[];
  atmosphere: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const idleFragments = [
  '有些歌，听完就想找个人说说话',
  '哪首歌最近一直在循环',
  '有些话说不出口，就让歌词替你说',
  '音乐是情绪的出口',
];

export default function Home() {
  const [link, setLink] = useState('');
  const [state, setState] = useState<AppState>('idle');
  const [viewMode, setViewMode] = useState<ViewMode>('song');
  const [songInfo, setSongInfo] = useState<SongInfo | null>(null);
  const [responseText, setResponseText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [fragment, setFragment] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatStreaming, setChatStreaming] = useState(false);
  const [songMood, setSongMood] = useState<SongMood | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const responseEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFragment(idleFragments[Math.floor(Math.random() * idleFragments.length)]);
  }, []);

  useEffect(() => {
    if (responseEndRef.current) {
      responseEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [responseText]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatStreaming]);

  useEffect(() => {
    if (viewMode === 'chat' && chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }, [viewMode]);

  const handleSubmit = useCallback(async () => {
    const trimmedLink = link.trim();
    if (!trimmedLink) return;

    setState('parsing');
    setSongInfo(null);
    setResponseText('');
    setErrorMessage('');
    setChatMessages([]);
    setViewMode('song');
    setSongMood(null);

    try {
      const parseRes = await fetch('/api/parse-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedLink }),
      });

      const parseData = await parseRes.json();

      if (!parseRes.ok || parseData.error) {
        setState('error');
        setErrorMessage(parseData.error || '无法识别这首歌');
        return;
      }

      setSongInfo({
        songName: parseData.songName,
        artist: parseData.artist,
        platform: parseData.platform,
        songId: parseData.songId,
      });

      setState('searching');

      const companionRes = await fetch('/api/music-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songName: parseData.songName,
          artist: parseData.artist,
          platform: parseData.platform,
          songId: parseData.songId,
        }),
      });

      if (!companionRes.ok) {
        setState('error');
        setErrorMessage('生成回复时出错了，请重试');
        return;
      }

      setState('streaming');

      const reader = companionRes.body?.getReader();
      if (!reader) {
        setState('error');
        setErrorMessage('连接中断，请重试');
        return;
      }

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setState('done');
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullText += parsed.content;
                setResponseText(fullText);
              }
              if (parsed.error) {
                setState('error');
                setErrorMessage(parsed.error);
              }
            } catch {
              // skip
            }
          }
        }
      }

      setState('done');
    } catch {
      setState('error');
      setErrorMessage('网络连接出了问题，请重试');
    }
  }, [link]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && state === 'idle') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleReset = () => {
    setLink('');
    setState('idle');
    setSongInfo(null);
    setResponseText('');
    setErrorMessage('');
    setChatMessages([]);
    setViewMode('song');
    setSongMood(null);
    setFragment(idleFragments[Math.floor(Math.random() * idleFragments.length)]);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCloseChat = () => {
    setViewMode('song');
  };

  const handleStartChat = () => {
    setViewMode('chat');

    if (!songMood && songInfo && responseText) {
      fetch('/api/analyze-mood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songName: songInfo.songName,
          artist: songInfo.artist,
          responseText: responseText,
        }),
      })
        .then((res) => res.json())
        .then((moodData) => {
          if (moodData.keywords && moodData.atmosphere) {
            setSongMood(moodData);
          }
        })
        .catch(() => {});
    }
  };

  const handleSendChat = useCallback(async () => {
    const trimmedInput = chatInput.trim();
    if (!trimmedInput || chatStreaming) return;

    const newUserMessage: ChatMessage = { role: 'user', content: trimmedInput };
    setChatMessages((prev) => [...prev, newUserMessage]);
    setChatInput('');
    setChatStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...chatMessages, newUserMessage], mood: songMood }),
      });

      if (!res.ok) {
        setChatStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setChatStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let fullText = '';

      setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setChatStreaming(false);
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullText += parsed.content;
                setChatMessages((prev) => {
                  const updated = [...prev];
                  if (updated.length > 0) {
                    updated[updated.length - 1] = { role: 'assistant', content: fullText };
                  }
                  return updated;
                });
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch {
      setChatStreaming(false);
    }

    setChatStreaming(false);
  }, [chatInput, chatMessages, chatStreaming]);

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const platformLabel: Record<string, string> = {
    netease: '网易云',
    qq: 'QQ音乐',
    kugou: '酷狗',
    kuwo: '酷我',
    spotify: 'Spotify',
    apple: 'Apple Music',
    bilibili: 'B站',
    unknown: '音乐平台',
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="fixed top-[-200px] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, oklch(0.7 0.06 65 / 0.04) 0%, transparent 70%)',
        }}
      />

      <main className="w-full max-w-xl mx-auto px-6 pt-28 md:pt-36 pb-20 relative z-10 flex-1">
        {/* Title */}
        <div className="text-center mb-16 animate-fade-up">
          <h1 className="font-serif text-4xl md:text-5xl font-normal text-warm-text tracking-[0.3em] mb-6">
            回响
          </h1>
          <p className="text-warm-text-dim text-xs tracking-[0.2em]">
            耳机里的情绪，终于有人回应
          </p>
        </div>

        {/* Input */}
        <div className="mb-12 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div
            className={`relative input-glow rounded-lg transition-all duration-500 ${
              state === 'idle'
                ? 'bg-warm-surface/80 border border-warm-border/60'
                : 'bg-warm-surface/40 border border-warm-border/30'
            }`}
          >
            <div className="flex items-center gap-3 px-4 py-3.5">
              <input
                ref={inputRef}
                type="text"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="粘贴一首歌的链接"
                disabled={state !== 'idle' && state !== 'error'}
                className="flex-1 bg-transparent text-warm-text placeholder:text-warm-text-dim/60 outline-none text-sm disabled:opacity-40 tracking-wide"
              />
              {state === 'idle' && link.trim() && (
                <button
                  onClick={handleSubmit}
                  className="flex-shrink-0 w-8 h-8 rounded-md bg-warm-amber/12 text-warm-amber/80 text-xs hover:bg-warm-amber/20 hover:text-warm-amber transition-all duration-300 flex items-center justify-center"
                >
                  →
                </button>
              )}
              {state !== 'idle' && (
                <button
                  onClick={handleReset}
                  className="flex-shrink-0 px-3 py-1 rounded-md text-warm-text-dim/60 text-xs hover:text-warm-text-muted transition-colors duration-300"
                >
                  换一首
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Song Info */}
        {songInfo && (
          <div className="mb-10 animate-fade-up">
            <div className="flex items-baseline gap-3 px-1">
              <span className="text-warm-text text-sm font-medium">
                {songInfo.songName}
              </span>
              {songInfo.artist && (
                <>
                  <span className="text-warm-text-dim/40 text-xs">·</span>
                  <span className="text-warm-text-muted text-xs">
                    {songInfo.artist}
                  </span>
                </>
              )}
              <span className="text-warm-text-dim/30 text-[10px] ml-auto">
                {platformLabel[songInfo.platform] || songInfo.platform}
              </span>
            </div>
          </div>
        )}

        {/* Loading */}
        {(state === 'parsing' || state === 'searching') && (
          <div className="py-20 animate-fade-in">
            <p className="text-warm-text-dim/50 text-xs tracking-[0.15em] text-center">
              {state === 'parsing' ? '在听' : '在想'}
            </p>
            <div className="flex justify-center gap-1.5 mt-4">
              <span className="w-1 h-1 rounded-full bg-warm-amber/40 pulse-dot-1" />
              <span className="w-1 h-1 rounded-full bg-warm-amber/40 pulse-dot-2" />
              <span className="w-1 h-1 rounded-full bg-warm-amber/40 pulse-dot-3" />
            </div>
          </div>
        )}

        {/* Song Response View */}
        {(state === 'streaming' || state === 'done') && responseText && viewMode === 'song' && (
          <div className="animate-fade-in">
            <div className="response-text text-warm-text/90 text-base md:text-lg whitespace-pre-wrap max-w-[65ch]">
              {responseText}
              {state === 'streaming' && (
                <span className="inline-block w-[2px] h-[1.1em] bg-warm-amber/60 ml-0.5 animate-cursor align-middle" />
              )}
            </div>
            {state === 'done' && (
              <div className="mt-16 animate-fade-in">
                <div className="w-6 h-px bg-warm-border/30 mb-10" />
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleReset}
                    className="text-warm-text-dim/50 text-sm tracking-wide hover:text-warm-text-dim transition-colors duration-300"
                  >
                    再听一首
                  </button>
                  <button
                    onClick={handleStartChat}
                    className="text-warm-text-dim/50 text-sm tracking-wide hover:text-warm-text-dim transition-colors duration-300"
                  >
                    继续聊聊
                  </button>
                </div>
              </div>
            )}
            <div ref={responseEndRef} />
          </div>
        )}

        {/* Chat View */}
        {viewMode === 'chat' && (
          <div className="animate-fade-in flex flex-col h-[70vh] min-h-[500px]">
            {/* Floating Back Button */}
            <button
              onClick={handleCloseChat}
              className="self-start mb-6 w-8 h-8 rounded-full bg-warm-surface/40 border border-warm-border/30 flex items-center justify-center text-warm-text-dim/60 hover:bg-warm-surface/60 hover:text-warm-text-muted transition-all duration-300"
            >
              ←
            </button>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {chatMessages.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-warm-text-dim/40 text-sm">
                    还有什么想聊的
                  </p>
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                      msg.role === 'user'
                        ? 'bg-warm-amber/20 text-warm-text rounded-br-md'
                        : 'bg-warm-surface/60 text-warm-text/90 rounded-bl-md'
                    }`}
                  >
                    {msg.content}
                    {chatStreaming && idx === chatMessages.length - 1 && msg.role === 'assistant' && (
                      <span className="inline-block w-[2px] h-[1em] bg-warm-amber/60 ml-1 animate-pulse align-middle" />
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="flex gap-3 pt-4 border-t border-warm-border/20">
              <input
                ref={chatInputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="你的感受是..."
                disabled={chatStreaming}
                className="flex-1 bg-warm-surface/40 border border-warm-border/30 rounded-lg px-4 py-3 text-warm-text text-sm placeholder:text-warm-text-dim/40 outline-none focus:border-warm-border/50 transition-colors duration-300 disabled:opacity-40"
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || chatStreaming}
                className="px-5 py-3 rounded-lg bg-warm-amber/15 border border-warm-amber/30 text-warm-amber/90 text-sm hover:bg-warm-amber/25 hover:text-warm-amber transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                发送
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {state === 'error' && errorMessage && (
          <div className="animate-fade-up">
            <p className="text-warm-rose/70 text-sm">{errorMessage}</p>
            <button
              onClick={handleReset}
              className="mt-4 text-warm-text-dim/50 text-xs tracking-wider hover:text-warm-text-muted transition-colors duration-300"
            >
              再试一次
            </button>
          </div>
        )}

        {/* Idle */}
        {state === 'idle' && (
          <div className="mt-16 animate-fade-in" style={{ animationDelay: '0.4s' }}>
            <p className="text-warm-text-dim/25 text-xs font-serif italic tracking-wider text-center leading-relaxed">
              {fragment}
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center pb-8 relative z-10">
        <span className="text-warm-text-dim/15 text-[10px] tracking-[0.3em]">
          回响
        </span>
      </footer>
    </div>
  );
}