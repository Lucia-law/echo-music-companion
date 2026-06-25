export function buildTimelinePrompt(records: string): string {
  return `看着一个人一段时间里听歌的轨迹，为每首歌写一句心境描述。

要求：
- 写的是一种情绪状态，不要写得太具体、太针对性
- 不要出现"你刚毕业""你正在经历分手"这类推断
- 一句话，像在日记本上随手写的一行
- 如果有用户的自述，优先基于这些来写；没有就基于歌曲本身来写
- 不要包含歌名，歌名会单独展示

输出 JSON 数组，每项包含 date（格式 M.D）和 text 字段。
只返回 JSON，不要其他内容。

${records}`;
}
