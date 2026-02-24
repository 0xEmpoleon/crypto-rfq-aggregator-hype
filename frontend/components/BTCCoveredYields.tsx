"use client";
import React, { useState, useEffect, useMemo } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   BTCCoveredYields — Derive.xyz Inspired Design
   
   Color: dark slate bg, green/yellow accents for APR heat
   Font: Inter with tabular-nums for data alignment
   Layout: tight rows, collapsed borders, 1px slate-800 dividers
   ═══════════════════════════════════════════════════════════════════ */

interface ParsedOption { instrument: string; strike: number; expiry: string; expiryTs: number; type: 'C' | 'P'; markPrice: number; markIv: number; futuresPrice: number; dte: number; }
interface CellData { apy: number; markIv: number; markPrice: number; futuresPrice: number; dte: number; premiumUsd: number; probExercise: number; greeks: { delta: number; gamma: number; theta: number; vega: number; }; }
interface SuggestedTrade { instrument: string; type: 'Put' | 'Call'; strike: number; expiry: string; dte: number; apy: number; markIv: number; futuresPrice: number; probExercise: number; premiumUsd: number; moneyness: number; }
type Status = 'ok' | 'err' | 'load';

function normCdf(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1; const t = 1 / (1 + p * Math.abs(x));
    return 0.5 * (1 + sign * (1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2)));
}

function pEx(S: number, K: number, T: number, s: number, type: 'C' | 'P', r: number = 0): number {
    if (T <= 0 || s <= 0) return 0;
    const d2 = (Math.log(S / K) + (r - 0.5 * s * s) * T) / (s * Math.sqrt(T));
    return type === 'C' ? normCdf(d2) : normCdf(-d2);
}

function bsGreeks(S: number, K: number, T: number, sigma: number, type: 'C' | 'P', r: number = 0) {
    if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 };
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    const normPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    const Nd1 = normCdf(d1);
    const nPdfd1 = normPdf(d1);
    const ert = Math.exp(-r * T);

    const delta = type === 'C' ? Nd1 : Nd1 - 1;
    const gamma = nPdfd1 / (S * sigma * sqrtT);
    const vega = S * nPdfd1 * sqrtT / 100; // per 1% change in IV
    const term1 = -(S * sigma * nPdfd1) / (2 * sqrtT);
    let theta = type === 'C' ? term1 - r * K * ert * normCdf(d2) : term1 + r * K * ert * normCdf(-d2);
    theta = theta / 365; // per day

    return { delta, gamma, theta, vega };
}
function parseInst(n: string) { const p = n.split('-'); return p.length === 4 ? { expiry: p[1], strike: +p[2], type: p[3] as 'C' | 'P' } : null; }
function expiryToDate(e: string): Date {
    const M: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
    return new Date(Date.UTC(2000 + +e.slice(5), M[e.slice(2, 5)] ?? 0, +e.slice(0, 2), 8));
}
const putApy = (mp: number, fp: number, k: number, d: number, r: number = 0) => d > 0 && k > 0 ? ((mp * fp / k) * (365 / d) * 100) + (r * 100) : 0;
const callApy = (mp: number, d: number) => d > 0 ? mp * (365 / d) * 100 : 0;

/* ═══════════════════════════════════════════════════════════════════
   SCORING ENGINE — 6-Factor Ladder Optimizer
   
   1. Expected Value (30%)       — risk-adjusted P&L
   2. Volatility Edge (20%)      — mark IV vs DVOL
   3. Risk-Return Ratio (20%)    — EV / conditional tail risk
   4. Theta Efficiency (15%)     — premium per day
   5. Kelly Fraction (10%)       — optimal sizing signal
   6. Strike Diversification (5%)— wider = more defensive
   ═══════════════════════════════════════════════════════════════════ */

interface ScoredLadder {
    legs: SuggestedTrade[];
    score: number;          // 0–10 composite
    ev: number;             // expected value (USD)
    evAnnual: number;       // annualized EV
    volEdge: number;        // mean (markIV - DVOL) / DVOL
    thetaEff: number;       // premium per day
    riskReturn: number;     // EV / risk
    kelly: number;          // Kelly fraction
    diversification: number;// strike spread / futures
    probAllOTM: number;     // P(all legs expire worthless)
    totalPrem: number;
    avgApy: number;
    topFactor: string;      // human-readable top contributor
}

/* Conditional tail loss — expected loss given assignment (Black-Scholes) */
function conditionalTailLoss(S: number, K: number, T: number, sigma: number, type: 'C' | 'P', r: number = 0): number {
    if (T <= 0 || sigma <= 0) return 0;
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    const ert = Math.exp(-r * T);

    if (type === 'P') {
        const Nd2 = normCdf(-d2);
        if (Nd2 < 1e-10) return 0;
        return Math.max(0, K * ert * Nd2 - S * normCdf(-d1));
    } else {
        const Nd2 = normCdf(d2);
        if (Nd2 < 1e-10) return 0;
        return Math.max(0, S * normCdf(d1) - K * ert * Nd2);
    }
}

