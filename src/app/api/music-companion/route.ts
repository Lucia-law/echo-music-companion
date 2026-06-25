import { NextRequest } from 'next/server';
import { searchNeteaseSong, fetchNeteaseLyrics } from '@/lib/api';
import { cleanLyrics } from '@/lib/lyrics-cleaner';
import { buildCompanionPrompt } from '@/prompts/companion';
import { streamWithGuard } from '@/agent/guard-runner';

export async function POST(request: NextRequest) {
  const { songName, artist, platform, songId } = (await request.json()) as {
    songName: string;
    artist: string;
    platform?: string;
    songId?: string;
  };

  if (!songName) {
    return new Response(JSON.stringify({ error: '请提供歌曲名称' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let lyricsContext = '';
  let neteaseSongId = songId || null;

  // 查找网易云 songId
  if (!neteaseSongId || platform !== 'netease') {
    const neteaseSearch = await searchNeteaseSong(songName, artist).catch(() => null);
    if (neteaseSearch) {
      neteaseSongId = neteaseSearch.songId;
    }
  }

  // 抓取完整歌词
  if (neteaseSongId) {
    try {
      const lyricsResult = await fetchNeteaseLyrics(neteaseSongId);
      if (lyricsResult?.lyric) {
        lyricsContext = cleanLyrics(lyricsResult.lyric);
        if (lyricsResult.translation) {
          lyricsContext += '\n\n' + cleanLyrics(lyricsResult.translation);
        }
      }
    } catch (error) {
      console.error('Fetch lyrics error:', error);
    }
  }

  // 无歌词时的降级
  const userContent = lyricsContext
    ? `歌曲名：${songName}${artist ? `\n歌手：${artist}` : ''}`
    : `歌曲名：${songName}${artist ? `\n歌手：${artist}` : ''}\n\n我没有获取到这首歌的歌词。请直接回复："抱歉，这首歌我没找到歌词，没法深入聊。你可以告诉我这首歌哪里打动了你吗？"不要根据歌名或歌手名自行联想或编造内容。`;

  const systemPrompt = lyricsContext
    ? buildCompanionPrompt({ songName, artist, lyrics: lyricsContext })
    : `你是听歌搭子。用户分享了一首歌，你来陪聊。\n\n${userContent}`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const apiKey = process.env.LLM_API_KEY;
        if (!apiKey) {
          const errorData = `data: ${JSON.stringify({ error: '请先配置 LLM API Key 才能使用 AI 生成功能。请在 .env 文件中设置 LLM_API_KEY。' })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
          return;
        }

        for await (const chunk of streamWithGuard(
          systemPrompt,
          userContent,
          { temperature: 1.2, model: 'deepseek-v4-flash' },
        )) {
          const data = `data: ${JSON.stringify({ content: chunk })}\n\n`;
          controller.enqueue(encoder.encode(data));
        }

        // 发送歌词缓存，供倾诉时使用
        const contextData = `data: ${JSON.stringify({ type: 'context', lyrics: lyricsContext || '' })}\n\n`;
        controller.enqueue(encoder.encode(contextData));

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        console.error('LLM streaming error:', error);
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        const errorData = `data: ${JSON.stringify({ error: `生成回复时出错了：${errorMessage}` })}\n\n`;
        controller.enqueue(encoder.encode(errorData));
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
