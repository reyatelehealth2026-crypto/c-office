import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../public/components.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../public/page-images.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../server/api/images.js', import.meta.url), 'utf8');
const imageAdapter = readFileSync(new URL('../server/agents/image.js', import.meta.url), 'utf8');

test('image studio is routed as a visible primary tab', () => {
  assert.match(nav, /id:\s*'images'/);
  assert.match(nav, /label:\s*'Images'/);
  assert.match(html, /page-images\.jsx/);
  assert.match(html, /page === 'images'/);
  assert.match(html, /<ImageStudioPage\/>/);
});

test('image studio defaults to Codex CLI image generation and stores a library', () => {
  assert.match(page, /Image\s*<span className="accent">Studio<\/span>/);
  assert.match(page, /Generate With Codex CLI/);
  assert.match(page, /codex-cli/);
  assert.match(page, /Codex CLI Image/);
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
  assert.match(api, /callCodexCliImage/);
  assert.match(api, /image_generation/);
  assert.match(api, /getGoogleAuth/);
  assert.match(api, /DEFAULT_GOOGLE_IMAGE_MODEL/);
});

test('image API routes Codex image generation through Codex CLI, not the Images API token', () => {
  assert.match(api, /hasDirectOpenAIImageCredential/);
  assert.match(api, /openaiImageReady/);
  assert.match(api, /codexCliReady/);
  assert.match(api, /Do not use OpenAI API keys/);
  assert.match(api, /do not call \/v1\/images/);
  assert.match(api, /shouldAutoUseGoogle/);
});

test('image API rejects empty requests before wrapping prompts', () => {
  assert.match(api, /sourcePrompt/);
  assert.match(api, /prompt required/);
  assert.match(api, /buildImagePrompt\(\{ prompt, note \}\)/);
});

test('OpenAI image generation defaults to GPT Image 2', () => {
  assert.match(api, /DEFAULT_MODEL[\s\S]*gpt-image-2/);
  assert.match(imageAdapter, /model:\s*'gpt-image-2'/);
  assert.doesNotMatch(imageAdapter, /model:\s*'gpt-image-1'/);
});
