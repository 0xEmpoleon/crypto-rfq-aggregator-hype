"use client";
import React, { useState, useEffect, useMemo } from 'react';
import * as MathUtils from '../utils/optionsMath';

/* ═══════════════════════════════════════════════════════════════════
   Derive Asset Yields — Multi-Currency Aggregator
    Optimized for Performance: Pre-computed Greeks & Modular Math
   ═══════════════════════════════════════════════════════════════════ */

interface ParsedOption {
    instrument: string; strike: number; expiry: string; expiryTs: number;
    type: 'C' | 'P'; markPrice: number; bidPrice: number; askPrice: number;
    markIv: number; futuresPrice: number; dte: number;
    greeks: { delta: number; gamma: number; theta: number; vega: number; };
    probExercise: number; tailLoss: number;
}

interface CellData {
    apy: number; markIv: number; markPrice: number; bidPrice: number;
    futuresPrice: number; dte: number; premiumUsd: number;
    probExercise: number; greeks: { delta: number; gamma: number; theta: number; vega: number; };
}

interface SuggestedTrade {
    instrument: string; type: 'Put' | 'Call'; strike: number; expiry: string;
    dte: number; apy: number; markIv: number; futuresPrice: number;
    probExercise: number; premiumUsd: number; moneyness: number; tailLoss: number;
    greeks: { delta: number; gamma: number; theta: number; vega: number; };
}

type Status = 'ok' | 'err' | 'load';

interface ScoredLadder {
    legs: SuggestedTrade[];
    score: number;
    ev: number;
    evAnnual: number;
    volEdge: number;
    thetaEff: number;
    riskReturn: number;
    kelly: number;
    diversification: number;
    probAllOTM: number;
    totalPrem: number;
    avgApy: number;
    topFactor: string;
}

function parseInst(n: string) {
    const p = n.split('-');
    return p.length === 4 ? { expiry: p[1], strike: +p[2].replace('_', '.'), type: p[3] as 'C' | 'P' } : null;
}

function expiryToDate(e: string): Date {
    const y = +e.slice(0, 4);
    const m = +e.slice(4, 6) - 1;
    const d = +e.slice(6, 8);
    return new Date(Date.UTC(y, m, d, 8));
}

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

function heatColor(apy: number, type: 'P' | 'C', dark: boolean): string {
    const i = Math.min(Math.max(apy, 0), 120) / 120;
    if (dark) return type === 'P' ? `rgba(34,197,94,${0.03 + i * 0.22})` : `rgba(234,179,8,${0.03 + i * 0.18})`;
    return type === 'P' ? `rgba(34,197,94,${0.05 + i * 0.25})` : `rgba(234,179,8,${0.05 + i * 0.2})`;
}

