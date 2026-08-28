const DEFAULTS = {
  currentAssets: 100_000,
  marginDebt: 0,
  expectedCagr: 7,
  inflation: 3,
  currentAge: 33,
  retirementAge: 62,
  endAge: 95,
  desiredSpendToday: 42_000,
  fixedSpend: 0,
  withdrawalRate: 4,
  socialSecurityAge: 62,
  ssBenefitToday: 20_000,
  standardDeduction: 16_100,
  gainsPercent: 80,
  ltcgRate: 15,
  stateCgRate: 4.95,
  ltcgZeroBound: 48_350,
  monthlyContribution: 500,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseNumber(value) {
  if (typeof value === 'number') {
    return {
      valid: Number.isFinite(value),
      value,
    };
  }
  if (value === null || value === undefined) {
    return { valid: false, value: Number.NaN };
  }
  const cleaned = String(value)
    .trim()
    .replace(/[$,%\s]/g, '')
    .replace(/^\((.*)\)$/, '-$1');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') {
    return { valid: false, value: Number.NaN };
  }
  const n = Number(cleaned);
  return {
    valid: Number.isFinite(n),
    value: n,
  };
}

function asNumber(value, fallback = 0) {
  const parsed = parseNumber(value);
  return parsed.valid ? parsed.value : fallback;
}

function pct(value) {
  return asNumber(value) / 100;
}

function remainingYearFraction(asOf = new Date()) {
  const year = asOf.getFullYear();
  const today = Date.UTC(year, asOf.getMonth(), asOf.getDate());
  const jan1 = Date.UTC(year, 0, 1);
  const dec31 = Date.UTC(year, 11, 31);
  const remainingInclusive = (dec31 - today) / MS_PER_DAY + 1;
  const daysInYear = (dec31 - jan1) / MS_PER_DAY + 1;
  return Math.max(0, Math.min(1, remainingInclusive / daysInYear));
}

function inflate(amount, inflationRate, years) {
  return amount * (1 + inflationRate) ** years;
}

function solveGrossWithdrawal({
  netNeeded,
  gainsFraction,
  federalRate,
  stateRate,
  federalThreshold,
}) {
  if (netNeeded <= 0) {
    return {
      grossWithdrawal: 0,
      taxableGains: 0,
      federalTax: 0,
      stateTax: 0,
      taxOwed: 0,
    };
  }

  const stateOnlyDenominator = 1 - gainsFraction * stateRate;
  if (stateOnlyDenominator <= 0) {
    throw new RangeError('Effective state tax rate must be below 100%.');
  }

  let grossWithdrawal = netNeeded / stateOnlyDenominator;
  if (grossWithdrawal * gainsFraction > federalThreshold) {
    const combinedDenominator = 1
      - gainsFraction * (federalRate + stateRate);
    if (combinedDenominator <= 0) {
      throw new RangeError('Combined effective tax rate must be below 100%.');
    }
    grossWithdrawal = (
      netNeeded - federalRate * federalThreshold
    ) / combinedDenominator;
  }

  const taxableGains = grossWithdrawal * gainsFraction;
  const federalTax = Math.max(
    0,
    taxableGains - federalThreshold,
  ) * federalRate;
  const stateTax = taxableGains * stateRate;

  return {
    grossWithdrawal,
    taxableGains,
    federalTax,
    stateTax,
    taxOwed: federalTax + stateTax,
  };
}

function calculateSpendDownPlan({
  startBalance,
  marginDebt,
  cagr,
  inflationRate,
  periods,
  firstYf = 1,
}) {
  if (periods <= 0) {
    return { withdrawal: null, terminalShortfall: 0 };
  }

  let balanceWithoutWithdrawals = startBalance;
  let withdrawalWeight = 0;

  for (let period = 0; period < periods; period += 1) {
    const yf = period === 0 ? firstYf : 1;
    const growthFactor = period === 0
      ? (1 + cagr) ** yf
      : 1 + cagr;
    const withdrawalScale = period === 0
      ? yf
      : (1 + inflationRate) ** period;

    balanceWithoutWithdrawals *= growthFactor;
    withdrawalWeight = withdrawalWeight * growthFactor + withdrawalScale;
  }

  if (withdrawalWeight <= 0) {
    return { withdrawal: null, terminalShortfall: 0 };
  }

  const terminalNetWithoutWithdrawals = balanceWithoutWithdrawals - marginDebt;
  if (terminalNetWithoutWithdrawals < 0) {
    return {
      withdrawal: null,
      terminalShortfall: Math.abs(terminalNetWithoutWithdrawals),
    };
  }

  return {
    withdrawal: terminalNetWithoutWithdrawals / withdrawalWeight * firstYf,
    terminalShortfall: 0,
  };
}

