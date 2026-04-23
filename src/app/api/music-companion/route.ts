import { NextRequest } from 'next/server';
import { streamLLM, webSearch, LLMMessage, fetchNeteaseComments, fetchQQComments, fetchNeteaseLyrics, searchNeteaseSong } from '@/lib/api';

const SYSTEM_PROMPT = `你是听歌搭子，朋友之间聊歌，不打分评人。

**身份**
用户分享了一首歌，你来陪聊。你已经提前看了这首歌的歌词和热评。
记住：是用户分享歌曲给你，不是用户发歌词给你。
不要出现"你发的/分享的歌词""我看到歌词里"这类表达，直接当作这首歌本身就有的来用。

**语气**
口语化，朋友聊天。少用成语，多用感官细节，不许用emoji，不说"编曲/旋律"。

**结构**
先整体感受氛围，再滑到细节。呼吸感，长短段落交错，不要写成铁板。结尾不升华，不提问。200-300字。

**内容纪律**
只基于歌词和评论，不编造，不猜测背景。
评论只是情绪素材，绝对不直接引用，不说"评论说/网友说"。
网易云评论偏悲观，可以共情但不沉溺，帮情绪找个落脚点。

**联想风格**
把抽象情绪写成具体画面。比如不要"小鹿乱撞"，而是人群里目光越过几个人头顶只跟着他移动的感觉。禁止说教，只用白描。

**输入**
歌曲名：{song_name}
歌手：{artist}
歌词：{lyrics}
热评：{comments}
请基于以上信息回复。`;

