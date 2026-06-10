---
project: "Pholio"
version: 1
status: draft
created: 2026-06-02
updated: 2026-06-10
prd_version: 1
main_goal: speed
top_blocker: decisions
---

# Roadmap: Pholio

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Indywidualny inwestor długoterminowy nie ma jednego miejsca, gdzie może zobaczyć cały swój portfel niezależnie od brokera — aktualne wyceny, zwroty z inwestycji i strukturę sektorową. Pholio jest niezależne od brokera: użytkownik sam wprowadza transakcje i kontroluje dane. Celem MVP jest dostarczenie prostego, przejrzystego widoku portfela z ROI — i nic poza tym.

## North star

**S-03: Użytkownik widzi tabelę portfela z ceną EOD i ROI** — ta historyjka zamyka pętlę: transakcja wpisana → cena pobrana z zewnętrznego API → zysk/strata widoczne na ekranie. Jeśli to działa, rdzeń hipotezy produktu jest potwierdzony.

> Gwiazda przewodnia to najkrótszy pełny przepływ end-to-end (od pierwszego kroku do widocznego wyniku dla użytkownika), którego dostarczenie udowadnia, że produkt robi to, do czego istnieje. Umieszczamy go jak najwcześniej w sekwencji, bo wszystko inne ma sens tylko wtedy, gdy ta ścieżka działa.

## At a glance

| ID   | Change ID               | Outcome (użytkownik może …)                                                   | Prerequisites | PRD refs                   | Status   |
| ---- | ----------------------- | ----------------------------------------------------------------------------- | ------------- | -------------------------- | -------- |
| F-01 | transactions-schema     | (fundament) tabela transakcji z RLS; każdy użytkownik widzi tylko swoje dane  | —             | FR-004, FR-007, §AC        | done     |
| S-01 | auth-flow-complete      | zarejestrować konto, zalogować się i wylogować; zobaczyć pusty dashboard      | —             | FR-001, FR-002, FR-003     | done     |
| S-02 | add-transaction         | dodać transakcję (ticker, cena, data, waluta, liczba akcji)                   | S-01, F-01    | FR-004                     | done     |
| S-03 | portfolio-roi-view      | zobaczyć tabelę portfela z ceną EOD i ROI każdej pozycji                      | S-02          | FR-007, US-01              | done     |
| S-04 | transaction-crud        | edytować i trwale usunąć istniejącą transakcję                                | S-02          | FR-005, FR-006             | proposed |
| S-05 | sector-allocation-chart | zobaczyć wykres alokacji sektorowej portfela                                  | S-03          | FR-008                     | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme             | Chain                                              | Note                                                                       |
| ------ | ----------------- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| A      | Autoryzacja       | `S-01`                                             | Brak prerequisites — można zacząć równolegle z F-01                       |
| B      | Dane & Portfel    | `F-01` → `S-02` → `S-03` / `S-04` (równolegle) → `S-05` | Główny trzon produktu; gwiazda przewodnia = S-03; S-04 biegnie równolegle z S-03 |

## Baseline

What's already in place in the codebase as of `2026-06-02` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 + Tailwind CSS 4; strony w `src/pages/`, komponenty w `src/components/` (np. `SignInForm.tsx`)
- **Backend / API:** present — Astro API routes + Cloudflare Workers adapter; endpointy w `src/pages/api/` (np. `signin.ts`)
- **Data:** partial — klient Supabase zainicjalizowany (`src/lib/supabase.ts`), brak plików schematu i migracji
- **Auth:** present — Supabase Auth + sesje cookie-based SSR (`src/middleware.ts`); middleware chroni `/dashboard`
- **Deploy / infra:** present — `wrangler.jsonc` + GitHub Actions CI/CD (`.github/workflows/deploy.yml`, `ci.yml`)
- **Observability:** absent — brak logowania, error trackingu i metryk

## Foundations

### F-01: Schemat transakcji + polityki RLS

