---
project: "Pholio"
version: 1
status: draft
created: 2026-05-22
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Indywidualny inwestor długoterminowy, który samodzielnie kupuje akcje przez brokera, nie ma jednego miejsca, gdzie może zobaczyć cały swój portfel — aktualne wyceny, zwroty z inwestycji i strukturę alokacji sektorowej. W momencie gdy chce sprawdzić jak radzi sobie portfel, musi albo ręcznie zestawiać dane ze spreadsheetów, albo skakać między aplikacjami różnych brokerów, z których każda pokazuje tylko swoją część.

Pholio jest niezależne od brokera — użytkownik sam wprowadza swoje transakcje i to on kontroluje dane. Istniejące narzędzia do śledzenia portfela albo są przeładowane funkcjami dla aktywnych traderów, albo zamykają użytkownika w ekosystemie jednej platformy brokerskiej. Pholio daje inwestorowi długoterminowemu prosty, przejrzysty widok tego co kupił, ile zarobił i jak zdywersyfikowany jest jego portfel.

## User & Persona

### Primary persona

**Inwestor-amator, który zaczyna poważnie**

Łukasz, 28–40 lat, pracownik na etacie z wolnymi środkami, które inwestuje długoterminowo w akcje. Ma konto u jednego lub dwóch brokerów, kupił kilka–kilkanaście spółek w ciągu ostatnich 1–3 lat. Nie jest traderem — nie gra na krótkich pozycjach, nie śledzi wykresów dzień po dniu. Raz na jakiś czas (co tydzień lub co miesiąc) chce sprawdzić: ile warty jest teraz jego portfel, ile zarobił lub stracił, w które sektory jest zainwestowany. Traktuje to poważnie — prowadzi notatki, zastanawia się nad kolejnymi zakupami — ale brakuje mu jednego narzędzia, które zbierze to wszystko razem w czytelny sposób.

Sięga po Pholio wtedy, gdy otwiera komputer wieczorem i chce rzutem oka ocenić stan swojego portfela zanim zadecyduje, czy coś dokupić.

## Success Criteria

### Primary
- Zalogowany użytkownik dodaje transakcję (spółka, cena zakupu, data, waluta) i widzi w tabeli portfela aktualną cenę tej pozycji oraz jej ROI (zysk/strata od zakupu w % i wartości bezwzględnej).

### Secondary
- Wykres alokacji sektorowej działa i pokazuje procentowy udział każdego sektora w portfelu w czytelnej formie wizualnej.

### Guardrails
- Dane portfela jednego użytkownika są absolutnie niedostępne dla innego użytkownika ani dla niezalogowanego gościa.
- ROI jest obliczany poprawnie — błąd matematyczny jest gorszy niż brak funkcji; formula musi być weryfikowalna.
- Niedostępność zewnętrznego źródła cen nie powoduje błędu krytycznego — aplikacja wyświetla ostatnią zapisaną cenę lub czytelny komunikat o braku danych, bez crasha.

## User Stories

### US-01: Użytkownik sprawdza stan portfela

- **Given** zalogowany użytkownik z co najmniej jedną dodaną transakcją zakupu
- **When** wchodzi na widok portfela
- **Then** widzi tabelę ze wszystkimi pozycjami, gdzie każda zawiera: nazwę/ticker spółki, liczbę akcji, cenę zakupu, aktualną cenę pobieraną z zewnętrznego źródła danych, wartość pozycji oraz ROI (zysk/strata w % i wartości bezwzględnej)

#### Acceptance Criteria
- Tabela ładuje aktualne ceny z zewnętrznego źródła danych; jeśli źródło nie odpowiada, wyświetla ostatnią zapisaną cenę lub komunikat "brak danych"
- ROI jest obliczany jako: `(cena_aktualna - cena_zakupu) / cena_zakupu × 100%` z uwzględnieniem liczby akcji
- Portfel bez żadnej pozycji pokazuje empty state z CTA do dodania pierwszej transakcji

## Functional Requirements

### Uwierzytelnianie

- FR-001: Użytkownik może zarejestrować nowe konto podając email i hasło. Priority: must-have
  > Socrates: Kontr-argument rozważony: "jeśli budujesz dla siebie, po co auth?" Odrzucony — użytkownik chce dostępu z różnych urządzeń i danych na serwerze; local-first nie wystarczy.
- FR-002: Użytkownik może zalogować się do konta email i hasłem. Priority: must-have
  > Socrates: j.w. — auth jest fundamentem aplikacji webowej. Stoi bez zmian.
- FR-003: Użytkownik może wylogować się z konta. Priority: must-have
  > Socrates: j.w. — nieodłączna część auth flow. Stoi bez zmian.

### Zarządzanie transakcjami

- FR-004: Użytkownik może dodać transakcję zakupu akcji podając: ticker (ręcznie wpisany), cenę zakupu, datę zakupu, walutę i liczbę akcji. Priority: must-have
  > Socrates: Kontr-argument rozważony: "ręczny ticker grozi cichym błędem — zły ticker daje złe ceny bez ostrzeżenia." Decyzja: KISS — użytkownik zna swoje tickery; autouzupełnianie i walidacja tickera w v2. Ryzyko cichego błędu zapisane w Open Questions.
