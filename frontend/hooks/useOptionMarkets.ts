"use client";
import { useEffect, useState } from 'react';
import { ASSETS } from '../config/assets';
import type { OptionMarket } from '../utils/markets';

const REFRESH_MS = 5 * 60_000;

export function useOptionMarkets() {
    const [markets, setMarkets] = useState<OptionMarket[]>(ASSETS.map(symbol => ({ symbol, optionCount: 0, expiryCount: 0 })));
    const [status, setStatus] = useState<'loading' | 'live' | 'stale'>('loading');
    const [checkedAt, setCheckedAt] = useState<Date | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        let inFlight = false;
        const refresh = async () => {
            if (inFlight) return;
            inFlight = true;
            const request = new AbortController();
            const timeout = setTimeout(() => request.abort(), 12_000);
            const abort = () => request.abort();
            controller.signal.addEventListener('abort', abort);
            try {
                const response = await fetch('/api/derive/markets', { signal: request.signal });
                if (!response.ok) throw new Error('Market discovery failed');
                const data = await response.json();
                if (!Array.isArray(data.result) || !data.result.every((m: OptionMarket) =>
                    m && typeof m.symbol === 'string' && /^[A-Z0-9]{1,10}$/.test(m.symbol)
                    && Number.isInteger(m.optionCount) && m.optionCount > 0
                    && Number.isInteger(m.expiryCount) && m.expiryCount > 0)) throw new Error('Invalid markets');
                if (controller.signal.aborted) return;
                setMarkets(data.result);
                setCheckedAt(new Date());
                setStatus('live');
            } catch {
                if (!controller.signal.aborted) setStatus('stale');
            } finally {
                clearTimeout(timeout);
                controller.signal.removeEventListener('abort', abort);
                inFlight = false;
            }
        };
        refresh();
        const interval = setInterval(refresh, REFRESH_MS);
        return () => { controller.abort(); clearInterval(interval); };
    }, [refreshKey]);

    return { markets, status, checkedAt, retry: () => setRefreshKey(k => k + 1) };
}
