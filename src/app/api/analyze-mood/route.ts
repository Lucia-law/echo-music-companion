import { NextRequest } from 'next/server';
import { streamLLM, LLMMessage } from '@/lib/api';

const MOOD_SYSTEM_PROMPT = `根据用户分享的歌曲及其AI回复，分析这首歌的情感氛围。

请生成一个JSON对象，包含：
1. keywords: 3-5个情感关键词数组（如：孤独、遗憾、释然、暗恋、迷茫等）
2. atmosphere: 一句话描述这首歌的整体氛围（10-20字）

只返回JSON，不要其他内容。格式：
{"keywords":["关键词1","关键词2","关键词3"],"atmosphere":"氛围描述"}`;

export async function POST(request: NextRequest) {
  const { songName, artist, responseText } = (await request.json()) as {
    songName: string;
    artist?: string;
    responseText: string;
  };

  if (!songName || !responseText) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userPrompt = `歌曲名：${songName}${artist ? ' - ' + artist : ''}\n\nAI对这首歌的回复：\n${responseText}`;

  const messages: LLMMessage[] = [
    { role: 'system', content: MOOD_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let fullText = '';
        for await (const chunk of streamLLM(messages, { temperature: 0.5 })) {
          fullText += chunk;
        }

        try {
          const cleaned = fullText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const mood = JSON.parse(cleaned);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(mood)}\n\n`));
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ keywords: [], atmosphere: '' })}\n\n`));
        }
      } catch (error) {
        console.error('Mood generation error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ keywords: [], atmosphere: '' })}\n\n`));
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}