/* Score a ladder combination — mixed-expiry safe (uses per-leg dte/fp) */
function scoreLadder(legs: SuggestedTrade[], dvolVal: number | null, r: number = 0): Omit<ScoredLadder, 'topFactor'> & { factors: number[] } {
    const n = legs.length;
    const dv = dvolVal || 57;

    let totalEv = 0, totalRisk = 0, totalPrem = 0, totalApy = 0, volEdgeSum = 0, thetaSum = 0;

    for (const l of legs) {
        const sigma = l.markIv / 100;
        const T = l.dte / 365;
        const pITM = l.probExercise;
        const r_leg = l.type === 'Put' ? r : 0;
        const tailLoss = conditionalTailLoss(l.futuresPrice, l.strike, T, sigma, l.type === 'Call' ? 'C' : 'P', r_leg);
        const ev = l.premiumUsd * (1 - pITM) - tailLoss * pITM;
        const maxLoss = l.type === 'Put' ? Math.max(0, tailLoss) : l.futuresPrice * sigma * 2 * Math.sqrt(T);
        totalEv += ev;
        totalRisk += pITM * maxLoss;
        totalPrem += l.premiumUsd;
        totalApy += l.apy;
        volEdgeSum += (l.markIv - dv) / Math.max(dv, 1);
        thetaSum += l.premiumUsd / l.dte;
    }

    const avgDte = legs.reduce((s, l) => s + l.dte, 0) / n;
    const fp0 = legs[0].futuresPrice;
    const avgApy = totalApy / n;
    const evAnnual = totalEv * (365 / avgDte);
    const volEdge = volEdgeSum / n;
    const thetaEff = thetaSum;                            // sum of per-leg θ
    const riskReturn = totalRisk > 0 ? totalEv / totalRisk : 0;
    const maxPex = Math.max(...legs.map(l => l.probExercise));
    const probAllOTM = 1 - maxPex;
    const avgLoss = totalRisk / Math.max(maxPex, 0.01);
    const kelly = totalPrem > 0 ? Math.max(0, probAllOTM - maxPex * avgLoss / totalPrem) : 0;
    const strikes = legs.map(l => l.strike);
    const diversification = (Math.max(...strikes) - Math.min(...strikes)) / fp0;
    const factors = [evAnnual, Math.max(0, volEdge), riskReturn, thetaEff, kelly, diversification];

    return { legs, score: 0, ev: totalEv, evAnnual, volEdge, thetaEff, riskReturn, kelly, diversification, probAllOTM, totalPrem, avgApy, factors };
}

/* Min-max normalize and compute weighted composite */
function rankLadders(candidates: ReturnType<typeof scoreLadder>[]): ScoredLadder[] {
    if (!candidates.length) return [];
    const W = [0.30, 0.20, 0.20, 0.15, 0.10, 0.05]; // EV, volEdge, riskReturn, theta, kelly, div
    const factorNames = ['Expected Value', 'Vol Edge', 'Risk/Return', 'Theta', 'Kelly', 'Diversification'];

    // Min-max normalize each factor
    const nFactors = 6;
    const mins = Array(nFactors).fill(Infinity);
    const maxs = Array(nFactors).fill(-Infinity);
    for (const c of candidates) {
        for (let i = 0; i < nFactors; i++) {
            mins[i] = Math.min(mins[i], c.factors[i]);
            maxs[i] = Math.max(maxs[i], c.factors[i]);
        }
    }

    return candidates.map(c => {
        let score = 0;
        let topContrib = 0;
        let topIdx = 0;
        for (let i = 0; i < nFactors; i++) {
            const range = maxs[i] - mins[i];
            const norm = range > 1e-10 ? (c.factors[i] - mins[i]) / range : 0.5;
            const contrib = W[i] * norm;
            score += contrib;
            if (contrib > topContrib) { topContrib = contrib; topIdx = i; }
        }
        // Scale to 0-10
        const score10 = Math.min(10, Math.max(0, score * 10));
        const topFactor = factorNames[topIdx];
        return { ...c, score: score10, topFactor };
    }).sort((a, b) => b.score - a.score);
}

/* Generic k-combination generator (without repetition) */
function combinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    return [
        ...combinations(rest, k - 1).map(c => [first, ...c]),
        ...combinations(rest, k),
    ];
}

/* k-combination WITH repetition — same option can appear multiple times in a ladder */
function combinationsWithRep<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const [first, ...rest] = arr;
    return [
        ...combinationsWithRep(arr, k - 1).map(c => [first, ...c]), // allow repeat
        ...combinationsWithRep(rest, k),                              // skip first
    ];
}

/* Combinatorial search: all valid numLegs-strike combos for an expiry */
function buildOptimalLadder(trades: SuggestedTrade[], type: 'Call' | 'Put', dvolVal: number | null, numLegs: number, allowRep: boolean, sofrRate: number = 0): ScoredLadder | null {
    const ofType = trades.filter(t => t.type === type);
    if (!allowRep && ofType.length < numLegs) return null;
    if (allowRep && ofType.length === 0) return null;

    // Deduplicate by strike+expiry
    const unique = new Map<string, SuggestedTrade>();
    for (const t of ofType) {
        const key = `${t.strike}-${t.expiry}`;
        if (!unique.has(key)) unique.set(key, t);
    }
    const all = Array.from(unique.values()).sort((a, b) => b.apy - a.apy);

    const allCandidates: ReturnType<typeof scoreLadder>[] = [];
    const perExpiryCap = allowRep ? Math.min(5, numLegs + 2) : Math.max(8, numLegs + 5);

    // ── Same-expiry combinations ─────────────
    const byExpiry = new Map<string, SuggestedTrade[]>();
    for (const t of all) {
        const arr = byExpiry.get(t.expiry) || [];
        arr.push(t);
        byExpiry.set(t.expiry, arr);
    }
    for (const [, expTrades] of Array.from(byExpiry.entries())) {
        const opts = expTrades.sort((a, b) => type === 'Call' ? a.strike - b.strike : b.strike - a.strike).slice(0, perExpiryCap);
        if (!allowRep && opts.length < numLegs) continue;
        if (allowRep && opts.length === 0) continue;
        const combos = allowRep ? combinationsWithRep(opts, numLegs) : combinations(opts, numLegs);
        for (const combo of combos)
            allCandidates.push(scoreLadder(combo, dvolVal, sofrRate));
    }

    // ── Cross-expiry combinations ────────
    const topCap = allowRep ? 8 : 15;
    const top = all.slice(0, topCap);
    if ((allowRep && top.length > 0) || (!allowRep && top.length >= numLegs)) {
        const seen = new Set<string>();
        const combos = allowRep ? combinationsWithRep(top, numLegs) : combinations(top, numLegs);
        for (const combo of combos) {
            const key = combo.map(x => `${x.strike}-${x.expiry}`).join('|');
            if (!seen.has(key)) { seen.add(key); allCandidates.push(scoreLadder(combo, dvolVal, sofrRate)); }
        }
    }

    if (!allCandidates.length) return null;
    const ranked = rankLadders(allCandidates);
    return ranked[0] || null;
}

