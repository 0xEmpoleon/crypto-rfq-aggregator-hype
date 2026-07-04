"use client";
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import * as MathUtils from '../utils/optionsMath';
import type { StrategyLeg, LadderContext } from '../utils/optionsMath';
import { AssetSymbol, ASSET_CONFIG } from '../config/assets';
import { MIN_DTE_DAYS, APR_MIN_PCT, APR_MAX_PCT, RECOMMEND_MIN_SCORE, TRADE_POOL_MIN } from '../config/constants';
import { useDeriveChain } from '../hooks/useDeriveChain';
import { useDeribitMarks } from '../hooks/useDeribitMarks';
import { ControlBar } from './ControlBar';
import { StrategyPanel, LadderResult } from './StrategyPanel';
import { YieldMatrix } from './YieldMatrix';
import { Tooltip, MetaTooltip } from './Tooltips';
import type { CellData, ExpiryCol, HoverTip, MetaTip } from '../types';

/* ═══════════════════════════════════════════════════════════════════
   Derive Option Strategist — orchestrator.
   Data: hooks/useDeriveChain + hooks/useDeribitMarks.
   Math: utils/optionsMath. Views: ControlBar / StrategyPanel / YieldMatrix.
   ═══════════════════════════════════════════════════════════════════ */

const CONTROLS_LS_KEY = 'optionStrategist.controls.v1';

