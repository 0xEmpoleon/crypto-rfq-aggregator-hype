"use client";

import React, { useEffect, useState } from 'react';
import DeriveAssetYields from '../components/DeriveAssetYields';
import { AssetSymbol } from '../config/assets';
import { useOptionMarkets } from '../hooks/useOptionMarkets';

const VIEW_LS_KEY = 'optionStrategist.view.v1';

export default function Dashboard() {
    // Stable default for SSR AND the first client render — React state must not
    // depend on the DOM during hydration; the saved asset is adopted on mount.
    const [asset, setAsset] = useState<AssetSymbol>('HYPE');
    const [hydrated, setHydrated] = useState(false);
    const { markets, status: marketStatus, checkedAt, retry } = useOptionMarkets();
    const selectedIsLive = markets.some(m => m.symbol === asset);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(VIEW_LS_KEY);
            if (raw) {
                const v = JSON.parse(raw);
                if (typeof v.asset === 'string' && /^[A-Z0-9]{1,10}$/.test(v.asset)) setAsset(v.asset);
            }
        } catch { /* storage unavailable */ }
        setHydrated(true);
    }, []);
    useEffect(() => {
        if (!hydrated) return;
        try { localStorage.setItem(VIEW_LS_KEY, JSON.stringify({ asset })); } catch { }
    }, [asset, hydrated]);

    return (
        <main className="container">
            {/* The asset switcher is the tab bar, built from Derive's live option
                universe. The ▸ glyph is aria-hidden so each tab's accessible
                name is exactly its ticker. */}
            <nav id="nav" aria-label="Underlying asset">
                <span className="brand">NERV // OPTIONS</span>
                {markets.map(({ symbol: a, optionCount, expiryCount }) => (
                    <button key={a} type="button" onClick={() => setAsset(a)} aria-pressed={asset === a}
                        title={optionCount ? `${optionCount} listed options · ${expiryCount} expiries` : 'Last known options market; checking availability'}>
                        <span className="tri" aria-hidden>▸</span>{a}
                    </button>
                ))}
                <span role="status" className={`discovery ${marketStatus}`} title="Option markets are re-discovered from Derive every 5 minutes">
                    {marketStatus === 'loading' ? 'Checking live option markets…' : marketStatus === 'live'
                        ? `${markets.length} live option markets · checked ${checkedAt?.toLocaleTimeString('en-GB')}`
                        : `Market discovery unavailable — showing ${checkedAt ? 'last retrieved' : 'last known'} listings.`}
                    {marketStatus === 'stale' && <button type="button" className="btn-line" onClick={retry}>Retry markets</button>}
                </span>
            </nav>
            {checkedAt && !selectedIsLive
                ? (
                    <div className="deck">
                        <p role="status" className="sc-empty" style={{ marginTop: '16px' }}>
                            No active options are currently listed for {asset}. Select another market above.
                        </p>
                    </div>
                )
                : <DeriveAssetYields key={asset} asset={asset} />}
        </main>
    );
}
