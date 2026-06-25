/**
 * 清洗歌词：去时间戳、去空行、去重复副歌
 * 输入是 fetchNeteaseLyrics 返回的已去时间戳的歌词文本
 */
export function cleanLyrics(rawLyric: string): string {
  const lines = rawLyric
    .split('\n')
    .map(l => l.replace(/\[\d+:\d+\.\d+\]/g, '').trim())
    .filter(l => l.length > 0);

  // 完全相同的行只保留第一次出现（去副歌重复）
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of lines) {
    if (!seen.has(line)) {
      seen.add(line);
      unique.push(line);
    }
  }

  return unique.join('\n');
}
