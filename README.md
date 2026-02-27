# 🦅 Hype Options RFQ Aggregator (Improved)

A professional-grade cryptocurrency options RFQ (Request for Quote) aggregator and strategist. This project aggregates live liquidity from **Deribit** and **Derive**, identifies arbitrage and volatility skew opportunities, and enriches them with advanced risk metrics like **Gamma Impact**.

---

## ✨ Key Features

### 📡 Real-time RFQ Aggregation
- **Multi-Venue Support:** Streams live quotes from Deribit (Centralized) and Derive (Decentralized).
- **Unified Orderbook:** Normalized data schema for cross-venue comparison.
- **WebSocket Streaming:** Low-latency updates pushed directly to the frontend.

### 🧠 Advanced Analytics Engine
- **Gamma Risk Metric (GEX):** Every trade suggestion calculates the Delta-equivalent Gamma impact (1% move sensitivity) using Black-Scholes modeling.
- **IV Surface logic:** Built-in support for processing volatility surfaces and identifying mispriced strikes across the term structure.
- **Automated Strategy Finder:** Flags high-edge opportunities like IV Arbitrage, Volatility Skew, and "VRP" (Volatility Risk Premium) harvests.

### 🎨 Institutional Dashboard
- **Pro Insights:** Integrated workflows and institutional research links directly in the trade review flow.
- **Reasoning Engine:** Explains *why* a trade is suggested (e.g., "Deribit IV > Derive IV by 5%").
- **Execution Simulator:** "One-click" review and execution flow for simulated order routing.

---

## 🚀 Quick Start (Local Hosting)

I've included a one-click startup script to launch both the backend and frontend simultaneously.

### Prerequisites
- Python 3.9+
- Node.js & npm (installed via NVM is recommended)

### Launching the System
```bash
cd rfq-aggregator-hype
chmod +x start_locally.sh
./start_locally.sh
```

- **Frontend Dashboard:** [http://localhost:3000](http://localhost:3000)
- **FastAPI Backend:** [http://localhost:8001](http://localhost:8001)

---

## 🛠️ Project Structure

```text
├── backend/
│   ├── lib/              # core math (risk_logic.py, iv_logic.py)
│   ├── engine/           # trade analysis and signal generation
│   ├── ml_engine/        # strategy recommendation logic
│   ├── models/           # Pydantic data schemas
│   └── main.py           # FastAPI entry point
├── frontend/
│   ├── components/       # React/Next.js UI components
│   ├── hooks/            # WebSocket and data fetching hooks
│   └── app/              # Next.js App Router pages
└── start_locally.sh      # Unified startup script
```

---

## 🏦 Pro Analysis Integration

This aggregator is compatible with the **Institutional Workflow Tools** (`pro_analysis.py`). Use these tools to perform deep-dive benchmarking, DCF modeling, and volatility curve fitting on the data captured by this aggregator.

---

## ⚠️ Disclaimer
*This software is for educational and research purposes only. Trading options involves significant risk. Always verify your calculations before committing real capital.*
