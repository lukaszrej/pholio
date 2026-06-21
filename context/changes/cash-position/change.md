---
id: cash-position
title: Cash Position Tracking
status: impl_reviewed
created: 2026-06-20
updated: 2026-06-21
---

## Summary

Add cash deposit/withdrawal tracking to portfolios via a new transaction type in the existing `AddTransactionForm` flow. The Cash Position UI section already exists in the sidebar (`PortfolioSection.tsx`) but shows `—` because no data flows into the `cashBalance` prop. This change wires up the full stack.
