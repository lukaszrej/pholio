---
id: watchlist-live-quotes
title: "WatchlistPanel: replace mocked quotes with live Finnhub data"
status: archived
archived_at: 2026-06-17T18:51:42Z
created: 2026-06-17
updated: 2026-06-17
---

## Summary

Replace hardcoded `MOCK_QUOTES` in `WatchlistPanel.tsx` with real Finnhub API calls, routed through a server-side API endpoint that reuses the existing Supabase price cache to stay within the free-tier rate limit (60 req/min).