function validate(inputs) {
  const fieldErrors = {};
  const parsed = {};

  for (const field of Object.keys(DEFAULTS)) {
    parsed[field] = parseNumber(inputs[field]);
    if (!parsed[field].valid) {
      fieldErrors[field] = 'Enter a valid number.';
    }
  }

  function check(field, condition, message) {
    if (parsed[field].valid && condition(parsed[field].value)) {
      fieldErrors[field] = message;
    }
  }

  check('currentAssets', (value) => value < 0, 'Must be zero or greater.');
  check('marginDebt', (value) => value < 0, 'Must be zero or greater.');
  check('expectedCagr', (value) => value <= -100, 'Must be greater than -100%.');
  check('inflation', (value) => value <= -100, 'Must be greater than -100%.');
  check('desiredSpendToday', (value) => value < 0, 'Must be zero or greater.');
  check('fixedSpend', (value) => value < 0, 'Must be zero or greater.');
  check('withdrawalRate', (value) => value < 0 || value > 100, 'Must be between 0% and 100%.');
  check('ssBenefitToday', (value) => value < 0, 'Must be zero or greater.');
  check('standardDeduction', (value) => value < 0, 'Must be zero or greater.');
  check('gainsPercent', (value) => value < 0 || value > 100, 'Must be between 0% and 100%.');
  check('ltcgRate', (value) => value < 0 || value > 100, 'Must be between 0% and 100%.');
  check('stateCgRate', (value) => value < 0 || value > 100, 'Must be between 0% and 100%.');
  check('ltcgZeroBound', (value) => value < 0, 'Must be zero or greater.');
  check('monthlyContribution', (value) => value < 0, 'Must be zero or greater.');

  for (const field of ['currentAge', 'retirementAge', 'endAge', 'socialSecurityAge']) {
    check(
      field,
      (value) => !Number.isInteger(value) || value < 0 || value > 120,
      'Must be a whole number between 0 and 120.',
    );
  }

  if (
    parsed.currentAge.valid
    && parsed.retirementAge.valid
    && parsed.retirementAge.value < parsed.currentAge.value
  ) {
    fieldErrors.retirementAge = 'Cannot be earlier than current age.';
  }
  if (
    parsed.currentAge.valid
    && parsed.endAge.valid
    && parsed.endAge.value < parsed.currentAge.value
  ) {
    fieldErrors.endAge = 'Cannot be earlier than current age.';
  }
  if (
    parsed.fixedSpend.valid
    && parsed.desiredSpendToday.valid
    && parsed.fixedSpend.value > parsed.desiredSpendToday.value
  ) {
    fieldErrors.fixedSpend = 'Cannot exceed desired annual spending.';
  }
  if (
    parsed.gainsPercent.valid
    && parsed.ltcgRate.valid
    && parsed.stateCgRate.valid
    && parsed.gainsPercent.value >= 0
    && parsed.gainsPercent.value <= 100
    && parsed.ltcgRate.value >= 0
    && parsed.ltcgRate.value <= 100
    && parsed.stateCgRate.value >= 0
    && parsed.stateCgRate.value <= 100
    && parsed.gainsPercent.value
      * (parsed.ltcgRate.value + parsed.stateCgRate.value) >= 10_000
  ) {
    const message = 'Combined effective tax on gains must be below 100%.';
    fieldErrors.ltcgRate = message;
    fieldErrors.stateCgRate = message;
  }

  const errors = Object.keys(fieldErrors).length
    ? ['Fix the highlighted fields.']
    : [];
  return { errors, fieldErrors };
}

