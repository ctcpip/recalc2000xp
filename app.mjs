import { DEFAULTS, parseNumber, project } from './model.mjs';
import { ALL_COLUMNS, TEXT_COLS } from './columns.mjs';

const STORAGE_KEY = 'recalc2000xp-inputs';
const COLUMNS_KEY = 'recalc2000xp-columns';
const FIELD_IDS = Object.keys(DEFAULTS);

const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

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

function fillForm(inputs) {
  for (const id of FIELD_IDS) {
    form.elements[id].value = inputs[id];
  }
}

function saveInputs(inputs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
}

function renderFieldErrors(fieldErrors) {
  form.querySelectorAll('.field__error').forEach((error) => {
    error.remove();
  });

  for (const id of FIELD_IDS) {
    const input = form.elements[id];
    const message = fieldErrors[id];
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    if (!message) {
      continue;
    }

    const errorId = `${id}-error`;
    const error = document.createElement('p');
    error.id = errorId;
    error.className = 'validation-error field__error';
    error.textContent = message;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorId);
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
    text = `Ending balance ${money.format(summary.endingBalance)}.`;
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
      : money.format(summary.balanceAtRetirement)),
    metric('Ending balance', money.format(summary.endingBalance)),
    metric('Lifetime withdrawals', money.format(summary.totalWithdrawn)),
    metric('Lifetime federal tax', money.format(summary.totalFederalTax)),
    metric('Lifetime state tax', money.format(summary.totalStateTax)),
    metric('Lifetime contributions', money.format(summary.totalContributed)),
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
    return `Shortfall ${money.format(row.spendDownShortfall)}`;
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
  return money.format(raw);
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
    return;
  }

  outlookSection.hidden = false;
  saveInputs(inputs);
  renderOutlook(result.summary);
  lastRows = result.rows;
  renderTable(lastRows);
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
renderColumnPicker();
form.addEventListener('input', render);
form.addEventListener('change', render);
render();
