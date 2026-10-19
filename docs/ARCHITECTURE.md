# Architecture

Option Strategist is a single Next.js app (App Router) deployed on Vercel. No
database, no accounts, no order execution — it reads two public market-data
APIs and does all analytics client-side.

## Module map

```
frontend/
├── app/
│   ├── page.tsx              # NERV shell: asset tab bar, view-state persistence
│   ├── layout.tsx            # metadata, self-hosted Source Code Pro (dark-only NERV theme)
│   ├── error.tsx             # App Router error boundary (recover, don't white-screen)
│   ├── globals.css           # NERV tokens (same palette as the report panel), a11y rules, mobile layout
│   └── api/derive/
│       ├── _upstream.ts      # shared: param allow-lists, validated forward, edge cache, error mapping
│       └── {instruments,tickers,ticker}/route.ts   # thin validated GET proxies → api.derive.xyz/v3
├── components/
│   ├── DeriveAssetYields.tsx # orchestrator: owns control + hover/pin state, derives everything in useMemo
│   ├── Masthead.tsx          # serif title card + MAGI status (one unit per feed: spot/options/ATM IV)
│   ├── YieldMatrix.tsx       # two strike×expiry heat tables → memoized MatrixCell
│   ├── MatrixCell.tsx        # one cell (memoized so hover never re-renders the grid)
│   ├── StrategyPanel.tsx     # CC + CSP ladder cards, price/expiry controls, position sizing
│   ├── ControlBar.tsx        # legs/P(ex)/fee-role/contracts controls
│   └── Tooltips.tsx          # cell detail card + metric explainers (mouse/keyboard/touch)
├── hooks/
│   ├── useDeriveChain.ts     # 15s poll: spot ∥ instruments → per-expiry tickers (abortable, in-flight guarded)
│   └── useDeribitMarks.ts    # cross-venue fair values (BTC/ETH inverse, SOL/HYPE/XRP linear; browser-direct)
├── utils/
│   ├── optionsMath.ts        # pure quant core (greeks, prob, fees, scoring)
│   ├── optionsMath.test.ts   # vitest
│   └── instruments.ts        # instrument-name parsing, display labels, Derive deep link
├── config/
│   ├── assets.ts             # bootstrap symbols + live-price display config
│   └── constants.ts          # poll cadence, filter bands, score gate
├── types.ts                  # typed upstream API shapes + view models
└── e2e/                      # fixture-driven Playwright smoke tests
```

**Render-performance invariant:** every prop below the orchestrator is
identity-stable (`useCallback`/`useMemo`). Hover/pin state lives only at the
root, so moving the mouse re-renders one floating tooltip, not ~140 cells.

## Data flow — one 15-second tick

