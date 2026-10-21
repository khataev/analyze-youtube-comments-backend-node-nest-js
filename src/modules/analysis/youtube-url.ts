const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);
const ID_IN_PATH = new Set(['shorts', 'embed', 'live']);

/**
 * Достаёт id видео из ссылки. Поддерживает youtube.com/watch?v=, youtu.be/<id>,
 * /shorts/<id>, /embed/<id>, /live/<id>. Возвращает null для всего остального.
 */
export function extractVideoId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  let candidate: string | null | undefined = null;
  if (host === 'youtu.be') {
    candidate = parts[0];
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (parts.length === 1 && parts[0] === 'watch') {
      candidate = url.searchParams.get('v');
    } else if (parts.length >= 2 && ID_IN_PATH.has(parts[0] ?? '')) {
      candidate = parts[1];
    }
  }
  return candidate && VIDEO_ID_RE.test(candidate) ? candidate : null;
}
