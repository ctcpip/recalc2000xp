const TEXT_COLS = new Set(['age', 'year', 'yf']);

const ALL_COLUMNS = [
  { id: 'age', label: 'Age' },
  { id: 'year', label: 'Year' },
  { id: 'yf', label: 'YF' },
  { id: 'startBalance', label: 'Start balance' },
  { id: 'startBalanceNet', label: 'Start balance net' },
  { id: 'growth', label: 'Growth' },
  { id: 'contribution', label: 'Contribution' },
  { id: 'desiredSpend', label: 'Desired spend' },
  { id: 'ssIncome', label: 'SS income' },
  { id: 'netNeeded', label: 'Net needed (after SS)' },
  { id: 'adjustedZero', label: 'Adjusted LTCG 0% threshold' },
  { id: 'adjustedStdDed', label: 'Adjusted standard deduction' },
  { id: 'taxableGains', label: 'Taxable gains' },
  { id: 'federalTax', label: 'Federal tax' },
  { id: 'stateTax', label: 'State tax' },
  { id: 'taxOwed', label: 'Tax owed' },
  { id: 'grossWithdrawal', label: 'Gross withdrawal' },
  { id: 'endBalance', label: 'End balance' },
  { id: 'endBalanceNet', label: 'End balance net' },
  { id: 'fourPctWithdrawal', label: '4% withdrawal' },
  { id: 'safeWithdrawal', label: 'Safe withdrawal' },
  { id: 'spendDownWithdrawal', label: 'Spend-down withdrawal' },
  { id: 'gap', label: 'Gap (need income)' },
];

export { ALL_COLUMNS, TEXT_COLS };
