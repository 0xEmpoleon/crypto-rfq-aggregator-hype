# Architecture

Option Strategist is a single Next.js app (App Router) deployed on Vercel. No
database, no accounts, no order execution — it reads two public market-data
APIs and does all analytics client-side.

## Module map

```
frontend/
├── app/
│   ├── page.tsx              # shell: asset switcher, theme toggle, view-state persistence
│   ├── layout.tsx            # metadata, self-hosted Inter, pre-paint theme script
│   ├── error.tsx             # App Router error boundary (recover, don't white-screen)
│   ├── globals.css           # design tokens (light/dark), a11y rules, mobile layout
│   └── api/derive/
│       ├── _upstream.ts      # shared: param allow-lists, validated forward, edge cache, error mapping
│       └── {instruments,tickers,ticker}/route.ts   # thin validated GET proxies
├── components/
│   ├── DeriveAssetYields.tsx # orchestrator: owns control + hover/pin state, derives everything in useMemo
│   ├── YieldMatrix.tsx       # two strike×expiry heat tables → memoized MatrixCell
│   ├── MatrixCell.tsx        # one cell (memoized so hover never re-renders the grid)
│   ├── StrategyPanel.tsx     # CC + CSP ladder cards, price/expiry controls, position sizing
│   ├── ControlBar.tsx        # feed status, legs/P(ex)/fee-role/contracts controls
│   └── Tooltips.tsx          # cell detail card + metric explainers (mouse/keyboard/touch)
├── hooks/
│   ├── useDeriveChain.ts     # 15s poll: spot ∥ instruments → per-expiry tickers (abortable, in-flight guarded)
│   └── useDeribitMarks.ts    # cross-venue reference prices (BTC/ETH, browser-direct)
├── utils/
│   ├── optionsMath.ts        # pure quant core (greeks, prob, fees, scoring) — the only unit-tested module
│   ├── optionsMath.test.ts   # vitest
│   └── instruments.ts        # instrument-name parsing, display labels, Derive deep link
├── config/
│   ├── assets.ts             # ⭐ asset registry — add a coin = one row
│   └── constants.ts          # poll cadence, filter bands, score gate
├── types.ts                  # typed upstream API shapes + view models
└── e2e/                      # fixture-driven Playwright smoke tests
```

**Render-performance invariant:** every prop below the orchestrator is
identity-stable (`useCallback`/`useMemo`). Hover/pin state lives only at the
root, so moving the mouse re-renders one floating tooltip, not ~140 cells.

## Data flow — one 15-second tick

1. **Fetch** — spot ∥ instrument list in parallel (`Promise.allSettled`), then
   every expiry's ticker chain concurrently. Every request carries an
   `AbortSignal`; a per-effect in-flight guard prevents overlapping ticks.
2. **Ingest + guard** — reject rows without a mark, a forward, or an IV (a
   zero-IV row would otherwise surface as a P(ex)=0 "risk-free" trade). Compute
   exact time-to-expiry; greeks / P(ex)=N(±d2) / expected ITM payoff on the forward.
3. **Filter** — DTE > 7d · within the per-asset strike window · OTM side only ·
   Market mode requires a live bid · fee-net APR ∈ (5%, 300%] · P(ex) ≤ cap.
4. **Ladder search** — per-expiry and top-APR combination pools, 1–5 legs,
   deduped once across passes; each candidate scored.
5. **Rank + gate** — one min-max normalization over the whole pool; masked/flat
   factors drop and weights renormalize; highlight only if `poolSize > 1` and
   `score ≥ 5.0`.
6. **Render** — heat cells, two ladder cards, explicit loading / error-retry /
   stale-data states.

## Scoring model — decisions & provenance

- **Black-76 on Derive's forward, r = 0.** The underlying is `option_pricing.f`,
  so d1/d2 need no rate term; the only simplification is the missing `e^{-rT}`
  discount (~0.4%/month at 5%). Φ(x) is A&S 7.1.26 (|ε| < 1.5e-7), unit-tested
  against known values.
- **Fees are role-aware.** Taker = $0.50 + 0.04% of spot notional; maker = 0.03%,
  no base fee; both capped at 12.5% of the option value
  ([help.derive.xyz](https://help.derive.xyz/en/articles/8691534-what-are-the-fees)).
  Default is Maker (a seller resting a quote at ~mark is a maker); the control
  bar toggles it. APR/EV/theta/Kelly are all net of the selected fee.
- **Risk severity is model-consistent across types.** Both puts and calls use the
  expected exercise payoff (Σ tailLoss) as ranking severity, so Risk/Return and
  Kelly are comparable between the call and put panels. The strike-to-zero worst
  case is displayed as "Max loss" but is **not** a ranking input.
- **EV is only scored against an independent fair value.** Under Market pricing
  the live bid is independent, so EV (bid − model) is real. Under Mark pricing EV
  vs the app's own model is ~0 by construction and is masked — **unless** a
  matching Deribit mark exists for every leg (BTC/ETH), in which case
  EV = Derive mark − Deribit mark is a genuine cross-venue edge and is unmasked.
- **Pool-relative scores are non-stationary by design.** The 0–10 score is a
  min-max rank within the current candidate pool; it answers "best available
  now," not an absolute quality, and can shift tick-to-tick.
- **P(any exercise) is a lower bound for cross-expiry ladders.** `max(pex)` is
  exact only within one expiry; multi-expiry ladders show it prefixed with "≥".
- **"~30d ATM IV" is a same-snapshot estimate** (per-expiry ATM straddle IVs
  interpolated in total variance), not a historical DVOL series; there is no IV-rank.

## API & security surface

Three serverless GET routes proxy Derive. Params are allow-list validated
(`^[A-Z0-9]{1,10}$`, `^\d{8}$`, `^…-PERP$`); the upstream body is built
server-side, so client input never reaches the upstream URL. Responses carry
`Cache-Control: public, s-maxage=15, stale-while-revalidate=45`, so all
concurrent users share one upstream call per URL per window. Upstream transport
failures and JSON-RPC error bodies (which Derive returns as HTTP 200) both map to
uncached 502s. Security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy,
Permissions-Policy) are set in `next.config.mjs`. Deribit is fetched directly
from the browser (CORS-open), keeping its rate limit on each user's IP.

## Deploy

The Vercel project is **not** git-connected. `scripts/deploy.sh` gates a manual
`vercel --prod` on a clean tree that is on `main`, in sync with origin, and
CI-green, so what ships is always a reviewed commit. GitHub Actions runs
lint · typecheck · unit tests (coverage) · build · fixture-driven e2e on every
PR, plus a Docker build.
