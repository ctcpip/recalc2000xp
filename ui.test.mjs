import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

import { ALL_COLUMNS } from './columns.mjs';
import { DEFAULTS } from './model.mjs';

test('includes the margin debt input', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

  assert.match(html, /id="marginDebt"/);
  assert.match(html, /name="marginDebt"/);
});

test('includes configurable quick picks for CAGR and annual spending', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

  assert.match(html, /id="expectedCagrPick"/);
  assert.match(html, /id="desiredSpendTodayPick"/);
  assert.match(html, /id="expectedCagrPresets"/);
  assert.match(html, /id="desiredSpendTodayPresets"/);
});

test('each assumption input has a help tooltip', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const fieldCount = Object.keys(DEFAULTS).length;

  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}-help"`));
    assert.match(html, new RegExp(`aria-describedby="${id}-help"`));
  }

  const infoButtons = html.match(/class="field__info"/g) || [];
  const labeled = html.match(/class="field__info" tabindex="-1" aria-label="About /g) || [];
  assert.equal(infoButtons.length, fieldCount);
  assert.equal(labeled.length, fieldCount);
  assert.equal(html.includes('class="field__info" tabindex="-1" aria-hidden'), false);
});

test('exposes net balance columns to the selector and table renderer', () => {
  const columns = Object.fromEntries(ALL_COLUMNS.map((column) => [
    column.id,
    column.label,
  ]));

  assert.equal(columns.startBalanceNet, 'Start balance net');
  assert.equal(columns.endBalanceNet, 'End balance net');
  assert.equal(columns.spendDownWithdrawal, 'Spend-down withdrawal');
});
