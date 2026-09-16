import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PRESETS,
  formatPresetList,
  parsePresetList,
  presetTextFromSaved,
} from './presets.mjs';

test('parses one preset per line', () => {
  assert.deepEqual(parsePresetList('5\n6\n7'), [5, 6, 7]);
  assert.deepEqual(parsePresetList('36000\n42000\n48000'), [36_000, 42_000, 48_000]);
});

test('parses comma-separated presets without gluing thousands', () => {
  assert.deepEqual(parsePresetList('36000, 42000, 48000'), [36_000, 42_000, 48_000]);
  assert.deepEqual(parsePresetList('5, 6, 7'), [5, 6, 7]);
  assert.deepEqual(parsePresetList('5,6,7'), [5, 6, 7]);
  assert.deepEqual(parsePresetList('5\n6, 7'), [5, 6, 7]);
});

test('parses currency, percentages, and grouped thousands as one value', () => {
  assert.deepEqual(parsePresetList('$42,000'), [42_000]);
  assert.deepEqual(parsePresetList('$36,000\n$42,000'), [36_000, 42_000]);
  assert.deepEqual(parsePresetList('1,250,000'), [1_250_000]);
  assert.deepEqual(parsePresetList('7%'), [7]);
  assert.deepEqual(parsePresetList('4.95%'), [4.95]);
  assert.deepEqual(parsePresetList('(2,500)'), [-2_500]);
  assert.deepEqual(parsePresetList('-$5'), [-5]);
});

test('skips invalid tokens and duplicate values', () => {
  assert.deepEqual(parsePresetList(''), []);
  assert.deepEqual(parsePresetList('hello'), []);
  assert.deepEqual(parsePresetList('5\nfoo\n10'), [5, 10]);
  assert.deepEqual(parsePresetList('7\n7\n8'), [7, 8]);
  assert.deepEqual(parsePresetList(['5', '6', '5']), [5, 6]);
});

test('restores saved editor text without rewriting in-progress lists', () => {
  assert.equal(
    presetTextFromSaved('$42,000\n50,000', DEFAULT_PRESETS.desiredSpendToday),
    '$42,000\n50,000',
  );
  assert.equal(
    presetTextFromSaved([36_000, 42_000], DEFAULT_PRESETS.desiredSpendToday),
    '36000\n42000',
  );
  assert.equal(
    presetTextFromSaved(null, [5, 7]),
    '5\n7',
  );
  assert.equal(formatPresetList([5, 6, 7]), '5\n6\n7');
});
