import { describe, expect, it } from 'vitest';
import { extractVideoId } from '@/modules/analysis/youtube-url';

const ID = 'dQw4w9WgXcQ';

describe('extractVideoId', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `http://www.youtube.com/watch?list=PL1&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://WWW.YOUTUBE.COM/watch?v=${ID}`,
  ])('extracts the id from %s', (url) => {
    expect(extractVideoId(url)).toBe(ID);
  });

  it.each([
    'not a url',
    `ftp://www.youtube.com/watch?v=${ID}`,
    `https://vimeo.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=short',
    `https://www.youtube.com/channel/${ID}`,
    `https://www.youtube.com/watch/extra?v=${ID}`,
    'https://youtu.be/',
  ])('rejects %s', (url) => {
    expect(extractVideoId(url)).toBeNull();
  });
});
