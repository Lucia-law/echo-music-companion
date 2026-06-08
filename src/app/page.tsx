'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type AppState = 'idle' | 'parsing' | 'searching' | 'streaming' | 'done' | 'error';

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

const idleFragments = [
  '有些歌，听完就想找个人说说话',
  '哪首歌最近一直在循环',
  '有些话说不出口，就让歌词替你说',
  '音乐是情绪的出口',
];

export default function Home() {
  const router = useRouter();
  const [link, setLink] = useState('');
  const [state, setState] = useState<AppState>('idle');
  const [songInfo, setSongInfo] = useState<SongInfo | null>(null);
  const [responseText, setResponseText] = useState('');
  const [secondResponse, setSecondResponse] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [fragment, setFragment] = useState('');
  const [songMood, setSongMood] = useState<SongMood | null>(null);

  // 倾诉卡片
  const [showConfession, setShowConfession] = useState(false);
  const [whenWhere, setWhenWhere] = useState('');
  const [thoughts, setThoughts] = useState('');
  const [isSubmittingConfession, setIsSubmittingConfession] = useState(false);

  // 回响之地
  const [currentSpaceName, setCurrentSpaceName] = useState<string | null>(null);
  const [showSpaceCard, setShowSpaceCard] = useState(false);
  const [spaceNameInput, setSpaceNameInput] = useState('');
  const [spacePassword, setSpacePassword] = useState('');
  const [spaceError, setSpaceError] = useState('');
  const [isSubmittingSpace, setIsSubmittingSpace] = useState(false);
  const [spaceExists, setSpaceExists] = useState<boolean | null>(null);
  const spaceCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 记录保存
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [cachedLyrics, setCachedLyrics] = useState('');
  const [cachedComments, setCachedComments] = useState('');
  const [hasConfessed, setHasConfessed] = useState(false);

  const [stardust, setStardust] = useState<React.ReactNode[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const responseEndRef = useRef<HTMLDivElement>(null);

  // 加载已保存的空间名，首次访问自动弹出回响之地卡片
  useEffect(() => {
    const saved = localStorage.getItem('huixiang_space_name');
    if (saved) {
      setCurrentSpaceName(saved);
      setSpaceNameInput(saved);
    } else {
      // 没有保存过空间名，首次访问直接弹出
      setShowSpaceCard(true);
    }
  }, []);

  useEffect(() => {
    setFragment(idleFragments[Math.floor(Math.random() * idleFragments.length)]);
    setStardust(
      Array.from({ length: 60 }).map((_, i) => {
        const duration = 2 + Math.random() * 4;
        const delay = Math.random() * 5;
        const left = Math.random() * 100;
        const top = Math.random() * 100;
        const opacity = 0.15 + Math.random() * 0.35;
        const isStar = Math.random() > 0.6;
        const starSize = 8 + Math.random() * 10;
        return (
          <div
            key={`atmo-${i}`}
            className="absolute pointer-events-none"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animation: `pulse-dot ${duration}s ease-in-out infinite ${delay}s`,
            }}
          >
            {isStar ? (
              <span
                style={{
                  fontSize: starSize,
                  color: `oklch(0.82 0.08 75 / ${opacity})`,
                  textShadow: `0 0 ${starSize}px oklch(0.82 0.08 75 / ${opacity * 0.4})`,
                  lineHeight: 1,
                }}
              >
                ✦
              </span>
            ) : (
              <div
                style={{
                  width: 1 + Math.random() * 1.5,
                  height: 1 + Math.random() * 1.5,
                  background: `oklch(0.82 0.08 75 / ${opacity})`,
                  borderRadius: '50%',
                  boxShadow: `0 0 3px oklch(0.82 0.08 75 / ${opacity * 0.5})`,
                }}
              />
            )}
          </div>
        );
      })
    );
  }, []);

  useEffect(() => {
    if (responseEndRef.current) {
      responseEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [responseText, secondResponse]);

  // 检查空间名是否已存在
  const checkSpaceExists = useCallback(async (name: string) => {
    if (!name.trim()) {
      setSpaceExists(null);
      return;
    }
    try {
      const res = await fetch(`/api/space?spaceName=${encodeURIComponent(name.trim())}`);
      const data = await res.json();
      setSpaceExists(data.exists);
    } catch {
      setSpaceExists(null);
    }
  }, []);

  // 保存记录到回响之地
  const saveRecord = useCallback(async (data: {
    songName: string;
    artist: string;
    platform: string;
    aiResponse: string;
    moodKeywords?: string[];
    moodAtmosphere?: string;
  }) => {
    if (!currentSpaceName) return null;
    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spaceName: currentSpaceName,
          ...data,
        }),
      });
      const result = await res.json();
      if (result.id) {
        setCurrentRecordId(result.id);
        return result.id;
      }
    } catch {
      // 静默失败，不影响主流程
    }
    return null;
  }, [currentSpaceName]);

  // 更新记录（倾诉后）
  const updateRecord = useCallback(async (recordId: string, data: {
    userWhenWhere?: string;
    userThoughts?: string;
    aiSecondResponse?: string;
    aiResponse?: string;
  }) => {
    try {
      await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, ...data }),
      });
    } catch {
      // 静默失败
    }
  }, []);

  // 分析情绪并保存记录
  const analyzeAndSave = useCallback(async (song: SongInfo, aiText: string) => {
    let mood: SongMood | null = null;
    try {
      const moodRes = await fetch('/api/analyze-mood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songName: song.songName,
          artist: song.artist,
          responseText: aiText,
        }),
      });
      const moodData = await moodRes.json();
      if (moodData.keywords && moodData.atmosphere) {
        mood = moodData;
        setSongMood(mood);
      }
    } catch {
      // 静默失败
    }

    if (currentSpaceName) {
      await saveRecord({
        songName: song.songName,
        artist: song.artist,
        platform: song.platform,
        aiResponse: aiText,
        moodKeywords: mood?.keywords,
        moodAtmosphere: mood?.atmosphere,
      });
    }
  }, [currentSpaceName, saveRecord]);

  const handleSubmit = useCallback(async () => {
    const trimmedLink = link.trim();
    if (!trimmedLink) return;

    setState('parsing');
    setSongInfo(null);
    setResponseText('');
    setSecondResponse('');
    setErrorMessage('');
    setShowConfession(false);
    setWhenWhere('');
    setThoughts('');
    setSongMood(null);
    setCurrentRecordId(null);
    setHasConfessed(false);

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

      const song: SongInfo = {
        songName: parseData.songName,
        artist: parseData.artist,
        platform: parseData.platform,
        songId: parseData.songId,
      };
      setSongInfo(song);

      setState('searching');

      const companionRes = await fetch('/api/music-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songName: song.songName,
          artist: song.artist,
          platform: song.platform,
          songId: song.songId,
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
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullText += parsed.content;
                setResponseText(fullText);
              }
              if (parsed.type === 'context') {
                setCachedLyrics(parsed.lyrics || '');
                setCachedComments(parsed.comments || '');
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
      analyzeAndSave(song, fullText);
    } catch {
      setState('error');
      setErrorMessage('网络连接出了问题，请重试');
    }
  }, [link, analyzeAndSave]);

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
    setSecondResponse('');
    setErrorMessage('');
    setShowConfession(false);
    setWhenWhere('');
    setThoughts('');
    setSongMood(null);
    setCurrentRecordId(null);
    setHasConfessed(false);
    setFragment(idleFragments[Math.floor(Math.random() * idleFragments.length)]);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // 提交倾诉
  const handleSubmitConfession = useCallback(async () => {
    if (!songInfo || isSubmittingConfession) return;
    if (!whenWhere.trim() && !thoughts.trim()) return;

    setIsSubmittingConfession(true);

    try {
      const res = await fetch('/api/music-resonance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songName: songInfo.songName,
          artist: songInfo.artist,
          aiResponse: responseText,
          whenWhere: whenWhere.trim(),
          thoughts: thoughts.trim(),
          lyrics: cachedLyrics,
          comments: cachedComments,
        }),
      });

      if (!res.ok) {
        setIsSubmittingConfession(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setIsSubmittingConfession(false);
        return;
      }

      const decoder = new TextDecoder();
      let fullText = '';

      setShowConfession(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullText += parsed.content;
                setResponseText(fullText);
              }
            } catch {
              // skip
            }
          }
        }
      }

      setIsSubmittingConfession(false);
      setHasConfessed(true);

      // 更新记录：覆盖 ai_response 为最终版本
      if (currentRecordId) {
        await updateRecord(currentRecordId, {
          userWhenWhere: whenWhere.trim(),
          userThoughts: thoughts.trim(),
          aiSecondResponse: fullText,
          aiResponse: fullText,
        });
      }
    } catch {
      setIsSubmittingConfession(false);
    }
  }, [songInfo, responseText, whenWhere, thoughts, isSubmittingConfession, currentRecordId, updateRecord]);

  // 进入/创建回响之地
  const handleSpaceSubmit = useCallback(async () => {
    if (!spaceNameInput.trim() || spacePassword.length < 6 || isSubmittingSpace) return;

    setIsSubmittingSpace(true);
    setSpaceError('');

    try {
      const res = await fetch('/api/space', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spaceName: spaceNameInput.trim(),
          password: spacePassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSpaceError(data.error || '出错了');
        setIsSubmittingSpace(false);
        return;
      }

      setCurrentSpaceName(data.spaceName);
      localStorage.setItem('huixiang_space_name', data.spaceName);
      setShowSpaceCard(false);
      setSpacePassword('');
      setSpaceError('');
      setIsSubmittingSpace(false);
    } catch {
      setSpaceError('网络出了问题，请重试');
      setIsSubmittingSpace(false);
    }
  }, [spaceNameInput, spacePassword, isSubmittingSpace]);

  const handleSpaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSpaceSubmit();
    }
  };

  // 空间名输入变化时检查是否存在
  const handleSpaceNameChange = useCallback((value: string) => {
    setSpaceNameInput(value);
    setSpaceError('');
    setSpaceExists(null);
    if (spaceCheckTimer.current) {
      clearTimeout(spaceCheckTimer.current);
    }
    spaceCheckTimer.current = setTimeout(() => checkSpaceExists(value), 500);
  }, [checkSpaceExists]);

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
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: '#111113' }}>
      {/* Ambient glow */}
      <div
        className="fixed top-[-200px] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, oklch(0.7 0.06 65 / 0.04) 0%, transparent 70%)',
        }}
      />

      {/* 氛围星尘 */}
      {stardust}

      <main className="w-full max-w-xl mx-auto px-6 pt-28 md:pt-36 pb-20 relative z-10 flex-1">
        {/* 回响之地入口 - 顶部 */}
        <div className="flex items-center justify-between mb-12 animate-fade-up">
          <button
            onClick={() => {
              if (currentSpaceName) {
                router.push('/starmap?space=' + encodeURIComponent(currentSpaceName));
              } else {
                setShowSpaceCard(true);
              }
            }}
            className="group font-serif text-warm-amber/75 text-2xl tracking-[0.15em] hover:text-warm-amber transition-colors duration-300"
          >
            {currentSpaceName ? `✦ ${currentSpaceName}` : '✦ 回响之地'}
          </button>
          <span className="text-warm-text-dim/40 text-xs font-serif italic tracking-wider">
            {currentSpaceName ? '你留下的回响，都在这里' : '你的听歌记忆，都在这里'}
          </span>
        </div>

        {/* Title */}
        <div className="text-center mb-16 animate-fade-up">
          <h1 className="font-serif text-4xl md:text-5xl font-normal text-warm-text tracking-[0.3em] mb-6">
            回响
          </h1>
          <p className="text-warm-text-dim/40 text-xs font-serif italic tracking-wider">
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
              <span className="text-warm-text-dim/45 text-[10px] ml-auto">
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
        {(state === 'streaming' || state === 'done') && responseText && (
          <div className="animate-fade-in">
            <div className="response-text text-warm-text/90 text-base md:text-lg whitespace-pre-wrap max-w-[65ch]">
              {responseText}
              {state === 'streaming' && (
                <span className="inline-block w-[2px] h-[1.1em] bg-warm-amber/60 ml-0.5 animate-cursor align-middle" />
              )}
            </div>

            {state === 'done' && !showConfession && (
              <div className="mt-16 animate-fade-in">
                <div className="w-6 h-px bg-warm-border/30 mb-10" />
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleReset}
                    className="text-warm-text/60 text-sm tracking-wide hover:text-warm-text/80 transition-colors duration-300"
                  >
                    再听一首
                  </button>
                  {!hasConfessed && (
                    <button
                      onClick={() => setShowConfession(true)}
                      className="text-warm-amber/60 text-sm tracking-wide hover:text-warm-amber/80 transition-colors duration-300"
                    >
                      你心里的版本
                    </button>
                  )}
                </div>
              </div>
            )}
            <div ref={responseEndRef} />
          </div>
        )}

        {/* 倾诉卡片 - 弹窗 */}
        {showConfession && (
          <div className="fixed inset-0 z-40 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-warm-bg/80 backdrop-blur-sm"
              onClick={() => setShowConfession(false)}
            />
            <div className="relative bg-warm-surface/90 backdrop-blur-md border border-warm-border/40 rounded-xl p-8 w-full max-w-sm animate-fade-up">
              <p className="font-serif text-warm-text/60 text-sm tracking-wider text-center mb-8">
                这首歌在你心里，是另一个样子
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-warm-text-dim/50 text-xs tracking-wider mb-2">
                    何时 · 何地
                  </label>
                  <input
                    type="text"
                    value={whenWhere}
                    onChange={(e) => setWhenWhere(e.target.value)}
                    placeholder="凌晨三点的窗边"
                    className="w-full bg-warm-bg/60 border border-warm-border/30 rounded-lg px-4 py-3 text-warm-text text-sm placeholder:text-warm-text-dim/30 outline-none focus:border-warm-amber/30 transition-colors duration-300"
                  />
                </div>
                <div>
                  <label className="block text-warm-text-dim/50 text-xs tracking-wider mb-2">
                    何思 · 何想
                  </label>
                  <input
                    type="text"
                    value={thoughts}
                    onChange={(e) => setThoughts(e.target.value)}
                    placeholder="想起了一个人"
                    className="w-full bg-warm-bg/60 border border-warm-border/30 rounded-lg px-4 py-3 text-warm-text text-sm placeholder:text-warm-text-dim/30 outline-none focus:border-warm-amber/30 transition-colors duration-300"
                  />
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 mt-8">
                <button
                  onClick={() => setShowConfession(false)}
                  className="text-warm-text-dim/40 text-sm tracking-wide hover:text-warm-text-dim/70 transition-colors duration-300"
                >
                  算了
                </button>
                <button
                  onClick={handleSubmitConfession}
                  disabled={(!whenWhere.trim() && !thoughts.trim()) || isSubmittingConfession}
                  className="px-6 py-2.5 rounded-lg bg-warm-amber/15 border border-warm-amber/30 text-warm-amber/90 text-sm tracking-wide hover:bg-warm-amber/25 hover:text-warm-amber transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmittingConfession ? '在听...' : '说完了'}
                </button>
              </div>
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
            <p className="text-warm-text-dim/40 text-xs font-serif italic tracking-wider text-center leading-relaxed">
              {fragment}
            </p>
          </div>
        )}
      </main>

      {/* 回响之地入口卡片 */}
      {showSpaceCard && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-warm-bg/80 backdrop-blur-sm" />
          <div className="relative bg-warm-surface/90 backdrop-blur-md border border-warm-border/40 rounded-xl p-8 w-full max-w-sm animate-fade-up">
            <p className="font-serif text-warm-text/80 text-base tracking-wider text-center mb-8">
              进入你的回响之地
            </p>

            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  value={spaceNameInput}
                  onChange={(e) => handleSpaceNameChange(e.target.value)}
                  placeholder="你的回响之地名字"
                  className="w-full bg-warm-bg/60 border border-warm-border/30 rounded-lg px-4 py-3 text-warm-text text-sm placeholder:text-warm-text-dim/40 outline-none focus:border-warm-amber/30 transition-colors duration-300"
                />
                <div className="mt-1.5 flex justify-between">
                  <p className="text-warm-text-dim/35 text-[10px] tracking-wider">
                    示例：深夜电台 / 凌晨两点半 / 某人的宇宙
                  </p>
                  {spaceExists === true && (
                    <p className="text-warm-amber/50 text-[10px] tracking-wider">已有此名</p>
                  )}
                  {spaceExists === false && (
                    <p className="text-warm-text-dim/40 text-[10px] tracking-wider">这个名字可用</p>
                  )}
                </div>
              </div>
              <div>
                <input
                  type="password"
                  value={spacePassword}
                  onChange={(e) => { setSpacePassword(e.target.value); setSpaceError(''); }}
                  onKeyDown={handleSpaceKeyDown}
                  placeholder={spaceExists ? '暗语' : '设一个暗语'}
                  className="w-full bg-warm-bg/60 border border-warm-border/30 rounded-lg px-4 py-3 text-warm-text text-sm placeholder:text-warm-text-dim/40 outline-none focus:border-warm-amber/30 transition-colors duration-300"
                />
                <p className="mt-1.5 text-warm-text-dim/35 text-[10px] tracking-wider">
                  字母、数字或符号，至少6位
                </p>
              </div>
            </div>

            {spaceError && (
              <p className="mt-3 text-warm-rose/70 text-xs text-center">{spaceError}</p>
            )}

            <div className="flex items-center justify-center mt-8">
              <button
                onClick={handleSpaceSubmit}
                disabled={!spaceNameInput.trim() || spacePassword.length < 6 || isSubmittingSpace}
                className="px-8 py-2.5 rounded-lg bg-warm-amber/15 border border-warm-amber/30 text-warm-amber/90 text-sm tracking-wide hover:bg-warm-amber/25 hover:text-warm-amber transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmittingSpace ? '进入中...' : '进入'}
              </button>
            </div>

            <p className="mt-6 text-warm-text-dim/35 text-[10px] tracking-wider text-center">
              还没有回响之地？取个名字就是你的了
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center pb-8 relative z-10">
        <span className="text-warm-text-dim/30 text-[10px] tracking-[0.3em]">
          回响
        </span>
      </footer>
    </div>
  );
}
