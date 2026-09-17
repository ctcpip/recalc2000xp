import { ALL_COLUMNS, TEXT_COLS } from './columns.mjs';
import { DEFAULTS, formatMoney, parseNumber, project } from './model.mjs';
import {
  DEFAULT_PRESETS,
  formatPresetList,
  parsePresetList,
  presetTextFromSaved,
} from './presets.mjs';

const STORAGE_KEY = 'recalc2000xp-inputs';
const COLUMNS_KEY = 'recalc2000xp-columns';
const PRESETS_KEY = 'recalc2000xp-presets';
const FIELD_IDS = Object.keys(DEFAULTS);

const PRESET_FIELDS = [
  {
    id: 'expectedCagr',
    pickId: 'expectedCagrPick',
    editorId: 'expectedCagrPresets',
    format: (value) => `${value}%`,
  },
  {
    id: 'desiredSpendToday',
    pickId: 'desiredSpendTodayPick',
    editorId: 'desiredSpendTodayPresets',
    format: (value) => formatMoney(value),
    formatEditor: formatMoney,
  },
];

const form = document.querySelector('#inputs-form');
const errorsEl = document.querySelector('#errors');
const outlookSection = document.querySelector('#outlook-section');
const outlookEl = document.querySelector('#outlook');
const metricsEl = document.querySelector('#metrics');
const tableWrap = document.querySelector('#table-wrap');
const columnList = document.querySelector('#column-list');
const resetColumnsBtn = document.querySelector('#reset-columns');

let lastRows = [];
let columnState = loadColumnState();
let dragSourceId = null;
let selectedRowYear = null;
let openHelpField = null;

function defaultColumnState() {
  return ALL_COLUMNS.map((col) => ({ ...col, visible: true }));
}

function loadColumnState() {
  const fallback = defaultColumnState();
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) || 'null');
    if (!saved || !Array.isArray(saved.order)) {
      return fallback;
    }
    const hidden = new Set(Array.isArray(saved.hidden) ? saved.hidden : []);
    const byId = Object.fromEntries(fallback.map((col) => [col.id, col]));
    const seen = new Set();
    const ordered = [];
    for (const id of saved.order) {
      if (byId[id] && !seen.has(id)) {
        ordered.push({ ...byId[id], visible: !hidden.has(id) });
        seen.add(id);
      }
    }
    for (const col of fallback) {
      if (!seen.has(col.id)) {
        ordered.push(col);
      }
    }
    return ordered;
  }
  catch {
    return fallback;
  }
}

function saveColumnState() {
  localStorage.setItem(COLUMNS_KEY, JSON.stringify({
    order: columnState.map((col) => col.id),
    hidden: columnState.filter((col) => !col.visible).map((col) => col.id),
  }));
}

function visibleColumns() {
  return columnState.filter((col) => col.visible);
}

function loadInputs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const merged = { ...DEFAULTS };
    if (saved && typeof saved === 'object') {
      for (const key of FIELD_IDS) {
        if (parseNumber(saved[key]).valid) {
          merged[key] = saved[key];
        }
      }
    }
    return merged;
  }
  catch {
    return { ...DEFAULTS };
  }
}

function readForm() {
  const data = {};
  for (const id of FIELD_IDS) {
    data[id] = form.elements[id].value;
  }
  return data;
}

function isMoneyInput(el) {
  return el instanceof HTMLInputElement && el.dataset.kind === 'money';
}

function normalizeMoneyInput(input) {
  if (!isMoneyInput(input)) {
    return;
  }
  const formatted = formatMoney(input.value);
  if (input.value !== formatted) {
    input.value = formatted;
  }
}

function fillForm(inputs) {
  for (const id of FIELD_IDS) {
    const input = form.elements[id];
    input.value = inputs[id];
    normalizeMoneyInput(input);
  }
}

function saveInputs(inputs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
}

