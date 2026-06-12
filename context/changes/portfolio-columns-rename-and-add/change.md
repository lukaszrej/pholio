---
change_id: portfolio-columns-rename-and-add
title: Portfolio table: add Cost basis and % of net liq columns, rename value labels
status: impl_reviewed
created: 2026-06-13
updated: 2026-06-13
archived_at: null
---

## Notes

1. Rename "Value" column → "Market value"
2. Add "Cost basis" column (before "Market value"): calculated total cost of all shares for the ticker
3. Add "% of net liq" column (after Ticker column): percentage of ticker's cost basis relative to the whole portfolio's market value (currently shown as "Current value" in the portfolio summary)
4. Rename "Current value" label in the portfolio summary header → "Market value"