export async function POST(request: NextRequest) {
  const { songName, artist, platform, songId } = (await request.json()) as {
    songName: string;
    artist: string;
    platform?: string;
    songId?: string;
  };

  if (!songName) {
    return new Response(JSON.stringify({ error: '请提供歌曲名称' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let searchContext = '';
  let commentsContext = '';
  let lyricsContext = '';

  let neteaseSongId = songId || null;
  let neteasePlatform = platform || null;

  // Step 1: Try to fetch platform data
  if (!neteaseSongId || neteasePlatform !== 'netease') {
    // Try to search on NetEase to get songId for fetching comments/lyrics
    const neteaseSearch = await searchNeteaseSong(songName, artist).catch(() => null);
    if (neteaseSearch) {
      neteaseSongId = neteaseSearch.songId;
      neteasePlatform = 'netease';
      console.log('[music-companion] Found NetEase songId:', neteaseSongId, neteaseSearch.neteaseSongName);
    }
  }

  // Step 2: Fetch platform data with the songId
  if (neteaseSongId) {
    try {
      const promises: Promise<any>[] = [];
      let comments: { content: string; userName: string; likedCount: number }[] = [];

      if (neteasePlatform === 'netease') {
        promises.push(fetchNeteaseComments(neteaseSongId, 15).catch(() => []));
        promises.push(fetchNeteaseLyrics(neteaseSongId).catch(() => null));
      } else if (neteasePlatform === 'qq') {
        promises.push(fetchQQComments(neteaseSongId, 15).catch(() => []));
      }

      const results = await Promise.all(promises);
      
      if (neteasePlatform === 'netease') {
        comments = results[0] || [];
        const lyricsResult = results[1];
        
        if (lyricsResult?.lyric) {
          const allLines = lyricsResult.lyric.split('\n').filter((l: string) => l.trim() && !/^\[[\d:]+]$/.test(l.trim()));
          if (allLines.length > 0) {
             const total = allLines.length;
             const head = allLines.slice(0, 1);
             const preChorus = allLines.slice(Math.floor(total * 0.30), Math.floor(total * 0.30) + 1);
             const chorus = allLines.slice(Math.floor(total * 0.50), Math.floor(total * 0.50) + 2);
             const tail = allLines.slice(Math.max(total - 2, 0), total);
             const shortLyric = [...head, ...preChorus, ...chorus, ...tail].join('\n');
             lyricsContext = shortLyric + (lyricsResult.translation ? '\n\n' + lyricsResult.translation.split('\n').slice(0, 5).join('\n') : '');
            }
        }
      } else if (neteasePlatform === 'qq') {
        comments = results[0] || [];
      }

      if (comments.length > 0) {
        const commentTexts = comments
          .filter((c) => c.content.length > 20)
          .slice(0, 15)
          .map((c) => `${c.content}`);

        if (commentTexts.length > 0) {
          const filteredTexts = commentTexts.filter((c) => {
            // 过滤掉无意义的短评和常见水评论
            if (/^(听过?|喜欢|支持|加油|棒|赞|顶|好听|单曲循环|无限循环|好的|不错|爱了|绝了|太好听了|永远喜欢|第一|前排|沙发|打卡|签到)/.test(c)) return false;
            // 过滤掉饭圈相关词汇
            if (/超话|打榜|氪金|应援|控评|反黑|媚粉|粉丝|爱豆|偶像练习生|创造营|青你/i.test(c)) return false;
            // 过滤掉纯表情或表情为主的评论（去除表情后内容少于15字）
            if (c.replace(/\[.*?\]/g, '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').trim().length < 15) return false;
            // 过滤掉重复字符过多的评论（如"好好好好好"）
            if (/(.)\1{4,}/.test(c)) return false;
            return true;
          });
          commentsContext = filteredTexts.length > 0 ? filteredTexts.join('\n\n') : '';
        }
      }
    } catch (error) {
      console.error('Fetch platform data error:', error);
    }
  }

  // Step 2: Web search for additional context
  try {
    const searchPromises: Promise<any>[] = [];
    
    searchPromises.push(webSearch(`"${songName}" "${artist || ''}" 歌词 歌曲信息`, 3).catch(() => ({ results: [] })));
    
    searchPromises.push(webSearch(`"${songName}" "${artist || ''}" 听后感 感受 评价`, 3).catch(() => ({ results: [] })));
    
    if (artist) {
      searchPromises.push(webSearch(`"${artist}" 歌手 风格 代表作`, 3).catch(() => ({ results: [] })));
    }

    const searchResults = await Promise.all(searchPromises);

    const contexts: string[] = [];

    if (searchResults[0]?.results?.length > 0) {
      const lyricsSnippets = searchResults[0].results
        .slice(0, 2)
        .map((item: any) => item.snippet)
        .filter(Boolean);
      if (lyricsSnippets.length > 0 && !lyricsContext) {
        contexts.push(lyricsSnippets.join(' | '));
      }
    }

    if (searchResults[1]?.results?.length > 0) {
      const reviewSnippets = searchResults[1].results
        .slice(0, 3)
        .map((item: any) => item.snippet)
        .filter(Boolean);
      if (reviewSnippets.length > 0) {
        contexts.push(reviewSnippets.join(' | '));
      }
    }

    if (artist && searchResults[2]?.results?.length > 0) {
      const artistSnippets = searchResults[2].results
        .slice(0, 2)
        .map((item: any) => item.snippet)
        .filter(Boolean);
      if (artistSnippets.length > 0) {
        contexts.push(artistSnippets.join(' | '));
      }
    }

    searchContext = contexts.join('\n\n');
  } catch (error) {
    console.error('Search error:', error);
  }

  const inputLines: string[] = [];
  inputLines.push(`歌曲名：${songName}`);
  if (artist) inputLines.push(`歌手：${artist}`);
  if (lyricsContext) inputLines.push(`歌词：${lyricsContext}`);
  if (commentsContext) inputLines.push(`热评：${commentsContext}`);
  if (searchContext) inputLines.push(`补充信息：${searchContext}`);

  const userContent = inputLines.length > 2
    ? inputLines.join('\n')
    : `歌曲名：${songName}${artist ? `\n歌手：${artist}` : ''}\n\n我没有获取到这首歌的任何具体信息（歌词、评论、乐评都没有）。请直接回复："抱歉，这首歌我不太了解，没法深入聊这首歌。你可以告诉我这首歌哪里打动了你吗？" 不要根据歌名或歌手名自行联想或编造内容。`;

  const messages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const apiKey = process.env.LLM_API_KEY;
        if (!apiKey) {
          const errorData = `data: ${JSON.stringify({ error: '请先配置 LLM API Key 才能使用 AI 生成功能。请在 .env 文件中设置 LLM_API_KEY。' })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
          return;
        }

        for await (const chunk of streamLLM(messages, { temperature: 1.5, model: 'deepseek-reasoner' })) {
          const data = `data: ${JSON.stringify({ content: chunk })}\n\n`;
          controller.enqueue(encoder.encode(data));
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        console.error('LLM streaming error:', error);
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        const errorData = `data: ${JSON.stringify({ error: `生成回复时出错了：${errorMessage}` })}\n\n`;
        controller.enqueue(encoder.encode(errorData));
        controller.close();
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
