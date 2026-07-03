# 🦅 Hype Options RFQ Aggregator

A cryptocurrency **options yield strategist** for sellers. It pulls live option chains from
**Derive (Lyra v2)**, ranks **covered-call** and **cash-secured-put** ladders with a
Black-Scholes analytics engine, and overlays **Deribit** marks as a cross-venue price
reference for BTC/ETH.

> **Live app:** [crypto-rfq-aggregator-hype.vercel.app](https://crypto-rfq-aggregator-hype.vercel.app)

---

## ✨ What it does

- **Covered Yield Matrix** — every liquid strike/expiry for the selected asset, colored by
  annualized yield (APY) with probability-of-exercise, priced from Derive marks.
- **Strategy recommendations** — an automated finder builds 1–5 leg CC/CSP ladders and scores
  them on expected value, risk/return, skew (vol edge), theta and diversification
  ([`utils/optionsMath.ts`](frontend/utils/optionsMath.ts)).
- **Greeks & risk** — Black-Scholes delta/gamma/theta/vega, prob-of-exercise, expected ITM
  payoff, and an estimated 30-day DVOL via variance interpolation.
- **Deribit reference** — for BTC/ETH, Deribit marks are overlaid on the matrix to flag where
  Derive premium is richer/cheaper.

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

Nothing else needs to change — `page.tsx` and `DeriveAssetYields.tsx` read the registry.

> Note: many tokens are *listed* on Derive as perps/spot but have **no live options** (DOGE,
> AVAX, LINK, BNB, SUI, PEPE, …). Those would render an empty matrix and are intentionally excluded.

---

## 🏗️ Architecture

The **deployed product is the Next.js `frontend/`** (Vercel, root dir `frontend`). It talks
directly to Derive/Deribit:

```text
frontend/
├── app/
│   ├── page.tsx                     # dashboard shell + asset switcher
│   └── api/derive/{instruments,tickers,ticker}/route.ts   # thin Lyra proxies
├── components/DeriveAssetYields.tsx # the whole live app (matrix + recommendations)
├── utils/optionsMath.ts             # BS greeks, prob/EV, DVOL, strategy scorer
└── config/assets.ts                 # ⭐ asset registry (single source of truth)
```

The `backend/` FastAPI service is **experimental / local-only** — it is not deployed and the
live frontend does not depend on it. Treat it as a work-in-progress aggregation service, not a
production dependency.

---

## 🚀 Quick start

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

The optional local backend can be started with `./start_locally.sh` (requires Python 3.9+).

---

## ⚠️ Disclaimer

For educational and research purposes only. Options trading involves significant risk. The
analytics are model estimates (Black-Scholes, `r = 0`); always verify against the venue before
committing capital.
