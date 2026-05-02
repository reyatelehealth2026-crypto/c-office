import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../public/components.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../public/page-images.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../server/api/images.js', import.meta.url), 'utf8');

test('image studio is routed as a visible primary tab', () => {
  assert.match(nav, /id:\s*'images'/);
  assert.match(nav, /label:\s*'Images'/);
  assert.match(html, /page-images\.jsx/);
  assert.match(html, /page === 'images'/);
  assert.match(html, /<ImageStudioPage\/>/);
});

test('image studio defaults to Gemini image generation and stores a library', () => {
  assert.match(page, /Image\s*<span className="accent">Studio<\/span>/);
  assert.match(page, /Generate With Gemini/);
  assert.match(page, /nanobanana2pro/);
  assert.match(page, /flashgen/);
  assert.match(page, /\/api\/images\/generate/);
  assert.match(page, /\/api\/images\/library/);
  assert.match(page, /Image Library/);
  assert.match(css, /\.image-library-grid/);
});

test('image API exposes library metadata without changing provider token flow', () => {
  assert.match(server, /imageLibraryRoute/);
  assert.match(server, /deleteImageRoute/);
  assert.match(server, /\/api\/images\/library/);
  assert.match(api, /writeImageMetadata/);
  assert.match(api, /readImageMetadata/);
  assert.match(api, /getGoogleAuth/);
  assert.match(api, /DEFAULT_GOOGLE_IMAGE_MODEL/);
});
