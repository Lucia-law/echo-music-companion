import { NextRequest } from 'next/server';
import { streamLLM, LLMMessage } from '@/lib/api';

const RESONANCE_SYSTEM_PROMPT = `你是听歌搭子。你之前对一首歌发表了自己的感受，现在用户告诉你他听这首歌时的真实情境和想法。

这一次，你要从用户的视角重新鉴赏这首歌。不是再解读一遍歌曲，而是把他的经历和这首歌的歌词、氛围织在一起，写出属于他的版本。

**语气**
比之前更亲近、更轻。像两个人坐在黑暗里，他刚说完，你沉默了一会儿，然后开口。
口语化，短句为主。不用成语，不用emoji。可以有一两句很轻的话，像叹气一样。

**结构**
不要重复之前说过的内容。直接从他告诉你的情境出发，把歌和他的经历织在一起。
150-250字。长短段落交错，有呼吸感。结尾不升华，不提问。

**内容纪律**
他说的何时何地、何思何想，是你的核心素材。围绕这些写，不要跑题。
不要评判他的感受，不要给建议，不要说"你应该"。
把他的处境和这首歌的歌词自然地连起来，引用具体的歌词细节，不要生硬。
如果用到别人说过的话，必须用"有人说"引出。

**输入**
歌曲名：{song_name}
歌手：{artist}
歌词：{lyrics}
有人说：{comments}
你之前的解读：{ai_response}
他何时何地听的：{when_where}
他的想法：{thoughts}`;

export async function POST(request: NextRequest) {
  const { songName, artist, aiResponse, whenWhere, thoughts, lyrics, comments } = (await request.json()) as {
    songName: string;
    artist?: string;
    aiResponse: string;
    whenWhere?: string;
    thoughts?: string;
    lyrics?: string;
    comments?: string;
  };

  if (!songName || !aiResponse) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let systemPrompt = RESONANCE_SYSTEM_PROMPT
    .replace('{song_name}', songName)
    .replace('{artist}', artist || '')
    .replace('{lyrics}', lyrics || '（未获取到歌词）')
    .replace('{comments}', comments || '（未获取到评论）')
    .replace('{ai_response}', aiResponse.slice(0, 500))
    .replace('{when_where}', whenWhere || '（未说）')
    .replace('{thoughts}', thoughts || '（未说）');

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `${whenWhere || ''} ${thoughts || ''}`.trim() || '我想说说我的感受' },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamLLM(messages, { temperature: 1.2, model: 'deepseek-v4-flash', thinking: false })) {
          const data = `data: ${JSON.stringify({ content: chunk })}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        console.error('Resonance stream error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: '出错了，请重试' })}\n\n`));
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
