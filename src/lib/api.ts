import 'dotenv/config';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  apiKey?: string;
  apiBase?: string;
  model?: string;
  temperature?: number;
  thinking?: boolean;
}

export async function* streamLLM(
  messages: LLMMessage[],
  config: LLMConfig = {},
): AsyncGenerator<string, void, unknown> {
  const apiKey = config.apiKey || process.env.LLM_API_KEY;
  const apiBase = config.apiBase || process.env.LLM_API_BASE;
  const model = config.model || process.env.LLM_MODEL || 'deepseek-chat';
  const temperature = config.temperature ?? 0.9;

  if (!apiKey) {
    throw new Error('LLM_API_KEY is not configured');
  }
  if (!apiBase) {
    throw new Error('LLM_API_BASE is not configured');
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[LLM] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      const body: Record<string, unknown> = {
          model,
          messages,
          temperature,
          stream: true,
        };

        if (config.thinking !== undefined) {
          body.extra_body = {
            thinking: { type: config.thinking ? 'enabled' : 'disabled' },
          };
        }

        const response = await fetch(`${apiBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 429 && attempt < maxRetries - 1) {
          console.log('[LLM] Rate limited (429), will retry...');
          continue;
        }
        
        throw new Error(`LLM API error: ${response.status} ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const decoded = decoder.decode(value, { stream: true });
          buffer += decoded;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              console.log('[LLM stream] raw delta:', JSON.stringify(parsed).slice(0, 200));
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch {
              // skip malformed data
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxRetries - 1) {
        throw lastError;
      }
    }
  }
}

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function webSearch(
  query: string,
  limit: number = 5,
): Promise<{ results: SearchResult[]; summary?: string }> {
  const searchApiKey = process.env.SEARCH_API_KEY;
  const searchApiBase = process.env.SEARCH_API_BASE;

  if (searchApiKey && searchApiBase) {
    return searchWithCustomAPI(query, limit, searchApiBase, searchApiKey);
  }

  return searchWithBing(query, limit);
}

async function searchWithCustomAPI(
  query: string,
  limit: number,
  apiBase: string,
  apiKey: string,
): Promise<{ results: SearchResult[]; summary?: string }> {
  try {
    const response = await fetch(`${apiBase}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      throw new Error(`Search API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      results: data.results || [],
      summary: data.summary,
    };
  } catch (error) {
    console.error('Custom search API error:', error);
    return searchWithBing(query, limit);
  }
}

async function searchWithBing(
  query: string,
  limit: number,
): Promise<{ results: SearchResult[]; summary?: string }> {
  try {
    const response = await fetch(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      throw new Error(`Bing search error: ${response.status}`);
    }

    const html = await response.text();
    const results = parseBingResults(html, limit);

    return { results };
  } catch (error) {
    console.error('Bing search error:', error);
    return { results: [] };
  }
}

function parseBingResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  
  const liRegex = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  
  while ((liMatch = liRegex.exec(html)) !== null && results.length < limit) {
    const liContent = liMatch[1];
    
    const hrefMatch = liContent.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = liContent.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    
    if (hrefMatch) {
      const url = hrefMatch[1];
      const title = hrefMatch[2].replace(/<[^>]*>/g, '').trim();
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      
      if (title && url.startsWith('http')) {
        results.push({ title, snippet, url });
      }
    }
  }
  
  return results;
}

export async function fetchPageContent(
  url: string,
): Promise<{ title?: string; content?: string; metaTags?: Record<string, string>; finalUrl?: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`Fetch page failed: ${response.status} ${url}`);
      return null;
    }

    const finalUrl = response.url;
    const html = await response.text();
    const title = extractTitle(html);
    const metaTags = extractMetaTags(html);
    const content = metaTags['og:title'] || metaTags['description'] || metaTags['music:song_name'] || '';

    return { title, content, metaTags, finalUrl };
  } catch (error) {
    console.error('Fetch page error:', error);
    return null;
  }
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match?.[1]?.trim();
}

function extractMetaTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  
  const metaRegex = /<meta[^>]+(?:name|property|itemprop)=["']([^"']+)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  let match;
  
  while ((match = metaRegex.exec(html)) !== null) {
    const name = match[1];
    const content = match[2];
    tags[name] = content;
  }
  
  const metaRegex2 = /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']([^"']+)["'][^>]*>/gi;
  while ((match = metaRegex2.exec(html)) !== null) {
    const content = match[1];
    const name = match[2];
    if (!tags[name]) {
      tags[name] = content;
    }
  }
  
  return tags;
}

