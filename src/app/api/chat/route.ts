import { NextRequest } from 'next/server';
import { streamLLM, LLMMessage } from '@/lib/api';

const CHAT_SYSTEM_PROMPT = `你是用户的听歌搭子。你们的歌刚聊完，现在他在跟你聊天。

你是一个听了很多年音乐的朋友，说话自然、简短、有温度。
像微信聊天那样，想到什么说什么。

回复原则：
- 通常一两句话，30字以内
- 偶尔可以多说几句，但不要超过三句话
- 接住对方的话头回应，不要自顾自延伸
- 不用括号描写动作或心理活动
- 不说教、不给建议、不问"为什么"
- 可以有语气词（诶、嗯、话说...），可以突然冒一句短的
- 重点是接住对方的情绪，该安抚就安抚，该共情就共情

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