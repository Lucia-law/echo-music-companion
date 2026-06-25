import { NextRequest } from 'next/server';
import { searchNeteaseSong, fetchNeteaseLyrics } from '@/lib/api';
import { cleanLyrics } from '@/lib/lyrics-cleaner';
import { buildCompanionPrompt } from '@/prompts/companion';
import { streamWithGuard, generateWithGuard } from '@/agent/guard-runner';
import { buildResonancePrompt } from '@/prompts/resonance';
import { supabase } from '@/lib/supabase';

interface ParsedSong {
  songName: string;
  artist: string;
  platform: string;
  songId?: string;
}

async function fetchAndCleanLyrics(songId: string): Promise<string> {
  const lyricsResult = await fetchNeteaseLyrics(songId).catch(() => null);
  if (!lyricsResult?.lyric) return '';

  let lyrics = cleanLyrics(lyricsResult.lyric);
  if (lyricsResult.translation) {
    lyrics += '\n\n' + cleanLyrics(lyricsResult.translation);
  }
  return lyrics;
}

export async function POST(request: NextRequest) {
  const { url, spaceName, whenWhere, thoughts } = (await request.json()) as {
    url: string;
    spaceName?: string;
    whenWhere?: string;
    thoughts?: string;
  };

  if (!url?.trim()) {
    return new Response(JSON.stringify({ error: '请提供音乐链接' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const apiKey = process.env.LLM_API_KEY;
        if (!apiKey) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: '请先配置 LLM API Key' })}\n\n`));
          controller.close();
          return;
        }

        // Step 1: 解析链接
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = request.headers.get('x-forwarded-proto') || 'http';

        const parseResp = await fetch(`${protocol}://${host}/api/parse-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        });

        if (!parseResp.ok) {
          const err = await parseResp.json().catch(() => ({ error: '无法识别这首歌' }));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.error || '无法识别这首歌' })}\n\n`));
          controller.close();
          return;
        }

        const song: ParsedSong = await parseResp.json();

        // 立即发送歌曲信息，前端可以马上展示
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'songInfo',
          songName: song.songName,
          artist: song.artist,
          platform: song.platform,
        })}\n\n`));

        // Step 2: 查找网易云 songId 并抓取完整歌词
        let lyricsContext = '';
        let neteaseSongId = song.songId || null;

        if (!neteaseSongId || song.platform !== 'netease') {
          const neteaseSearch = await searchNeteaseSong(song.songName, song.artist).catch(() => null);
          if (neteaseSearch) {
            neteaseSongId = neteaseSearch.songId;
          }
        }

        if (neteaseSongId) {
          lyricsContext = await fetchAndCleanLyrics(neteaseSongId);
        }

        // Step 3: 构建 prompt
        const hasUserContext = !!(whenWhere?.trim() || thoughts?.trim());
        const userContent = lyricsContext
          ? `歌曲名：${song.songName}${song.artist ? `\n歌手：${song.artist}` : ''}`
          : `歌曲名：${song.songName}${song.artist ? `\n歌手：${song.artist}` : ''}\n\n我没有获取到这首歌的歌词。请直接回复："抱歉，这首歌我没找到歌词，没法深入聊。你可以告诉我这首歌哪里打动了你吗？"`;

        const companionPrompt = lyricsContext
          ? buildCompanionPrompt({ songName: song.songName, artist: song.artist, lyrics: lyricsContext })
          : `你是听歌搭子。用户分享了一首歌，你来陪聊。\n\n${userContent}`;

        // Step 4: 生成回复
        let fullText = '';

        if (hasUserContext && lyricsContext) {
          // 用户提供了想法：先内部生成 companion 分析，再用 resonance 生成个人版本
          const companionText = await generateWithGuard(
            companionPrompt,
            userContent,
            { temperature: 1.2, model: 'deepseek-v4-flash' },
          );

          const resonancePrompt = buildResonancePrompt({
            songName: song.songName,
            artist: song.artist || '',
            lyrics: lyricsContext,
            aiResponse: companionText,
            whenWhere: whenWhere?.trim() || '',
            thoughts: thoughts?.trim() || '',
          });

          for await (const chunk of streamWithGuard(
            resonancePrompt,
            `${whenWhere?.trim() || ''} ${thoughts?.trim() || ''}`.trim() || '我想说说我的感受',
            { temperature: 1.2, model: 'deepseek-v4-flash' },
          )) {
            fullText += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
          }
        } else {
          // 没有用户想法：直接用 companion prompt 流式输出
          for await (const chunk of streamWithGuard(
            companionPrompt,
            userContent,
            { temperature: 1.2, model: 'deepseek-v4-flash' },
          )) {
            fullText += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
          }
        }

        // Step 5: 保存记录（回复生成完毕后再存）
        let recordId: string | null = null;
        if (spaceName) {
          try {
            const { data, error } = await supabase.from('records').insert({
              space_name: spaceName,
              song_name: song.songName,
              artist: song.artist || '',
              platform: song.platform || '',
              ai_response: fullText,
            }).select('id').single();
            if (error) {
              console.error('[process-song] Insert error:', error);
            } else {
              recordId = data?.id || null;
              console.log('[process-song] Record saved, id:', recordId);
            }
          } catch (e) {
            console.error('[process-song] Save record exception:', e);
          }
        } else {
          console.log('[process-song] No spaceName, skipping save');
        }

        // 发送上下文数据（供倾诉时使用）
        const contextPayload = { type: 'context', lyrics: lyricsContext || '', recordId };
        console.log('[process-song] Sending context:', JSON.stringify(contextPayload));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(contextPayload)}\n\n`));

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        console.error('Process song error:', error);
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `出错了：${errorMessage}` })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
