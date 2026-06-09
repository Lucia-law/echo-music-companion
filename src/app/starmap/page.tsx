'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

interface SongRecord {
  id: string;
  songName: string;
  artist: string;
  platform: string;
  aiResponse: string;
  userWhenWhere: string | null;
  userThoughts: string | null;
  aiSecondResponse: string | null;
  moodKeywords: string[] | null;
  moodAtmosphere: string | null;
  createdAt: string;
}

interface Star {
  id: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  songName: string;
  record: SongRecord;
  haloDuration: number;
}

interface TimelineEntry {
  date: string;
  text: string;
  songName: string;
  artist: string;
  createdAt: string;
  period?: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours();
  const period = hour < 6 ? '凌晨' : hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';
  return `${month}.${day}  ${period}`;
}

function StarmapContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const spaceName = searchParams.get('space');

  const [records, setRecords] = useState<SongRecord[]>([]);
  const [stars, setStars] = useState<Star[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<SongRecord | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spaceCreatedAt, setSpaceCreatedAt] = useState<string | null>(null);
  const [stardust, setStardust] = useState<React.ReactNode[]>([]);
  const [bgDust, setBgDust] = useState<React.ReactNode[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // 加载记录
  useEffect(() => {
    if (!spaceName) {
      router.push('/');
      return;
    }

    const fetchRecords = async () => {
      try {
        const res = await fetch(`/api/records?spaceName=${encodeURIComponent(spaceName)}`);
        const data = await res.json();
        if (data.records) {
          setRecords(data.records);
        }
      } catch {
        // 静默
      } finally {
        setLoading(false);
      }
    };

    // 获取空间信息
    const fetchSpace = async () => {
      try {
        const res = await fetch(`/api/space?spaceName=${encodeURIComponent(spaceName)}`);
        const data = await res.json();
        if (data.exists) {
          setSpaceCreatedAt(new Date().toISOString()); // 简化处理
        }
      } catch {
        // 静默
      }
    };

    fetchRecords();
    fetchSpace();
  }, [spaceName, router]);

  // 生成星点位置 - 同一首歌只显示一次，歌少时网格排布，歌多时随机但有最小间距
  useEffect(() => {
    if (records.length === 0) {
      setStars([]);
      return;
    }

    // 按歌名去重，保留最新一条
    const seen = new Map<string, SongRecord>();
    for (const record of records) {
      const key = `${record.songName}-${record.artist}`;
      if (!seen.has(key)) {
        seen.set(key, record);
      }
    }
    const uniqueRecords = Array.from(seen.values());

    const containerWidth = containerRef.current?.clientWidth || 600;
    const starCount = uniqueRecords.length;
    const padding = 50;
    const usableWidth = containerWidth - padding * 2;

    // 动态高度：紧凑，给脉络留空间
    const containerHeight = Math.max(200, Math.min(350, starCount * 70));
    const usableHeight = containerHeight - padding * 2;

    // 使用固定种子确保同一记录位置一致
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    // 拒绝采样：两个星点间距不小于 minDist px
    const minDist = 50;
    const placed: { x: number; y: number }[] = [];
    const isTooClose = (x: number, y: number) =>
      placed.some((p) => {
        const dx = x - p.x;
        const dy = y - p.y;
        return dx * dx + dy * dy < minDist * minDist;
      });

    const newStars: Star[] = [];

    for (let i = 0; i < uniqueRecords.length; i++) {
      const record = uniqueRecords[i];
      let x = 0, y = 0;

      if (starCount <= 15) {
        // 歌少 → 网格排布 + 种子随机偏移，保证不重叠不扎堆
        const cols = Math.ceil(Math.sqrt(starCount * (usableWidth / usableHeight)));
        const rows = Math.ceil(starCount / cols);
        const cellW = usableWidth / cols;
        const cellH = usableHeight / rows;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const jitterX = (seededRandom(i * 5) - 0.5) * cellW * 0.35;
        const jitterY = (seededRandom(i * 6) - 0.5) * cellH * 0.35;
        x = padding + col * cellW + cellW / 2 + jitterX;
        y = padding + row * cellH + cellH / 2 + jitterY;
        placed.push({ x, y });
      } else {
        // 歌多 → 随机采样 + 最小间距拒绝
        let attempts = 0;
        const maxAttempts = 50;
        let found = false;
        while (!found && attempts < maxAttempts) {
          const rx = seededRandom(i * 7 + attempts * 13);
          const ry = seededRandom(i * 8 + attempts * 17);
          const px = padding + rx * usableWidth;
          const py = padding + ry * usableHeight;
          if (!isTooClose(px, py)) {
            x = px;
            y = py;
            placed.push({ x, y });
            found = true;
            break;
          }
          attempts++;
        }
        // 如果拒绝采样超限，退化为网格排布
        if (!found) {
          const cols = Math.ceil(Math.sqrt(starCount * (usableWidth / usableHeight)));
          const rows = Math.ceil(starCount / cols);
          const cellW = usableWidth / cols;
          const cellH = usableHeight / rows;
          const col = i % cols;
          const row = Math.floor(i / cols);
          const jitterX = (seededRandom(99 + i) - 0.5) * cellW * 0.3;
          const jitterY = (seededRandom(199 + i) - 0.5) * cellH * 0.3;
          x = padding + col * cellW + cellW / 2 + jitterX;
          y = padding + row * cellH + cellH / 2 + jitterY;
          placed.push({ x, y });
        }
      }

      const opacity = 0.5 + seededRandom(i * 3) * 0.5;
      const size = 12 + seededRandom(i * 4) * 4;
      const haloDuration = 3 + seededRandom(i * 9) * 2;

      newStars.push({
        id: record.id,
        x,
        y,
        size,
        opacity,
        songName: record.songName,
        record,
        haloDuration,
      });
    }

    setStars(newStars);

    // 背景星尘
    setBgDust(
      Array.from({ length: 40 }).map((_, i) => {
        const w = 1 + seededRandom(200 + i) * 1.5;
        const h = 1 + seededRandom(300 + i) * 1.5;
        return (
          <div
            key={`dust-${i}`}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: w,
              height: h,
              left: `${seededRandom(400 + i) * 100}%`,
              top: `${seededRandom(500 + i) * 100}%`,
              background: 'oklch(0.75 0.08 65 / 0.2)',
              animation: `pulse-dot ${2 + seededRandom(600 + i) * 3}s ease-in-out infinite ${seededRandom(700 + i) * 2}s`,
            }}
          />
        );
      })
    );
  }, [records]);

  // 加载情绪时间流
  const loadTimeline = useCallback(async () => {
    if (records.length === 0 || isLoadingTimeline) return;
    setIsLoadingTimeline(true);

    try {
      const timelineData = records.map((r) => ({
        songName: r.songName,
        artist: r.artist,
        whenWhere: r.userWhenWhere,
        thoughts: r.userThoughts,
        moodKeywords: r.moodKeywords,
        moodAtmosphere: r.moodAtmosphere,
        createdAt: r.createdAt,
      }));

      const res = await fetch('/api/mood-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: timelineData }),
      });

      const data = await res.json();
      if (data.timeline) {
        // 按创建时间从近到远排序
        const sorted = [...data.timeline].sort(
          (a: TimelineEntry, b: TimelineEntry) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        // 同一天同一首歌只保留最后一条（排序后第一条即最新）
        const seen = new Set<string>();
        const deduped = sorted.filter((entry) => {
          const key = `${entry.date}-${entry.songName}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setTimeline(deduped);
      }
    } catch {
      // 静默
    } finally {
      setIsLoadingTimeline(false);
    }
  }, [records, isLoadingTimeline]);

  // 氛围星尘 — 客户端渲染，避免 hydration 不匹配
  useEffect(() => {
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

  if (!spaceName) return null;

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: '#111113' }}>
      {/* 氛围星尘 */}
      {stardust}
      <main className="w-full max-w-2xl mx-auto px-6 pt-20 pb-20 relative z-10 flex-1">
        {/* 顶部导航 */}
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => router.push('/')}
            className="text-warm-text-dim/60 text-sm tracking-wide hover:text-warm-text-dim/80 transition-colors duration-300"
          >
            ← 听歌去
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('huixiang_space_name');
              router.push('/');
            }}
            className="text-warm-text-dim/40 text-xs tracking-wider hover:text-warm-rose/60 transition-colors duration-300"
          >
            退出当前回响之地
          </button>
        </div>
        {/* 空间名 */}
        <div className="text-center mb-6 animate-fade-up">
          <h1 className="font-serif text-3xl md:text-4xl font-normal text-warm-text tracking-[0.3em] mb-4">
            {spaceName}
          </h1>
          <p className="text-warm-text-dim/30 text-xs tracking-[0.2em]">
            回响之地
          </p>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <p className="text-warm-text-dim/40 text-xs tracking-[0.15em]">在找</p>
            <div className="flex justify-center gap-1.5 mt-4">
              <span className="w-1 h-1 rounded-full bg-warm-amber/40 pulse-dot-1" />
              <span className="w-1 h-1 rounded-full bg-warm-amber/40 pulse-dot-2" />
              <span className="w-1 h-1 rounded-full bg-warm-amber/40 pulse-dot-3" />
            </div>
          </div>
        ) : records.length === 0 ? (
          <div className="py-20 text-center animate-fade-in">
            <p className="text-warm-text-dim/25 text-sm font-serif italic tracking-wider">
              还没有回响。去听第一首歌吧。
            </p>
            <button
              onClick={() => router.push('/')}
              className="mt-8 text-warm-amber/60 text-sm tracking-wide hover:text-warm-amber transition-colors duration-300"
            >
              去听第一首
            </button>
          </div>
        ) : (
          <>
            {/* 星云 */}
            <div
              ref={containerRef}
              className="relative w-full animate-fade-in"
              style={{ height: Math.max(200, Math.min(350, records.length * 70)) }}
            >
              {/* 背景星尘 */}
              {bgDust}

              {/* 歌名星点 */}
              {stars.map((star) => (
                <button
                  key={star.id}
                  onClick={() => setSelectedRecord(star.record)}
                  className="absolute group cursor-pointer"
                  style={{
                    left: star.x,
                    top: star.y,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {/* 光晕 */}
                  <div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: star.size * 3,
                      height: star.size * 3,
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      background: 'radial-gradient(circle, oklch(0.75 0.1 65 / 0.08) 0%, transparent 70%)',
                      animation: `pulse-dot ${star.haloDuration}s ease-in-out infinite`,
                    }}
                  />
                  {/* 歌名 */}
                  <span
                    className="relative z-10 font-serif whitespace-nowrap transition-all duration-300 group-hover:text-warm-amber"
                    style={{
                      fontSize: star.size,
                      color: `oklch(0.75 0.08 65 / ${star.opacity})`,
                      textShadow: `0 0 ${star.size}px oklch(0.75 0.08 65 / ${star.opacity * 0.3})`,
                    }}
                  >
                    {star.songName}
                  </span>
                </button>
              ))}
            </div>

            {/* 情绪时间流 */}
            <div className="mt-6 animate-fade-in">
              <div className="flex items-center justify-between mb-8">
                <p className="text-warm-text-dim/55 text-sm tracking-[0.2em]">脉络</p>
                {timeline.length === 0 && (
                  <button
                    onClick={loadTimeline}
                    disabled={isLoadingTimeline}
                    className="text-warm-amber/60 text-xs tracking-wide hover:text-warm-amber/80 transition-colors duration-300 disabled:opacity-40"
                  >
                    {isLoadingTimeline ? '在看...' : '看看你的脉络'}
                  </button>
                )}
              </div>

              {timeline.length > 0 && (
                <div className="relative pl-6 border-l border-warm-border/15">
                  {timeline.map((entry, idx) => (
                    <div key={idx} className="relative mb-8 last:mb-0">
                      <div
                        className="absolute -left-[25px] top-1 w-2 h-2 rounded-full"
                        style={{ background: 'oklch(0.7 0.06 65 / 0.4)' }}
                      />
                      <p className="text-warm-text-dim/55 text-xs tracking-wider mb-1">
                        {entry.date}
                        {entry.period && (
                          <span className="text-warm-text-dim/40 ml-1.5">{entry.period}</span>
                        )}
                        {entry.songName && (
                          <span className="text-warm-amber/70 ml-3">{entry.songName}</span>
                        )}
                      </p>
                      <p className="text-warm-text/80 text-sm tracking-wide leading-relaxed">
                        {entry.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 底部入口 - 已移除 */}
          </>
        )}
      </main>

      {/* 回忆卡片 */}
      {selectedRecord && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-[#0a0908]/80 backdrop-blur-sm"
            onClick={() => setSelectedRecord(null)}
          />
          <div className="relative bg-warm-surface/90 backdrop-blur-md border border-warm-border/30 rounded-xl p-8 w-full max-w-md max-h-[80vh] overflow-y-auto animate-fade-up">
            {/* 歌曲信息 */}
            <div className="mb-6">
              <div className="flex items-baseline gap-2">
                <span className="text-warm-text text-base font-medium">
                  {selectedRecord.songName}
                </span>
                {selectedRecord.artist && (
                  <>
                    <span className="text-warm-text-dim/30 text-xs">·</span>
                    <span className="text-warm-text-muted text-xs">
                      {selectedRecord.artist}
                    </span>
                  </>
                )}
              </div>
              <p className="text-warm-text-dim/30 text-xs tracking-wider mt-1">
                {formatDate(selectedRecord.createdAt)}
              </p>
            </div>

            {/* AI 解读 — 最终版本，有倾诉回应则优先显示 */}
            <div className="response-text text-warm-text/80 text-sm whitespace-pre-wrap leading-relaxed mb-6">
              {selectedRecord.aiSecondResponse || selectedRecord.aiResponse}
            </div>

            {/* 用户自述 */}
            {(selectedRecord.userWhenWhere || selectedRecord.userThoughts) && (
              <>
                <div className="w-full h-px bg-warm-border/20 mb-6" />
                <p className="text-warm-amber/40 text-xs tracking-[0.2em] mb-3">你说</p>
                {selectedRecord.userWhenWhere && (
                  <p className="text-warm-text-dim/50 text-xs tracking-wider mb-2">
                    何时何地：{selectedRecord.userWhenWhere}
                  </p>
                )}
                {selectedRecord.userThoughts && (
                  <p className="text-warm-text-dim/50 text-xs tracking-wider">
                    何思何想：{selectedRecord.userThoughts}
                  </p>
                )}
              </>
            )}

            {/* 氛围关键词 */}
            {selectedRecord.moodKeywords && selectedRecord.moodKeywords.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {selectedRecord.moodKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-warm-text-dim/30 text-[10px] tracking-wider px-2 py-0.5 rounded-full border border-warm-border/10"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}

            {/* 关闭 */}
            <button
              onClick={() => setSelectedRecord(null)}
              className="mt-8 w-full text-center text-warm-text-dim/40 text-xs tracking-wider hover:text-warm-text-dim/60 transition-colors duration-300"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center pb-8 relative z-10">
        <span className="text-warm-text-dim/20 text-xs tracking-[0.3em]">
          回响
        </span>
      </footer>
    </div>
  );
}

export default function StarmapPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0908' }}>
        <p className="text-warm-text-dim/30 text-xs tracking-[0.15em]">在找</p>
      </div>
    }>
      <StarmapContent />
    </Suspense>
  );
}