- FR-005: Użytkownik może edytować istniejącą transakcję. Priority: must-have
  > Socrates: Kontr-argument rozważony: "usunięcie i ponowne dodanie wystarczy zamiast edycji in-place." Odrzucony — edycja jest wygodniejsza i warta implementacji w MVP.
- FR-006: Użytkownik może usunąć istniejącą transakcję (usunięcie trwałe, z potwierdzeniem). Priority: must-have
  > Socrates: Kontr-argument rozważony: "trwałe usunięcie niszczy historię — może archiwizacja?" Odrzucony dla MVP — historia transakcji to v2. Usunięcie z potwierdzeniem wystarczy.

### Widok portfela

- FR-007: Użytkownik może zobaczyć tabelę portfela z każdą pozycją, ceną EOD (end-of-day) pobieraną z zewnętrznego źródła danych oraz wyliczonym ROI (zysk/strata od zakupu w % i wartości bezwzględnej). Priority: must-have
  > Socrates: Kontr-argument rozważony: "dane cenowe na żywo mają limity i koszty." Zaakceptowany — cena EOD wystarczy dla inwestora długoterminowego; eliminuje złożoność i koszty związane z danymi na bieżąco. FR zaktualizowany: "cena aktualna" → "cena EOD".

### Analiza portfela (nice-to-have)

- FR-008: Użytkownik może zobaczyć wykres alokacji sektorowej portfela pokazujący procentowy udział każdego sektora. Priority: nice-to-have
  > Socrates: Kontr-argument rozważony: "wymaga danych o sektorach — dodatkowa zewnętrzna zależność." Zaakceptowany jako ryzyko — jeśli dane sektorowe sprawią problemy, feature wypada z MVP bez blokowania dostawy.
- FR-009: Użytkownik może przełączyć walutę bazową widoku portfela (PLN/USD/EUR). Priority: nice-to-have
  > Socrates: Kontr-argument rozważony: "kurs walut to kolejne zewnętrzne źródło danych." Zaakceptowany — nice-to-have, nie blokuje MVP. Jeśli użytkownik ma tylko jedną walutę, feature jest zbędny.

## Non-Functional Requirements

- Widok portfela z do 50 pozycjami staje się interaktywny w ciągu 3 sekund od nawigacji przy działającym połączeniu internetowym.
- Dane transakcji użytkownika nie są przekazywane do podmiotów trzecich poza zewnętrznym źródłem danych cenowych wymaganym do pobierania cen EOD.
- Aplikacja działa poprawnie w dwóch ostatnich wersjach czterech głównych przeglądarek desktopowych.

## Business Logic

Pholio oblicza aktualną wartość i ROI każdej pozycji na podstawie ceny zakupu, liczby akcji i ceny EOD pobieranej z zewnętrznego źródła — agregując portfel do spójnego widoku niezależnie od waluty, w której akcje były kupowane.

Dane wejściowe to: cena zakupu jednej akcji, liczba akcji, waluta transakcji i aktualna cena EOD tej samej akcji. Wynikiem jest dla każdej pozycji: bieżąca wartość rynkowa oraz zysk/strata od zakupu wyrażone w % i wartości bezwzględnej. Użytkownik napotyka tę regułę w momencie otworzenia widoku portfela — tabela jest rezultatem aplikacji tej reguły do każdej z wprowadzonych transakcji.

## Access Control

Rejestracja i logowanie przez email i hasło. Płaski model użytkownika — jeden typ konta, brak ról. Każdy zalogowany użytkownik widzi wyłącznie własny portfel; żaden inny użytkownik ani gość nie ma dostępu do jego danych.

Niezalogowany odwiedzający może zobaczyć jedynie stronę główną. Całość funkcjonalności portfela jest dostępna wyłącznie po zalogowaniu.

## Non-Goals

- **Brak importu pliku / integracji z platformą brokerską** — użytkownik wprowadza transakcje ręcznie w MVP. Parsowanie eksportów z zewnętrznych platform brokerskich jest poza zakresem. (Rationale: eliminuje złożoność parsowania różnych formatów i zależność od ich zmieniających się schematów.)
- **Brak publicznego profilu i udostępniania portfela** — portfel jest zawsze prywatny w MVP. Mechanizm konfiguracji widoczności i dostęp dla niezalogowanych odwiedzających to v2. (Rationale: uzgodnione świadomie — Socratic challenge przeprowadzony, użytkownik świadomie odłożył na v2.)

## Open Questions

1. **Walidacja tickera przy ręcznym wpisaniu** — użytkownik wpisuje ticker ręcznie bez podpowiedzi; jeśli wpisze błędny ticker, aplikacja pobierze złe dane bez ostrzeżenia. Czy MVP powinien walidować ticker natychmiast po wpisaniu przez weryfikację z zewnętrznym źródłem danych? Owner: do decyzji podczas implementacji.
2. **Publiczny profil (v2)** — czy ma mieć dedykowany URL? Jakie dokładnie moduły mogą być widoczne publicznie, a jakie pozostają prywatne? Owner: do decyzji przed v2.
3. **Historia transakcji** — trwałe usunięcie wybrane dla MVP, ale możliwość odtworzenia usuniętych transakcji to potencjalna funkcja v2. Owner: do decyzji przed v2.
