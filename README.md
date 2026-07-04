# Option Strategist — Derive Covered-Call & CSP Yields

A cryptocurrency **options yield strategist** for sellers. It pulls live option chains from
**Derive (Lyra v2)**, ranks **covered-call** and **cash-secured-put** ladders with a
Black-Scholes analytics engine, and overlays **Deribit** prices as a cross-venue reference
for BTC/ETH.

> **Live app:** [crypto-rfq-aggregator-hype.vercel.app](https://crypto-rfq-aggregator-hype.vercel.app)
> *(the domain is a historical artifact — there is no RFQ functionality here)*

---

## ✨ What it does

- **Covered Yield Matrix** — every liquid strike/expiry for the selected asset, colored by
  annualized yield (**APR, net of estimated taker fees**) with probability-of-exercise,
  priced from Derive marks or live bids.
- **Strategy recommendations** — an automated finder builds 1–5 leg CC/CSP ladders and ranks
  them in one shared scoring pass on expected value, risk/return, same-expiry skew (vol
  edge), premium decay and diversification ([`utils/optionsMath.ts`](frontend/utils/optionsMath.ts)).
- **Greeks & risk** — Black-Scholes delta/gamma/theta/vega, prob-of-exercise, expected ITM
  payoff, and an estimated 30-day ATM IV via variance interpolation.
- **Fee-aware yields** — Derive taker fees ($0.50 + 0.04% of notional, capped at 12.5% of the
  option value) are subtracted from every APR, EV and premium/day figure.
- **Deribit reference** — for BTC/ETH, Deribit prices are overlaid on the matrix to flag where
  Derive premium is richer/cheaper.
- **Honest price modes** — MARK uses venue marks; **Market** uses live best bids only and
  excludes strikes with no resting bid instead of inventing a price.

---

## 🪙 Supported assets

All assets with a **live option market on Derive** are supported:

| Majors | Alts | Other |
|--------|------|-------|
| BTC · ETH · SOL | HYPE · XRP · ADA · ZEC | XAUT (tokenized gold) · CC |

**Adding a coin is a one-line change.** Every per-asset knob (display symbol, strike window,
price decimals, Deribit-arb flag, spot fallback) lives in a single registry:
[`frontend/config/assets.ts`](frontend/config/assets.ts). To add a coin:

1. Confirm Derive lists options for it:
   `POST https://api.lyra.finance/public/get_instruments {"currency":"<SYM>","instrument_type":"option","expired":false}`
   should return instruments, and `<SYM>-PERP` should return a mark price.
2. Add one row to `ASSET_CONFIG` (and the symbol to the `ASSETS` array).

> Note: many tokens are *listed* on Derive as perps/spot but have **no live options** (DOGE,
> AVAX, LINK, BNB, SUI, PEPE, …). Those would render an empty matrix and are intentionally excluded.

---

## 🏗️ Architecture

A single Next.js app (deployed on Vercel, root dir `frontend`). Derive is reached through
validated, edge-cached API-route proxies; Deribit's CORS-open API is fetched directly from
the browser.

```text
frontend/
├── app/
│   ├── page.tsx                    # dashboard shell + asset switcher
│   └── api/derive/*/route.ts       # validated, edge-cached Lyra proxies (GET)
├── components/
│   ├── DeriveAssetYields.tsx       # orchestrator (state + derived data)
│   ├── YieldMatrix.tsx             # strike×expiry heat-map tables
│   ├── MatrixCell.tsx              # memoized cell (hover is O(1), not O(cells))
│   ├── StrategyPanel.tsx           # ladder recommendation cards
│   ├── ControlBar.tsx              # feed status + filters
│   └── Tooltips.tsx                # cell/metric tooltips
├── hooks/
│   ├── useDeriveChain.ts           # 15s poll: spot ∥ instruments → tickers (abortable)
│   └── useDeribitMarks.ts          # cross-venue reference prices
├── utils/
│   ├── optionsMath.ts              # BS greeks, prob/EV, fees, ATM IV, ladder scorer
│   ├── optionsMath.test.ts         # vitest unit tests (CDF, parity, fees, ranking)
│   └── instruments.ts              # instrument parsing + display helpers
└── config/
    ├── assets.ts                   # ⭐ asset registry (single source of truth)
    └── constants.ts                # poll cadence, filter bands, thresholds
```

---

## 🚀 Quick start

```bash
./start_locally.sh          # or: cd frontend && npm ci && npm run dev
```

```bash
cd frontend
npm test                    # unit tests (options math)
npm run typecheck           # tsc --noEmit
npm run build               # production build
```

Docker (optional): `docker build -t option-strategist frontend/` then
`docker run -p 3000:3000 option-strategist`.

**Deploying:** the Vercel project is *not* git-connected. Deploy from the repo root with
`vercel --prod` (project root directory is configured as `frontend`).

---

## ⚠️ Disclaimer

For educational and research purposes only — **nothing here is financial advice**. Options
trading involves significant risk. The analytics are model estimates (Black-Scholes on
Derive's forward, `r = 0`, taker-fee model per 1 contract); always verify against the venue
before committing capital.
