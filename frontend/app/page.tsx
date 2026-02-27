"use client";

import React, { useEffect, useState } from 'react';
import DeriveAssetYields from '../components/DeriveAssetYields';

export default function Dashboard() {
    const [darkMode, setDarkMode] = useState(true);
    const [asset, setAsset] = useState<'BTC' | 'ETH' | 'SOL' | 'HYPE'>('HYPE');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

    const assets: ('BTC' | 'ETH' | 'SOL' | 'HYPE')[] = ['BTC', 'ETH', 'SOL', 'HYPE'];

    return (
        <main className="container">
            <header className="header" style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h1>Option Strategist</h1>
                        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--t-label)', fontWeight: 400 }}>
                            Automated Strategy Recommendations
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                            {assets.map((a, i) => (
                                <button
                                    key={a}
                                    onClick={() => setAsset(a)}
                                    style={{
                                        background: asset === a ? 'var(--border-strong)' : 'transparent',
                                        border: 'none', padding: '4px 12px', cursor: 'pointer',
                                        borderLeft: i > 0 ? '1px solid var(--border-color)' : 'none',
                                        fontSize: 'var(--t-label)', fontWeight: 600, color: asset === a ? 'var(--text-primary)' : 'var(--text-secondary)'
                                    }}>
                                    {a} (Derive)
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setDarkMode(!darkMode)}
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
            <DeriveAssetYields key={asset} asset={asset} darkMode={darkMode} />
        </main>
    );
}
