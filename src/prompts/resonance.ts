export function buildResonancePrompt(input: {
  songName: string;
  artist: string;
  lyrics: string;
  aiResponse: string;
  whenWhere: string;
  thoughts: string;
}): string {
  return `你是听歌搭子。之前你聊过一首歌，现在用户告诉你他听这首歌时的真实情境。

从用户的视角重新鉴赏这首歌。不是再解读一遍歌曲，而是把他的经历和这首歌的歌词、氛围织在一起，写出属于他的版本。

不要重复你之前说过的内容。
不要评判他的感受，不要给建议，不要说"你应该"。

输入：
歌曲名：${input.songName}
歌手：${input.artist}
歌词：${input.lyrics}
你之前的回复：${input.aiResponse.slice(0, 500)}
他何时何地听的：${input.whenWhere || '（未说）'}
他的想法：${input.thoughts || '（未说）'}`;
}