function project(rawInputs, asOf = new Date()) {
  const inputs = { ...DEFAULTS, ...rawInputs };
  const validation = validate(inputs);
  if (validation.errors.length) {
    return {
      errors: validation.errors,
      fieldErrors: validation.fieldErrors,
      rows: [],
      summary: null,
    };
  }

  const currentAge = Math.round(asNumber(inputs.currentAge));
  const retirementAge = Math.round(asNumber(inputs.retirementAge));
  const endAge = Math.round(asNumber(inputs.endAge));
  const cagr = pct(inputs.expectedCagr);
  const inflationRate = pct(inputs.inflation);
  const safeRate = pct(inputs.withdrawalRate);
  const gainsFraction = pct(inputs.gainsPercent);
  const ltcgRate = pct(inputs.ltcgRate);
  const stateCgRate = pct(inputs.stateCgRate);
  const ssAge = Math.round(asNumber(inputs.socialSecurityAge));
  const desiredToday = asNumber(inputs.desiredSpendToday);
  const fixedSpend = asNumber(inputs.fixedSpend);
  const marginDebt = asNumber(inputs.marginDebt);
  const monthly = asNumber(inputs.monthlyContribution);
  const startYear = asOf.getFullYear();
  const firstYf = remainingYearFraction(asOf);

  const rows = [];
  let startBalance = asNumber(inputs.currentAssets);
  let depletedAge = null;
  let firstGapAge = null;
  let totalTax = 0;
  let totalFederalTax = 0;
  let totalStateTax = 0;
  let totalWithdrawn = 0;
  let totalContributed = 0;
  let balanceAtRetirement = null;
  let retirementSafeWithdraw = null;
  let retirementSpendDownAnnualized = null;
  let retirementSpendDownFirstYear = null;
  let retirementSpendDownShortfall = 0;

  for (let age = currentAge; age <= endAge; age += 1) {
    const yearsOut = age - currentAge;
    const isFirstRow = yearsOut === 0;
    const yf = isFirstRow ? firstYf : 1;
    const year = startYear + yearsOut;
    const retired = age >= retirementAge;
    const startBalanceNet = startBalance - marginDebt;

    const desiredSpend = isFirstRow
      ? inflate(desiredToday, inflationRate, yearsOut) * yf
      : inflate(desiredToday - fixedSpend, inflationRate, yearsOut - 1) + fixedSpend;

    const ssIncome = age >= ssAge
      ? inflate(asNumber(inputs.ssBenefitToday), inflationRate, yearsOut)
      : 0;
    const netNeeded = retired ? Math.max(0, desiredSpend - ssIncome) : 0;

    const growth = isFirstRow
      ? startBalance * ((1 + cagr) ** yf - 1)
      : startBalance * cagr;

    const contribution = age < retirementAge
      ? monthly * 12 * (isFirstRow ? yf : inflate(1, inflationRate, year - startYear))
      : 0;

    const adjustedZero = inflate(asNumber(inputs.ltcgZeroBound), inflationRate, yearsOut);
    const adjustedStdDed = inflate(asNumber(inputs.standardDeduction), inflationRate, yearsOut);

    const taxes = solveGrossWithdrawal({
      netNeeded,
      gainsFraction,
      federalRate: ltcgRate,
      stateRate: stateCgRate,
      federalThreshold: adjustedZero + adjustedStdDed,
    });
    const {
      taxableGains,
      federalTax,
      stateTax,
      taxOwed,
      grossWithdrawal,
    } = taxes;
    const endBalance = startBalance + growth + contribution - grossWithdrawal;
    const endBalanceNet = endBalance - marginDebt;
    const fourPctWithdrawal = startBalance * safeRate;

    if (age === retirementAge) {
      balanceAtRetirement = startBalance;
      retirementSafeWithdraw = startBalance * safeRate;
      const spendDownPlan = calculateSpendDownPlan({
        startBalance,
        marginDebt,
        cagr,
        inflationRate,
        periods: endAge - retirementAge + 1,
        firstYf: yf,
      });
      retirementSpendDownFirstYear = spendDownPlan.withdrawal;
      retirementSpendDownShortfall = spendDownPlan.terminalShortfall;
      retirementSpendDownAnnualized = yf > 0 && retirementSpendDownFirstYear !== null
        ? retirementSpendDownFirstYear / yf
        : null;
    }

    const safeWithdrawal = retired && retirementSafeWithdraw !== null
      ? inflate(retirementSafeWithdraw, inflationRate, age - retirementAge)
      : null;
    const spendDown = retired && retirementSpendDownAnnualized !== null
      ? age === retirementAge
        ? retirementSpendDownFirstYear
        : inflate(
          retirementSpendDownAnnualized,
          inflationRate,
          age - retirementAge,
        )
      : null;
    const gap = retired && safeWithdrawal !== null
      ? Math.max(0, grossWithdrawal - safeWithdrawal)
      : 0;

    if (depletedAge === null && endBalance < 0) {
      depletedAge = age;
    }
    if (firstGapAge === null && gap > 0) {
      firstGapAge = age;
    }

    totalTax += taxOwed;
    totalFederalTax += federalTax;
    totalStateTax += stateTax;
    totalWithdrawn += grossWithdrawal;
    totalContributed += contribution;

    rows.push({
      age,
      year,
      yf,
      startBalance,
      startBalanceNet,
      growth,
      contribution,
      desiredSpend,
      ssIncome,
      netNeeded,
      adjustedZero,
      adjustedStdDed,
      taxableGains,
      federalTax,
      stateTax,
      taxOwed,
      grossWithdrawal,
      endBalance,
      endBalanceNet,
      fourPctWithdrawal,
      safeWithdrawal,
      spendDownWithdrawal: spendDown,
      spendDownShortfall: retired ? retirementSpendDownShortfall : 0,
      gap,
      retired,
      depleted: depletedAge !== null && age >= depletedAge,
    });

    startBalance = endBalance;
  }

  const last = rows.at(-1);

  return {
    errors: [],
    fieldErrors: {},
    rows,
    summary: {
      firstGapAge,
      depletedAge,
      balanceAtRetirement,
      endingBalance: last ? last.endBalance : 0,
      totalTax,
      totalFederalTax,
      totalStateTax,
      totalWithdrawn,
      totalContributed,
      lastsToEnd: depletedAge === null,
    },
  };
}

export {
  DEFAULTS,
  asNumber,
  calculateSpendDownPlan,
  inflate,
  parseNumber,
  project,
  remainingYearFraction,
  solveGrossWithdrawal,
};
