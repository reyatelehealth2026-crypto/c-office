import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  buildCharacterImagePrompt,
  googleFlashImageModelInfo,
  googleImageModelInfo,
} from '../server/api/images.js';

const imagesSource = readFileSync(new URL('../server/api/images.js', import.meta.url), 'utf8');
const cutoutSource = readFileSync(new URL('../server/utils/cutout.js', import.meta.url), 'utf8');
const agentsPage = readFileSync(new URL('../public/page-agents.jsx', import.meta.url), 'utf8');

test('character image prompt is a general game character prompt, not a card prompt', () => {
  const prompt = buildCharacterImagePrompt({
    name: 'Aira',
    role: 'Knowledge Architect',
    color: '#22d3ee',
    category: 'scriptorium',
    systemPrompt: 'Patient teacher and planner.',
  });

  assert.match(prompt, /full-body game character/i);
  assert.match(prompt, /MMORPG guild party/i);
  assert.match(prompt, /transparent-background character cutout PNG/i);
  assert.match(prompt, /portrait 9:16 or 2:3 ratio/i);
  assert.match(prompt, /Avoid:.*trading card layout/i);
  assert.match(prompt, /Avoid:.*card frame/i);
  assert.match(prompt, /Avoid:.*landscape 16:9/i);
});

test('google nano banana pro model mapping uses the official Gemini image model id', () => {
  assert.equal(googleImageModelInfo.display, 'Nano Banana 2 Pro');
  assert.equal(googleImageModelInfo.model, 'gemini-3-pro-image-preview');
  assert.equal(googleFlashImageModelInfo.display, '3.1 Flash Gen');
  assert.equal(googleFlashImageModelInfo.model, 'gemini-2.0-flash-preview-image-generation');
});

test('character generation stores generated image as a draft before replacing the active image', () => {
  assert.match(imagesSource, /generatedImage:\s*imageUrl/);
  assert.doesNotMatch(imagesSource, /updateAgent\(agent\.id,\s*\{\s*image:\s*imageUrl/);
  assert.match(agentsPage, /Generated Draft/);
  assert.match(agentsPage, /Apply Generated/);
  assert.match(agentsPage, /Restore Default/);
});

test('google character generation can use the current agent image as reference input', () => {
  assert.match(imagesSource, /referenceImagePart/);
  assert.match(imagesSource, /inlineData/);
  assert.match(imagesSource, /agent\?\.image/);
  assert.match(imagesSource, /callGoogleCharacterImage/);
  assert.match(imagesSource, /Use the attached current agent image as the visual reference/);
});

test('codex image edit path requests transparent PNG cutouts for roster use', () => {
  assert.match(imagesSource, /codeximage2/);
  assert.match(imagesSource, /replace\(\/\[\^a-z0-9\]\+\/g, ''\)/);
  assert.match(imagesSource, /background', 'transparent'/);
  assert.match(imagesSource, /output_format', 'png'/);
  assert.match(imagesSource, /DEFAULT_CHARACTER_SIZE[\s\S]*1024x1536/);
  assert.match(imagesSource, /callGoogleImageWithModelFallback/);
  assert.match(imagesSource, /fallbackModel/);
  assert.match(imagesSource, /createTransparentCutout/);
  assert.match(cutoutSource, /Format32bppArgb/);
  assert.match(cutoutSource, /CutoutTool/);
  assert.match(agentsPage, /Codex Image2/);
  assert.match(agentsPage, /3\.1 Flash Gen/);
  assert.match(agentsPage, /Generate Transparent Cutout/);
});
