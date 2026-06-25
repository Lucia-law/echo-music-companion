const FORBIDDEN = [
  /[\u{1F600}-\u{1F9FF}]/u,          // emoji
  /编曲|旋律|曲风|曲调/,               // 术语
  /你发的|分享的歌词|我看到歌词/,       // 泄露 prompt
  /你应该|建议你|推荐你|不妨/,          // 说教
];

export interface GuardOptions {
  minLength?: number;
  maxLength?: number;
}

export function validateOutput(
  text: string,
  options?: GuardOptions,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const minLen = options?.minLength ?? 50;
  const maxLen = options?.maxLength ?? 1200;

  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) {
      reasons.push(`触发: ${pattern.source}`);
    }
  }

  const len = text.trim().length;
  if (len < minLen) {
    reasons.push(`内容过短: ${len}字`);
  }
  if (len > maxLen) {
    reasons.push(`内容过长: ${len}字`);
  }

  return { ok: reasons.length === 0, reasons };
}

/** Companion 专用：允许较长输出（深度分析需要空间） */
export function validateCompanion(text: string) {
  return validateOutput(text, { minLength: 50, maxLength: 1200 });
}

/** Resonance 专用：允许稍长，但不要过分 */
export function validateResonance(text: string) {
  return validateOutput(text, { minLength: 50, maxLength: 800 });
}
