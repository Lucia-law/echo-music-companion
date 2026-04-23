import 'dotenv/config';

async function testAppleMusic() {
  const url = 'https://music.apple.com/cn/song/like-jennie/1882164775';
  console.log('测试 Apple Music:', url, '\n');

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });

    const html = await res.text();
    console.log('页面大小:', html.length);

    // 提取 og:title
    const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
    const title = ogTitleMatch?.[1] || '';
    console.log('原始 og:title:', JSON.stringify(title));

    // 提取 music:artist
    const musicArtistMatch = html.match(/<meta property="music:artist" content="([^"]+)"/i);
    const artist = musicArtistMatch?.[1] || '';

    // 提取 songName - Apple Music 特殊格式
    const songNameMatch = title.match(/的歌曲「(.+?)」/);
    const songName = songNameMatch?.[1] || title.replace('Apple Music 中JENNIE的歌曲「', '').replace('」', '').replace('Like JENNIE', 'Like JENNIE').trim();

    console.log('歌曲名:', songName);
    console.log('歌手:', artist);

    // 测试歌词搜索
    console.log('\n测试网络搜索...');
    const searchRes = await fetch(`https://www.bing.com/search?q=${encodeURIComponent('Jennie LIKE JENNIE 歌词')}&count=3`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    const searchHtml = await searchRes.text();
    console.log('搜索结果长度:', searchHtml.length);

    // 提取 snippet
    const snippetMatches = searchHtml.match(/<p>([^<]+)<\/p>/gi);
    if (snippetMatches) {
      console.log('找到', snippetMatches.length, '个段落');
      snippetMatches.slice(0, 3).forEach((s, i) => {
        const clean = s.replace(/<[^>]+>/g, '').trim();
        if (clean.length > 20) console.log(`段落${i+1}:`, clean.slice(0, 100));
      });
    }

  } catch (e) {
    console.error('失败:', e instanceof Error ? e.message : String(e));
  }
}

testAppleMusic();