export default function DeriveAssetYields({ asset, darkMode }: { asset: 'HYPE' | 'BTC' | 'ETH' | 'SOL'; darkMode: boolean }) {
    const [hoverTip, setHoverTip] = useState<{ d: any; x: number; y: number } | null>(null);
    const [pinnedLocs, setPinnedLocs] = useState<Record<string, { x: number; y: number }>>({});
    const [hoverMeta, setHoverMeta] = useState<{ title: string; text: string; x: number; y: number } | null>(null);
    const [spot, setSpot] = useState<{ v: number; c: number; cp: number } | null>(null);
    const [dvol, setDvol] = useState<{ v: number; cp: number } | null>(null);
    const [opts, setOpts] = useState<ParsedOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [trades, setTrades] = useState<SuggestedTrade[]>([]);
    const [locked, setLocked] = useState<Set<string>>(new Set());
    const [sugAt, setSugAt] = useState<Date | null>(null);
    const [dataAt, setDataAt] = useState<Date | null>(null);
    const [st, setSt] = useState<{ spot: Status; opt: Status; dvol: Status }>({ spot: 'load', opt: 'load', dvol: 'load' });
    const [maxPexCap, setMaxPexCap] = useState(40);
    const [deribitPrices, setDeribitPrices] = useState<{ mark: Record<string, number>; bid: Record<string, number>; ask: Record<string, number> }>({ mark: {}, bid: {}, ask: {} });
    const [numLegs, setNumLegs] = useState(0);
    const [allowRep, setAllowRep] = useState(false);
    const [priceSource, setPriceSource] = useState<'mark' | 'market'>('mark');
    const [excludedExp, setExcludedExp] = useState<Set<string>>(new Set());
    const [countdown, setCountdown] = useState(15);

    const assetSymbol = useMemo(() => {
        if (asset === 'BTC') return '₿';
        if (asset === 'ETH') return 'Ξ';
        return asset;
    }, [asset]);

    const strikeRange = useMemo(() => {
        if (asset === 'BTC') return 20000;
        if (asset === 'ETH') return 800;
        if (asset === 'SOL') return 50;
        return 20; // HYPE
    }, [asset]);

    const { computedCall, computedPut } = useMemo(() => {
        if (!trades.length) return { computedCall: null, computedPut: null };
        const best = (type: 'Call' | 'Put') => {
            if (numLegs === 0) {
                let top: ScoredLadder | null = null;
                for (let n = 1; n <= 5; n++) {
                    const l = MathUtils.buildOptimalLadder(trades, type, dvol?.v || null, n, allowRep);
                    if (l && (!top || l.score > top.score)) top = l;
                }
                return top;
            }
            return MathUtils.buildOptimalLadder(trades, type, dvol?.v || null, numLegs, allowRep);
        };
        return { computedCall: best('Call'), computedPut: best('Put') };
    }, [trades, dvol, numLegs, allowRep]);

    const recommendedKeys = useMemo(() => {
        const s = new Set<string>();
        [computedCall, computedPut].forEach((l: ScoredLadder | null) => {
            if (l && l.score >= 5.0) l.legs.forEach((leg: SuggestedTrade) => s.add(`${leg.type === 'Call' ? 'C' : 'P'}-${leg.strike}-${leg.expiry}`));
        });
        return s;
    }, [computedCall, computedPut]);

    useEffect(() => {
        const ticker = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
        return () => clearInterval(ticker);
    }, []);

    useEffect(() => {
        setLoading(true); setOpts([]); setSpot(null); setDvol(null);
        const go = async () => {
            setCountdown(15);
            const ns: Record<string, Status> = { spot: 'load', opt: 'load', dvol: 'load' };
            let currentSpot = 0;
            try {
                const r = await fetch('/api/derive/ticker', { method: 'POST', body: JSON.stringify({ instrument_name: `${asset}-PERP` }) });
                const d = await r.json(); currentSpot = +(d.result?.mark_price || 0);
                if (currentSpot > 0) { setSpot({ v: currentSpot, c: 0, cp: 0 }); ns.spot = 'ok'; } else ns.spot = 'err';
            } catch { ns.spot = 'err'; }
            try {
                const r = await fetch('/api/derive/instruments', { method: 'POST', body: JSON.stringify({ currency: asset, instrument_type: 'option', expired: false }) });
                const d = await r.json(); if (!d.result?.length) { ns.opt = 'err'; setLoading(false); setSt(ns as any); return; }
                const exps = new Set<string>(); d.result.forEach((it: any) => { const p = it.instrument_name.split('-'); if (p.length === 4) exps.add(p[1]); });
                const now = Date.now(); const arr: ParsedOption[] = [];
                const expsArray = Array.from(exps);
                for (const exp of expsArray) {
                    const tr = await fetch('/api/derive/tickers', { method: 'POST', body: JSON.stringify({ currency: asset, instrument_type: 'option', expiry_date: exp }) });
                    const td = await tr.json(); if (!td.result?.tickers) continue;
                    for (const [name, it] of Object.entries<any>(td.result.tickers)) {
                        const info = parseInst(name); if (!info || !it.M || it.M <= 0) continue;
                        const ed = expiryToDate(info.expiry); const dte = Math.max(0, Math.ceil((ed.getTime() - now) / 86400000)); if (dte <= 0) continue;
                        const mp = +it.M; const bp = +(it.b || it.best_bid || 0); const ap = +(it.a || it.best_ask || 0); const up = +(it.option_pricing?.f || it.I || 0); const iv = +(it.option_pricing?.i || 0) * 100;
                        if (up <= 0) continue;
                        const y = info.expiry.slice(2, 4); const m = +info.expiry.slice(4, 6) - 1; const dt = info.expiry.slice(6, 8);
                        const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                        const greeks = MathUtils.calculateGreeks(up, info.strike, dte / 365, iv / 100, info.type);
                        const pExVal = MathUtils.calculateProbExercise(up, info.strike, dte / 365, iv / 100, info.type);
                        const tailLoss = MathUtils.calculateTailLoss(up, info.strike, dte / 365, iv / 100, info.type);
                        arr.push({ instrument: name, strike: info.strike, expiry: `${dt}${M[m]}${y}`, expiryTs: ed.getTime(), type: info.type, markPrice: mp, bidPrice: bp, askPrice: ap, markIv: iv, futuresPrice: up, dte, greeks, probExercise: pExVal, tailLoss });
                    }
                }
                if (arr.length > 0) {
                    ns.opt = 'ok';
                    if (currentSpot > 0) {
                        const expiryAtms: { dte: number; iv: number }[] = [];
                        const groupedByExp = new Map<string, ParsedOption[]>();
                        arr.forEach(o => {
                            if (o.dte > 0) {
                                if (!groupedByExp.has(o.expiry)) groupedByExp.set(o.expiry, []);
                                groupedByExp.get(o.expiry)!.push(o);
                            }
                        });

                        groupedByExp.forEach((options) => {
                            let bestDiff = Infinity;
                            options.forEach(o => bestDiff = Math.min(bestDiff, Math.abs(o.strike - currentSpot)));
                            const atATM = options.filter(o => Math.abs(o.strike - currentSpot) === bestDiff);
                            const c = atATM.find(o => o.type === 'C'), p = atATM.find(o => o.type === 'P');
                            const iv = (c && p) ? (c.markIv + p.markIv) / 2 : (c?.markIv || p?.markIv || 0);
                            if (iv > 0) expiryAtms.push({ dte: options[0].dte, iv });
                        });

                        const dvolEst = MathUtils.estimateDvol(expiryAtms);
                        if (dvolEst > 0) { setDvol({ v: dvolEst, cp: 0 }); ns.dvol = 'ok'; }
                    }

                    // Deribit Arbitrage Fetching
                    if (asset === 'BTC' || asset === 'ETH') {
                        try {
                            const dr = await fetch(`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${asset}&kind=option`);
                            const dd = await dr.json();
                            if (dd.result) {
                                const markMap: Record<string, number> = {};
                                const bidMap: Record<string, number> = {};
                                const askMap: Record<string, number> = {};
                                dd.result.forEach((it: any) => {
                                    const p = it.instrument_name.split('-');
                                    if (p.length === 4) {
                                        const key = `${p[3]}-${p[2]}-${p[1]}`; // C-70000-27MAR26
                                        const und = it.underlying_price || currentSpot;
                                        markMap[key] = it.mark_price * und;
                                        if (it.bid_price) bidMap[key] = it.bid_price * und;
                                        if (it.ask_price) askMap[key] = it.ask_price * und;
                                    }
                                });
                                setDeribitPrices({ mark: markMap, bid: bidMap, ask: askMap });
                            }
                        } catch (e) { console.error('Deribit fetch failed', e); }
                    } else {
                        setDeribitPrices({ mark: {}, bid: {}, ask: {} });
                    }
                } else ns.opt = 'err';
                setOpts(arr); setLoading(false); setDataAt(new Date());
            } catch { ns.opt = 'err'; setLoading(false); }
            setSt(ns as any);
        };
        go(); const iv = setInterval(go, 15000); return () => clearInterval(iv);
    }, [asset]);

    useEffect(() => {
        if (!opts.length) return;
        const compute = () => {
            const t: SuggestedTrade[] = [];
            for (const o of opts) {
                if (o.dte <= 7 || excludedExp.has(o.expiry)) continue;
                const ref = spot?.v || 30; if (Math.abs(o.strike - ref) > strikeRange) continue;
                if ((o.type === 'C' && o.strike < ref) || (o.type === 'P' && o.strike > ref)) continue;
                const price = priceSource === 'market'
                    ? (o.bidPrice || o.markPrice * 0.95)
                    : o.markPrice;
                const apy = o.type === 'P' ? MathUtils.calculatePutApy(price, o.futuresPrice, o.strike, o.dte) : MathUtils.calculateCallApy(price, o.futuresPrice, o.dte);
                if (apy <= 5 || apy > 300) continue;
                const pe = o.probExercise;
                if (pe > maxPexCap / 100) continue;
                t.push({ instrument: o.instrument, type: o.type === 'P' ? 'Put' : 'Call', strike: o.strike, expiry: o.expiry, dte: o.dte, apy, markIv: o.markIv, futuresPrice: o.futuresPrice, probExercise: pe, premiumUsd: price, moneyness: Math.abs(o.strike / o.futuresPrice - 1) * 100, tailLoss: o.tailLoss, greeks: o.greeks });
            }
            t.sort((a, b) => b.apy - a.apy); setTrades(t.slice(0, Math.max(15, numLegs * 4))); setSugAt(new Date());
        };
        compute(); const iv = setInterval(compute, 15000); return () => clearInterval(iv);
    }, [opts, maxPexCap, priceSource, excludedExp, strikeRange, numLegs, allowRep, spot]);

    const { exps, putK, callK, cells } = useMemo(() => {
        if (!opts.length) return { exps: [], putK: [], callK: [], cells: {} as Record<string, CellData> };
        const f = opts.filter(o => o.dte > 7);
        const em = new Map<string, { ts: number; dte: number; fp: number }>();
        f.forEach(o => { if (!em.has(o.expiry)) em.set(o.expiry, { ts: o.expiryTs, dte: o.dte, fp: o.futuresPrice }); });

        const expsArr: { label: string; ts: number; dte: number; fp: number }[] = [];
        em.forEach((v, k) => { expsArr.push({ label: k, ...v }); });
        const exps = expsArr.sort((a, b) => a.ts - b.ts);
        const ref = spot?.v || exps[0]?.fp || 30;
        const fFiltered = f.filter(o => Math.abs(o.strike - ref) <= strikeRange && (o.type === 'C' ? o.strike >= ref : o.strike <= ref));

        const pK: number[] = [];
        const cK: number[] = [];
        const pS = new Set<number>();
        const cS = new Set<number>();
        fFiltered.forEach(o => { if (o.type === 'P') pS.add(o.strike); else cS.add(o.strike); });
        pS.forEach(s => pK.push(s));
        cS.forEach(s => cK.push(s));

        const cells: Record<string, CellData> = {};
        fFiltered.forEach(o => {
            const price = priceSource === 'market'
                ? (o.bidPrice || o.markPrice * 0.95)
                : o.markPrice;
            cells[`${o.type}-${o.strike}-${o.expiry}`] = {
                apy: o.type === 'P' ? MathUtils.calculatePutApy(price, o.futuresPrice, o.strike, o.dte) : MathUtils.calculateCallApy(price, o.futuresPrice, o.dte),
                markIv: o.markIv, markPrice: o.markPrice, bidPrice: o.bidPrice, futuresPrice: o.futuresPrice, dte: o.dte, premiumUsd: price, probExercise: o.probExercise, greeks: o.greeks
            };
        });
        return { exps, putK: pK.sort((a, b) => b - a), callK: cK.sort((a, b) => a - b), cells };
    }, [opts, spot, priceSource, strikeRange]);

    const renderCell = (type: 'P' | 'C', strike: number, exp: { label: string; dte: number }) => {
        const k = `${type}-${strike}-${exp.label}`, d = cells[k];
        const isEx = excludedExp.has(exp.label);
        const isPexExceeded = d && (d.probExercise * 100 > maxPexCap);
        if (!d) return <td key={k} style={{ color: 'var(--text-muted)', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 'var(--t-data)' }}>—</td>;

        const isRec = recommendedKeys.has(k), isP = !!pinnedLocs[k];

        // Deribit Arbitrage Coloring
        const dbitPrice = priceSource === 'mark'
            ? deribitPrices.mark[k]
            : deribitPrices.bid[k];

        let priceColor = 'var(--text-primary)';
        if (dbitPrice && !isEx) {
            const currentPrice = d.premiumUsd;
            if (currentPrice > dbitPrice * 1.001) priceColor = 'var(--green)'; // Superior Premium
            else if (currentPrice < dbitPrice * 0.999) priceColor = 'var(--red)'; // Inferior Premium
        }

        const bg = heatColor(d.apy, type, darkMode);
        const premAsset = d.premiumUsd / d.futuresPrice;

        return (
            <td key={k} onClick={(e) => { setPinnedLocs((p: any) => { const o = { ...p }; if (o[k]) delete o[k]; else o[k] = { x: e.clientX, y: e.clientY }; return o; }); }}
                onMouseEnter={(e) => !pinnedLocs[k] && setHoverTip({ d: { ...d, type: type === 'P' ? 'Put' : 'Call', strike, exp: exp.label }, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => !pinnedLocs[k] && setHoverTip(null)}
                style={{
                    backgroundColor: bg,
                    color: (isEx || isPexExceeded) ? 'var(--text-muted)' : (isRec ? (type === 'C' ? 'var(--yellow)' : 'var(--green)') : 'var(--text-primary)'),
                    opacity: (isEx || isPexExceeded) ? 0.3 : undefined,
                    padding: '2px 4px', fontSize: '11px', textAlign: 'center', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    fontVariantNumeric: 'tabular-nums', fontWeight: isRec ? 700 : 400,
                    boxShadow: isRec ? `inset 0 0 0 1.5px ${type === 'C' ? 'var(--yellow)' : 'var(--green)'}` : 'none',
                    height: '32px'
                }}>
                <div style={{ position: 'relative', height: '100%', zIndex: isP || (hoverTip && hoverTip.d.strike === strike && hoverTip.d.exp === exp.label) ? 999 : (isRec ? 2 : 1), display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', alignItems: 'baseline', lineHeight: 1 }}>
                        <span style={{ fontSize: '12px' }}>{d.apy.toFixed(1)}%</span>
                        <span style={{ fontSize: '10px', opacity: 0.6 }}>{(d.probExercise * 100).toFixed(0)}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', fontSize: '10px', color: priceColor, opacity: isRec ? 1 : 0.7, fontWeight: dbitPrice ? 700 : 400, marginTop: '1px' }}>
                        {premAsset.toFixed(4)}{assetSymbol}
                    </div>
                </div>
                {isP && <Tooltip tip={{ d: { ...d, type: type === 'P' ? 'Put' : 'Call', strike, exp: exp.label }, ...pinnedLocs[k] }} inline onClose={() => setPinnedLocs((p: any) => { const o = { ...p }; delete o[k]; return o; })} onHoverMeta={setHoverMeta} assetSymbol={assetSymbol} priceSource={priceSource} />}
            </td>
        );
    };

    const fmtTime = (d: Date | null) => d ? d.toLocaleTimeString('en-GB') : '--:--:--';

    const MetaLabel = ({ title, text, label }: { title: string; text: string; label: string }) => (
        <span
            onMouseEnter={(e) => setHoverMeta({ title, text, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHoverMeta(null)}
            style={{ borderBottom: '1px dashed var(--text-muted)', cursor: 'help', textUnderlineOffset: '2px' }}
        >
            {label}
        </span>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, overflow: 'hidden', gap: '2px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '2px 0', borderBottom: '1px solid var(--border-color)', marginBottom: '2px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <Dot s={st.spot} label="Spot" /> <Dot s={st.opt} label="Options" /> <Dot s={st.dvol} label="DVOL" />
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--t-meta)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={allowRep} onChange={e => setAllowRep(e.target.checked)} style={{ cursor: 'pointer' }} />
                        <span>Repeat legs</span>
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Legs</span>
                        <input type="range" min="0" max="5" value={numLegs} onChange={e => setNumLegs(+e.target.value)} style={{ width: '60px', cursor: 'pointer' }} />
                        <span style={{ minWidth: '1em', color: 'var(--blue)', fontWeight: 600 }}>{numLegs || 'A'}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>P(ex) cap</span>
                        <input type="range" min="5" max="90" value={maxPexCap} onChange={e => setMaxPexCap(+e.target.value)} style={{ width: '80px', cursor: 'pointer' }} />
                        <span style={{ minWidth: '2em', color: 'var(--yellow)', fontWeight: 600 }}>{maxPexCap}%</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '8px', borderLeft: '1px solid var(--border-color)' }}>
                        <Dot s={st.opt} label="" />
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>Data: {fmtTime(dataAt)}</span>
                        <span>·</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>Strategy: {fmtTime(sugAt)}</span>
                        <span>·</span>
                        <span style={{ width: '22px', color: countdown < 5 ? 'var(--red)' : 'var(--text-muted)' }}>{countdown}s</span>
                    </div>
                </div>
            </div>

            <div className="neo-panel" style={{ flex: '0 0 auto', marginTop: '0px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ fontSize: 'var(--t-title)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--yellow)', filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.5))' }}>⚡</span> Recommendations
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-card)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                            <span style={{ fontSize: 'var(--t-micro)', color: 'var(--text-muted)' }}>MKT:</span>
                            <button onClick={() => setPriceSource('mark')} style={{ padding: '0px 4px', fontSize: 'var(--t-micro)', border: 'none', background: priceSource === 'mark' ? 'var(--blue)' : 'transparent', color: priceSource === 'mark' ? 'white' : 'var(--text-muted)', cursor: 'pointer', borderRadius: '2px' }}>MARK</button>
                            <button onClick={() => setPriceSource('market')} style={{ padding: '0px 4px', fontSize: 'var(--t-micro)', border: 'none', background: priceSource === 'market' ? 'var(--blue)' : 'transparent', color: priceSource === 'market' ? 'white' : 'var(--text-muted)', cursor: 'pointer', borderRadius: '2px' }}>Market</button>
                        </div>
                        {spot && <span style={{ fontSize: 'var(--t-data)', fontWeight: 600 }}>{asset} ${spot.v.toLocaleString()}</span>}
                        {dvol && <span style={{ fontSize: 'var(--t-data)', color: 'var(--text-secondary)' }}>DVOL {dvol.v.toFixed(1)}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>Expiries:</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {exps.map(e => (
                                <button key={e.label} onClick={() => setExcludedExp(p => { const n = new Set(p); n.has(e.label) ? n.delete(e.label) : n.add(e.label); return n; })}
                                    style={{ padding: '1px 6px', fontSize: 'var(--t-micro)', borderRadius: '4px', border: '1px solid var(--border-color)', background: excludedExp.has(e.label) ? 'transparent' : 'var(--bg-panel)', color: excludedExp.has(e.label) ? 'var(--text-muted)' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>
                                    {e.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {[computedCall, computedPut].map((l, i) => {
                        const isCall = i === 0;
                        const accent = isCall ? 'var(--yellow)' : 'var(--green)';
                        const dir = isCall ? 'below' : 'above';
                        const pDec = asset === 'BTC' || asset === 'ETH' ? 0 : 2;
                        if (!l) return <div key={i} style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '6px', borderRadius: '4px', color: 'var(--text-muted)', fontSize: 'var(--t-data)' }}>No {isCall ? 'CALL' : 'PUT'} strategies found</div>;

                        const { legs, score, totalPrem, avgApy, topFactor, probAllOTM, ev, evAnnual, thetaEff, volEdge, kelly, riskReturn } = l;
                        const probAnyEx = 1 - probAllOTM;
                        const uniqueExpiries = Array.from(new Set(legs.map((x: SuggestedTrade) => x.expiry))).join(' / ');
                        const avgDte = (legs.reduce((sum: number, leg: SuggestedTrade) => sum + leg.dte, 0) / legs.length).toFixed(0);
                        const yieldOnCapital = legs.reduce((sum: number, leg: SuggestedTrade) => {
                            const cap = isCall ? (spot?.v || leg.futuresPrice) : leg.strike;
                            return sum + (cap > 0 ? (leg.premiumUsd / cap) * (365 / leg.dte) * 100 : 0);
                        }, 0) / legs.length;

                        return (
                            <div key={i} style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', borderRadius: '4px', borderLeft: `3px solid ${accent}`, overflow: 'hidden' }}>
                                <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontWeight: 700, fontSize: 'var(--t-label)', textTransform: 'uppercase', color: accent }}>{isCall ? 'Covered Call' : 'CSP'} Ladder</span>
                                            <span style={{ fontSize: 'var(--t-micro)', fontWeight: 700, color: accent, background: 'rgba(255,255,255,0.05)', padding: '0 4px', borderRadius: '3px', border: `1px solid ${accent}` }}>{score.toFixed(1)}</span>
                                        </div>
                                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>{uniqueExpiries} · {avgDte}d avg · {legs.length} legs · {topFactor}</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 'var(--t-hero)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1' }}>{avgApy.toFixed(1)}%</div>
                                        <div style={{ fontSize: 'var(--t-micro)', color: 'var(--text-muted)' }}>avg APR ({priceSource})</div>
                                    </div>
                                </div>
                                <div style={{ padding: '0 8px 4px', fontSize: 'var(--t-meta)', fontVariantNumeric: 'tabular-nums' }}>
                                    {legs.map((leg: SuggestedTrade, idx: number) => (
                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', borderTop: idx > 0 ? '1px solid var(--border-color)' : 'none', color: 'var(--text-secondary)' }}>
                                            <span>Sell {isCall ? 'CC' : 'CSP'} <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>${leg.strike.toLocaleString()}</span></span>
                                            <span>${leg.premiumUsd.toFixed(pDec)} · {(leg.premiumUsd / leg.futuresPrice).toFixed(4)}{assetSymbol} · {leg.apy.toFixed(0)}% · P(ex) {(leg.probExercise * 100).toFixed(0)}%</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ padding: '4px 8px', borderTop: '1px solid var(--border-color)', fontSize: 'var(--t-meta)', color: 'var(--text-muted)', backgroundColor: 'rgba(0,0,0,0.2)', lineHeight: '1.4' }}>
                                    {(() => {
                                        const avgStrike = legs.reduce((s: number, lg: SuggestedTrade) => s + lg.strike, 0) / legs.length;
                                        const scaledCap = isCall ? (spot?.v || legs[0].futuresPrice) : avgStrike;
                                        const scaledPrem = totalPrem / legs.length;
                                        const breakeven = isCall ? scaledCap - scaledPrem : avgStrike - scaledPrem;
                                        const maxExit = isCall ? avgStrike + scaledPrem : null;

                                        return <><span style={{ color: 'var(--text-secondary)' }}>Cap req (1H):</span> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${scaledCap.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span> − ${scaledPrem.toFixed(pDec)} prem = <span style={{ fontWeight: 600 }}>${(scaledCap - scaledPrem).toLocaleString(undefined, { maximumFractionDigits: pDec })}</span> net · <span style={{ color: accent, fontWeight: 600 }}>{yieldOnCapital.toFixed(1)}% yield</span>
                                            {isCall ? (
                                                <> · Downside B/E: <span style={{ color: accent, fontWeight: 600 }}>${breakeven.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span> · Max Exit: <span style={{ color: accent, fontWeight: 600 }}>${maxExit?.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span></>
                                            ) : (
                                                <> · B/E: <span style={{ color: accent, fontWeight: 600 }}>${breakeven.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span></>
                                            )}
                                        </>;
                                    })()}
                                    <br />
                                    <MetaLabel title="Expected Value (EV)" text="Theoretical Average Profit/Loss per trade based on historical probabilities and payoffs." label="EV (1H):" /> ${(ev / legs.length).toFixed(pDec)} (${(evAnnual / legs.length).toFixed(pDec)}/yr) · <MetaLabel title="P(any exercise)" text="The probability that at least one of the option legs in this strategy will be exercised (In-The-Money at expiry)." label="P(any ex):" /> <span style={{ color: accent, fontWeight: 600 }}>{(probAnyEx * 100).toFixed(0)}%</span> · <MetaLabel title="Theta (θ)" text="Measures the time decay of the option price. It represents the value the option loses each day as it approaches expiration." label="θ (1H):" /> ${(thetaEff / legs.length).toFixed(pDec)}/d
                                    <br />
                                    <MetaLabel title="Volatility Edge" text="Difference between Option IV and the benchmark volatility index (DVOL). Positive means receiving more premium than historical benchmarking suggests." label="Vol edge:" /> {(volEdge * 100).toFixed(1)}% vs DVOL · <MetaLabel title="Kelly Criterion" text="Optimal fraction of capital to allocate based on edge vs variance. Higher = more confident bet. Used by professional traders for position sizing." label="Kelly:" /> {(kelly * 100).toFixed(1)}% · <MetaLabel title="Risk/Reward Ratio" text="Total Strategy Score based on Yield, Risk, and Greeks. Represents expected Return over Potential risk." label="R/R:" /> {riskReturn.toFixed(2)}
                                    <br />
                                    {asset} stays {dir} all strikes by {uniqueExpiries} → keep <span style={{ color: accent, fontWeight: 600 }}>${(totalPrem / legs.length).toFixed(pDec)} · {(totalPrem / legs.length / (spot?.v || legs[0].futuresPrice)).toFixed(4)}{assetSymbol}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="neo-panel" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0, marginTop: '0px', padding: '5px 12px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '15px', color: 'var(--yellow)', filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.5))', lineHeight: 1 }}>⚡</span>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Covered Yield Matrix</div>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Spot: <span style={{ color: 'var(--blue)' }}>${spot?.v.toLocaleString()}</span></div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        <span style={{ width: '8px', height: '2px', backgroundColor: 'var(--yellow)', borderRadius: '1px' }}></span> COVERED CALLS
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        <span style={{ width: '8px', height: '2px', backgroundColor: 'var(--green)', borderRadius: '1px' }}></span> CASH SECURED PUTS
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flex: '1 1 auto', overflow: 'hidden' }}>
                    {['C', 'P'].map(t => (
                        <div key={t} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <div style={{ overflow: 'auto', flex: '1 1 auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', borderSpacing: 0 }}>
                                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-panel)', zIndex: 10 }}>
                                        <tr>
                                            <th style={{ textAlign: 'center', padding: '4px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Strike</th>
                                            {exps.map(e => <th key={e.label} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '4px' }}>{e.label}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(t === 'C' ? callK : putK).map(s => (
                                            <tr key={s}>
                                                <td style={{ fontSize: '12px', fontWeight: 700, padding: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', textAlign: 'center' }}>${s.toLocaleString()}</td>
                                                {exps.map(e => renderCell(t as 'C' | 'P', s, e))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {hoverTip && !pinnedLocs[`${hoverTip.d.type === 'Put' ? 'P' : 'C'}-${hoverTip.d.strike}-${hoverTip.d.exp}`] && (
                <Tooltip
                    tip={hoverTip}
                    priceSource={priceSource}
                    assetSymbol={assetSymbol}
                    onHoverMeta={(meta) => setHoverMeta(meta)}
                />
            )}
            {hoverMeta && <MetaTooltip tip={hoverMeta} />}
        </div>
    );
}

function MetaTooltip({ tip }: { tip: { title: string; text: string; x: number; y: number } }) {
    return (
        <div style={{ position: 'fixed', top: tip.y + 15, left: tip.x - 100, backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '4px', zIndex: 10000, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', width: '220px', pointerEvents: 'none', color: '#fff', fontSize: '11px', lineHeight: '1.4', backdropFilter: 'blur(4px)' }}>
            <div style={{ fontWeight: 800, marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '3px', color: 'var(--yellow)', fontSize: '10px', textTransform: 'uppercase' }}>{tip.title}</div>
            {tip.text}
        </div>
    );
}

function Tooltip({ tip, onClose, priceSource, inline, assetSymbol, onHoverMeta }: { tip: any; onClose?: () => void; priceSource: string; inline?: boolean; assetSymbol: string; onHoverMeta: (meta: any) => void }) {
    const style: React.CSSProperties = inline
        ? { position: 'absolute', top: '-10px', left: '100%', marginLeft: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-strong)', padding: '10px', borderRadius: '6px', zIndex: 9999, boxShadow: '0 10px 30px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.05)', width: '16rem', textAlign: 'left', pointerEvents: 'auto' }
        : { position: 'fixed', top: tip.y || 100, left: (tip.x || 100) + 15, backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-strong)', padding: '10px', borderRadius: '6px', zIndex: 9999, boxShadow: '0 10px 30px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.05)', width: '16rem', pointerEvents: 'none' };

    const MetaLabel = ({ title, text, label }: { title: string; text: string; label: string }) => (
        <span
            onMouseEnter={(e) => onHoverMeta({ title, text, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => onHoverMeta(null)}
            style={{ borderBottom: '1px dashed var(--text-muted)', cursor: 'help', textUnderlineOffset: '2px' }}
        >
            {label}
        </span>
    );

    return (
        <div style={style}>
            {onClose && <button onClick={onClose} style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', borderBottom: '1px solid var(--border-strong)', paddingBottom: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tip.d.type === 'Put' ? 'var(--green)' : 'var(--yellow)' }}></div>
                <div style={{ fontWeight: 800, fontSize: '13px', color: tip.d.type === 'Put' ? 'var(--green)' : 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {tip.d.type === 'Put' ? 'Strategy Note: CSP' : 'Strategy Note: Call'}
                </div>
            </div>

            <div style={{ fontSize: '11px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 0', color: 'var(--text-secondary)' }}>
                <span>Strike</span><span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>${tip.d.strike.toLocaleString()}</span>
                <span>Expiry</span><span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>{tip.d.exp} ({tip.d.dte.toFixed(0)}d)</span>
                <span>IV</span><span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>{tip.d.markIv?.toFixed(1)}%</span>
                <span>Prem $</span><span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>${tip.d.premiumUsd?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span>Prem {assetSymbol}</span><span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>{(tip.d.premiumUsd / tip.d.futuresPrice)?.toFixed(4)} {assetSymbol}</span>
            </div>

            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-strong)' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px', textTransform: 'uppercase', opacity: 0.8 }}>Values & Greeks</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 8px' }}>
                    <MetaLabel title="P(ex)" text="Probability of the option being In-The-Money (ITM) at expiration. A higher value means a higher risk of exercise." label="P(ex)" />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{(tip.d.probExercise * 100).toFixed(1)}%</span>

                    <MetaLabel title="Delta (Δ)" text="Measures the change in the option price for every $1 change in the underlying asset's price." label="Delta (Δ)" />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{tip.d.greeks?.delta?.toFixed(2)}</span>

                    <MetaLabel title="Gamma (Γ)" text="Measures the rate of change in Delta for every $1 change in the underlying asset's price. Highlights the sensitivity of Delta." label="Gamma (Γ)" />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{tip.d.greeks?.gamma?.toFixed(5)}</span>

                    <MetaLabel title="Theta (Θ)" text="Measures the time decay of the option price. It represents the value the option loses each day as it approaches expiration." label="Theta (Θ)" />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{tip.d.greeks?.theta?.toFixed(2)}</span>

                    <MetaLabel title="Vega (ν)" text="Measures the sensitivity of the option price to a 1% change in the implied volatility (IV) of the underlying asset." label="Vega (ν)" />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{tip.d.greeks?.vega?.toFixed(2)}</span>
                </div>
            </div>

            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600 }}>EST. APR</span>
                <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>{tip.d.apy.toFixed(1)}%</span>
            </div>
        </div>
    );
}

function Dot({ s, label }: { s: Status; label: string }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'var(--t-meta)', color: 'var(--text-secondary)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: s === 'ok' ? 'var(--green)' : s === 'err' ? 'var(--red)' : 'var(--yellow)' }} />
            {label}
        </span>
    );
}
