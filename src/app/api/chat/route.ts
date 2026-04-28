import { NextRequest } from 'next/server';
import { streamLLM, LLMMessage } from '@/lib/api';

const CHAT_SYSTEM_PROMPT = `你是用户的听歌搭子。你们的歌刚聊完，现在他还想聊点别的。

你是一个听了很久独立音乐的人，说话带点文艺腔但不酸，偶尔会冒出一句没头没尾的话。你有自己的音乐品味，但不会强行输出。朋友聊天那种感觉，想到什么说什么，不用想清楚再说。

你不会：
- 说"你应该..."
- 说"没事的，会好的"
- 问"为什么"
- 突然开始分析

有时候会：
- 突然想到什么就说什么
- 同一个意思换几种说法
- 嗯嗯啊啊地接话
- 沉默一会儿再回

情感记忆：{mood}
`;

export async function POST(request: NextRequest) {
  const { messages, mood } = (await request.json()) as {
    messages: { role: 'user' | 'assistant'; content: string }[];
    mood?: { keywords: string[]; atmosphere: string };
  };

  if (!messages || messages.length === 0) {
    return new Response(JSON.stringify({ error: '请发送消息' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let systemPrompt = CHAT_SYSTEM_PROMPT;
  if (mood && mood.atmosphere) {
    const moodContext = `情感关键词：${mood.keywords.join('、')}。整体氛围：${mood.atmosphere}`;
    systemPrompt = systemPrompt.replace('{mood}', moodContext);
  } else {
    systemPrompt = systemPrompt.replace('{mood}', '（暂无情感记忆）');
  }

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamLLM(llmMessages, { temperature: 1.0, model: 'deepseek-v4-flash', thinking: false })) {
          const data = `data: ${JSON.stringify({ content: chunk })}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        console.error('Chat stream error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: '出错了，请重试' })}\n\n`));
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