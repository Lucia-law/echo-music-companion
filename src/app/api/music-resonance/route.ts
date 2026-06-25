import { NextRequest } from 'next/server';
import { streamLLM, LLMMessage } from '@/lib/api';
import { buildResonancePrompt } from '@/prompts/resonance';

export async function POST(request: NextRequest) {
  const { songName, artist, aiResponse, whenWhere, thoughts, lyrics } = (await request.json()) as {
    songName: string;
    artist?: string;
    aiResponse: string;
    whenWhere?: string;
    thoughts?: string;
    lyrics?: string;
  };

  console.log('[resonance] Request received:', { songName, hasAiResponse: !!aiResponse, whenWhere, thoughts });

  if (!songName || !aiResponse) {
    console.log('[resonance] Missing params, returning 400');
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = buildResonancePrompt({
    songName,
    artist: artist || '',
    lyrics: lyrics || '（未获取到歌词）',
    aiResponse,
    whenWhere: whenWhere || '',
    thoughts: thoughts || '',
  });

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `${whenWhere || ''} ${thoughts || ''}`.trim() || '我想说说我的感受' },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamLLM(messages, { temperature: 1.2, model: 'deepseek-v4-flash', thinking: false })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
        }
      } catch (error) {
        console.error('Resonance stream error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: '出错了，请重试' })}\n\n`));
      } finally {
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
