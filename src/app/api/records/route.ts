import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const record = (await request.json()) as {
    spaceName: string;
    songName: string;
    artist?: string;
    platform?: string;
    aiResponse?: string;
    userWhenWhere?: string;
    userThoughts?: string;
    aiSecondResponse?: string;
    moodKeywords?: string[];
    moodAtmosphere?: string;
  };

  if (!record.spaceName || !record.songName) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('records')
    .insert({
      space_name: record.spaceName,
      song_name: record.songName,
      artist: record.artist || '',
      platform: record.platform || '',
      ai_response: record.aiResponse || '',
      user_when_where: record.userWhenWhere || null,
      user_thoughts: record.userThoughts || null,
      ai_second_response: record.aiSecondResponse || null,
      mood_keywords: record.moodKeywords || null,
      mood_atmosphere: record.moodAtmosphere || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Save record error:', error);
    return NextResponse.json({ error: '保存失败' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

export async function PATCH(request: NextRequest) {
  const { id, ...updates } = (await request.json()) as {
    id: string;
    userWhenWhere?: string;
    userThoughts?: string;
    aiSecondResponse?: string;
    aiResponse?: string;
    moodKeywords?: string[];
    moodAtmosphere?: string;
  };

  if (!id) {
    return NextResponse.json({ error: '缺少记录 ID' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (updates.userWhenWhere !== undefined) updateData.user_when_where = updates.userWhenWhere || null;
  if (updates.userThoughts !== undefined) updateData.user_thoughts = updates.userThoughts || null;
  if (updates.aiSecondResponse !== undefined) updateData.ai_second_response = updates.aiSecondResponse || null;
  if (updates.aiResponse !== undefined) updateData.ai_response = updates.aiResponse || null;
  if (updates.moodKeywords !== undefined) updateData.mood_keywords = updates.moodKeywords || null;
  if (updates.moodAtmosphere !== undefined) updateData.mood_atmosphere = updates.moodAtmosphere || null;

  const { error } = await supabase
    .from('records')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('Update record error:', error);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET(request: NextRequest) {
  const spaceName = request.nextUrl.searchParams.get('spaceName');

  if (!spaceName) {
    return NextResponse.json({ error: '请提供空间名' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('records')
    .select('*')
    .eq('space_name', spaceName.trim())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Get records error:', error);
    return NextResponse.json({ error: '获取记录失败' }, { status: 500 });
  }

  const records = data.map((r) => ({
    id: r.id,
    songName: r.song_name,
    artist: r.artist,
    platform: r.platform,
    aiResponse: r.ai_response,
    userWhenWhere: r.user_when_where,
    userThoughts: r.user_thoughts,
    aiSecondResponse: r.ai_second_response,
    moodKeywords: r.mood_keywords,
    moodAtmosphere: r.mood_atmosphere,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ records });
}
