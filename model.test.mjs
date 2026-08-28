import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULTS,
  asNumber,
  calculateSpendDownPlan,
  parseNumber,
  project,
  remainingYearFraction,
  solveGrossWithdrawal,
} from './model.mjs';

const AS_OF = new Date(2026, 0, 1);

function closeTo(actual, expected, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('parses formatted money, percentages, and accounting negatives', () => {
  assert.equal(asNumber('$1,250,000'), 1_250_000);
  assert.equal(asNumber('4.95%'), 4.95);
  assert.equal(asNumber('(2,500)'), -2_500);
  assert.equal(asNumber('', 42), 42);
  assert.equal(parseNumber('$1,00x').valid, false);
});

test('calculates the inclusive fraction of the calendar year remaining', () => {
  assert.equal(remainingYearFraction(new Date(2026, 0, 1)), 1);
  closeTo(remainingYearFraction(new Date(2026, 11, 31)), 1 / 365, 1e-12);
  closeTo(remainingYearFraction(new Date(2024, 11, 31)), 1 / 366, 1e-12);
});

test('applies partial-year compounding, contributions, and spending to row one', () => {
  const asOf = new Date(2026, 6, 1);
  const yf = remainingYearFraction(asOf);
  const inputs = {
    ...DEFAULTS,
    currentAssets: 1_000_000,
    expectedCagr: 8,
    monthlyContribution: 1_000,
    desiredSpendToday: 60_000,
  };
  const first = project(inputs, asOf).rows[0];

  closeTo(first.growth, 1_000_000 * (1.08 ** yf - 1));
  closeTo(first.contribution, 12_000 * yf);
  closeTo(first.desiredSpend, 60_000 * yf);
});

test('inflates later contributions and only the non-fixed portion of spending', () => {
  const inputs = {
    ...DEFAULTS,
    inflation: 3,
    monthlyContribution: 1_000,
    desiredSpendToday: 60_000,
    fixedSpend: 12_000,
  };
  const rows = project(inputs, AS_OF).rows;

  closeTo(rows[1].contribution, 12_000 * 1.03);
  closeTo(rows[1].desiredSpend, 60_000);
  closeTo(rows[2].desiredSpend, 48_000 * 1.03 + 12_000);
});

test('starts withdrawals at retirement and Social Security at its selected age', () => {
  const inputs = {
    ...DEFAULTS,
    currentAge: 64,
    retirementAge: 65,
    socialSecurityAge: 66,
    desiredSpendToday: 50_000,
    ssBenefitToday: 20_000,
    inflation: 0,
  };
  const rows = project(inputs, AS_OF).rows;

  assert.equal(rows[0].netNeeded, 0);
  assert.equal(rows[0].grossWithdrawal, 0);
  assert.equal(rows[1].netNeeded, 50_000);
  assert.equal(rows[2].ssIncome, 20_000);
  assert.equal(rows[2].netNeeded, 30_000);
});

test('charges flat state gains tax even when federal gains tax is zero', () => {
  const inputs = {
    ...DEFAULTS,
    currentAge: 65,
    retirementAge: 65,
    desiredSpendToday: 40_000,
    inflation: 0,
    gainsPercent: 100,
    standardDeduction: 30_000,
    ltcgZeroBound: 96_700,
    ltcgRate: 15,
    stateCgRate: 4.95,
    socialSecurityAge: 100,
  };
  const first = project(inputs, AS_OF).rows[0];
  const expectedGross = 40_000 / (1 - 0.0495);

  closeTo(first.taxableGains, expectedGross);
  assert.equal(first.federalTax, 0);
  closeTo(first.stateTax, expectedGross * 0.0495);
  closeTo(first.taxOwed, first.stateTax);
  closeTo(first.grossWithdrawal, expectedGross);
  closeTo(first.grossWithdrawal - first.taxOwed, first.netNeeded);
});

test('returns zero withdrawal and taxes when no cash is needed', () => {
  assert.deepEqual(solveGrossWithdrawal({
    netNeeded: 0,
    gainsFraction: 1,
    federalRate: 0.15,
    stateRate: 0.05,
    federalThreshold: 100_000,
  }), {
    grossWithdrawal: 0,
    taxableGains: 0,
    federalTax: 0,
    stateTax: 0,
    taxOwed: 0,
  });
});

test('does not charge federal tax at or below its threshold', () => {
  const result = solveGrossWithdrawal({
    netNeeded: 100_000,
    gainsFraction: 1,
    federalRate: 0.15,
    stateRate: 0,
    federalThreshold: 100_000,
  });

  assert.equal(result.grossWithdrawal, 100_000);
  assert.equal(result.taxableGains, 100_000);
  assert.equal(result.federalTax, 0);
  assert.equal(result.taxOwed, 0);
});

test('grosses up federal tax above its threshold', () => {
  const result = solveGrossWithdrawal({
    netNeeded: 200_000,
    gainsFraction: 1,
    federalRate: 0.15,
    stateRate: 0,
    federalThreshold: 100_000,
  });
  const expectedGross = (200_000 - 0.15 * 100_000) / (1 - 0.15);

  closeTo(result.grossWithdrawal, expectedGross);
  closeTo(result.federalTax, expectedGross - 200_000);
  closeTo(result.grossWithdrawal - result.taxOwed, 200_000);
});

test('grosses up combined federal and state taxes with partial gains', () => {
  const result = solveGrossWithdrawal({
    netNeeded: 200_000,
    gainsFraction: 0.8,
    federalRate: 0.15,
    stateRate: 0.05,
    federalThreshold: 100_000,
  });
  const expectedGross = (
    200_000 - 0.15 * 100_000
  ) / (1 - 0.8 * (0.15 + 0.05));

  closeTo(result.grossWithdrawal, expectedGross);
  closeTo(result.taxableGains, expectedGross * 0.8);
  closeTo(result.stateTax, result.taxableGains * 0.05);
  closeTo(
    result.federalTax,
    (result.taxableGains - 100_000) * 0.15,
  );
  closeTo(result.grossWithdrawal - result.taxOwed, 200_000);
});

test('does not tax withdrawals when the gains fraction is zero', () => {
  const result = solveGrossWithdrawal({
    netNeeded: 200_000,
    gainsFraction: 0,
    federalRate: 0.15,
    stateRate: 0.05,
    federalThreshold: 0,
  });

  assert.equal(result.grossWithdrawal, 200_000);
  assert.equal(result.taxableGains, 0);
  assert.equal(result.taxOwed, 0);
});

test('projection withdrawals deliver exactly the required after-tax cash', () => {
  const rows = project({
    ...DEFAULTS,
    currentAge: 65,
    retirementAge: 65,
    endAge: 75,
    desiredSpendToday: 180_000,
    gainsPercent: 75,
    ltcgRate: 15,
    stateCgRate: 4.95,
    standardDeduction: 15_000,
    ltcgZeroBound: 50_000,
  }, AS_OF).rows;

  for (const row of rows) {
    closeTo(row.grossWithdrawal - row.taxOwed, row.netNeeded);
    closeTo(row.taxableGains, row.grossWithdrawal * 0.75);
    closeTo(row.taxOwed, row.federalTax + row.stateTax);
  }
});

test('tax solver preserves required net cash across rate combinations', () => {
  const netAmounts = [1, 10_000, 100_000, 500_000];
  const gainsFractions = [0, 0.25, 0.8, 1];
  const federalRates = [0, 0.15, 0.2];
  const stateRates = [0, 0.0495, 0.1];
  const thresholds = [0, 50_000, 150_000];

  for (const netNeeded of netAmounts) {
    for (const gainsFraction of gainsFractions) {
      for (const federalRate of federalRates) {
        for (const stateRate of stateRates) {
          for (const federalThreshold of thresholds) {
            const result = solveGrossWithdrawal({
              netNeeded,
              gainsFraction,
              federalRate,
              stateRate,
              federalThreshold,
            });
            closeTo(
              result.grossWithdrawal - result.taxOwed,
              netNeeded,
              1e-7,
            );
          }
        }
      }
    }
  }
});

test('subtracts constant margin debt from start and end net balances', () => {
  const inputs = {
    ...DEFAULTS,
    currentAssets: '$1,000,000',
    marginDebt: '$125,000',
  };
  const rows = project(inputs, AS_OF).rows;

  assert.equal(rows[0].startBalanceNet, 875_000);
  assert.equal(rows[0].endBalanceNet, rows[0].endBalance - 125_000);
  assert.equal(rows[1].startBalanceNet, rows[1].startBalance - 125_000);
});

test('calculates a level spend-down withdrawal that ends at zero net', () => {
  assert.deepEqual(calculateSpendDownPlan({
    startBalance: 1_000,
    marginDebt: 0,
    cagr: 0,
    inflationRate: 0,
    periods: 4,
  }), {
    withdrawal: 250,
    terminalShortfall: 0,
  });

  const plan = calculateSpendDownPlan({
    startBalance: 1_000,
    marginDebt: 100,
    cagr: 0.10,
    inflationRate: 0,
    periods: 2,
  });
  closeTo(plan.withdrawal, (1_210 - 100) / 2.1);
  assert.equal(plan.terminalShortfall, 0);
});

test('reports terminal shortfall when withdrawals cannot reach zero net', () => {
  assert.deepEqual(calculateSpendDownPlan({
    startBalance: 100_000,
    marginDebt: 150_000,
    cagr: 0,
    inflationRate: 0,
    periods: 10,
  }), {
    withdrawal: null,
    terminalShortfall: 50_000,
  });
});

test('anchors the spend-down schedule at retirement', () => {
  const result = project({
    ...DEFAULTS,
    currentAge: 64,
    retirementAge: 65,
    endAge: 66,
    currentAssets: 1_000_000,
    marginDebt: 100_000,
    expectedCagr: 0,
    inflation: 0,
    monthlyContribution: 0,
  }, AS_OF);

  assert.equal(result.rows[0].spendDownWithdrawal, null);
  assert.equal(result.rows[1].spendDownWithdrawal, 450_000);
  assert.equal(result.rows[2].spendDownWithdrawal, 450_000);
});

test('inflation-growing spend-down schedule reaches zero net at end age', () => {
  const inputs = {
    ...DEFAULTS,
    currentAge: 65,
    retirementAge: 65,
    endAge: 69,
    currentAssets: 2_000_000,
    marginDebt: 150_000,
    expectedCagr: 6,
    inflation: 3,
    monthlyContribution: 0,
  };
  const rows = project(inputs, AS_OF).rows;
  let hypotheticalBalance = inputs.currentAssets;

  for (const row of rows) {
    hypotheticalBalance *= 1 + inputs.expectedCagr / 100;
    hypotheticalBalance -= row.spendDownWithdrawal;
  }

  assert.ok(rows[0].spendDownWithdrawal > 0);
  closeTo(
    rows[1].spendDownWithdrawal,
    rows[0].spendDownWithdrawal * 1.03,
  );
  closeTo(hypotheticalBalance - inputs.marginDebt, 0);
});

test('returns field-level validation errors instead of projection rows', () => {
  const result = project({
    ...DEFAULTS,
    currentAge: 70,
    retirementAge: 65,
    stateCgRate: -1,
  }, AS_OF);

  assert.equal(result.rows.length, 0);
  assert.equal(result.summary, null);
  assert.deepEqual(result.errors, ['Fix the highlighted fields.']);
  assert.deepEqual(result.fieldErrors, {
    retirementAge: 'Cannot be earlier than current age.',
    stateCgRate: 'Must be between 0% and 100%.',
  });
});

test('rejects malformed numeric input instead of treating it as zero', () => {
  const result = project({
    ...DEFAULTS,
    currentAssets: '$1,00x,000',
  }, AS_OF);

  assert.deepEqual(result.errors, ['Fix the highlighted fields.']);
  assert.deepEqual(result.fieldErrors, { currentAssets: 'Enter a valid number.' });
  assert.equal(result.rows.length, 0);
});

test('rejects out-of-range financial assumptions', () => {
  const result = project({
    ...DEFAULTS,
    currentAssets: -1,
    marginDebt: -1,
    withdrawalRate: 101,
    gainsPercent: -1,
    ltcgRate: 101,
    monthlyContribution: -1,
  }, AS_OF);

  assert.deepEqual(Object.keys(result.fieldErrors).sort(), [
    'currentAssets',
    'gainsPercent',
    'ltcgRate',
    'marginDebt',
    'monthlyContribution',
    'withdrawalRate',
  ]);
  assert.equal(result.rows.length, 0);
});

test('rejects tax combinations that cannot produce positive net proceeds', () => {
  const result = project({
    ...DEFAULTS,
    gainsPercent: 100,
    ltcgRate: 60,
    stateCgRate: 40,
  }, AS_OF);

  const expected = 'Combined effective tax on gains must be below 100%.';
  assert.equal(result.fieldErrors.ltcgRate, expected);
  assert.equal(result.fieldErrors.stateCgRate, expected);
  assert.equal(result.rows.length, 0);
});

test('gross-withdrawal solver rejects an impossible effective tax rate', () => {
  assert.throws(() => solveGrossWithdrawal({
    netNeeded: 100_000,
    gainsFraction: 1,
    federalRate: 0,
    stateRate: 1,
    federalThreshold: 0,
  }), {
    name: 'RangeError',
    message: 'Effective state tax rate must be below 100%.',
  });
});

test('gross-withdrawal solver rejects an impossible combined rate', () => {
  assert.throws(() => solveGrossWithdrawal({
    netNeeded: 100_000,
    gainsFraction: 1,
    federalRate: 0.6,
    stateRate: 0.4,
    federalThreshold: 0,
  }), {
    name: 'RangeError',
    message: 'Combined effective tax rate must be below 100%.',
  });
});

test('requires whole-number ages and fixed spend within desired spending', () => {
  const result = project({
    ...DEFAULTS,
    currentAge: 40.5,
    fixedSpend: 81_000,
  }, AS_OF);

  assert.equal(
    result.fieldErrors.currentAge,
    'Must be a whole number between 0 and 120.',
  );
  assert.equal(
    result.fieldErrors.fixedSpend,
    'Cannot exceed desired annual spending.',
  );
});
