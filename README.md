# ReCalc 2000 XP

A year-by-year retirement planning calculator. Set your portfolio, spending, and tax assumptions, then see whether the money lasts -- and when it runs out if it does not.

It is also useful if you are not working. Set retirement age to your current age (and monthly contribution to `$0`) to project how long savings last under inflation-adjusted spending.

This is a planning tool, not tax or investment advice.

## What it models

Until retirement age, the portfolio grows at your expected CAGR and receives monthly contributions (inflated each year). After retirement, contributions stop and the model withdraws enough to cover desired spending minus Social Security, including tax on the withdrawal.

Each year it tracks:

- Portfolio growth, contributions, and ending balance (gross and net of margin debt)
- Inflation-adjusted spending, plus optional fixed spend that is **not** inflated (mortgage, etc.)
- Social Security starting at a chosen age, with COLA equal to inflation
- Federal long-term capital gains tax above the inflated 0% bracket and standard deduction
- State capital gains tax on taxable gains (flat; no federal offsets)
- A "safe" withdrawal path (e.g. 4% at retirement, then inflated)
- A spend-down withdrawal: the largest inflation-rising draw that reaches `$0` net at end age

The outlook tells you if the portfolio lasts through end age, when it goes negative, and the first age where withdrawals exceed the safe amount.

Inputs and column layout are saved in the browser.
