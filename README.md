# Option Strategist — Derive Covered-Call & CSP Yields

A cryptocurrency **options yield strategist** for sellers. It pulls live option chains from
**Derive (v3 API)**, ranks **covered-call** and **cash-secured-put** ladders with a
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

The selector discovers active option underlyings from Derive v3 on page load and every
five minutes. As verified on **26 September 2026**, the 12 markets are:

| Majors | Alts | Other |
|--------|------|-------|
| BTC · ETH · SOL | HYPE · XRP · ADA · ZEC · VVV · LIT · PUMP | XAUT · CC |

The `/api/derive/markets` route derives symbols and contract/expiry counts from
`POST https://api.derive.xyz/v3/public/get_all_live_instruments {}`. Expired contracts,
spot tokens and perpetual-only markets do not appear. New option underlyings appear
without redeployment; the selector shows discovery status and a retry action on failure.
During an outage it retains the last retrieved list (or the 12-market bootstrap list).
Successful discovery is authoritative, including when a market has been delisted.

Display configuration is generated from live prices in `frontend/config/assets.ts`:
strikes are filtered to ±40% of the live spot reference (option forward if spot is
unavailable), and decimal precision scales to the token price. No placeholder spot
price is used. PUMP strikes, premiums and fees retain sub-cent precision throughout
the matrix and detail cards. Deribit overlays remain limited to BTC/ETH.

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
│       └── */route.ts              # validated, edge-cached Derive v3 adapters (GET)
├── components/
│   ├── DeriveAssetYields.tsx       # orchestrator (state + derived data)
│   ├── YieldMatrix.tsx             # strike×expiry heat-map tables
│   ├── MatrixCell.tsx              # memoized cell (hover is O(1), not O(cells))
│   ├── StrategyPanel.tsx           # ladder cards + position sizing + Derive links
│   ├── ControlBar.tsx              # feed status, filters, fee role, contracts
│   └── Tooltips.tsx                # cell/metric tooltips (mouse/keyboard/touch)
├── hooks/
│   ├── useDeriveChain.ts           # 15s poll: spot ∥ instruments → tickers (abortable)
│   ├── useDeribitMarks.ts          # cross-venue reference prices
│   └── useOptionMarkets.ts         # live option market discovery every 5 minutes
├── utils/
│   ├── optionsMath.ts              # BS greeks, prob/EV, fees, ATM IV, ladder scorer
│   ├── optionsMath.test.ts         # vitest unit tests (CDF, parity, fees, risk, ranking)
│   └── instruments.ts              # instrument parsing, labels, Derive deep link
├── config/
│   ├── assets.ts                   # bootstrap symbols + live-price display config
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

**Deploying:** Vercel is connected to GitHub. Pull requests create preview deployments;
merging a reviewed, CI-green PR to `main` updates production. Verify the production
market list and option chains after deployment. `scripts/deploy.sh` is retained only
for the legacy manual CLI deployment workflow.

---

## ⚠️ Disclaimer

For educational and research purposes only — **nothing here is financial advice**. Options
trading involves significant risk. The analytics are model estimates (Black-Scholes on
Derive's forward, `r = 0`, taker-fee model per 1 contract); always verify against the venue
before committing capital.
