"use client";
import { useEffect, useState } from 'react';
import { POLL_INTERVAL_MS } from '../config/constants';
import { AssetSymbol, DERIBIT_BOOK } from '../config/assets';
import type { DeribitMaps, DeribitBookResponse } from '../types';

const EMPTY: DeribitMaps = { mark: {}, bid: {}, ask: {} };

/** The USDC-linear book returns every linear coin at once (~1.6 MB raw,
 *  gzipped on the wire), so it is polled less often than the inverse book. */
const LINEAR_POLL_MS = 60000;

/** Deribit writes decimal strikes with a 'd' ("1d35" = 1.35). Normalising
 *  through Number makes the key match Derive's numeric strike exactly. */
const normStrike = (s: string) => String(Number(s.replace('d', '.')));

/**
 * Cross-venue reference prices from Deribit's public REST API (CORS-open,
 * fetched directly from the browser so each user consumes their own rate
 * limit). Keys are `TYPE-STRIKE-EXPIRY` using Deribit's own instrument-name
 * segments (e.g. "C-63000-4JUL26"), which `expiryLabel` mirrors exactly.
 *
 * - inverse (BTC, ETH): marks are in coin units → USD via each row's own
 *   underlying_price; rows without one are skipped rather than mispriced.
 * - linear (SOL, HYPE, XRP): `<SYM>_USDC-…` instruments, marks already USD.
 */
export function useDeribitMarks(asset: AssetSymbol): DeribitMaps {
    const book = DERIBIT_BOOK[asset] ?? null;
    const [maps, setMaps] = useState<DeribitMaps>(EMPTY);

    useEffect(() => {
        setMaps(EMPTY);
        if (!book) return;
        const ctrl = new AbortController();
        const currency = book === 'inverse' ? asset : 'USDC';
        const prefix = book === 'linear' ? `${asset}_USDC` : asset;

        const go = async () => {
            try {
                const r = await fetch(
                    `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`,
                    { signal: ctrl.signal }
                );
                const d = await r.json() as DeribitBookResponse;
                if (!d.result || ctrl.signal.aborted) return;
                const mark: Record<string, number> = {};
                const bid: Record<string, number> = {};
                const ask: Record<string, number> = {};
                d.result.forEach(it => {
                    const p = it.instrument_name.split('-');
                    if (p.length !== 4 || p[0] !== prefix) return;
                    const usd = book === 'inverse' ? it.underlying_price : 1;
                    if (!usd) return;
                    const key = `${p[3]}-${normStrike(p[2])}-${p[1]}`;
                    if (it.mark_price > 0) mark[key] = it.mark_price * usd;
                    if (it.bid_price) bid[key] = it.bid_price * usd;
                    if (it.ask_price) ask[key] = it.ask_price * usd;
                });
                setMaps({ mark, bid, ask });
            } catch { /* reference overlay is best-effort */ }
        };

        go();
        const iv = setInterval(go, book === 'linear' ? LINEAR_POLL_MS : POLL_INTERVAL_MS);
        return () => { ctrl.abort(); clearInterval(iv); };
    }, [asset, book]);

    return maps;
}
