import { parseNumber } from './model.mjs';

const DEFAULT_PRESETS = {
  expectedCagr: [5, 6, 7, 8, 10],
  desiredSpendToday: [36_000, 42_000, 48_000, 54_000, 60_000],
};

function parsePresetList(text) {
  const values = [];
  const seen = new Set();
  const source = Array.isArray(text) ? text.join('\n') : String(text ?? '');
  const tokens = source.match(
    /\(?-?\$?-?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?\)?|\(?-?\$?-?\d+(?:\.\d+)?%?\)?/g,
  ) || [];

  for (const token of tokens) {
    const parsed = parseNumber(token);
    if (!parsed.valid || seen.has(parsed.value)) {
      continue;
    }
    seen.add(parsed.value);
    values.push(parsed.value);
  }
  return values;
}

function formatPresetList(values, format) {
  const stringify = format ?? String;
  return values.map((value) => stringify(value)).join('\n');
}

function presetTextFromSaved(raw, fallbackValues, format) {
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw)) {
    return formatPresetList(parsePresetList(raw), format);
  }
  return formatPresetList(fallbackValues, format);
}

export {
  DEFAULT_PRESETS,
  formatPresetList,
  parsePresetList,
  presetTextFromSaved,
};
