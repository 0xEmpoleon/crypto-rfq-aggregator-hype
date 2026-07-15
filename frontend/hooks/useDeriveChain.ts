"use client";
import { useCallback, useEffect, useState } from 'react';
import * as MathUtils from '../utils/optionsMath';
import { parseInst, expiryToDate, expiryLabel } from '../utils/instruments';
import { POLL_INTERVAL_MS } from '../config/constants';
import { AssetSymbol } from '../config/assets';
import type {
    ParsedOption, FeedStatus, Status,
    DeriveTickersResponse, DeriveInstrumentsResponse, DerivePerpTickerResponse,
} from '../types';

const MS_PER_YEAR = 365 * 86400000;

export interface DeriveChain {
    spot: number | null;
    dvol: number | null;
    /** Per-expiry-label ATM IV (%) — the skew baseline for vol edge. */
    atmIvByExpiry: Record<string, number>;
    opts: ParsedOption[];
    /** true until the first fetch for this asset settles (ok or error). */
    loading: boolean;
    dataAt: Date | null;
    st: FeedStatus;
    countdown: number;
    refresh: () => void;
}

/**
 * Polls Derive every POLL_INTERVAL_MS for the selected asset: PERP spot and
 * the option instrument list in parallel, then every expiry's ticker chain
 * concurrently. All fetches carry an AbortSignal tied to the effect, and an
 * in-flight guard prevents overlapping ticks on slow networks.
 */
