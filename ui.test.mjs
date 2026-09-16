import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

import { ALL_COLUMNS } from './columns.mjs';

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

test('exposes net balance columns to the selector and table renderer', () => {
  const columns = Object.fromEntries(ALL_COLUMNS.map((column) => [
    column.id,
    column.label,
  ]));

  assert.equal(columns.startBalanceNet, 'Start balance net');
  assert.equal(columns.endBalanceNet, 'End balance net');
  assert.equal(columns.spendDownWithdrawal, 'Spend-down withdrawal');
});