export async function extractSongFromNetease(url: string): Promise<{ songName: string; artist: string } | null> {
  try {
    const idMatch = url.match(/id=(\d+)/);
    
    if (!idMatch) return null;
    
    const id = idMatch[1];
    const response = await fetch(`https://music.163.com/api/song/detail/?id=${id}&ids=[${id}]`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/',
      },
      signal: AbortSignal.timeout(8000),
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.songs && data.songs.length > 0) {
      const song = data.songs[0];
      return {
        songName: song.name,
        artist: song.artists?.[0]?.name || '',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Netease API error:', error);
    return null;
  }
}

export async function extractSongFromKugou(url: string): Promise<{ songName: string; artist: string } | null> {
  try {
    console.log('[kugou] Fetching short URL:', url);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.log('[kugou] Short URL fetch failed:', response.status);
      return null;
    }

    const finalUrl = response.url;
    console.log('[kugou] Final URL:', finalUrl);
    
    const hashMatch = finalUrl.match(/hash=([a-zA-Z0-9]+)/i);
    const albumAudioIdMatch = finalUrl.match(/album_audio_id=(\d+)/i);
    
    console.log('[kugou] Hash match:', hashMatch?.[1]);
    console.log('[kugou] Album Audio ID match:', albumAudioIdMatch?.[1]);
    
    if (hashMatch && albumAudioIdMatch) {
      const hash = hashMatch[1];
      const albumAudioId = albumAudioIdMatch[1];
      
      const apiUrl = `https://mobiles.kugou.com/api/v3/song/info?hash=${hash}&album_audio_id=${albumAudioId}&platid=4`;
      console.log('[kugou] Calling API:', apiUrl);
      
      const apiResponse = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Referer': 'https://m.kugou.com/',
        },
        signal: AbortSignal.timeout(8000),
      });

      console.log('[kugou] API response status:', apiResponse.status);
      
      if (apiResponse.ok) {
        const data = await apiResponse.json();
        console.log('[kugou] API response:', JSON.stringify(data).slice(0, 300));
        
        if (data.data) {
          const filename = data.data.filename || '';
          if (filename) {
            const parts = filename.split(' - ');
            const artist = parts[0]?.trim() || '';
            const songName = parts.slice(1).join(' - ').trim() || filename;
            console.log('[kugou] Extracted - Song:', songName, 'Artist:', artist);
            return { songName, artist };
          }
          
          const songName = data.data.songname || data.data.audio_name || '';
          const artist = data.data.author_name || data.data.singername || data.data.singer_id || '';
          if (songName) {
            console.log('[kugou] Extracted - Song:', songName, 'Artist:', artist);
            return { songName, artist };
          }
        }
      }

      const apiUrl2 = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${hash}&album_id=${albumAudioId}&dfid=-&mid=-&platid=4&_=1700000000000`;
      console.log('[kugou] Calling API v2:', apiUrl2);
      
      const apiResponse2 = await fetch(apiUrl2, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.kugou.com/',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (apiResponse2.ok) {
        const data2 = await apiResponse2.json();
        console.log('[kugou] API v2 response:', JSON.stringify(data2).slice(0, 300));
        
        if (data2.status === 1 && data2.data) {
          const songName = data2.data.audio_name || data2.data.song_name || '';
          const artist = data2.data.author_name || data2.data.singer_name || '';
          console.log('[kugou] Extracted v2 - Song:', songName, 'Artist:', artist);
          return { songName, artist };
        }
      }
    }

    const html = await response.text();
    const metaTags = extractMetaTags(html);
    const songName = metaTags['og:title'] || metaTags['music:song_name'] || '';
    const artist = metaTags['music:singer'] || metaTags['author'] || '';
    
    if (songName) {
      return { songName: songName.trim(), artist: artist.trim() };
    }

    console.log('[kugou] No song info found');
    return null;
  } catch (error) {
    console.error('[kugou] Extract error:', error);
    return null;
  }
}

export async function extractSongFromQQ(url: string): Promise<{ songName: string; artist: string } | null> {
  try {
    console.log('[qq] Parsing URL:', url);
    
    let finalUrl = url;
    
    if (url.includes('c.y.qq.com') || url.includes('c6.y.qq.com')) {
      console.log('[qq] Following redirect for short URL...');
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      
      if (response.ok) {
        finalUrl = response.url;
        console.log('[qq] Final URL after redirect:', finalUrl);
      }
    }
    
    const songIdMatch = finalUrl.match(/songid=(\d+)/i) || 
                        finalUrl.match(/songmid=([a-zA-Z0-9]+)/i) || 
                        finalUrl.match(/\/(\d+)\.html/i) ||
                        finalUrl.match(/songDetail\/([a-zA-Z0-9]+)/i);
    
    if (!songIdMatch) {
      console.log('[qq] No song ID found in URL:', finalUrl);
      return null;
    }
    
    const songId = songIdMatch[1];
    console.log('[qq] Song ID:', songId);
    
    const apiUrl = `https://u.y.qq.com/cgi-bin/musicu.fcg?data={"comm":{"ct":"ios","cv":"12060002"},"songinfo":{"method":"get_song_detail_yqq","module":"music.pf_song_detail_svr","param":{"song_mid":"${songId}"}}}`;
    console.log('[qq] Calling API:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://y.qq.com/',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.log('[qq] API request failed:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[qq] API response keys:', Object.keys(data));
    
    // Navigate the complex QQ Music API response structure
    const songInfoData = data.songinfo?.data;
    
    if (!songInfoData) {
      console.log('[qq] No songinfo.data found');
      return null;
    }
    
    console.log('[qq] songinfo.data keys:', Object.keys(songInfoData));
    
    // The track_info object contains the actual song details
    const trackInfo = songInfoData.track_info;
    if (!trackInfo) {
      console.log('[qq] No track_info found in songinfo.data');
      return null;
    }
    
    console.log('[qq] track_info keys:', Object.keys(trackInfo));
    
    // Extract song name
    const songName = trackInfo.name || trackInfo.title || trackInfo.songName || trackInfo.songname || '';
    
    // Extract artist - QQ Music uses 'singer' array
    const singerList = trackInfo.singer || trackInfo.singers || trackInfo.artist || [];
    const artist = Array.isArray(singerList) 
      ? singerList.map((s: any) => s.name || s).join(', ') 
      : (typeof singerList === 'string' ? singerList : '');
    
    if (songName) {
      console.log('[qq] Extracted - Song:', songName, 'Artist:', artist);
      return { songName, artist };
    }
    
    console.log('[qq] No song name found in track_info');
    return null;
  } catch (error) {
    console.error('[qq] Extract error:', error);
    return null;
  }
}

