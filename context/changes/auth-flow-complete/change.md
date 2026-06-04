---
change_id: auth-flow-complete
title: Complete auth flow — register, sign in, view dashboard, sign out
status: implementing
created: 2026-06-04
updated: 2026-06-04
archived_at: null
---

## Notes

From roadmap S-01 (auth-flow-complete):
- Outcome: użytkownik może zarejestrować nowe konto email/hasło, zalogować się, zobaczyć pusty dashboard i wylogować się.
- PRD refs: FR-001, FR-002, FR-003
- Prerequisites: — (scaffold autoryzacji istnieje w baseline: `src/middleware.ts`, `src/pages/api/auth/signin.ts`, `src/components/auth/SignInForm.tsx`)
- Risk: kompletność flow rejestracji (strona signup, ewentualne potwierdzenie email) nie jest zweryfikowana; może wymagać uzupełnienia brakujących ekranów.
