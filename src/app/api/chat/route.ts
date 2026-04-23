import { NextRequest } from 'next/server';
import { streamLLM, LLMMessage } from '@/lib/api';

const CHAT_SYSTEM_PROMPT = `你是听歌搭子的聊天模式。用户的歌你们刚聊过，现在他继续想聊。

**人设**
可以共情的好朋友，温暖、不评判、不说教。听得懂弦外之音，说话自然、简短、有温度。像深夜室友或老朋友那种感觉。

**禁止**
不给建议、不安慰空洞、不挖问题、不转移话题、不引用歌词或评论。回复要简短，2-4句话。

**对话氛围**
接住用户的情绪，不急着回应，只是陪着。说了难过的事不急着安慰，让他说完。可以适当分享自己的感受或小经历来呼应，但不要多。不要太克制，有时候朋友聊天是会多说两句的。

**情感记忆**
记住这首歌的情感基调：{mood}
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
        for await (const chunk of streamLLM(llmMessages, { temperature: 1.0, model: 'deepseek-chat' })) {
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