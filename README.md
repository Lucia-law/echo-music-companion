# 回响 (Echo) — AI 音乐伴聊

把一首歌链接丢进来，AI 会听完歌词、翻完评论区，然后陪你聊一聊这首歌。

## 它能做什么

**🎵 一键解析**
贴一个网易云音乐/QQ 音乐链接，自动获取歌名、歌手、歌词和评论区。

**💬 AI 陪聊**
基于歌词和评论区情绪生成一段有呼吸感的回应——不是打分，不是乐评，像朋友聊歌。

**💭 倾诉**
听完 AI 的回应后，如果你有话想说，可以写下此刻的想法，AI 会紧接着回应你，形成一段完整的对话。

**🌌 回响之地**
把每次和歌的对话保存在一个「空间」里。同一个空间里的人能看到彼此与音乐产生的共鸣脉络——按时间排列，自动去重，星云式可视化。

## 快速开始

```bash
pnpm install
pnpm dev
```

浏览器打开 [http://localhost:5000](http://localhost:5000)。

## 配置

复制 `.env.example` 为 `.env` 并填写：

- `LLM_API_KEY` — DeepSeek 或其他 OpenAI 兼容 API Key
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — Supabase 项目配置（用于回响之地）

## 技术栈

- **框架**: Next.js 16 (App Router)
- **AI**: DeepSeek V4 Flash (流式输出 + 思考链)
- **数据库**: Supabase (PostgreSQL)
- **样式**: Tailwind CSS v4 + shadcn/ui

## License

MIT
