---
id: landing-page
title: Pholio Landing Page
status: archived
archived_at: 2026-06-18T18:45:32Z
created: 2026-06-18
updated: 2026-06-18
---

## What

Build the public marketing landing page at `/` so unauthenticated visitors see the Pholio product pitch instead of being immediately redirected to `/auth/signin`.

## Why

Currently the root route is a dead pass-through: middleware always redirects `/` — either to `/dashboard` (authenticated) or `/auth/signin` (unauthenticated). The Claude Design project contains a fully-designed landing page (`Pholio Landing Page.html`) that needs to be implemented.

## Scope

- `src/middleware.ts` — remove the unauthenticated redirect at `/`
- `src/pages/index.astro` — new landing page (static, no React needed)
- No new dependencies required
