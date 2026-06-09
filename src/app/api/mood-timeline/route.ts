import { NextRequest, NextResponse } from 'next/server';
import { streamLLM, LLMMessage } from '@/lib/api';

interface TimelineRecord {
  songName: string;
  artist: string;
  whenWhere: string | null;
  thoughts: string | null;
  moodKeywords: string[] | null;
  moodAtmosphere: string | null;
  createdAt: string;
}

const TIMELINE_SYSTEM_PROMPT = `你是一个安静的旁观者，看着一个人一段时间里听歌的轨迹。你要为每首歌写一句简短的心境描述。

**核心原则**
- 不要写得太具体、太针对性。不要出现"你刚毕业""你正在经历分手"这类推断
- 要通用、有共鸣。写的是一种情绪状态，任何有过类似感受的人都能被触动
- 语气像旁观者在轻轻描述，不是心理咨询师在做评估
- 一句话，15-30字，像在日记本上随手写的一行

**优先级**
- 如果有用户的自述（何时何地、何思何想），优先基于这些来写
- 如果没有自述，基于歌曲的情绪关键词和氛围来写
- 不要直接引用用户的话，而是提炼出更通用的感受

**输出格式**
返回 JSON 数组，每项包含 date 和 text 字段。
date 格式：M.D（如 4.28）
text：一句心境描述。不要包含歌名，歌名会单独展示。

只返回 JSON，不要其他内容。`;

export async function POST(request: NextRequest) {
  const { records } = (await request.json()) as { records: TimelineRecord[] };

  if (!records || records.length === 0) {
    return NextResponse.json({ error: '没有记录' }, { status: 400 });
  }

  const recordsSummary = records.map((r) => {
    const d = new Date(r.createdAt);
    const dateStr = `${d.getMonth() + 1}.${d.getDate()}`;
    const parts = [`${dateStr} 《${r.songName}》${r.artist ? ' - ' + r.artist : ''}`];
    if (r.whenWhere) parts.push(`何时何地：${r.whenWhere}`);
    if (r.thoughts) parts.push(`何思何想：${r.thoughts}`);
    if (r.moodKeywords?.length) parts.push(`情绪：${r.moodKeywords.join('、')}`);
    if (r.moodAtmosphere) parts.push(`氛围：${r.moodAtmosphere}`);
    return parts.join(' | ');
  }).join('\n');

  const messages: LLMMessage[] = [
    { role: 'system', content: TIMELINE_SYSTEM_PROMPT },
    { role: 'user', content: recordsSummary },
  ];

  try {
    let fullText = '';
    for await (const chunk of streamLLM(messages, { temperature: 0.8, model: 'deepseek-v4-flash', thinking: false })) {
      fullText += chunk;
    }

    const cleaned = fullText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsedTimeline = JSON.parse(cleaned);

    // 配对每条脉络对应的歌曲信息和创建时间，保证前端可排序
    const timeline = parsedTimeline.map((entry: any, i: number) => {
      const d = new Date(records[i]?.createdAt || '');
      const hour = d.getHours();
      const period = hour < 6 ? '凌晨' : hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';
      return {
        date: entry.date,
        text: entry.text,
        songName: records[i]?.songName || '',
        artist: records[i]?.artist || '',
        createdAt: records[i]?.createdAt || '',
        period,
      };
    });

    return NextResponse.json({ timeline });
  } catch (error) {
    console.error('Timeline generation error:', error);
    // 降级：用简单格式返回
    const fallback = records.map((r) => {
      const d = new Date(r.createdAt);
      const hour = d.getHours();
      const period = hour < 6 ? '凌晨' : hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';
      return {
        date: `${d.getMonth() + 1}.${d.getDate()}`,
        text: r.moodAtmosphere || '听了一首歌',
        songName: r.songName,
        artist: r.artist,
        createdAt: r.createdAt,
        period,
      };
    });
    return NextResponse.json({ timeline: fallback });
  }
}