export default function DeriveAssetYields({ asset, darkMode }: { asset: AssetSymbol; darkMode: boolean }) {
    const cfg = ASSET_CONFIG[asset];

    const [hoverTip, setHoverTip] = useState<HoverTip | null>(null);
    const [hoverMeta, setHoverMeta] = useState<MetaTip | null>(null);
    const [pinnedLocs, setPinnedLocs] = useState<Record<string, { x: number; y: number }>>({});
    const [maxPexCap, setMaxPexCap] = useState(40);
    const [numLegs, setNumLegs] = useState(0);
    const [allowRep, setAllowRep] = useState(false);
    const [priceSource, setPriceSource] = useState<'mark' | 'market'>('mark');
    const [excludedExp, setExcludedExp] = useState<Set<string>>(new Set());
    const [controlsLoaded, setControlsLoaded] = useState(false);

    const { spot, dvol, atmIvByExpiry, opts, loading, dataAt, st, countdown, refresh } = useDeriveChain(asset);
    const deribitPrices = useDeribitMarks(asset, cfg.deribitArb);

    // Controls survive asset switches and reloads; per-asset view state resets.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(CONTROLS_LS_KEY);
            if (raw) {
                const c = JSON.parse(raw);
                // Clamp to the sliders' ranges — a hand-edited value like numLegs=-1
                // would otherwise recurse the combination generator to a stack overflow.
                if (Number.isFinite(c.maxPexCap)) setMaxPexCap(Math.min(90, Math.max(5, Math.trunc(c.maxPexCap))));
                if (Number.isFinite(c.numLegs)) setNumLegs(Math.min(5, Math.max(0, Math.trunc(c.numLegs))));
                if (typeof c.allowRep === 'boolean') setAllowRep(c.allowRep);
                if (c.priceSource === 'mark' || c.priceSource === 'market') setPriceSource(c.priceSource);
            }
        } catch { /* corrupted or unavailable storage is fine */ }
        setControlsLoaded(true);
    }, []);
    useEffect(() => {
        if (!controlsLoaded) return;
        try { localStorage.setItem(CONTROLS_LS_KEY, JSON.stringify({ maxPexCap, numLegs, allowRep, priceSource })); } catch { }
    }, [maxPexCap, numLegs, allowRep, priceSource, controlsLoaded]);
    useEffect(() => {
        setExcludedExp(new Set());
        setPinnedLocs({});
        setHoverTip(null);
        setHoverMeta(null);
    }, [asset]);

    const trades = useMemo<StrategyLeg[]>(() => {
        if (!opts.length) return [];
        const t: StrategyLeg[] = [];
        const ref = spot ?? cfg.fallbackSpot;
        for (const o of opts) {
            if (o.dte <= MIN_DTE_DAYS || excludedExp.has(o.expiry)) continue;
            if (Math.abs(o.strike - ref) > cfg.strikeRange) continue;
            if ((o.type === 'C' && o.strike < ref) || (o.type === 'P' && o.strike > ref)) continue;
            // Market mode means executable prices only — a strike with no
            // resting bid is skipped, never priced at a synthetic 95% of mark.
            if (priceSource === 'market' && o.bidPrice <= 0) continue;
            const price = priceSource === 'market' ? o.bidPrice : o.markPrice;
            const feeUsd = MathUtils.deriveTakerFee(o.futuresPrice, price);
            const netPrem = Math.max(0, price - feeUsd);
            const days = o.tYears * 365;
            const apr = o.type === 'P'
                ? MathUtils.calculatePutApr(netPrem, o.strike, days)
                : MathUtils.calculateCallApr(netPrem, o.futuresPrice, days);
            if (apr <= APR_MIN_PCT || apr > APR_MAX_PCT) continue;
            if (o.probExercise > maxPexCap / 100) continue;
            t.push({
                instrument: o.instrument, type: o.type === 'P' ? 'Put' : 'Call', strike: o.strike,
                expiry: o.expiry, dte: o.dte, tYears: o.tYears, apr, markIv: o.markIv,
                futuresPrice: o.futuresPrice, probExercise: o.probExercise, premiumUsd: price,
                feeUsd, tailLoss: o.tailLoss, moneyness: Math.abs(o.strike / o.futuresPrice - 1) * 100,
                greeks: o.greeks,
            });
        }
        t.sort((a, b) => b.apr - a.apr);
        return t.slice(0, Math.max(TRADE_POOL_MIN, numLegs * 4));
    }, [opts, spot, cfg, maxPexCap, priceSource, excludedExp, numLegs]);

    const { callRes, putRes } = useMemo<{ callRes: LadderResult | null; putRes: LadderResult | null }>(() => {
        if (!trades.length) return { callRes: null, putRes: null };
        const ctx: LadderContext = { atmIvByExpiry, priceSource };
        const legCounts = numLegs === 0 ? [1, 2, 3, 4, 5] : [numLegs];
        return {
            callRes: MathUtils.findBestLadder(trades, 'Call', ctx, legCounts, allowRep),
            putRes: MathUtils.findBestLadder(trades, 'Put', ctx, legCounts, allowRep),
        };
    }, [trades, atmIvByExpiry, priceSource, numLegs, allowRep]);

    const recommendedKeys = useMemo(() => {
        const s = new Set<string>();
        [callRes, putRes].forEach(r => {
            // A pool of one candidate carries no ranking information — never highlight it.
            if (r && r.poolSize > 1 && r.best.score >= RECOMMEND_MIN_SCORE) {
                r.best.legs.forEach(leg => s.add(`${leg.type === 'Call' ? 'C' : 'P'}-${leg.strike}-${leg.expiry}`));
            }
        });
        return s;
    }, [callRes, putRes]);

    const { exps, putK, callK, cells } = useMemo(() => {
        if (!opts.length) return { exps: [] as ExpiryCol[], putK: [] as number[], callK: [] as number[], cells: {} as Record<string, CellData> };
        const f = opts.filter(o => o.dte > MIN_DTE_DAYS);
        const em = new Map<string, { ts: number; dte: number; fp: number }>();
        f.forEach(o => { if (!em.has(o.expiry)) em.set(o.expiry, { ts: o.expiryTs, dte: o.dte, fp: o.futuresPrice }); });

        const expsArr: ExpiryCol[] = [];
        em.forEach((v, k) => { expsArr.push({ label: k, ...v }); });
        const exps = expsArr.sort((a, b) => a.ts - b.ts);
        const ref = spot ?? exps[0]?.fp ?? cfg.fallbackSpot;
        const fFiltered = f.filter(o => Math.abs(o.strike - ref) <= cfg.strikeRange && (o.type === 'C' ? o.strike >= ref : o.strike <= ref));

        const pS = new Set<number>();
        const cS = new Set<number>();
        const cells: Record<string, CellData> = {};
        fFiltered.forEach(o => {
            if (priceSource === 'market' && o.bidPrice <= 0) return; // unquotable — renders as "—"
            const price = priceSource === 'market' ? o.bidPrice : o.markPrice;
            const feeUsd = MathUtils.deriveTakerFee(o.futuresPrice, price);
            const netPrem = Math.max(0, price - feeUsd);
            const days = o.tYears * 365;
            if (o.type === 'P') pS.add(o.strike); else cS.add(o.strike);
            cells[`${o.type}-${o.strike}-${o.expiry}`] = {
                apr: o.type === 'P'
                    ? MathUtils.calculatePutApr(netPrem, o.strike, days)
                    : MathUtils.calculateCallApr(netPrem, o.futuresPrice, days),
                markIv: o.markIv, markPrice: o.markPrice, bidPrice: o.bidPrice,
                futuresPrice: o.futuresPrice, dte: o.dte, premiumUsd: price, feeUsd,
                probExercise: o.probExercise, greeks: o.greeks,
            };
        });
        return { exps, putK: Array.from(pS).sort((a, b) => b - a), callK: Array.from(cS).sort((a, b) => a - b), cells };
    }, [opts, spot, priceSource, cfg]);

    const onHover = useCallback((tip: HoverTip | null) => setHoverTip(tip), []);
    const onHoverMeta = useCallback((m: MetaTip | null) => setHoverMeta(m), []);
    const onTogglePin = useCallback((k: string, x: number, y: number) => {
        setPinnedLocs(p => {
            const o = { ...p };
            if (o[k]) delete o[k]; else o[k] = { x, y };
            return o;
        });
        setHoverTip(null);
    }, []);
    const onToggleExp = useCallback((label: string) => {
        setExcludedExp(p => { const n = new Set(p); n.has(label) ? n.delete(label) : n.add(label); return n; });
    }, []);
    const onPriceSource = useCallback((s: 'mark' | 'market') => setPriceSource(s), []);
    const onAllowRep = useCallback((v: boolean) => setAllowRep(v), []);
    const onNumLegs = useCallback((v: number) => setNumLegs(v), []);
    const onMaxPexCap = useCallback((v: number) => setMaxPexCap(v), []);

    const staleWithData = st.opt === 'err' && opts.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, overflow: 'hidden', gap: '2px' }}>
            <ControlBar
                st={st} allowRep={allowRep} numLegs={numLegs} maxPexCap={maxPexCap}
                dataAt={dataAt} countdown={countdown}
                onAllowRep={onAllowRep} onNumLegs={onNumLegs} onMaxPexCap={onMaxPexCap}
            />

            {staleWithData && (
                <div role="alert" style={{ padding: '3px 8px', fontSize: 'var(--t-meta)', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    Live refresh is failing — showing data from {dataAt?.toLocaleTimeString('en-GB')}.
                    <button onClick={refresh} style={{ padding: '0 8px', borderRadius: '3px', border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', cursor: 'pointer', fontWeight: 600 }}>Retry now</button>
                </div>
            )}

            <StrategyPanel
                call={callRes} put={putRes} asset={asset} spot={spot} dvol={dvol}
                priceSource={priceSource} exps={exps} excludedExp={excludedExp} loading={loading}
                onPriceSource={onPriceSource} onToggleExp={onToggleExp} onHoverMeta={onHoverMeta}
            />

            <YieldMatrix
                exps={exps} putK={putK} callK={callK} cells={cells}
                recommendedKeys={recommendedKeys} excludedExp={excludedExp} maxPexCap={maxPexCap}
                deribitPrices={deribitPrices} priceSource={priceSource} darkMode={darkMode}
                assetSymbol={cfg.symbol} pinnedLocs={pinnedLocs} spot={spot} strikeRange={cfg.strikeRange}
                loading={loading} hasError={st.opt === 'err'} onRetry={refresh}
                onHover={onHover} onTogglePin={onTogglePin}
            />

            <div style={{ flex: '0 0 auto', padding: '2px 0', fontSize: 'var(--t-micro)', color: 'var(--text-muted)', textAlign: 'center' }}>
                Market data: Derive & Deribit public APIs · yields are estimates net of est. taker fees · nothing here is financial advice — for education only.
            </div>

            {/* Pinned detail cards render here at fixed viewport coordinates so the
                tables' scroll containers can never clip them. A pin whose cell
                vanished (e.g. bid dried up in Market mode) simply shows nothing. */}
            {Object.entries(pinnedLocs).map(([k, pos]) => {
                const d = cells[k];
                if (!d) return null;
                const [t, strikeStr, ...expParts] = k.split('-');
                return (
                    <Tooltip
                        key={k}
                        tip={{ d: { ...d, type: t === 'P' ? 'Put' : 'Call', strike: Number(strikeStr), exp: expParts.join('-') }, x: pos.x, y: pos.y }}
                        onClose={() => onTogglePin(k, 0, 0)}
                        priceSource={priceSource} assetSymbol={cfg.symbol} onHoverMeta={onHoverMeta}
                    />
                );
            })}
            {hoverTip && !pinnedLocs[`${hoverTip.d.type === 'Put' ? 'P' : 'C'}-${hoverTip.d.strike}-${hoverTip.d.exp}`] && (
                <Tooltip tip={hoverTip} priceSource={priceSource} assetSymbol={cfg.symbol} onHoverMeta={onHoverMeta} />
            )}
            {hoverMeta && <MetaTooltip tip={hoverMeta} />}
        </div>
    );
}
