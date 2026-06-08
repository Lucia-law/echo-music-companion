import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const { spaceName, password } = (await request.json()) as {
    spaceName: string;
    password: string;
  };

  if (!spaceName || !password) {
    return NextResponse.json({ error: '请输入名字和暗语' }, { status: 400 });
  }

  const trimmedName = spaceName.trim();
  if (trimmedName.length < 1 || trimmedName.length > 30) {
    return NextResponse.json({ error: '名字需要 1-30 个字' }, { status: 400 });
  }

  if (password.length < 6 || password.length > 100) {
    return NextResponse.json({ error: '暗语需要 6-100 位' }, { status: 400 });
  }

  // 查找是否已存在
  const { data: existing } = await supabase
    .from('spaces')
    .select('space_name, password_hash, created_at')
    .eq('space_name', trimmedName)
    .single();

  if (existing) {
    // 验证暗语
    const valid = await bcrypt.compare(password, existing.password_hash);
    if (!valid) {
      return NextResponse.json({ error: '暗语不对，再想想' }, { status: 401 });
    }
    return NextResponse.json({
      spaceName: existing.space_name,
      createdAt: existing.created_at,
      isNew: false,
    });
  }

  // 创建新空间
  const passwordHash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('spaces')
    .insert({ space_name: trimmedName, password_hash: passwordHash })
    .select('space_name, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '这个回响之地已经有人住了，换一个吧' }, { status: 409 });
    }
    console.error('Create space error:', error);
    return NextResponse.json({ error: '创建失败，请重试' }, { status: 500 });
  }

  return NextResponse.json({
    spaceName: data.space_name,
    createdAt: data.created_at,
    isNew: true,
  });
}

export async function GET(request: NextRequest) {
  const spaceName = request.nextUrl.searchParams.get('spaceName');

  if (!spaceName) {
    return NextResponse.json({ error: '请提供空间名' }, { status: 400 });
  }

  const { data } = await supabase
    .from('spaces')
    .select('space_name, created_at')
    .eq('space_name', spaceName.trim())
    .single();

  return NextResponse.json({ exists: !!data });
}
