---
id: watchlist-live-quotes
title: "WatchlistPanel: replace mocked quotes with live Finnhub data"
status: impl_reviewed
created: 2026-06-17
updated: 2026-06-17 (phase 1 reviewed)
---

## Summary

Replace hardcoded `MOCK_QUOTES` in `WatchlistPanel.tsx` with real Finnhub API calls, routed through a server-side API endpoint that reuses the existing Supabase price cache to stay within the free-tier rate limit (60 req/min).
