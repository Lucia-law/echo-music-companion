import { NextRequest, NextResponse } from 'next/server';
import { streamLLM, LLMMessage } from '@/lib/api';
import { buildTimelinePrompt } from '@/prompts/timeline';

interface TimelineRecord {
  songName: string;
  artist: string;
  whenWhere: string | null;
  thoughts: string | null;
  moodKeywords: string[] | null;
  moodAtmosphere: string | null;
  createdAt: string;
}

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

  const systemPrompt = buildTimelinePrompt(recordsSummary);

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
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