- **Outcome:** (fundament) tabela `transactions` z polami potrzebnymi do przechowywania transakcji zakupu akcji; polityki Row Level Security zapewniające, że każdy zalogowany użytkownik widzi wyłącznie własne rekordy.
- **Change ID:** transactions-schema
- **PRD refs:** FR-004, FR-007, §AC
- **Unlocks:** S-02 (dodawanie transakcji wymaga tabeli), S-03 (widok portfela odczytuje dane z tej tabeli)
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Schemat zdefiniowany zbyt wąsko (np. bez obsługi wielowalutowości) może wymagać migracji zanim trafią pierwsze dane; warto uwzględnić walutę i datę zakupu od razu, bo późniejsza zmiana schematu z danymi produkcyjnymi jest kosztowna.
- **Status:** done

## Slices

### S-01: Kompletny flow autoryzacji

- **Outcome:** Użytkownik może zarejestrować nowe konto email/hasło, zalogować się, zobaczyć pusty dashboard i wylogować się.
- **Change ID:** auth-flow-complete
- **PRD refs:** FR-001, FR-002, FR-003
- **Prerequisites:** — (scaffold autoryzacji istnieje w baseline: `src/middleware.ts`, `src/pages/api/auth/signin.ts`, `src/components/auth/SignInForm.tsx`)
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Scaffold auth istnieje, ale kompletność flow rejestracji (strona signup, ewentualne potwierdzenie email) nie jest zweryfikowana; może wymagać uzupełnienia brakujących ekranów.
- **Status:** done

### S-02: Dodawanie transakcji

- **Outcome:** Użytkownik może dodać transakcję zakupu akcji podając ticker, cenę zakupu, datę zakupu, walutę i liczbę akcji; transakcja jest zapisana i pojawia się na liście.
- **Change ID:** add-transaction
- **PRD refs:** FR-004
- **Prerequisites:** S-01, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy MVP powinien walidować ticker przez call do API cenowego zaraz po wpisaniu? — Owner: developer. Block: no (PRD wybrało KISS; cichy błąd tickera zaakceptowany jako ryzyko MVP, decyzja odłożona do implementacji).
- **Risk:** Ręczne wpisywanie tickera bez walidacji może dawać złe ceny bez ostrzeżenia; ryzyko zaakceptowane świadomie w PRD §FR-004.
- **Status:** done

### S-03: Widok portfela z ROI

- **Outcome:** Użytkownik widzi tabelę portfela ze wszystkimi pozycjami, aktualną ceną EOD (pobieraną z zewnętrznego API) i wyliczonym ROI (% i wartość bezwzględna); przy niedostępności API wyświetla ostatnią zapisaną cenę lub czytelny komunikat "brak danych", bez crasha.
- **Change ID:** portfolio-roi-view
- **PRD refs:** FR-007, US-01
- **Prerequisites:** S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - ~~Który dostawca danych EOD zostanie wybrany?~~ — **Resolved 2026-06-06: Finnhub.** Szczegóły w `context/foundation/eod-api-decision.md`.
- **Risk:** Zewnętrzna zależność od API cenowego jest jedyną nierozwiązaną decyzją blokującą must-have; zły wybór dostawcy (limity API, koszty, niezawodność) może wymagać podmiany integracji przed launchem.
- **Status:** done

### S-04: Edycja i usuwanie transakcji

- **Outcome:** Użytkownik może edytować dane istniejącej transakcji i trwale ją usunąć po potwierdzeniu.
- **Change ID:** transaction-crud
- **PRD refs:** FR-005, FR-006
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Twarde usunięcie bez możliwości odtworzenia zaakceptowane przez PRD; edycja in-place z potwierdzeniem — zakres prosty, ryzyko niskie.
- **Status:** proposed

### S-05: Wykres alokacji sektorowej

