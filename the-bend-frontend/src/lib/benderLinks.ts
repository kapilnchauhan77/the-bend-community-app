export type BenderCaptionPart =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string };

export type BenderCaptionToken = BenderCaptionPart;

const URL_RE = /https?:\/\/[^\s<>"'“”‘’]+/gi;
const TERMINAL_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':']);
const BOUNDARY_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':']);

function cleanUrlToken(raw: string): string {
  let value = raw;
  while (value && TERMINAL_PUNCTUATION.has(value.at(-1)!)) value = value.slice(0, -1);
  while (value.endsWith(']') || value.endsWith('}') || value.endsWith(')')) {
    const closing = value.at(-1)!;
    const opening = closing === ']' ? '[' : closing === '}' ? '{' : '(';
    const closingCount = [...value].filter((character) => character === closing).length;
    const openingCount = [...value].filter((character) => character === opening).length;
    if (closingCount > openingCount) value = value.slice(0, -1);
    else break;
  }
  return value;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export function isSafeHttpUrl(value: string | null | undefined): boolean {
  const authority = value?.match(/^https?:\/\/([^/?#]*)/i)?.[1];
  if (
    !value
    || value.includes('\\')
    || authority?.includes('%')
    || authority?.includes('@')
    || /[<>"'`^|{}\\]/.test(authority ?? '')
    || hasControlCharacter(value)
    || /%(?![0-9a-f]{2})/i.test(value)
  ) return false;
  try {
    const url = new URL(value);
    const bracketedHost = authority?.match(/^\[([^\]]*)\](?::\d+)?$/)?.[1];
    if (bracketedHost !== undefined) {
      if (url.hostname !== `[${bracketedHost}]`) return false;
    } else if (!url.hostname.replace(/\.$/, '').split('.').every(
      (label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    )) return false;
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function urlMatches(text: string): Array<{ raw: string; value: string; index: number }> {
  return [...text.matchAll(URL_RE)].map((match) => ({
    raw: match[0],
    value: cleanUrlToken(match[0]),
    index: match.index ?? 0,
  }));
}

export function extractHttpUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  return urlMatches(text)
    .map((match) => match.value)
    .filter((value) => isSafeHttpUrl(value));
}

export function extractFirstHttpUrl(text: string | null | undefined): string | null {
  return extractHttpUrls(text)[0] ?? null;
}

export function removeFirstExactUrl(caption: string, sourceUrl: string): string {
  const match = urlMatches(caption).find(
    (candidate) => candidate.value === sourceUrl && isSafeHttpUrl(candidate.value),
  );
  if (!match) return caption;

  const before = caption.slice(0, match.index);
  const after = caption.slice(match.index + match.value.length);
  const leftWhitespace = before.match(/[ \t\r\n]+$/)?.[0] ?? '';
  const rightWhitespace = after.match(/^[ \t\r\n]+/)?.[0] ?? '';
  const beforeContent = before.slice(0, before.length - leftWhitespace.length);
  const afterContent = after.slice(rightWhitespace.length);

  if (leftWhitespace && rightWhitespace) {
    if (!beforeContent.trim()) return afterContent;
    if (!afterContent.trim()) return beforeContent;
    if (leftWhitespace.includes('\n') || rightWhitespace.includes('\n')) {
      const lineBreaks = Math.max(
        (leftWhitespace.match(/\n/g) ?? []).length,
        (rightWhitespace.match(/\n/g) ?? []).length,
      );
      return `${beforeContent}${'\n'.repeat(lineBreaks)}${afterContent}`;
    }
    return `${beforeContent} ${afterContent}`;
  }

  if (!before.trim()) return after.replace(/^[ \t\r\n]+/, '');
  if (!after.trim()) return before.replace(/[ \t\r\n]+$/, '');
  if (
    leftWhitespace &&
    !rightWhitespace &&
    BOUNDARY_PUNCTUATION.has(after[0] ?? '')
  ) {
    return `${beforeContent}${after}`;
  }
  return `${before}${after}`;
}

export function tokenizeBenderCaption(
  caption: string,
  omittedSourceUrl?: string | null,
): BenderCaptionPart[] {
  const visibleCaption = omittedSourceUrl
    ? removeFirstExactUrl(caption, omittedSourceUrl)
    : caption;
  const result: BenderCaptionPart[] = [];
  let lastIndex = 0;

  for (const match of urlMatches(visibleCaption)) {
    if (!isSafeHttpUrl(match.value)) continue;
    if (match.index > lastIndex) {
      result.push({ type: 'text', text: visibleCaption.slice(lastIndex, match.index) });
    }
    result.push({ type: 'link', text: match.value, href: match.value });
    lastIndex = match.index + match.value.length;
  }

  if (lastIndex < visibleCaption.length) {
    result.push({ type: 'text', text: visibleCaption.slice(lastIndex) });
  }
  return result;
}

export function isBendLinkPreviewImageUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\/uploads\/link-previews\/[0-9a-f]{64}\.webp$/.test(value);
}