/* Hover tooltip — CSS-only, no state, defined once at module level */
const Tip = ({ text, children }: { text: string; children: React.ReactNode }) => (
    <span style={{ position: 'relative', cursor: 'help', borderBottom: '1px dotted var(--text-muted)', color: 'var(--text-secondary)', display: 'inline-block' }} className="tip-wrap">
        {children}
        <span className="tip-popup" style={{
            position: 'absolute', bottom: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)',
            backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-strong)', borderRadius: '4px',
            padding: '4px 8px', fontSize: 'var(--t-meta)', lineHeight: '1.35', color: 'var(--text-primary)',
            width: '200px', textAlign: 'left', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            pointerEvents: 'none', opacity: 0, transition: 'opacity 0.15s', zIndex: 9999, whiteSpace: 'normal',
        }}>{text}</span>
        <style>{`.tip-wrap:hover .tip-popup { opacity: 1 !important; }`}</style>
    </span>
);

/* Derive-style heat color */
function heatColor(apy: number, type: 'P' | 'C', dark: boolean): string {
    const i = Math.min(Math.max(apy, 0), 120) / 120;
    if (dark) {
        return type === 'P'
            ? `rgba(34,197,94,${0.03 + i * 0.22})`
            : `rgba(234,179,8,${0.03 + i * 0.18})`;
    }
    return type === 'P'
        ? `rgba(34,197,94,${0.05 + i * 0.25})`
        : `rgba(234,179,8,${0.05 + i * 0.2})`;
}