function defaultPresetTexts() {
  const texts = {};
  for (const field of PRESET_FIELDS) {
    texts[field.id] = formatPresetList(
      DEFAULT_PRESETS[field.id],
      field.formatEditor,
    );
  }
  return texts;
}

function loadPresetTexts() {
  const texts = defaultPresetTexts();
  try {
    const saved = JSON.parse(localStorage.getItem(PRESETS_KEY) || 'null');
    if (!saved || typeof saved !== 'object') {
      return texts;
    }
    for (const field of PRESET_FIELDS) {
      texts[field.id] = presetTextFromSaved(
        saved[field.id],
        DEFAULT_PRESETS[field.id],
        field.formatEditor,
      );
    }
    return texts;
  }
  catch {
    return texts;
  }
}

function savePresetTexts(texts) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(texts));
}

function readPresetTexts() {
  const texts = {};
  for (const field of PRESET_FIELDS) {
    texts[field.id] = form.elements[field.editorId].value;
  }
  return texts;
}

function fillPresetEditors(texts) {
  for (const field of PRESET_FIELDS) {
    form.elements[field.editorId].value = texts[field.id];
  }
}

function normalizePresetEditor(editor) {
  if (!(editor instanceof HTMLTextAreaElement)) {
    return;
  }
  const field = PRESET_FIELDS.find((item) => item.editorId === editor.id);
  if (!field?.formatEditor) {
    return;
  }
  const values = parsePresetList(editor.value);
  if (!values.length) {
    return;
  }
  const formatted = formatPresetList(values, field.formatEditor);
  if (editor.value !== formatted) {
    editor.value = formatted;
  }
}

function presetValuesFromTexts(texts) {
  const presets = {};
  for (const field of PRESET_FIELDS) {
    presets[field.id] = parsePresetList(texts[field.id]);
  }
  return presets;
}

function persistPresetEditors() {
  const texts = readPresetTexts();
  savePresetTexts(texts);
  renderQuickPicks(presetValuesFromTexts(texts));
}

function isPresetEditor(target) {
  return target instanceof HTMLTextAreaElement
    && PRESET_FIELDS.some((field) => field.editorId === target.id);
}

function renderQuickPicks(presets) {
  for (const field of PRESET_FIELDS) {
    const select = form.elements[field.pickId];
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Pick';
    select.replaceChildren(placeholder);
    for (const value of presets[field.id]) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = field.format(value);
      select.append(option);
    }
  }
  syncQuickPicks();
}

function syncQuickPicks() {
  for (const field of PRESET_FIELDS) {
    const input = form.elements[field.id];
    const select = form.elements[field.pickId];
    const parsed = parseNumber(input.value);
    const match = parsed.valid
      ? [...select.options].find((option) => option.value !== ''
        && parseNumber(option.value).value === parsed.value)
      : null;
    select.value = match ? match.value : '';
  }
}

function applyQuickPick(select) {
  if (!(select instanceof HTMLSelectElement) || select.value === '') {
    return false;
  }
  const field = PRESET_FIELDS.find((item) => item.pickId === select.id);
  if (!field) {
    return false;
  }
  const input = form.elements[field.id];
  input.value = select.value;
  normalizeMoneyInput(input);
  return true;
}

function describedBy(id, errorId) {
  const ids = [];
  if (document.getElementById(`${id}-help`)) {
    ids.push(`${id}-help`);
  }
  if (errorId) {
    ids.push(errorId);
  }
  return ids.join(' ');
}

function renderFieldErrors(fieldErrors) {
  form.querySelectorAll('.field__error').forEach((error) => {
    error.remove();
  });

  for (const id of FIELD_IDS) {
    const input = form.elements[id];
    const message = fieldErrors[id];
    input.removeAttribute('aria-invalid');
    if (!message) {
      const helpIds = describedBy(id);
      if (helpIds) {
        input.setAttribute('aria-describedby', helpIds);
      }
      else {
        input.removeAttribute('aria-describedby');
      }
      continue;
    }

    const errorId = `${id}-error`;
    const error = document.createElement('p');
    error.id = errorId;
    error.className = 'validation-error field__error';
    error.textContent = message;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', describedBy(id, errorId));
    input.closest('.field').append(error);
  }
}

