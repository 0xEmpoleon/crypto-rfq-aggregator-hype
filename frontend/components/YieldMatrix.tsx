"use client";
import React, { memo } from 'react';
import type { CellData, DeribitMaps, ExpiryCol, HoverTip, MetaTip } from '../types';
import { MatrixCell } from './MatrixCell';

export interface YieldMatrixProps {
    exps: ExpiryCol[];
    putK: number[];
    callK: number[];
    cells: Record<string, CellData>;
    recommendedKeys: Set<string>;
    excludedExp: Set<string>;
    maxPexCap: number;
    deribitPrices: DeribitMaps;
    priceSource: 'mark' | 'market';
    darkMode: boolean;
    assetSymbol: string;
    pinnedLocs: Record<string, { x: number; y: number }>;
    spot: number | null;
    strikeRange: number;
    loading: boolean;
    hasError: boolean;
    onRetry: () => void;
    onHover: (tip: HoverTip | null) => void;
    onTogglePin: (k: string, x: number, y: number) => void;
    onHoverMeta: (m: MetaTip | null) => void;
}

/**
 * The two strike×expiry heat-map tables. Memoized: hover state lives in the
 * page root, so mouse movement never re-renders the tables at all.
 */
export const YieldMatrix = memo(function YieldMatrix({
    exps, putK, callK, cells, recommendedKeys, excludedExp, maxPexCap, deribitPrices,
    priceSource, darkMode, assetSymbol, pinnedLocs, spot, strikeRange, loading, hasError,
    onRetry, onHover, onTogglePin, onHoverMeta,
}: YieldMatrixProps) {

    const centered: React.CSSProperties = { flex: '1 1 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: 'var(--t-data)', minHeight: '120px' };

    let body: React.ReactNode;
    if (loading && !exps.length) {
        body = <div style={centered} role="status"><span className="pulse">Loading option chains from Derive…</span></div>;
    } else if (hasError && !exps.length) {
        body = (
            <div style={centered} role="alert">
                <span style={{ color: 'var(--red)', fontWeight: 600 }}>Could not load the option chain from Derive.</span>
                <button onClick={onRetry} style={{ padding: '4px 14px', borderRadius: '4px', border: '1px solid var(--border-strong)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
            </div>
        );
    } else if (!exps.length) {
        body = <div style={centered}>No liquid strikes within ±${strikeRange.toLocaleString()} of spot{priceSource === 'market' ? ' with a resting bid' : ''}.</div>;
    } else {
        body = (
            <div className="two-col" style={{ flex: '1 1 auto', overflow: 'hidden' }}>
                {(['C', 'P'] as const).map(t => (
                    <div key={t} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div style={{ overflow: 'auto', flex: '1 1 auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', borderSpacing: 0 }}>
                                <caption className="sr-only">{t === 'C' ? 'Covered call' : 'Cash-secured put'} net APR by strike and expiry</caption>
                                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-panel)', zIndex: 10 }}>
                                    <tr>
                                        <th scope="col" style={{ textAlign: 'center', padding: '4px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-strong)' }}>Strike</th>
                                        {exps.map(e => <th scope="col" key={e.label} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', borderBottom: '1px solid var(--border-strong)', padding: '4px' }}>{e.label}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(t === 'C' ? callK : putK).map(s => (
                                        <tr key={s}>
                                            <th scope="row" style={{ fontSize: '12px', fontWeight: 700, padding: '4px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', textAlign: 'center' }}>${s.toLocaleString()}</th>
                                            {exps.map(e => {
                                                const k = `${t}-${s}-${e.label}`;
                                                const d = cells[k];
                                                const dbit = priceSource === 'mark' ? deribitPrices.mark[k] : deribitPrices.bid[k];
                                                return (
                                                    <MatrixCell
                                                        key={k}
                                                        cellKey={k}
                                                        type={t}
                                                        strike={s}
                                                        expLabel={e.label}
                                                        data={d}
                                                        isRec={recommendedKeys.has(k)}
                                                        isExcluded={excludedExp.has(e.label)}
                                                        overCap={!!d && d.probExercise * 100 > maxPexCap}
                                                        pinnedPos={pinnedLocs[k]}
                                                        dbitPrice={dbit}
                                                        darkMode={darkMode}
                                                        assetSymbol={assetSymbol}
                                                        priceSource={priceSource}
                                                        onHover={onHover}
                                                        onTogglePin={onTogglePin}
                                                        onHoverMeta={onHoverMeta}
                                                    />
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="neo-panel" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0, marginTop: '0px', padding: '5px 12px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '15px', color: 'var(--yellow)', filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.5))', lineHeight: 1 }} aria-hidden>⚡</span>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Covered Yield Matrix</div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Cell: <span style={{ color: 'var(--text-secondary)' }}>net APR%</span> · <span style={{ color: 'var(--text-secondary)' }}>P(ex)%</span> · <span style={{ color: 'var(--text-secondary)' }}>premium ({assetSymbol})</span>
                    {Object.keys(deribitPrices.mark).length > 0 && <> · vs Deribit: <span style={{ color: 'var(--green)' }}>richer</span>/<span style={{ color: 'var(--red)' }}>cheaper</span></>}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Spot: <span style={{ color: 'var(--blue)' }}>{spot != null ? `$${spot.toLocaleString()}` : '—'}</span></div>
            </div>

            <div className="two-col" style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    <span style={{ width: '8px', height: '2px', backgroundColor: 'var(--yellow)', borderRadius: '1px' }}></span> COVERED CALLS
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    <span style={{ width: '8px', height: '2px', backgroundColor: 'var(--green)', borderRadius: '1px' }}></span> CASH SECURED PUTS
                </div>
            </div>

            {body}
        </div>
    );
});
