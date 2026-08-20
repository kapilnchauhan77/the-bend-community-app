export type BenderCaptionToken = { type: 'text'; value: string } | { type: 'url'; value: string };

const URL_RE = /https?:\/\/[^\s<>"'“”‘’]+/gi;
const TERMINAL_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':']);

function cleanUrlToken(raw: string): string {
  let value = raw;
  while (value && TERMINAL_PUNCTUATION.has(value.at(-1)!)) value = value.slice(0, -1);
  while (value.endsWith(']') || value.endsWith('}') || value.endsWith(')')) {
    const closing = value.at(-1)!;
    const opening = closing === ']' ? '[' : closing === '}' ? '{' : '(';
    if ([...value].filter((c) => c === closing).length > [...value].filter((c) => c === opening).length) value = value.slice(0, -1);
    else break;
  }
  return value;
}

export function extractHttpUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...text.matchAll(URL_RE)].map((match) => cleanUrlToken(match[0])).filter(Boolean);
}

export function extractFirstHttpUrl(text: string | null | undefined): string | null {
  return extractHttpUrls(text)[0] ?? null;
}

export function removeFirstExactUrl(text: string, sourceUrl: string): string {
  let removed = false;
  const without = text.replace(URL_RE, (raw) => {
    const token = cleanUrlToken(raw);
    if (!removed && token === sourceUrl) {
      removed = true;
      return raw.slice(0, raw.indexOf(token)) + raw.slice(raw.indexOf(token) + token.length);
    }
    return raw;
  });
  return without;
}

export function tokenizeBenderCaption(text: string): BenderCaptionToken[] {
  const result: BenderCaptionToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    const value = cleanUrlToken(match[0]);
    if (!value) continue;
    if (start > lastIndex) result.push({ type: 'text', value: text.slice(lastIndex, start) });
    result.push({ type: 'url', value });
    lastIndex = start + value.length;
  }
  if (lastIndex < text.length) result.push({ type: 'text', value: text.slice(lastIndex) });
  return result;
}

export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hasControl = [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && Boolean(url.hostname) && !hasControl && !/%(?![0-9a-f]{2})/i.test(value);
  } catch { return false; }
}

export function isBendLinkPreviewImageUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\/uploads\/link-previews\/[0-9a-f]{64}\.webp$/.test(value);
}
