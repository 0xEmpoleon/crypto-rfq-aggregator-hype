"use client";
import { useEffect, useState } from 'react';
import { POLL_INTERVAL_MS } from '../config/constants';
import { AssetSymbol } from '../config/assets';
import type { DeribitMaps, DeribitBookResponse } from '../types';

const EMPTY: DeribitMaps = { mark: {}, bid: {}, ask: {} };

/**
 * Cross-venue reference prices from Deribit's public REST API (CORS-open,
 * fetched directly from the browser so each user consumes their own rate
 * limit). Keys are `TYPE-STRIKE-EXPIRY` using Deribit's own instrument-name
 * segments (e.g. "C-63000-4JUL26"), which `expiryLabel` mirrors exactly.
 * Prices are converted from coin units to USD via each row's own
 * underlying_price; rows without one are skipped rather than mispriced.
 */
export function useDeribitMarks(asset: AssetSymbol, enabled: boolean): DeribitMaps {
    const [maps, setMaps] = useState<DeribitMaps>(EMPTY);

    useEffect(() => {
        if (!enabled) { setMaps(EMPTY); return; }
        setMaps(EMPTY);
        const ctrl = new AbortController();

        const go = async () => {
            try {
                const r = await fetch(
                    `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${asset}&kind=option`,
                    { signal: ctrl.signal }
                );
                const d = await r.json() as DeribitBookResponse;
                if (!d.result || ctrl.signal.aborted) return;
                const mark: Record<string, number> = {};
                const bid: Record<string, number> = {};
                const ask: Record<string, number> = {};
                d.result.forEach(it => {
                    const p = it.instrument_name.split('-');
                    const und = it.underlying_price;
                    if (p.length !== 4 || !und) return;
                    const key = `${p[3]}-${p[2]}-${p[1]}`;
                    mark[key] = it.mark_price * und;
                    if (it.bid_price) bid[key] = it.bid_price * und;
                    if (it.ask_price) ask[key] = it.ask_price * und;
                });
                setMaps({ mark, bid, ask });
            } catch { /* reference overlay is best-effort */ }
        };

        go();
        const iv = setInterval(go, POLL_INTERVAL_MS);
        return () => { ctrl.abort(); clearInterval(iv); };
    }, [asset, enabled]);

    return maps;
}
