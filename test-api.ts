import 'dotenv/config';

async function testComments() {
  const songId = '411314';
  console.log(`测试歌曲 ${songId} 的评论...\n`);

  try {
    const res = await fetch(`https://music.163.com/api/v1/resource/comments/R_SO_4_${songId}?limit=5`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/',
      }
    });
    const data = await res.json();

    console.log('code:', data.code);
    console.log('comments 数量:', data.comments?.length);
    console.log('hotComments 数量:', data.hotComments?.length);
    console.log('total:', data.total);

    if (data.comments && data.comments.length > 0) {
      console.log('\n第一条评论:');
      console.log('  content:', data.comments[0].content);
      console.log('  userId:', data.comments[0].user?.userId);
      console.log('  nickname:', data.comments[0].user?.nickname);
    }
  } catch (e) {
    console.error('失败:', e.message);
  }
}

testComments();