- **Outcome:** Użytkownik widzi wykres pokazujący procentowy udział każdego sektora w portfelu.
- **Change ID:** sector-allocation-chart
- **PRD refs:** FR-008
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - ~~Czy wybrany dostawca EOD dostarcza dane o przynależności sektorowej?~~ — **Resolved 2026-06-06: Finnhub company profile endpoint zawiera sector/industry.** Szczegóły w `context/foundation/eod-api-decision.md`.
- **Risk:** FR-008 to nice-to-have; jeśli dostawca nie dostarcza danych sektorowych lub koszty są za wysokie, feature wypada bez blokowania MVP.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID               | Suggested issue title                             | Ready for `/10x-plan` | Notes                                  |
| ---------- | ----------------------- | ------------------------------------------------- | --------------------- | -------------------------------------- |
| F-01       | transactions-schema     | Stwórz schemat tabeli `transactions` z RLS        | yes                   | Run `/10x-plan transactions-schema`    |
| S-01       | auth-flow-complete      | Dokończ i zweryfikuj flow rejestracji i logowania | yes                   | Run `/10x-plan auth-flow-complete`     |
| S-02       | add-transaction         | Formularz dodawania transakcji zakupu             | no                    | Czeka na F-01 + S-01                   |
| S-03       | portfolio-roi-view      | Tabela portfela z ceną EOD i ROI                  | no                    | Blocked: wybór dostawcy danych EOD     |
| S-04       | transaction-crud        | Edycja i usuwanie transakcji                      | no                    | Czeka na S-02                          |
| S-05       | sector-allocation-chart | Wykres alokacji sektorowej                        | no                    | Blocked: dane sektorowe od dostawcy EOD |

## Open Roadmap Questions

1. ~~**Który dostawca danych EOD (ceny akcji)?**~~ — **Resolved 2026-06-06: Finnhub.** Zobacz `context/foundation/eod-api-decision.md`.
2. **Walidacja tickera przy ręcznym wpisaniu** — Czy MVP powinien walidować ticker natychmiast przez call do API? Owner: developer. Block: no (KISS wybrane w PRD §FR-004; jeśli zdecydujesz inaczej, S-02 wymaga aktualizacji zakresu).

## Parked

- **FR-009: Przełączanie waluty bazowej (PLN/USD/EUR)** — Why parked: nice-to-have per PRD; wymaga kolejnego zewnętrznego API kursów walut; odłożone do v2.
- **Publiczny profil + konfiguracja widoczności per-moduł** — Why parked: jawne Non-Goal MVP per PRD §Non-Goals; Socratic challenge przeprowadzony, decyzja świadoma.
- **Import CSV / integracja z brokerem (XTB, Degiro, IBKR)** — Why parked: Non-Goal MVP per PRD §Non-Goals; eliminuje złożoność parsowania różnych formatów eksportów.
- **Historia transakcji / soft-delete** — Why parked: Non-Goal MVP per PRD §Non-Goals; twarde usunięcie wybrane świadomie; odtwarzanie historii to v2.
- **Walidacja tickera / autocomplete** — Why parked: KISS wybrane w PRD §FR-004; cichy błąd tickera zaakceptowany jako ryzyko MVP; autocomplete i walidacja to v2.
- **Dane cenowe w czasie rzeczywistym (real-time)** — Why parked: EOD wybrane świadomie w PRD §FR-007; eliminuje koszty i złożoność real-time API.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived.)

- **F-01: (fundament) tabela transakcji z RLS; każdy użytkownik widzi tylko swoje dane** — Archived 2026-06-04 → `context/archive/2026-06-03-transactions-schema/`. Lesson: —.
- **S-01: Użytkownik może zarejestrować nowe konto email/hasło, zalogować się, zobaczyć pusty dashboard i wylogować się.** — Archived 2026-06-04 → `context/archive/2026-06-04-auth-flow-complete/`. Lesson: —.
- **S-02: Użytkownik może dodać transakcję zakupu akcji podając ticker, cenę zakupu, datę zakupu, walutę i liczbę akcji; transakcja jest zapisana i pojawia się na liście.** — Archived 2026-06-08 → `context/archive/2026-06-06-add-transaction/`. Lesson: —.
- **S-03: Użytkownik widzi tabelę portfela ze wszystkimi pozycjami, aktualną ceną EOD i wyliczonym ROI (% i wartość bezwzględna); przy niedostępności API wyświetla ostatnią zapisaną cenę lub czytelny komunikat "brak danych", bez crasha.** — Archived 2026-06-10 → `context/archive/2026-06-09-portfolio-roi-view/`. Lesson: —.
