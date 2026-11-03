import { describe, expect, it } from 'vitest';
import { rewriteBackendUrls } from './apiBase';

const BACKEND = 'http://localhost:3000';

describe('rewriteBackendUrls', () => {
  it('rewrites backend-absolute links to the proxy prefix, deeply', () => {
    const input = {
      imageUrl: `${BACKEND}/files?key=a.jpg`,
      artworkLinks: [{ artwork: { imageUrl: `${BACKEND}/files?key=b.jpg` } }],
    };
    expect(rewriteBackendUrls(input, BACKEND, '/api')).toEqual({
      imageUrl: '/api/files?key=a.jpg',
      artworkLinks: [{ artwork: { imageUrl: '/api/files?key=b.jpg' } }],
    });
  });

  it('leaves other strings, external URLs and non-strings untouched', () => {
    const input = {
      title: 'http://localhost:30001/x',
      external: 'https://upload.wikimedia.org/a.jpg',
      price: 1200,
      sold: false,
      note: null,
    };
    expect(rewriteBackendUrls(input, BACKEND, '/api')).toEqual(input);
  });
});