export function useDeriveChain(asset: AssetSymbol): DeriveChain {
    const [spot, setSpot] = useState<number | null>(null);
    const [dvol, setDvol] = useState<number | null>(null);
    const [atmIvByExpiry, setAtmIvByExpiry] = useState<Record<string, number>>({});
    const [opts, setOpts] = useState<ParsedOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [dataAt, setDataAt] = useState<Date | null>(null);
    const [st, setSt] = useState<FeedStatus>({ spot: 'load', opt: 'load', dvol: 'load' });
    const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);
    const [refreshKey, setRefreshKey] = useState(0);

    const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

    useEffect(() => {
        const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
        return () => clearInterval(t);
    }, []);

    // Hard reset happens ONLY on asset change — never on a manual refresh(), so
    // the "Retry now" button on the stale-data banner keeps the old matrix on
    // screen while it re-fetches instead of blanking it.
    useEffect(() => {
        setLoading(true); setOpts([]); setSpot(null); setDvol(null); setAtmIvByExpiry({}); setDataAt(null);
        setSt({ spot: 'load', opt: 'load', dvol: 'load' });
    }, [asset]);

    useEffect(() => {
        const ctrl = new AbortController();
        const { signal } = ctrl;
        // Per-effect-instance guard: an aborted run from a previous asset (whose
        // `finally` hasn't flushed yet) must never block THIS asset's first fetch.
        let inFlight = false;

        const go = async () => {
            if (inFlight) return;
            inFlight = true;
            setCountdown(POLL_INTERVAL_MS / 1000);
            const ns: FeedStatus = { spot: 'load', opt: 'load', dvol: 'load' };
            try {
                // Spot and the instrument list are independent — fetch together.
                const [spotRes, instRes] = await Promise.allSettled([
                    fetch(`/api/derive/ticker?instrument_name=${asset}-PERP`, { signal })
                        .then(r => r.json() as Promise<DerivePerpTickerResponse>),
                    fetch(`/api/derive/instruments?currency=${asset}`, { signal })
                        .then(r => r.json() as Promise<DeriveInstrumentsResponse>),
                ]);
                if (signal.aborted) return;

                let currentSpot = 0;
                if (spotRes.status === 'fulfilled') {
                    currentSpot = +(spotRes.value.result?.mark_price || 0);
                }
                if (currentSpot > 0) { setSpot(currentSpot); ns.spot = 'ok'; } else ns.spot = 'err';

                const instruments = instRes.status === 'fulfilled' ? instRes.value.result : undefined;
                if (!instruments?.length) {
                    ns.opt = 'err';
                    setLoading(false); setSt(ns);
                    return;
                }

                const exps = new Set<string>();
                instruments.forEach(it => { const p = it.instrument_name.split('-'); if (p.length === 4) exps.add(p[1]); });
                const now = Date.now();

                const perExpiry = await Promise.all(Array.from(exps).map(async (exp) => {
                    const out: ParsedOption[] = [];
                    try {
                        const tr = await fetch(`/api/derive/tickers?currency=${asset}&expiry_date=${exp}`, { signal });
                        const td = await tr.json() as DeriveTickersResponse;
                        if (!td.result?.tickers) return out;
                        for (const [name, it] of Object.entries(td.result.tickers)) {
                            const info = parseInst(name); if (!info || !it.M || +it.M <= 0) continue;
                            const ed = expiryToDate(info.expiry);
                            const tYears = (ed.getTime() - now) / MS_PER_YEAR;
                            const dte = Math.max(0, Math.ceil(tYears * 365));
                            if (tYears <= 0) continue;
                            const mp = +it.M; const bp = +(it.b || it.best_bid || 0); const ap = +(it.a || it.best_ask || 0);
                            const up = +(it.option_pricing?.f || it.I || 0); const iv = +(it.option_pricing?.i || 0) * 100;
                            // A row without a forward OR without an IV cannot be priced —
                            // ingesting iv=0 used to surface P(ex)=0 "risk-free" trades.
                            if (up <= 0 || iv <= 0) continue;
                            const greeks = MathUtils.calculateGreeks(up, info.strike, tYears, iv / 100, info.type);
                            const probExercise = MathUtils.calculateProbExercise(up, info.strike, tYears, iv / 100, info.type);
                            const tailLoss = MathUtils.calculateTailLoss(up, info.strike, tYears, iv / 100, info.type);
                            out.push({
                                instrument: name, strike: info.strike, expiry: expiryLabel(info.expiry),
                                expiryTs: ed.getTime(), type: info.type, markPrice: mp, bidPrice: bp, askPrice: ap,
                                markIv: iv, futuresPrice: up, dte, tYears, greeks, probExercise, tailLoss,
                            });
                        }
                    } catch { /* skip this expiry if its ticker fetch fails */ }
                    return out;
                }));
                if (signal.aborted) return;

                const arr = perExpiry.flat();
                if (arr.length > 0) {
                    ns.opt = 'ok';
                    // Per-expiry ATM IV (straddle average at the nearest strike) —
                    // baseline for vol edge and input to the 30d DVOL estimate.
                    const ref = currentSpot > 0 ? currentSpot : arr[0].futuresPrice;
                    const atmMap: Record<string, number> = {};
                    const expiryAtms: { dte: number; iv: number }[] = [];
                    const grouped = new Map<string, ParsedOption[]>();
                    arr.forEach(o => {
                        if (!grouped.has(o.expiry)) grouped.set(o.expiry, []);
                        grouped.get(o.expiry)!.push(o);
                    });
                    grouped.forEach((options, label) => {
                        let bestDiff = Infinity;
                        options.forEach(o => bestDiff = Math.min(bestDiff, Math.abs(o.strike - ref)));
                        const atATM = options.filter(o => Math.abs(o.strike - ref) === bestDiff);
                        const c = atATM.find(o => o.type === 'C'), p = atATM.find(o => o.type === 'P');
                        const iv = (c && p) ? (c.markIv + p.markIv) / 2 : (c?.markIv || p?.markIv || 0);
                        if (iv > 0) {
                            atmMap[label] = iv;
                            // Exact fractional days, not the ceil'd display dte — a
                            // 1.1-day expiry must weight variance as 1.1/365, not 2/365.
                            expiryAtms.push({ dte: options[0].tYears * 365, iv });
                        }
                    });
                    setAtmIvByExpiry(atmMap);
                    const dvolEst = MathUtils.estimateDvol(expiryAtms);
                    if (dvolEst > 0) { setDvol(dvolEst); ns.dvol = 'ok'; }
                } else ns.opt = 'err';

                setOpts(arr); setLoading(false); setDataAt(new Date());
            } catch {
                if (!signal.aborted) { ns.opt = 'err'; setLoading(false); }
            } finally {
                inFlight = false;
            }
            if (!signal.aborted) setSt(ns);
        };

        go();
        const iv = setInterval(go, POLL_INTERVAL_MS);
        return () => { ctrl.abort(); clearInterval(iv); };
    }, [asset, refreshKey]);

    return { spot, dvol, atmIvByExpiry, opts, loading, dataAt, st, countdown, refresh };
}