The server proxies use `https://api.derive.xyz/v3`. The instruments route filters
`public/get_all_live_instruments` to the selected currency's option names; the
spot route maps the slim ticker's `M` field to the browser's `mark_price` field.
Bulk option tickers retain their slim schema. The old Lyra endpoint can return
empty option chains even when individual contracts still have prices.
See [Derive's migration notes](https://docs.derive.xyz/migrating/breaking-changes).
Adapter regression tests live in `frontend/app/api/derive/routes.test.ts`.

1. **Fetch** — spot ∥ instrument list in parallel (`Promise.allSettled`), then
   every expiry's ticker chain concurrently. Every request carries an
   `AbortSignal`; a per-effect in-flight guard prevents overlapping ticks.
2. **Ingest + guard** — reject rows without a mark, a forward, or an IV (a
   zero-IV row would otherwise surface as a P(ex)=0 "risk-free" trade). Compute
   exact time-to-expiry; greeks / P(ex)=N(±d2) / expected ITM payoff on the forward.
3. **Filter** — DTE > 7d · within ±40% of the live reference price · OTM side only ·
   Market mode requires a live bid · fee-net APR ∈ (5%, 300%] · P(ex) ≤ cap.
4. **Ladder search** — calls and puts searched separately (no shared top-N cut);
   per-expiry pools sample strikes evenly across the eligible range (not the N
   nearest the money) plus a per-type top-APR pool, 1–5 legs,
   deduped once across passes; each candidate scored.
5. **Rank + gate** — if ≥2 candidates are fully covered by Deribit fair values,
   only those are ranked (edge mode). One min-max normalization over the pool;
   masked/flat factors drop and weights renormalize. Highlight only if
   `poolSize > 1`, `score ≥ 5.0` **and** the pick is not −EV vs Deribit.
6. **Render** — heat cells, two ladder cards, explicit loading / error-retry /
   stale-data states.

## Scoring model — decisions & provenance

- **Black-76 on Derive's forward, r = 0.** The underlying is `option_pricing.f`,
  so d1/d2 need no rate term; the only simplification is the missing `e^{-rT}`
  discount (~0.4%/month at 5%). Φ(x) is A&S 7.1.26 (|ε| < 1.5e-7), unit-tested
  against known values.
- **Fees are Derive V3's live schedule.** Every option instrument returned by
  `public/get_all_instruments` on 2026-10-19 carried `base_fee 0.5`,
  `maker_fee_rate 0.0001`, `taker_fee_rate 0.0003`, `mark_price_fee_rate_cap 0.125`.
  Per contract: rate × **index** price, that notional part capped at 12.5% of the
  option value; takers add a $0.50 base fee **per order**, amortised over the
  contracts input. MARK defaults to maker (a resting quote at ~mark); MARKET is
  forced to taker, because selling into the bid is a taker fill.
- **EV is only scored against an independent fair value — a Deribit mark.**
  Derive's own model value (`tailLoss`) is priced off Derive's mark IV and
  forward, so it ≈ the mark: EV vs it is ≈ −fee under MARK and −spread−fee under
  MARKET, by construction. A live Derive bid is therefore NOT independent (an
  earlier version unmasked it and ranked a guaranteed-negative execution cost at
  30%). EV and the edge ratio unmask only when every leg has a Deribit mark
  (BTC/ETH inverse; SOL/HYPE/XRP USDC-linear).
- **Ranking factors: EV, edge, premium/day, diversification.** Edge = EV ÷ net
  premium, which is exactly the binary Kelly fraction 1 − E[payoff]/W (the old
  Kelly subtracted P(ex) twice and was identically 0). Risk/Return = EV ÷ expected
  payoff is monotone in edge, so it is displayed, not double-counted. Same-expiry
  skew is displayed, not ranked: every OTM strike on a convex smile reads "rich",
  so it measured smile shape, not mispricing.
- **Three verdicts.** `+EV vs Deribit` (highlighted), `−EV vs Deribit` (shown,
  never highlighted, however well it ranks), `Yield pick` (no fair value: the
  best net premium/day inside the P(ex) cap — no edge claim). Note that
  without a fair value every yield metric is compensation for risk; the P(ex)
  cap is the user's risk choice.
- **Pool-relative scores are non-stationary by design.** The 0–10 score is a
  min-max rank within the current candidate pool; it answers "best available
  now," not an absolute quality, and can shift tick-to-tick.
- **P(any exercise) is a lower bound for cross-expiry ladders.** `max(pex)` is
  exact only within one expiry; multi-expiry ladders show it prefixed with "≥".
- **"~30d ATM IV" is a same-snapshot estimate** (per-expiry ATM straddle IVs
  interpolated in total variance), not a historical DVOL series; there is no IV-rank.

## API & security surface

Serverless GET routes adapt Derive v3 (`api.derive.xyz/v3`). The PERP ticker
adapter also passes the index price (`I`) through as `index_price` when valid —
spot, fee notional and covered-call collateral use the index, falling back to
the PERP mark. Params are allow-list validated
(`^[A-Z0-9]{1,10}$`, `^\d{8}$`, `^…-PERP$`); the upstream body is built
server-side, so client input never reaches the upstream URL. Responses carry
`Cache-Control: public, s-maxage=15, stale-while-revalidate=45`, so all
concurrent users share one upstream call per URL per window. Upstream transport
failures and JSON-RPC error bodies (which Derive returns as HTTP 200) both map to
uncached 502s. Security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy,
Permissions-Policy) are set in `next.config.mjs`. Deribit is fetched directly
from the browser (CORS-open), keeping its rate limit on each user's IP.

## Deploy

The Vercel project is GitHub-connected: PRs produce previews and merges to `main` deploy production. The legacy `scripts/deploy.sh` gates a manual
`vercel --prod` on a clean tree that is on `main`, in sync with origin, and
CI-green, so what ships is always a reviewed commit. GitHub Actions runs
lint · typecheck · unit tests (coverage) · build · fixture-driven e2e on every
PR, plus a Docker build.


## Live options market discovery

`GET /api/derive/markets` adapts the v3 live instrument list into deduplicated option
underlyings, contract counts and expiry counts. It validates names and dates, excludes
expired contracts and ignores spot/perp-only assets. The browser refreshes every five
minutes with a bounded request timeout, keeps the previous list on failure, and exposes
status plus retry. A successful empty list is treated as authoritative. Stored selections
are restored for dynamically discovered symbols; a removed selection shows a clear
no-active-options state. Unknown assets use generic display configuration from live
prices. The last-verified bootstrap list is only an outage fallback.

The matrix uses a ±40% strike band, with the live perp reference or the option forward
when unavailable; synthetic fallback prices have been removed. Small-token strikes,
premiums and fees use adaptive decimal formatting. Market-mode labels explicitly note
that best bids do not establish executable size.
