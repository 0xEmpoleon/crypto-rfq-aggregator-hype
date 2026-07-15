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
  annualized yield (**APR, net of estimated fees**) with probability-of-exercise, priced
  from Derive marks or live bids.
- **Strategy recommendations** — an automated finder builds 1–5 leg CC/CSP ladders and ranks
  them in one shared scoring pass on expected value, risk/return, same-expiry skew (vol
  edge), premium decay and diversification ([`utils/optionsMath.ts`](frontend/utils/optionsMath.ts)).
- **Position sizing** — a contracts input scales each ladder into dollar totals: capital
  required, net premium kept, and max loss. Every leg has a copyable instrument name and a
  deep link to the Derive trade ticket.
- **Greeks & risk** — Black-Scholes delta/gamma/theta/vega, prob-of-exercise, expected ITM
  payoff, and an estimated ~30-day ATM IV via variance interpolation.
- **Fee-aware yields** — role-aware Derive fees (Maker 0.03% no base, or Taker $0.50 + 0.04%,
  both capped at 12.5% of the option value) are subtracted from every APR, EV and premium/day.
- **Deribit reference** — for BTC/ETH, Deribit prices are overlaid on the matrix (▲ richer /
  ▼ cheaper) **and** used as an independent fair value that unmasks the EV ranking factor.
- **Honest price modes** — MARK uses venue marks; **Market** uses live best bids only and
  excludes strikes with no resting bid instead of inventing a price.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the data flow and the rationale behind
the modeling choices (fee provenance, symmetric risk severity, EV masking, the P(any-ex) bound).

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
│   ├── layout.tsx                  # metadata, self-hosted font, pre-paint theme script
│   ├── error.tsx                   # App Router error boundary
│   └── api/derive/
│       ├── _upstream.ts            # shared validation, edge cache, error mapping
│       └── */route.ts              # validated, edge-cached Lyra proxies (GET)
├── components/
│   ├── DeriveAssetYields.tsx       # orchestrator (state + derived data)
│   ├── YieldMatrix.tsx             # strike×expiry heat-map tables
│   ├── MatrixCell.tsx              # memoized cell (hover is O(1), not O(cells))
│   ├── StrategyPanel.tsx           # ladder cards + position sizing + Derive links
│   ├── ControlBar.tsx              # feed status, filters, fee role, contracts
│   └── Tooltips.tsx                # cell/metric tooltips (mouse/keyboard/touch)
├── hooks/
│   ├── useDeriveChain.ts           # 15s poll: spot ∥ instruments → tickers (abortable)
│   └── useDeribitMarks.ts          # cross-venue reference prices
├── utils/
│   ├── optionsMath.ts              # BS greeks, prob/EV, fees, ATM IV, ladder scorer
│   ├── optionsMath.test.ts         # vitest unit tests (CDF, parity, fees, risk, ranking)
│   └── instruments.ts              # instrument parsing, labels, Derive deep link
├── config/
│   ├── assets.ts                   # ⭐ asset registry (single source of truth)
│   └── constants.ts                # poll cadence, filter bands, thresholds
├── types.ts                        # typed upstream API shapes + view models
└── e2e/                            # fixture-driven Playwright smoke tests
```

Full data-flow and modeling rationale: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 🚀 Quick start

Node 20 (see `frontend/.nvmrc`).

```bash
./start_locally.sh          # or: cd frontend && npm ci && npm run dev
```

```bash
cd frontend
npm test                    # unit tests (options math)
npm run test:coverage       # + coverage report
npm run test:e2e            # Playwright smoke suite (fixture-driven, no live API)
npm run typecheck           # tsc --noEmit
npm run build               # production build
```

CI (GitHub Actions) runs lint · typecheck · unit tests · build · e2e on every PR,
plus a Docker build. Docker (optional): `docker build -t option-strategist frontend/`
then `docker run -p 3000:3000 option-strategist`.

**Deploying:** the Vercel project is *not* git-connected, so a deploy ships the local
working tree. Use the guarded wrapper, which refuses to deploy a tree that isn't clean,
on `main`, in sync with origin, and CI-green:

```bash
./scripts/deploy.sh
```

---

## ⚠️ Disclaimer

For educational and research purposes only — **nothing here is financial advice**. Options
trading involves significant risk. The analytics are model estimates (Black-Scholes on
Derive's forward, `r = 0`, taker-fee model per 1 contract); always verify against the venue
before committing capital.
