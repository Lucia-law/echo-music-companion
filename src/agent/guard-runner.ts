import { streamLLM, LLMMessage } from '@/lib/api';
import { validateCompanion, GuardOptions } from '@/guards/companion-guard';

type Validator = (text: string) => { ok: boolean; reasons: string[] };

/**
 * 带守卫的 LLM 生成：输出违规时自动重试
 * 返回完整文本
 */
export async function generateWithGuard(
  systemPrompt: string,
  userContent: string,
  options?: {
    maxRetries?: number;
    temperature?: number;
    model?: string;
    validate?: Validator;
  },
): Promise<string> {
  const maxRetries = options?.maxRetries ?? 2;
  const validate = options?.validate ?? validateCompanion;
  let lastOutput = '';
  let lastReasons: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let finalPrompt = systemPrompt;
    if (attempt > 0 && lastReasons.length > 0) {
      finalPrompt += `\n\n上次的问题：${lastReasons.join('；')}。修正后重新回复。`;
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: finalPrompt },
      { role: 'user', content: userContent },
    ];

    let fullText = '';
    for await (const chunk of streamLLM(messages, {
      temperature: options?.temperature ?? 1.2,
      model: options?.model ?? 'deepseek-v4-flash',
      thinking: true,
    })) {
      fullText += chunk;
    }
    lastOutput = fullText;

    const result = validate(fullText);
    lastReasons = result.reasons;

    if (result.ok) return fullText;
  }

  // 重试仍不通过，返回当前结果
  return lastOutput;
}

/**
 * 带守卫的流式 LLM 生成：逐块 yield，完成后校验
 * 如果校验失败，会 yield 修正指令并重新生成
 */
export async function* streamWithGuard(
  systemPrompt: string,
  userContent: string,
  options?: {
    maxRetries?: number;
    temperature?: number;
    model?: string;
    validate?: Validator;
  },
): AsyncGenerator<string, void, unknown> {
  const maxRetries = options?.maxRetries ?? 2;
  const validate = options?.validate ?? validateCompanion;
  let lastReasons: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let finalPrompt = systemPrompt;
    if (attempt > 0 && lastReasons.length > 0) {
      finalPrompt += `\n\n上次的问题：${lastReasons.join('；')}。修正后重新回复。`;
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: finalPrompt },
      { role: 'user', content: userContent },
    ];

    let fullText = '';
    for await (const chunk of streamLLM(messages, {
      temperature: options?.temperature ?? 1.2,
      model: options?.model ?? 'deepseek-v4-flash',
      thinking: true,
    })) {
      fullText += chunk;
      yield chunk;
    }

    const result = validate(fullText);
    lastReasons = result.reasons;

    if (result.ok) return;
    // 校验失败，进入下一轮重试
  }
}
