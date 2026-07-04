"use client";

import React, { useEffect, useState } from 'react';
import DeriveAssetYields from '../components/DeriveAssetYields';
import { ASSETS, AssetSymbol } from '../config/assets';

const VIEW_LS_KEY = 'optionStrategist.view.v1';

export default function Dashboard() {
    const [darkMode, setDarkMode] = useState(true);
    const [asset, setAsset] = useState<AssetSymbol>('HYPE');
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(VIEW_LS_KEY);
            if (raw) {
                const v = JSON.parse(raw);
                if (typeof v.darkMode === 'boolean') setDarkMode(v.darkMode);
                if (ASSETS.includes(v.asset)) setAsset(v.asset);
            }
        } catch { /* storage unavailable */ }
        setHydrated(true);
    }, []);
    useEffect(() => {
        if (!hydrated) return;
        try { localStorage.setItem(VIEW_LS_KEY, JSON.stringify({ darkMode, asset })); } catch { }
    }, [darkMode, asset, hydrated]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

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
                                        background: asset === a ? 'var(--border-strong)' : 'transparent',
                                        border: 'none', padding: '4px 12px', cursor: 'pointer',
                                        borderLeft: i > 0 ? '1px solid var(--border-color)' : 'none',
                                        fontSize: 'var(--t-label)', fontWeight: 600, color: asset === a ? 'var(--text-primary)' : 'var(--text-secondary)'
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
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--border-strong)')}
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