export default function BTCCoveredYields({ darkMode }: { darkMode: boolean }) {
    const [hoverTip, setHoverTip] = useState<{ d: any; x: number; y: number } | null>(null);
    const [pinnedTip, setPinnedTip] = useState<{ d: any; x: number; y: number } | null>(null);
    const [pinnedKey, setPinnedKey] = useState<string | null>(null);
    const [spot, setSpot] = useState<{ v: number; c: number; cp: number } | null>(null);
    const [dvol, setDvol] = useState<{ v: number; cp: number } | null>(null);
    const [sofr, setSofr] = useState<{ v: number } | null>(null);
    const [opts, setOpts] = useState<ParsedOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [trades, setTrades] = useState<SuggestedTrade[]>([]);
    const [locked, setLocked] = useState<Set<string>>(new Set());
    const [sugAt, setSugAt] = useState<Date | null>(null);
    const [dataAt, setDataAt] = useState<Date | null>(null);
    const [st, setSt] = useState<{ spot: Status; opt: Status; dvol: Status; sofr: Status }>({ spot: 'load', opt: 'load', dvol: 'load', sofr: 'load' });
    const [maxPexCap, setMaxPexCap] = useState(40); // P(exercise) cap 0–100, default 40%
    const [numLegs, setNumLegs] = useState(0);       // 0 = Auto, 1-5 = fixed
    const [allowRep, setAllowRep] = useState(false); // allow repetitive legs

    // Compute best ladders — memoized; in Auto mode sweeps all leg counts 1–5
    const { computedCall, computedPut } = useMemo(() => {
        if (!trades.length) return { computedCall: null as ScoredLadder | null, computedPut: null as ScoredLadder | null };
        const best = (type: 'Call' | 'Put'): ScoredLadder | null => {
            const rate = type === 'Put' ? (sofr?.v || 0) / 100 : 0;
            if (numLegs === 0) {
                let top: ScoredLadder | null = null;
                for (let n = 1; n <= 5; n++) {
                    const l = buildOptimalLadder(trades, type, dvol?.v || null, n, allowRep, rate);
                    if (l && (!top || l.score > top.score)) top = l;
                }
                return top;
            }
            return buildOptimalLadder(trades, type, dvol?.v || null, numLegs, allowRep, rate);
        };
        return { computedCall: best('Call'), computedPut: best('Put') };
    }, [trades, dvol, numLegs, allowRep, sofr]);

    // Set of keys for options that are currently recommended (used to highlight them in the matrix)
    const recommendedKeys = useMemo(() => {
        const s = new Set<string>();
        const addL = (l: ScoredLadder | null) => {
            if (l && l.score >= 5.0) {
                l.legs.forEach(leg => s.add(`${leg.type === 'Call' ? 'C' : 'P'}-${leg.strike}-${leg.expiry}`));
            }
        };
        addL(computedCall);
        addL(computedPut);
        return s;
    }, [computedCall, computedPut]);

    const tip = pinnedTip || hoverTip;
    const toggleLock = (k: string) => setLocked(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

    // ── Fetch (5s) ────────────────────────────────────────────────
    useEffect(() => {
        const go = async () => {
            const ns = { spot: 'load' as Status, opt: 'load' as Status, dvol: 'load' as Status, sofr: 'load' as Status };
            try { const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'); const d = await r.json(); const v = +d.lastPrice; if (v > 0) { setSpot({ v, c: +d.priceChange, cp: +d.priceChangePercent }); ns.spot = 'ok'; } else ns.spot = 'err'; } catch { ns.spot = 'err'; }
            try { const now = Date.now(); const r = await fetch(`https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&resolution=3600&start_timestamp=${now - 86520000}&end_timestamp=${now}`); const d = await r.json(); if (d.result?.data?.length > 0) { const a = d.result.data; const l = a[a.length - 1][4] ?? a[a.length - 1][1]; const f = a[0][1]; setDvol({ v: l, cp: ((l - f) / f) * 100 }); ns.dvol = 'ok'; } else ns.dvol = 'err'; } catch { ns.dvol = 'err'; }
            try { const r = await fetch('https://markets.newyorkfed.org/api/rates/secured/sofr/last/30.json'); const d = await r.json(); if (d.refRates?.length > 0) { const avg = d.refRates.reduce((s: number, x: any) => s + x.percentRate, 0) / d.refRates.length; setSofr({ v: avg }); ns.sofr = 'ok'; } else ns.sofr = 'err'; } catch { ns.sofr = 'err'; }
            try {
                const r = await fetch('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option');
                const d = await r.json();
                if (!d.result?.length) { ns.opt = 'err'; setLoading(false); setSt(ns); return; }
                ns.opt = 'ok'; const now = Date.now(); const arr: ParsedOption[] = [];
                for (const it of d.result) {
                    const info = parseInst(it.instrument_name); if (!info || it.mark_price <= 0 || it.underlying_price <= 0 || info.strike % 1000 !== 0) continue;
                    const ed = expiryToDate(info.expiry); const dte = Math.max(0, Math.ceil((ed.getTime() - now) / 86400000)); if (dte <= 0) continue;
                    arr.push({ instrument: it.instrument_name, strike: info.strike, expiry: info.expiry, expiryTs: ed.getTime(), type: info.type, markPrice: it.mark_price, markIv: it.mark_iv, futuresPrice: it.underlying_price, dte });
                }
                setOpts(arr); setLoading(false); setDataAt(new Date());
            } catch { ns.opt = 'err'; setLoading(false); }
            setSt(ns);
        };
        go(); const iv = setInterval(go, 15000); return () => clearInterval(iv);
    }, []);

    // ── Suggested trades (60s, DTE ≥ 15) ──────────────────────────
    useEffect(() => {
        if (!opts.length) return;
        const compute = () => {
            const t: SuggestedTrade[] = [];
            for (const o of opts) {
                if (o.dte < 15) continue;
                const r_val = o.type === 'P' ? (sofr?.v || 0) / 100 : 0;
                const apy = o.type === 'P' ? putApy(o.markPrice, o.futuresPrice, o.strike, o.dte, r_val) : callApy(o.markPrice, o.dte);
                if (apy <= 5 || apy > 200) continue;
                const m = o.type === 'C' ? o.strike / o.futuresPrice : o.futuresPrice / o.strike;
                if (m < 1 || m > 1.15) continue;
                const pe = pEx(o.futuresPrice, o.strike, o.dte / 365, o.markIv / 100, o.type, r_val);
                if (pe > maxPexCap / 100) continue; // Only strategies with ≤ maxPexCap% P(exercise)
                t.push({ ...o, apy, type: o.type === 'C' ? 'Call' : 'Put', moneyness: m, probExercise: pe, premiumUsd: o.markPrice * o.futuresPrice });
            }
            t.sort((a, b) => b.apy - a.apy);
            setTrades(t.slice(0, Math.max(15, numLegs * 4))); setSugAt(new Date());
        };
        compute(); const iv = setInterval(compute, 15000); return () => clearInterval(iv);
    }, [opts, maxPexCap, numLegs, sofr]);

    // ── Derived data (DTE ≥ 15) ───────────────────────────────────
    const { exps, putK, callK, cells } = useMemo(() => {
        if (!opts.length) return { exps: [] as any[], putK: [] as number[], callK: [] as number[], cells: {} as Record<string, CellData> };
        const f = opts.filter(o => o.dte >= 15);
        const em = new Map<string, { ts: number; dte: number; fp: number }>();
        for (const o of f) if (!em.has(o.expiry)) em.set(o.expiry, { ts: o.expiryTs, dte: o.dte, fp: o.futuresPrice });
        const exps = Array.from(em.entries()).map(([l, d]) => ({ label: l, ...d })).sort((a, b) => a.ts - b.ts);
        const ref = exps[0]?.fp || (spot?.v || 60000);
        const pS = new Set<number>(), cS = new Set<number>();
        for (const o of f) { if (o.type === 'P' && o.strike <= ref) pS.add(o.strike); if (o.type === 'C' && o.strike >= ref) cS.add(o.strike); }
        const putK = Array.from(pS).sort((a, b) => b - a).slice(0, 10);
        const callK = Array.from(cS).sort((a, b) => a - b).slice(0, 10);
        const cells: Record<string, CellData> = {};
        for (const o of f) {
            const k = `${o.type}-${o.strike}-${o.expiry}`;
            const r_val = o.type === 'P' ? (sofr?.v || 0) / 100 : 0;
            cells[k] = {
                apy: o.type === 'P' ? putApy(o.markPrice, o.futuresPrice, o.strike, o.dte, r_val) : callApy(o.markPrice, o.dte),
                markIv: o.markIv,
                markPrice: o.markPrice,
                futuresPrice: o.futuresPrice,
                dte: o.dte,
                premiumUsd: o.markPrice * o.futuresPrice,
                probExercise: pEx(o.futuresPrice, o.strike, o.dte / 365, o.markIv / 100, o.type, r_val),
                greeks: bsGreeks(o.futuresPrice, o.strike, o.dte / 365, o.markIv / 100, o.type, r_val)
            };
        }
        return { exps, putK, callK, cells };
    }, [opts, spot, sofr]);

    /* ── Cell (Derive-style: tabular-nums, tight, subtle heat bg) ── */
    const dataFont: React.CSSProperties = {
        fontFamily: 'var(--font-ui)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 'var(--t-data)',
        lineHeight: '1.3',
        whiteSpace: 'nowrap',
        textAlign: 'center',
    };

    const renderCell = (type: 'P' | 'C', strike: number, exp: { label: string; dte: number }) => {
        const k = `${type}-${strike}-${exp.label}`; const d = cells[k]; const isL = locked.has(k); const isP = pinnedKey === k;

        if (!d) return (
            <td key={k} style={{ ...dataFont, color: 'var(--text-muted)', padding: '4px 6px', borderBottom: '1px solid var(--border-color)' }}>—</td>
        );

        const { apy, probExercise: pe, greeks } = d;
        const excluded = pe > maxPexCap / 100;
        const isRec = recommendedKeys.has(k);
        const bg = isP
            ? 'rgba(37,99,235,0.2)'  /* blue highlight when pinned */
            : isL ? 'rgba(37,99,235,0.1)'
                : excluded ? 'transparent'
                    : isRec ? (type === 'C' ? 'rgba(234,179,8,0.25)' : 'rgba(34,197,94,0.25)')
                        : heatColor(apy, type, darkMode);
        const det = { type: type === 'P' ? 'Put' : 'Call', strike, exp: exp.label, apy: apy.toFixed(1), dte: d.dte, markIv: d.markIv.toFixed(1), markPrice: d.markPrice, futuresPrice: d.futuresPrice, premiumUsd: d.premiumUsd, probExercise: pe, greeks };

        return (
            <td key={k}
                onClick={(e) => { if (pinnedKey === k) { setPinnedKey(null); setPinnedTip(null); } else { setPinnedKey(k); setPinnedTip({ d: det, x: e.clientX, y: e.clientY }); } toggleLock(k); }}
                onMouseEnter={(e) => { if (!pinnedKey) setHoverTip({ d: det, x: e.clientX, y: e.clientY }); }}
                onMouseLeave={() => { if (!pinnedKey) setHoverTip(null); }}
                style={{
                    ...dataFont,
                    backgroundColor: bg,
                    color: excluded ? 'var(--text-muted)' : (isRec ? (type === 'C' ? 'var(--yellow)' : 'var(--green)') : 'var(--text-primary)'),
                    opacity: excluded ? 0.6 : 1,
                    padding: '3px 5px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color)',
                    borderLeft: isP ? '2px solid var(--blue)' : 'none',
                    boxShadow: isRec ? `inset 0 0 0 1.5px ${type === 'C' ? 'var(--yellow)' : 'var(--green)'}` : 'none',
                    position: 'relative',
                    transition: 'background 0.15s, opacity 0.15s',
                }}>
                <span style={{ fontWeight: !excluded && (isRec || apy > 30) ? 700 : 400 }}>{apy.toFixed(1)}%</span>
                <span style={{ fontSize: 'var(--t-micro)', color: isRec ? 'inherit' : 'var(--text-muted)', marginLeft: '2px', opacity: isRec ? 0.8 : 1 }}>{(pe * 100).toFixed(0)}%</span>
                <span style={{ display: 'block', fontSize: 'var(--t-micro)', color: isRec ? 'inherit' : 'var(--text-muted)', opacity: isRec ? 0.8 : 1, lineHeight: '1' }}>{(d.premiumUsd / d.futuresPrice).toFixed(4)}฿</span>
                {(isL || isP) && <span style={{ position: 'absolute', top: 0, right: 1, fontSize: '0.5rem', color: 'var(--blue)' }}>●</span>}
            </td>
        );
    };



    /* Status dot — Derive style (minimal, no label bg) */
    const Dot = ({ s, label }: { s: Status; label: string }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'var(--t-label)', fontWeight: 500, color: 'var(--text-secondary)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: s === 'ok' ? 'var(--green)' : s === 'err' ? 'var(--red)' : 'var(--yellow)', boxShadow: s === 'ok' ? '0 0 4px var(--green)' : 'none' }} />
            {label}
        </span>
    );

    /* ── Table (Derive-style: no cell borders, just row dividers) ── */
    const Table = ({ type, strikes, accentColor, label }: { type: 'C' | 'P'; strikes: number[]; accentColor: string; label: string }) => (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: 'var(--t-label)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-strong)', paddingBottom: '4px', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' }}>
                <span style={{ width: '8px', height: '3px', backgroundColor: accentColor, borderRadius: '1px', display: 'inline-block' }} />
                {label}
            </div>
            <div style={{ overflow: 'auto', flex: '1 1 auto', minHeight: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <th style={{ color: 'var(--text-muted)', textAlign: 'left', padding: '3px 5px', fontSize: 'var(--t-label)', fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', top: 0, left: 0, backgroundColor: 'var(--bg-panel)', zIndex: 2, borderBottom: '1px solid var(--border-strong)' }}>Strike</th>
                        {exps.map(e => <th key={`${type}-h-${e.label}`} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3px 3px', fontSize: 'var(--t-label)', fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: 'var(--bg-panel)', zIndex: 1, borderBottom: '1px solid var(--border-strong)' }}>{e.label}</th>)}
                    </tr></thead>
                    <tbody>
                        {!strikes.length
                            ? <tr><td colSpan={exps.length + 1} style={{ textAlign: 'center', padding: '8px', color: 'var(--text-muted)', fontSize: 'var(--t-label)' }}>{loading ? 'Loading…' : 'No data'}</td></tr>
                            : strikes.map(s => (
                                <tr key={`${type}-${s}`} style={{ transition: 'background 0.1s' }}
                                    onMouseEnter={(e) => { if (!pinnedKey) e.currentTarget.style.background = 'var(--bg-row-hover)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}>
                                    <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', padding: '3px 5px', fontSize: 'var(--t-data)', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: 'var(--bg-panel)', zIndex: 1, borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>${s.toLocaleString()}</td>
                                    {exps.map(e => renderCell(type, s, e))}
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, overflow: 'hidden', gap: '4px', marginTop: '4px' }}>

            {/* Status + metrics bar */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '2px 0', flex: '0 0 auto' }}>
                <Dot s={st.spot} label="Binance" />
                <Dot s={st.opt} label="Deribit" />
                <Dot s={st.dvol} label="DVOL" />
                <Dot s={st.sofr} label="SOFR" />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {spot !== null && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--t-data)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                            BTC <span>${spot.v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 500, color: spot.c >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {spot.c >= 0 ? '↗' : '↘'} {Math.abs(spot.cp).toFixed(2)}%
                            </span>
                        </span>
                    )}
                    {sofr !== null && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--t-data)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                            SOFR <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sofr.v.toFixed(2)}%</span>
                        </span>
                    )}
                    {dvol !== null && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--t-data)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                            DVOL <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{dvol.v.toFixed(1)}</span>
                            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 500, color: dvol.cp >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {dvol.cp >= 0 ? '↗' : '↘'} {Math.abs(dvol.cp).toFixed(1)}%
                            </span>
                        </span>
                    )}
                </div>
            </div>

            {/* Top Yields — 2 multi-leg strategies side-by-side */}
            <div className="neo-panel" style={{ flex: '0 0 auto', marginTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: 'var(--t-title)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                        ⚡ Top Yields
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: 'var(--t-meta)', color: allowRep ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                <input type="checkbox" checked={allowRep} onChange={e => setAllowRep(e.target.checked)} style={{ accentColor: 'var(--blue)', cursor: 'pointer', margin: 0 }} />
                                Repeat legs
                            </label>
                        </div>
                        {/* Legs slider — 0 = Auto */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Legs</span>
                            <input
                                type="range" min={0} max={5} step={1} value={numLegs}
                                onChange={e => setNumLegs(+e.target.value)}
                                style={{ width: '60px', accentColor: 'var(--blue)', cursor: 'pointer', verticalAlign: 'middle' }}
                            />
                            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, minWidth: '28px', textAlign: 'right', color: numLegs === 0 ? 'var(--green)' : 'var(--blue)' }}>{numLegs === 0 ? 'Auto' : numLegs}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>P(ex) cap</span>
                            <input
                                type="range" min={0} max={100} step={1} value={maxPexCap}
                                onChange={e => setMaxPexCap(+e.target.value)}
                                style={{ width: '80px', accentColor: 'var(--blue)', cursor: 'pointer', verticalAlign: 'middle' }}
                            />
                            <span style={{
                                fontSize: 'var(--t-meta)', fontWeight: 700, minWidth: '30px', textAlign: 'right',
                                color: maxPexCap <= 25 ? 'var(--green)' : maxPexCap <= 50 ? 'var(--yellow)' : 'var(--red)'
                            }}>{maxPexCap}%</span>
                        </div>
                        {/* Pulsing live indicator */}
                        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: dataAt ? 'var(--green)' : 'var(--text-muted)', boxShadow: dataAt ? '0 0 4px var(--green)' : 'none' }} />
                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>
                            Data: <span style={{ color: 'var(--text-secondary)' }}>{dataAt ? dataAt.toLocaleTimeString('en-GB', { hour12: false }) : '—'}</span>
                            {' · '}Strategy: <span style={{ color: 'var(--text-secondary)' }}>{sugAt ? sugAt.toLocaleTimeString('en-GB', { hour12: false }) : '—'}</span>
                            {' · '}15s
                        </span>
                    </div>
                </div>
                {!trades.length ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--t-data)' }}>{loading ? 'Loading...' : 'Scanning...'}</div>
                ) : (() => {
                    const callLadder = computedCall;
                    const putLadder = computedPut;
                    // Only show strategies scoring ≥ 5.0
                    const filteredCall = callLadder && callLadder.score >= 5.0 ? callLadder : null;
                    const filteredPut = putLadder && putLadder.score >= 5.0 ? putLadder : null;

                    const LadderCard = ({ ladder, label, isCall }: { ladder: ScoredLadder | null; label: string; isCall: boolean }) => {
                        const accent = isCall ? 'var(--yellow)' : 'var(--green)';
                        if (!ladder) return <div style={{ border: '1px solid var(--border-color)', padding: '6px 8px', backgroundColor: 'var(--bg-card)', borderRadius: '4px', fontSize: 'var(--t-data)', color: 'var(--text-muted)' }}>No {label} available</div>;
                        const { legs, score, ev, evAnnual, volEdge, thetaEff, riskReturn, kelly, probAllOTM, totalPrem, avgApy, topFactor, diversification } = ladder;
                        const probAnyEx = 1 - probAllOTM;
                        const uniqueExpiries = Array.from(new Set(legs.map(l => l.expiry)));
                        const isMixed = uniqueExpiries.length > 1;
                        const expiryLabel = isMixed ? uniqueExpiries.join(' / ') : legs[0].expiry;
                        const avgDte = legs.reduce((s, l) => s + l.dte, 0) / legs.length;
                        const dteLabel = isMixed ? `${Math.min(...legs.map(l => l.dte))}–${Math.max(...legs.map(l => l.dte))}d (avg ${avgDte.toFixed(0)}d)` : `${legs[0].dte}d`;
                        const dir = isCall ? 'below' : 'above';
                        const scoreColor = score >= 7 ? 'var(--green)' : score >= 4 ? 'var(--yellow)' : 'var(--red)';
                        const totalCost = isCall
                            ? (spot?.v || legs[0].futuresPrice) * legs.length
                            : legs.reduce((s, l) => s + l.strike, 0);
                        const netCost = totalCost - totalPrem;
                        // Yield on capital: compute per leg (each leg's own DTE) then average.
                        // For CC: capital per leg = spot price of BTC (1 BTC per leg)
                        // For CSP: capital per leg = strike (cash to secure)
                        const capitalPerLeg = isCall
                            ? (spot?.v || legs[0].futuresPrice)
                            : null; // per-leg for CSP defined below
                        const yieldOnCapital = legs.reduce((sum, l) => {
                            const cap = isCall ? capitalPerLeg! : l.strike;
                            return sum + (cap > 0 ? (l.premiumUsd / cap) * (365 / l.dte) * 100 : 0);
                        }, 0) / legs.length;

                        return (
                            <div style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', borderRadius: '4px', borderLeft: `3px solid ${accent}`, overflow: 'visible' }}>
                                {/* Header with score badge */}
                                <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontWeight: 700, fontSize: 'var(--t-label)', textTransform: 'uppercase', letterSpacing: '0.05em', color: accent }}>{label}</span>
                                            <Tip text={`Composite score (0–10) from 6 factors: Expected Value (30%), Vol Edge (20%), Risk/Return (20%), Theta (15%), Kelly (10%), Diversification (5%). Top factor: ${topFactor}.`}>
                                                <span style={{ fontSize: 'var(--t-micro)', fontWeight: 700, color: scoreColor, backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', padding: '0 4px', borderRadius: '3px', border: `1px solid ${scoreColor}`, borderBottom: 'none' }}>{score.toFixed(1)}</span>
                                            </Tip>
                                        </div>
                                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>{expiryLabel} · {dteLabel} · {legs.length} legs{isMixed ? ' · mixed expiry' : ''} · {topFactor}</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 'var(--t-hero)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1', fontVariantNumeric: 'tabular-nums' }}>{avgApy.toFixed(1)}%</div>
                                        <div style={{ fontSize: 'var(--t-micro)', color: 'var(--text-muted)' }}>avg APR</div>
                                    </div>
                                </div>
                                {/* Legs */}
                                <div style={{ padding: '0 8px 3px', fontSize: 'var(--t-meta)', fontVariantNumeric: 'tabular-nums' }}>
                                    {legs.map((l, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', borderTop: i > 0 ? '1px solid var(--border-color)' : 'none', color: 'var(--text-secondary)' }}>
                                            <span>Sell {isCall ? 'CC' : 'CSP'} <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>${l.strike.toLocaleString()}</span>{isMixed ? <span style={{ color: 'var(--text-muted)', fontSize: 'var(--t-micro)', marginLeft: '3px' }}>{l.expiry}</span> : null}</span>
                                            <span>${(l.premiumUsd / legs.length).toFixed(0)} · {(l.premiumUsd / l.futuresPrice / legs.length).toFixed(4)} BTC · {l.apy.toFixed(0)}% · P(ex) {(l.probExercise * 100).toFixed(0)}%</span>
                                        </div>
                                    ))}
                                </div>
                                {/* Cost + Explainer with hover callouts (Scaled to exactly 1 BTC total notional) */}
                                <div style={{ padding: '4px 8px', borderTop: '1px solid var(--border-color)', fontSize: 'var(--t-meta)', color: 'var(--text-muted)', backgroundColor: darkMode ? 'rgba(15,23,42,0.5)' : 'rgba(241,245,249,0.5)', lineHeight: '1.45' }}>
                                    {(() => {
                                        // Scale all costs to 1 BTC total notional (so 1/N BTC per leg)
                                        const scaledTotalCost = isCall
                                            ? (spot?.v || legs[0].futuresPrice)
                                            : legs.reduce((s, l) => s + l.strike, 0) / legs.length;
                                        const scaledTotalPrem = totalPrem / legs.length;
                                        const scaledNetCost = scaledTotalCost - scaledTotalPrem;
                                        const pctPerLeg = (100 / legs.length).toFixed(1);
                                        return <><span style={{ color: 'var(--text-secondary)' }}>Capital req (1 BTC):</span> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${scaledTotalCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span> <span style={{ color: 'var(--text-muted)', fontSize: 'var(--t-micro)' }}>({pctPerLeg}%/leg)</span> − ${scaledTotalPrem.toFixed(0)} prem = <span style={{ fontWeight: 600 }}>${scaledNetCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span> net · <span style={{ color: accent, fontWeight: 600 }}>{yieldOnCapital.toFixed(1)}% yield</span></>;
                                    })()}
                                    <br />
                                    <Tip text="Expected Value: risk-adjusted profit = premium × P(expire OTM) minus expected loss if assigned. Higher = better edge.">EV (1฿)</Tip>: ${(ev / legs.length).toFixed(0)} (${(evAnnual / legs.length).toFixed(0)}/yr) · <Tip text="Probability that at least one option gets exercised/assigned. Lower = safer strategy.">P(any ex)</Tip>: <span style={{ color: accent, fontWeight: 600 }}>{(probAnyEx * 100).toFixed(0)}%</span> · <Tip text="Theta: premium income earned per day from time decay. Higher = more daily income.">θ (1฿)</Tip>: ${(thetaEff / legs.length).toFixed(0)}/d
                                    <br />
                                    <Tip text="Volatility Edge: how much richer the option's implied vol is vs DVOL index. Positive = selling overpriced vol = edge.">Vol edge</Tip>: {volEdge > 0 ? '+' : ''}{(volEdge * 100).toFixed(1)}% vs DVOL · <Tip text="Kelly Criterion: optimal fraction of capital to allocate based on edge vs variance. Higher = more confident bet. Used by professional traders for position sizing.">Kelly</Tip>: {(kelly * 100).toFixed(1)}% · <Tip text="Risk/Return Ratio: expected value ÷ probability-weighted max loss. Higher = better risk-adjusted return. Think of it like a Sortino ratio for options.">R/R</Tip>: {riskReturn.toFixed(2)}
                                    <br />
                                    {(() => {
                                        const totalPremBtc = legs.reduce((s, l) => s + l.premiumUsd / l.futuresPrice, 0) / legs.length;
                                        const avgDte = legs.reduce((s, l) => s + l.dte, 0) / legs.length;
                                        const annualBtc = totalPremBtc * (365 / avgDte);
                                        return <><span style={{ color: 'var(--text-muted)' }}>BTC stays {dir} all strikes by {expiryLabel} → keep </span><span style={{ color: accent, fontWeight: 600 }}>${(totalPrem / legs.length).toFixed(0)} · {totalPremBtc.toFixed(4)}฿</span><span style={{ color: 'var(--text-muted)' }}> · {avgApy.toFixed(0)}% APR · {annualBtc.toFixed(4)}฿/yr</span></>;
                                    })()}
                                </div>
                            </div>
                        );
                    };
                    return (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            <LadderCard ladder={filteredCall} label="Covered Call Ladder" isCall={true} />
                            <LadderCard ladder={filteredPut} label="CSP Ladder" isCall={false} />
                        </div>
                    );
                })()}
            </div>

            {/* Yield Matrix */}
            <div className="neo-panel" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', marginTop: '14px' }}>
                <span className="neo-folder-tab">~/earn/btc/yields</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flex: '0 0 auto' }}>
                    <span style={{ fontSize: 'var(--t-title)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Covered Yield Matrix
                        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 400, color: 'var(--text-muted)' }}>DTE ≥ 15 · 1฿ notional · click to pin</span>
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 'var(--t-data)' }}>
                        Spot: <span style={{ color: 'var(--blue)' }}>{spot ? `$${spot.v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--'}</span>
                    </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
                    <Table type="C" strikes={callK} accentColor="var(--yellow)" label="Covered Calls" />
                    <Table type="P" strikes={putK} accentColor="var(--green)" label="Cash Secured Puts" />
                </div>

                {/* Tooltip */}
                {tip && (() => {
                    const W = typeof window !== 'undefined' ? window : { innerHeight: 832, innerWidth: 1470 };
                    return (
                        <div style={{ position: 'fixed', top: Math.min(Math.max(8, tip.y - 130), W.innerHeight - 220), left: Math.min(tip.x + 12, W.innerWidth - 230), backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-strong)', padding: '8px 10px', borderRadius: '6px', pointerEvents: 'none', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.4)', width: '14rem', fontSize: 'var(--t-data)' }}>
                            <strong style={{ display: 'block', borderBottom: '1px solid var(--border-color)', paddingBottom: '3px', marginBottom: '6px', fontSize: 'var(--t-label)', textTransform: 'uppercase', letterSpacing: '0.05em', color: tip.d.type === 'Put' ? 'var(--green)' : 'var(--yellow)' }}>
                                {tip.d.type === 'Put' ? '🟢 Cash Secured Put' : '🟡 Covered Call'}
                            </strong>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: '1px', columnGap: '12px', fontVariantNumeric: 'tabular-nums', lineHeight: '1.6' }}>
                                {[
                                    ['Strike', `$${tip.d.strike.toLocaleString()}`],
                                    ['Expiry', tip.d.exp],
                                    ['DTE', `${tip.d.dte}d`],
                                    ['Futures', `$${tip.d.futuresPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`],
                                    ['IV', `${tip.d.markIv}%`],
                                    ['Prem $', `$${tip.d.premiumUsd.toFixed(2)}`],
                                    ['Prem ฿', `${(tip.d.premiumUsd / tip.d.futuresPrice).toFixed(4)} ฿`],
                                    ['P(ex)', `${(tip.d.probExercise * 100).toFixed(1)}%`],
                                    ['Δ Delta', tip.d.greeks.delta.toFixed(2)],
                                    ['Γ Gamma', tip.d.greeks.gamma.toFixed(5)],
                                    ['Θ Theta', tip.d.greeks.theta.toFixed(2)],
                                    ['ν Vega', tip.d.greeks.vega.toFixed(2)],
                                ].map(([l, v]) => (
                                    <React.Fragment key={l}>
                                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{l}</span>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>{v}</span>
                                    </React.Fragment>
                                ))}
                            </div>
                            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '6px', paddingTop: '4px', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '12px', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-muted)' }}>APR</span>
                                <span style={{ fontWeight: 700, fontSize: 'var(--t-title)', color: 'var(--text-primary)' }}>{tip.d.apy}%</span>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
