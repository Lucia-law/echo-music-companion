import { NextRequest, NextResponse } from 'next/server';
import { fetchPageContent, webSearch, extractSongFromNetease, extractSongFromKugou, extractSongFromQQ, extractSongFromKuwo, extractSongFromSpotify } from '@/lib/api';

interface ParsedSong {
  songName: string;
  artist: string;
  platform: string;
  songId?: string;
}

function identifyPlatform(url: string): string {
  if (url.includes('music.163.com') || url.includes('163cn')) return 'netease';
  if (url.includes('y.qq.com') || url.includes('c.y.qq.com')) return 'qq';
  if (url.includes('kugou.com')) return 'kugou';
  if (url.includes('kuwo.cn')) return 'kuwo';
  if (url.includes('open.spotify.com')) return 'spotify';
  if (url.includes('music.apple.com')) return 'apple';
  if (url.includes('bilibili.com')) return 'bilibili';
  return 'unknown';
}

function extractUrlFromText(text: string): string | null {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/i;
  const match = text.match(urlRegex);
  return match ? match[1] : null;
}

function cleanMusicTitle(title: string): { songName: string; artist: string } | null {
  if (!title) return null;

  let cleaned = title
    .replace(/-?\s*网易云音乐$/, '')
    .replace(/-?\s*QQ\s*音乐.*$/, '')
    .replace(/-?\s*酷狗音乐.*$/, '')
    .replace(/-?\s*酷我音乐.*$/, '')
    .replace(/-?\s*Spotify$/, '')
    .replace(/-?\s*Apple\s*Music.*$/, '')
    .replace(/-?\s*哔哩哔哩.*$/, '')
    .replace(/\s*-\s*单曲.*$/, '')
    .replace(/【.*?】/g, '')
    .replace(/—.*$/, '')
    .replace(/\(.*?\)/g, '')
    .trim();

  const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    const left = dashMatch[1].trim();
    const right = dashMatch[2].trim();
    return { songName: left, artist: right };
  }

  if (cleaned.length > 0 && cleaned.length < 50) {
    return { songName: cleaned, artist: '' };
  }

  return null;
}