function metric(label, value) {
  return `<div class="metric"><span class="metric__label">${label}</span><span class="metric__value">${value}</span></div>`;
}

function ageLabel(age) {
  return age === null ? '—' : String(age);
}

function renderOutlook(summary) {
  if (!summary) {
    outlookEl.innerHTML = '';
    metricsEl.innerHTML = '';
    return;
  }

  let tone = 'good';
  let title = 'On track';
  let headline;
  let text;

  if (summary.lastsToEnd) {
    headline = `Portfolio lasts through age ${form.elements.endAge.value}`;
    text = `Ending balance ${formatMoney(summary.endingBalance)}.`;
    if (summary.firstGapAge !== null) {
      tone = 'warn';
      title = 'Above the safe draw';
      text = `Gross withdrawal exceeds the inflation-adjusted safe amount from age ${summary.firstGapAge}. ${text}`;
    }
  }
  else {
    tone = 'bad';
    title = 'Shortfall';
    headline = `Negative balance at age ${summary.depletedAge}`;
    text = 'Spending plus tax exceeds growth, contributions, and Social Security before the end age.';
  }

  outlookEl.innerHTML = `
    <div class="outlook outlook--${tone}">
      <p class="outlook__title">${title}</p>
      <p class="outlook__headline">${headline}</p>
      <p class="outlook__text">${text}</p>
    </div>
  `;

  metricsEl.innerHTML = [
    metric('First gap age', ageLabel(summary.firstGapAge)),
    metric('Balance at retirement', summary.balanceAtRetirement === null
      ? '—'
      : formatMoney(summary.balanceAtRetirement)),
    metric('Ending balance', formatMoney(summary.endingBalance)),
    metric('Lifetime withdrawals', formatMoney(summary.totalWithdrawn)),
    metric('Lifetime federal tax', formatMoney(summary.totalFederalTax)),
    metric('Lifetime state tax', formatMoney(summary.totalStateTax)),
    metric('Lifetime contributions', formatMoney(summary.totalContributed)),
  ].join('');
}

function cellClass(row, key) {
  if (key === 'gap') {
    return row.gap > 0 ? 'num--bad' : 'num--good';
  }
  if (key === 'endBalance' && row.endBalance <= 0 && row.retired) {
    return 'num--bad';
  }
  return '';
}

function formatCell(key, raw, row) {
  if (key === 'spendDownWithdrawal' && row.spendDownShortfall > 0) {
    return `Shortfall ${formatMoney(row.spendDownShortfall)}`;
  }
  if (typeof raw !== 'number') {
    return '';
  }
  if (key === 'age' || key === 'year') {
    return String(raw);
  }
  if (key === 'yf') {
    return raw.toFixed(4);
  }
  return formatMoney(raw);
}

