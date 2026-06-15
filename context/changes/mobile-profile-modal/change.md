---
id: mobile-profile-modal
title: Mobile Profile Modal
status: impl_reviewed
created: 2026-06-15
updated: 2026-06-15
---

# Mobile Profile Modal

## Problem

On mobile viewports (< 640px `sm` breakpoint), the user profile icon in the header is visible but has no click handler — tapping it does nothing. The desktop header (`hidden sm:flex`) contains the user email, "+ Add portfolio" button, and "Sign out" form, but all of this is completely hidden on mobile.

## Goal

Add a profile modal (using the existing `Dialog` component) triggered by the mobile profile icon that shows:

- User email address
- "Add portfolio" button (calls `openAddPortfolio()`)
- "Sign out" button (submits to `/api/auth/signout`)