function extractFromMetaTags(metaTags: Record<string, string>): { songName: string; artist: string } | null {
  const structuredSong = metaTags['music:song_name'];
  const artist = metaTags['music:singer'] || metaTags['music:artist'] || metaTags['author'] || '';
  const fallbackTitle = metaTags['og:title'] || metaTags['twitter:title'] || '';

  if (structuredSong) {
    return { songName: structuredSong.trim(), artist: artist.trim() };
  }

  if (fallbackTitle) {
    const cleaned = cleanMusicTitle(fallbackTitle);
    if (cleaned) {
      if (!cleaned.artist && artist) {
        cleaned.artist = artist.trim();
      }
      return cleaned;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url: string };

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '请提供音乐链接' }, { status: 400 });
    }

    const extractedUrl = extractUrlFromText(url);
    if (!extractedUrl) {
      return NextResponse.json({ error: '未找到有效的音乐链接' }, { status: 400 });
    }

    const platform = identifyPlatform(extractedUrl);
    let parsedSong: ParsedSong | null = null;

    console.log(`[parse-link] Platform: ${platform}, URL: ${extractedUrl}`);

    if (platform === 'netease') {
      const neteaseResult = await extractSongFromNetease(extractedUrl);
      if (neteaseResult) {
        const idMatch = extractedUrl.match(/id=(\d+)/);
        parsedSong = {
          songName: neteaseResult.songName,
          artist: neteaseResult.artist,
          platform,
          songId: idMatch?.[1],
        };
        console.log(`[parse-link] Netease API result:`, parsedSong);
      }
    } else if (platform === 'kugou') {
      const kugouResult = await extractSongFromKugou(extractedUrl);
      if (kugouResult) {
        parsedSong = {
          songName: kugouResult.songName,
          artist: kugouResult.artist,
          platform,
        };
        console.log(`[parse-link] Kugou API result:`, parsedSong);
      }
    } else if (platform === 'qq') {
      const qqResult = await extractSongFromQQ(extractedUrl);
      if (qqResult) {
        const songIdMatch = extractedUrl.match(/songid=(\d+)/i) || 
                            extractedUrl.match(/songmid=([a-zA-Z0-9]+)/i) || 
                            extractedUrl.match(/\/(\d+)\.html/i) ||
                            extractedUrl.match(/songDetail\/([a-zA-Z0-9]+)/i);
        parsedSong = {
          songName: qqResult.songName,
          artist: qqResult.artist,
          platform,
          songId: songIdMatch?.[1],
        };
        console.log(`[parse-link] QQ API result:`, parsedSong);
      }
    } else if (platform === 'kuwo') {
      const kuwoResult = await extractSongFromKuwo(extractedUrl);
      if (kuwoResult) {
        parsedSong = {
          songName: kuwoResult.songName,
          artist: kuwoResult.artist,
          platform,
        };
        console.log(`[parse-link] Kuwo API result:`, parsedSong);
      }
    } else if (platform === 'spotify') {
      const spotifyResult = await extractSongFromSpotify(extractedUrl);
      if (spotifyResult) {
        parsedSong = {
          songName: spotifyResult.songName,
          artist: spotifyResult.artist,
          platform,
        };
        console.log(`[parse-link] Spotify API result:`, parsedSong);
      }
    }

    if (!parsedSong) {
      try {
        const pageData = await fetchPageContent(extractedUrl);
        console.log(`[parse-link] Page data:`, pageData);

        if (pageData) {
          if (pageData.metaTags) {
            const metaParsed = extractFromMetaTags(pageData.metaTags);
            if (metaParsed) {
              // Apple Music special handling - og:title is formatted, use apple:title instead
              if (platform === 'apple' && pageData.metaTags['apple:title']) {
                const appleSongName = pageData.metaTags['apple:title'].trim();
                // Extract artist from music:musician URL: https://music.apple.com/cn/artist/jennie/913944
                const musicianUrl = pageData.metaTags['music:musician'] || '';
                const artistMatch = musicianUrl.match(/\/artist\/([^/]+)/i);
                const appleArtist = artistMatch ? decodeURIComponent(artistMatch[1]) : '';
                parsedSong = {
                  songName: appleSongName,
                  artist: appleArtist,
                  platform,
                };
                console.log(`[parse-link] Apple Music parsed:`, parsedSong);
              } else {
                parsedSong = {
                  songName: metaParsed.songName,
                  artist: metaParsed.artist,
                  platform,
                };
                console.log(`[parse-link] Meta tags parsed:`, parsedSong);
              }
            }
          }

          if (!parsedSong && pageData.title) {
            const titleParsed = cleanMusicTitle(pageData.title);
            if (titleParsed) {
              parsedSong = {
                songName: titleParsed.songName,
                artist: titleParsed.artist,
                platform,
              };
              console.log(`[parse-link] Title parsed:`, parsedSong);
            }
          }
        }
      } catch (error) {
        console.error('[parse-link] Fetch page error:', error);
      }
    }

    if (!parsedSong || !parsedSong.songName) {
      try {
        let searchQuery: string;
        if (parsedSong?.songName) {
          searchQuery = `${parsedSong.songName} 歌手 歌曲`;
        } else {
          const shortUrl = extractedUrl.split('?')[0].split('#')[0];
          searchQuery = `${platform}音乐 ${shortUrl.split('/').pop() || ''} 歌曲`;
        }

        console.log(`[parse-link] Searching: ${searchQuery}`);
        const searchResult = await webSearch(searchQuery, 5);
        console.log(`[parse-link] Search results: ${searchResult.results.length}`);
        
        const allText = [
          ...searchResult.results.map((item) => `${item.title} ${item.snippet}`),
          searchResult.summary || '',
        ].join(' ');

        const bookTitleMatch = allText.match(/《(.+?)》/);
        const artistPatterns = [
          /(?:歌手|演唱|by)[：:\s]*([^\n,，\s《》]{1,20})/,
          /([^\n,，\s《》]{1,15})\s*[-–—]\s*(?:演唱|唱|首唱)/,
        ];

        let foundArtist = '';
        for (const pattern of artistPatterns) {
          const match = allText.match(pattern);
          if (match) {
            foundArtist = match[1].trim();
            break;
          }
        }

        if (parsedSong?.songName && foundArtist) {
          parsedSong.artist = foundArtist;
        } else if (!parsedSong && bookTitleMatch) {
          parsedSong = {
            songName: bookTitleMatch[1].trim(),
            artist: foundArtist,
            platform,
          };
        } else if (!parsedSong && searchResult.summary) {
          const summaryMatch = searchResult.summary.match(/《(.+?)》/);
          if (summaryMatch) {
            parsedSong = {
              songName: summaryMatch[1],
              artist: foundArtist,
              platform,
            };
          }
        }
      } catch (error) {
        console.error('[parse-link] Search error:', error);
      }
    }

    if (!parsedSong || !parsedSong.songName) {
      return NextResponse.json(
        {
          error: '无法识别这首歌，试试直接告诉我歌名和歌手吧',
          platform,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      songName: parsedSong.songName,
      artist: parsedSong.artist,
      platform: parsedSong.platform,
      songId: parsedSong.songId,
    });
  } catch (error) {
    console.error('[parse-link] Error:', error);
    return NextResponse.json(
      { error: '解析链接时出错了，请重试' },
      { status: 500 },
    );
  }
}