function renderTable(rows) {
  if (!rows.length) {
    tableWrap.innerHTML = '';
    return;
  }

  const cols = visibleColumns();
  const head = cols.map((col) => {
    const textClass = TEXT_COLS.has(col.id) ? ' is-text' : '';
    return `<th class="${textClass}" scope="col" draggable="true" data-col-id="${col.id}">${col.label}</th>`;
  }).join('');
  const body = rows.map((row) => {
    const cls = [
      row.retired ? 'is-retired' : '',
      row.depleted ? 'is-depleted' : '',
      row.year === selectedRowYear ? 'is-selected' : '',
    ].filter(Boolean).join(' ');
    const tds = cols.map((col) => {
      const extra = [cellClass(row, col.id), TEXT_COLS.has(col.id) ? 'is-text' : '']
        .filter(Boolean)
        .join(' ');
      return `<td class="${extra}">${formatCell(col.id, row[col.id], row)}</td>`;
    }).join('');
    const selected = row.year === selectedRowYear ? 'true' : 'false';
    return `<tr class="${cls}" data-row-year="${row.year}" aria-selected="${selected}">${tds}</tr>`;
  }).join('');

  tableWrap.innerHTML = `
    <table class="projection" aria-label="Retirement projection by age">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
  lockColumnWidths(tableWrap.querySelector('.projection'));
}

function lockColumnWidths(table) {
  if (!table) {
    return;
  }
  const headerRow = table.tHead?.rows[0];
  const firstRow = table.tBodies[0]?.rows[0];
  if (!headerRow || !firstRow) {
    return;
  }
  const headers = [...headerRow.cells];
  if (headers.length !== firstRow.cells.length) {
    return;
  }

  table.style.tableLayout = 'auto';
  table.style.width = 'max-content';
  const existing = table.querySelector('colgroup');
  if (existing) {
    existing.remove();
  }
  headers.forEach((cell) => {
    cell.style.width = '';
  });
  [...firstRow.cells].forEach((cell) => {
    cell.style.width = '';
  });

  const widths = headers.map((header, i) => Math.ceil(Math.max(
    header.getBoundingClientRect().width,
    firstRow.cells[i].getBoundingClientRect().width,
  )));
  const colgroup = document.createElement('colgroup');
  widths.forEach((width) => {
    const col = document.createElement('col');
    col.style.width = `${width}px`;
    colgroup.append(col);
  });
  table.prepend(colgroup);
  table.style.tableLayout = 'fixed';
  table.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
}

function renderColumnPicker() {
  columnList.innerHTML = columnState.map((col) => `
    <li>
      <div class="column-chip${col.visible ? '' : ' is-off'}">
        <input id="col-${col.id}" type="checkbox" value="${col.id}" ${col.visible ? 'checked' : ''} />
        <label for="col-${col.id}">${col.label}</label>
      </div>
    </li>
  `).join('');
}

function moveColumn(fromId, toId) {
  if (!fromId || fromId === toId) {
    return;
  }
  const from = columnState.findIndex((col) => col.id === fromId);
  const to = columnState.findIndex((col) => col.id === toId);
  if (from < 0 || to < 0) {
    return;
  }
  const [moved] = columnState.splice(from, 1);
  columnState.splice(to, 0, moved);
  saveColumnState();
  renderColumnPicker();
  renderTable(lastRows);
}

function clearDragStyles() {
  tableWrap.querySelectorAll('.is-dragging, .is-drop-target').forEach((el) => {
    el.classList.remove('is-dragging', 'is-drop-target');
  });
}

function bindColumnDrag(root) {
  root.addEventListener('dragstart', (event) => {
    const item = event.target.closest('[data-col-id]');
    if (!item || !root.contains(item) || event.target.closest('input')) {
      event.preventDefault();
      return;
    }
    dragSourceId = item.dataset.colId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragSourceId);
    item.classList.add('is-dragging');
  });

  root.addEventListener('dragend', () => {
    dragSourceId = null;
    clearDragStyles();
  });

  root.addEventListener('dragover', (event) => {
    const item = event.target.closest('[data-col-id]');
    if (!item || !dragSourceId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    root.querySelectorAll('.is-drop-target').forEach((el) => {
      el.classList.remove('is-drop-target');
    });
    if (item.dataset.colId !== dragSourceId) {
      item.classList.add('is-drop-target');
    }
  });

  root.addEventListener('drop', (event) => {
    const item = event.target.closest('[data-col-id]');
    if (!item || !dragSourceId) {
      return;
    }
    event.preventDefault();
    const toId = item.dataset.colId;
    const fromId = dragSourceId;
    dragSourceId = null;
    clearDragStyles();
    moveColumn(fromId, toId);
  });
}

function render() {
  const inputs = readForm();
  const result = project(inputs);

  errorsEl.textContent = result.errors.join(' ');
  renderFieldErrors(result.fieldErrors);
  if (result.errors.length) {
    outlookSection.hidden = true;
    renderOutlook(null);
    lastRows = [];
    renderTable(lastRows);
    syncQuickPicks();
    return;
  }

  outlookSection.hidden = false;
  saveInputs(inputs);
  renderOutlook(result.summary);
  lastRows = result.rows;
  renderTable(lastRows);
  syncQuickPicks();
}

columnList.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') {
    return;
  }
  const col = columnState.find((item) => item.id === input.value);
  if (!col) {
    return;
  }
  if (!input.checked && visibleColumns().length === 1) {
    input.checked = true;
    return;
  }
  col.visible = input.checked;
  input.closest('.column-chip')?.classList.toggle('is-off', !col.visible);
  saveColumnState();
  renderTable(lastRows);
});

resetColumnsBtn.addEventListener('click', () => {
  columnState = defaultColumnState();
  saveColumnState();
  renderColumnPicker();
  renderTable(lastRows);
});

bindColumnDrag(tableWrap);

function closeHelp() {
  openHelpField?.classList.remove('is-open');
  openHelpField = null;
}

function fieldInfoButton(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  const info = target.closest('.field__info');
  return info instanceof HTMLButtonElement && form.contains(info) ? info : null;
}

function suppressHoverHelp(field) {
  field?.classList.add('is-closing');
}

form.addEventListener('mousedown', (event) => {
  if (fieldInfoButton(event.target)) {
    event.preventDefault();
  }
});

document.addEventListener('click', (event) => {
  const info = fieldInfoButton(event.target);
  if (!info) {
    closeHelp();
    return;
  }

  const field = info.closest('.field');
  const wasOpen = field === openHelpField;
  closeHelp();
  if (!field) {
    return;
  }
  if (wasOpen) {
    suppressHoverHelp(field);
    return;
  }
  field.classList.remove('is-closing');
  field.classList.add('is-open');
  openHelpField = field;
});

form.addEventListener('pointerout', (event) => {
  const info = fieldInfoButton(event.target);
  if (!info) {
    return;
  }
  const next = event.relatedTarget;
  if (next instanceof Element && info.contains(next)) {
    return;
  }
  info.closest('.field')?.classList.remove('is-closing');
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }
  const hovered = form.querySelector('.field:has(.field__info:hover)');
  const pinned = openHelpField;
  closeHelp();
  suppressHoverHelp(hovered);
  suppressHoverHelp(pinned);
});

tableWrap.addEventListener('click', (event) => {
  const row = event.target.closest('tbody tr[data-row-year]');
  if (!row || !tableWrap.contains(row)) {
    return;
  }

  const year = Number(row.dataset.rowYear);
  selectedRowYear = selectedRowYear === year ? null : year;
  tableWrap.querySelectorAll('tbody tr.is-selected').forEach((selectedRow) => {
    selectedRow.classList.remove('is-selected');
    selectedRow.setAttribute('aria-selected', 'false');
  });
  if (selectedRowYear !== null) {
    row.classList.add('is-selected');
    row.setAttribute('aria-selected', 'true');
  }
});

fillForm(loadInputs());
const presetTexts = loadPresetTexts();
fillPresetEditors(presetTexts);
renderQuickPicks(presetValuesFromTexts(presetTexts));
renderColumnPicker();
form.addEventListener('input', (event) => {
  if (isPresetEditor(event.target)) {
    persistPresetEditors();
    return;
  }
  if (event.target instanceof HTMLSelectElement) {
    return;
  }
  render();
});
form.addEventListener('change', (event) => {
  if (isPresetEditor(event.target)) {
    normalizePresetEditor(event.target);
    persistPresetEditors();
    return;
  }
  applyQuickPick(event.target);
  normalizeMoneyInput(event.target);
  render();
});
render();