export async function extractSongFromKuwo(url: string): Promise<{ songName: string; artist: string } | null> {
  try {
    console.log('[kuwo] Parsing URL:', url);
    
    const idMatch = url.match(/detail\/(\d+)/i) || url.match(/play_detail\/(\d+)/i) || url.match(/music\/(\d+)/i);
    
    if (!idMatch) {
      console.log('[kuwo] No song ID found in URL');
      return null;
    }
    
    const songId = idMatch[1];
    console.log('[kuwo] Song ID:', songId);
    
    const apiUrl = `https://www.kuwo.cn/api/www/music/musicInfo?mid=${songId}&httpsStatus=1`;
    console.log('[kuwo] Calling API:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.kuwo.cn/',
        'Cookie': 'kw_token=',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.log('[kuwo] API request failed:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[kuwo] API response:', JSON.stringify(data).slice(0, 300));
    
    if (data.code === 200 && data.data) {
      const songName = data.data.name || '';
      const artist = data.data.artist || '';
      
      if (songName) {
        console.log('[kuwo] Extracted - Song:', songName, 'Artist:', artist);
        return { songName, artist };
      }
    }

    console.log('[kuwo] No song info found');
    return null;
  } catch (error) {
    console.error('[kuwo] Extract error:', error);
    return null;
  }
}

export async function extractSongFromSpotify(url: string): Promise<{ songName: string; artist: string } | null> {
  try {
    console.log('[spotify] Parsing URL:', url);
    
    const trackMatch = url.match(/track\/([a-zA-Z0-9]+)/i);
    
    if (!trackMatch) {
      console.log('[spotify] No track ID found in URL');
      return null;
    }
    
    const trackId = trackMatch[1];
    console.log('[spotify] Track ID:', trackId);
    
    const apiUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`;
    console.log('[spotify] Calling oEmbed API:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.log('[spotify] oEmbed API request failed:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[spotify] oEmbed response:', JSON.stringify(data).slice(0, 300));
    
    if (data.title) {
      const parts = data.title.split(' · ');
      const songName = parts[0]?.trim() || data.title;
      const artist = parts[1]?.trim() || '';
      
      console.log('[spotify] Extracted - Song:', songName, 'Artist:', artist);
      return { songName, artist };
    }

    console.log('[spotify] No song info found');
    return null;
  } catch (error) {
    console.error('[spotify] Extract error:', error);
    return null;
  }
}

export async function searchNeteaseSong(songName: string, artist?: string): Promise<{ songId: string; neteaseSongName: string; neteaseArtist: string } | null> {
  try {
    const query = artist ? `${songName} ${artist}` : songName;
    console.log('[netease-search] Searching:', query);
    
    const response = await fetch(`https://music.163.com/api/search/get?type=1&s=${encodeURIComponent(query)}&limit=1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.log('[netease-search] API request failed:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.result?.songs && data.result.songs.length > 0) {
      const song = data.result.songs[0];
      const result = {
        songId: String(song.id),
        neteaseSongName: song.name,
        neteaseArtist: song.artists?.[0]?.name || artist || '',
      };
      console.log('[netease-search] Found:', result);
      return result;
    }

    console.log('[netease-search] No results found');
    return null;
  } catch (error) {
    console.error('[netease-search] Error:', error);
    return null;
  }
}

