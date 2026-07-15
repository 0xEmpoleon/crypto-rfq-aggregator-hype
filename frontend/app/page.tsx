"use client";

import React, { useEffect, useState } from 'react';
import DeriveAssetYields from '../components/DeriveAssetYields';
import { ASSETS, AssetSymbol } from '../config/assets';

const VIEW_LS_KEY = 'optionStrategist.view.v1';

export default function Dashboard() {
    // Stable default for SSR AND the first client render — React state must not
    // depend on the DOM during hydration. The dark→light FLASH is prevented by
    // the blocking <head> script (it stamps data-theme + CSS before paint); we
    // just mirror that decision into state on mount.
    const [darkMode, setDarkMode] = useState(true);
    const [asset, setAsset] = useState<AssetSymbol>('HYPE');
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        // Adopt whatever the blocking script already applied (localStorage / OS),
        // so the toggle label and later syncs match the painted theme.
        if (document.documentElement.dataset.theme === 'light') setDarkMode(false);
        try {
            const raw = localStorage.getItem(VIEW_LS_KEY);
            if (raw) {
                const v = JSON.parse(raw);
                if (ASSETS.includes(v.asset)) setAsset(v.asset);
            }
        } catch { /* storage unavailable */ }
        setHydrated(true);
    }, []);
    useEffect(() => {
        if (!hydrated) return;
        try { localStorage.setItem(VIEW_LS_KEY, JSON.stringify({ darkMode, asset })); } catch { }
    }, [darkMode, asset, hydrated]);

    // Only sync the attribute AFTER mount, so we never clobber the script's
    // pre-paint value before we've adopted it (which would re-introduce a flash).
    useEffect(() => {
        if (!hydrated) return;
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    }, [darkMode, hydrated]);

    return (
        <main className="container">
            <header className="header" style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h1>Option Strategist</h1>
                        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--t-label)', fontWeight: 400 }}>
                            Covered-call & CSP yields on Derive
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden', flexWrap: 'wrap' }} role="group" aria-label="Underlying asset">
                            {ASSETS.map((a, i) => (
                                <button
                                    key={a}
                                    onClick={() => setAsset(a)}
                                    aria-pressed={asset === a}
                                    style={{
                                        background: asset === a ? 'var(--active-bg)' : 'transparent',
                                        border: 'none', padding: '4px 12px', cursor: 'pointer',
                                        borderLeft: i > 0 ? '1px solid var(--border-color)' : 'none',
                                        fontSize: 'var(--t-label)', fontWeight: 600, color: asset === a ? 'var(--active-fg)' : 'var(--text-secondary)'
                                    }}>
                                    {a}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setDarkMode(!darkMode)}
                            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
                            style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                padding: '3px 10px',
                                cursor: 'pointer',
                                fontSize: 'var(--t-label)',
                                fontWeight: 500,
                                color: 'var(--text-secondary)',
                                fontFamily: 'var(--font-ui)',
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--active-bg)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
                        >
                            {darkMode ? '☀ Light' : '🌙 Dark'}
                        </button>
                    </div>
                </div>
            </header>
            <DeriveAssetYields asset={asset} darkMode={darkMode} />
        </main>
    );
}
