---
decision: "EOD stock price API provider"
status: decided
decided: 2026-06-06
affects: portfolio-roi-view (S-03), sector-allocation-chart (S-05)
---

# EOD Stock Price API — Decision

## Decision

**Finnhub** is the selected provider for EOD stock prices and sector/industry data.

## Rationale

| API                           | Free tier                  | EOD data      | Sector data                 | Reliability                                                |
| ----------------------------- | -------------------------- | ------------- | --------------------------- | ---------------------------------------------------------- |
| Yahoo Finance (yfinance)      | Unlimited (unofficial)     | Yes           | No                          | Poor — breaks without warning, rate limits change silently |
| Alpha Vantage                 | 25 req/day, 5/min          | Yes (20+ yrs) | Yes (company overview)      | Good                                                       |
| Polygon.io                    | 5 req/min, limited history | Yes           | Yes                         | Good — but free tier too restrictive                       |
| **Finnhub**                   | **60 req/min**             | **Yes**       | **Yes (company profile)**   | **Good — official, documented**                            |
| Financial Modeling Prep (FMP) | Free tier available        | Yes           | Yes (dedicated sectors API) | Good                                                       |

Finnhub wins on:

- **Rate limits**: 60 req/min on free — sufficient for a small personal portfolio without aggressive caching
- **Sector data**: company profile endpoint includes sector and industry → unblocks S-05 at no extra cost
- **Stability**: official REST API with documentation; will not silently break like Yahoo Finance
- **Integration fit**: clean JSON, compatible with Cloudflare Workers edge runtime

## Eliminated options

- **Yahoo Finance**: unofficial, no documented limits, periodically broken by cookie/crumb requirement changes — not suitable for production
- **Polygon.io**: free tier too restrictive (5 req/min, limited history); paid tier starts at $29/month — unnecessary cost for MVP scale
- **Alpha Vantage**: 25 req/day exhausted quickly with 20+ positions; viable fallback if Finnhub has issues

## Fallback

Alpha Vantage — same EOD + sector coverage, but requires aggressive caching to stay within 25 req/day limit.

## Impact on roadmap

- **S-03 (`portfolio-roi-view`)**: unblocked — use Finnhub quote endpoint for EOD price per ticker
- **S-05 (`sector-allocation-chart`)**: unblocked — use Finnhub company profile endpoint for sector classification
- Roadmap open question #1 is resolved; update `roadmap.md` status for S-03 and S-05 from `blocked` accordingly when planning begins