export interface CommentInfo {
  content: string;
  userName: string;
  likedCount: number;
}

export interface LyricInfo {
  lyric: string;
  translation?: string;
}

export async function fetchNeteaseLyrics(songId: string): Promise<LyricInfo | null> {
  try {
    const response = await fetch(`https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.log('[netease-lyrics] API request failed:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.lrc?.lyric) {
      const lyric = data.lrc.lyric
        .replace(/\[.*?\]/g, '')
        .split('\n')
        .filter((line: string) => line.trim())
        .join('\n')
        .trim();
      
      let translation: string | undefined;
      if (data.tlyric?.lyric) {
        translation = data.tlyric.lyric
          .replace(/\[.*?\]/g, '')
          .split('\n')
          .filter((line: string) => line.trim())
          .join('\n')
          .trim();
      }
      
      return { lyric, translation };
    }

    return null;
  } catch (error) {
    console.error('[netease-lyrics] Error:', error);
    return null;
  }
}

export async function fetchNeteaseComments(songId: string, limit: number = 15): Promise<CommentInfo[]> {
  try {
    const response = await fetch(`https://music.163.com/api/v1/resource/comments/R_SO_4_${songId}?limit=${limit}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.log('[netease-comments] API request failed:', response.status);
      return [];
    }

    const data = await response.json();
    
    if (data.hotComments && data.hotComments.length > 0) {
      return data.hotComments.map((c: any) => ({
        content: c.content,
        userName: c.user.nickname,
        likedCount: c.likedCount || 0,
      }));
    }

    if (data.comments && data.comments.length > 0) {
      return data.comments.slice(0, limit).map((c: any) => ({
        content: c.content,
        userName: c.user.nickname,
        likedCount: c.likedCount || 0,
      }));
    }

    return [];
  } catch (error) {
    console.error('[netease-comments] Error:', error);
    return [];
  }
}

export async function fetchQQComments(songMid: string, limit: number = 15): Promise<CommentInfo[]> {
  try {
    const apiUrl = `https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg?cmd=8&reqtype=1&biztype=1&topid=${songMid}&pagenum=1&pagesize=${limit}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://y.qq.com/',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.log('[qq-comments] API request failed:', response.status);
      return [];
    }

    const data = await response.json();
    
    if (data.comment && data.comment.commentlist && data.comment.commentlist.length > 0) {
      return data.comment.commentlist.slice(0, limit).map((c: any) => ({
        content: c.rootcommentcontent || c.commentcontent || '',
        userName: c.nickname || c.nick || '',
        likedCount: c.praisenum || c.likecount || 0,
      }));
    }

    return [];
  } catch (error) {
    console.error('[qq-comments] Error:', error);
    return [];
  }
}
