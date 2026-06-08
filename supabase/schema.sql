-- 回响之地：空间表
CREATE TABLE IF NOT EXISTS spaces (
  space_name TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 听歌记录表
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_name TEXT NOT NULL REFERENCES spaces(space_name) ON DELETE CASCADE,
  song_name TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  ai_response TEXT NOT NULL DEFAULT '',
  user_when_where TEXT,
  user_thoughts TEXT,
  ai_second_response TEXT,
  mood_keywords TEXT[],
  mood_atmosphere TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 按空间名查询记录的索引
CREATE INDEX IF NOT EXISTS idx_records_space_name ON records(space_name);
-- 按时间排序
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(space_name, created_at DESC);
