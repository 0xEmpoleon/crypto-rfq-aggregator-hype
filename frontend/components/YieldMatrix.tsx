"use client";
import React, { memo } from 'react';
import type { CellData, DeribitMaps, ExpiryCol, HoverTip } from '../types';
import { MatrixCell } from './MatrixCell';
import { formatPrice } from '../utils/format';

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
    assetSymbol: string;
    pinnedLocs: Record<string, { x: number; y: number }>;
    spot: number | null;
    strikeRange: number;
    loading: boolean;
    hasError: boolean;
    onRetry: () => void;
    onHover: (tip: HoverTip | null) => void;
    onTogglePin: (k: string, x: number, y: number) => void;
}

const SIDES = [
    { t: 'C' as const, title: 'Covered calls', accent: 'var(--call)' },
    { t: 'P' as const, title: 'Cash-secured puts', accent: 'var(--put)' },
];

/**
 * The two strike×expiry heat-map tables. Memoized: hover state lives in the
 * page root, so mouse movement never re-renders the tables at all.
 */
export const YieldMatrix = memo(function YieldMatrix({
    exps, putK, callK, cells, recommendedKeys, excludedExp, maxPexCap, deribitPrices,
    priceSource, assetSymbol, pinnedLocs, spot, strikeRange, loading, hasError,
    onRetry, onHover, onTogglePin,
}: YieldMatrixProps) {

    const centered: React.CSSProperties = { flex: '1 1 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: 'var(--t-data)', minHeight: '120px' };
    // Cells color against whichever Deribit side is actually compared in this mode.
    const dbitMap = priceSource === 'mark' ? deribitPrices.mark : deribitPrices.bid;

    let body: React.ReactNode;
    if (loading && !exps.length) {
        body = <div style={centered} role="status"><span className="pulse">Loading option chains from Derive…</span></div>;
    } else if (hasError && !exps.length) {
        body = (
            <div style={centered} role="alert">
                <span style={{ color: 'var(--red)', letterSpacing: '0.12em' }}>PATTERN RED — could not load the option chain from Derive.</span>
                <button type="button" className="btn-line" onClick={onRetry}>Retry</button>
            </div>
        );
    } else if (!exps.length || (!putK.length && !callK.length)) {
        body = <div style={centered}>No eligible strikes within ±${formatPrice(strikeRange)} of the reference price{priceSource === 'market' ? ' with a resting bid. Switch to MARK to view indicative prices' : ''}.</div>;
    } else {
        body = (
            <div className="two-col" style={{ flex: '1 1 auto', overflow: 'hidden' }}>
                {SIDES.map(({ t, title, accent }) => (
                    <div key={t} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, '--accent': accent } as React.CSSProperties}>
                        <h3 className="side-h">{title}</h3>
                        <div className="table-scroll" style={{ overflow: 'auto', flex: '1 1 auto', border: '1px solid var(--line)' }}>
                            <table className="mx">
                                <caption className="sr-only">{t === 'C' ? 'Covered call' : 'Cash-secured put'} net APR by strike and expiry</caption>
                                <thead>
                                    <tr>
                                        <th scope="col" style={{ textAlign: 'right' }}>STRIKE</th>
                                        {exps.map(e => <th scope="col" key={e.label}>{e.label}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(t === 'C' ? callK : putK).map(s => (
                                        <tr key={s}>
                                            <th scope="row">${formatPrice(s)}</th>
                                            {exps.map(e => {
                                                const k = `${t}-${s}-${e.label}`;
                                                return (
                                                    <MatrixCell
                                                        key={k}
                                                        cellKey={k}
                                                        type={t}
                                                        strike={s}
                                                        expLabel={e.label}
                                                        data={cells[k]}
                                                        isRec={recommendedKeys.has(k)}
                                                        isExcluded={excludedExp.has(e.label)}
                                                        overCap={!!cells[k] && cells[k].probExercise * 100 > maxPexCap}
                                                        isPinned={!!pinnedLocs[k]}
                                                        dbitPrice={dbitMap[k]}
                                                        assetSymbol={assetSymbol}
                                                        onHover={onHover}
                                                        onTogglePin={onTogglePin}
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
        <section aria-labelledby="mx-h" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="sec-row">
                <h2 id="mx-h" className="sec-h" style={{ flex: '1 1 220px' }}>Covered yield matrix</h2>
                <div className="sec-tools ctl-item" style={{ textTransform: 'none', letterSpacing: '0.04em' }}>
                    <span>Cell: <b className="readout-b">net APR%</b> · <b className="readout-b">P(ex)%</b> · <b className="readout-b">premium ({assetSymbol})</b>
                        {Object.keys(dbitMap).length > 0 && <> · vs Deribit <span style={{ color: 'var(--green)' }}>▲ richer</span> / <span style={{ color: 'var(--red)' }}>▼ cheaper</span></>}</span>
                    <span className="readout" style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}>Spot <b>{spot != null ? `$${formatPrice(spot)}` : '—'}</b> · strikes ±40%</span>
                </div>
            </div>

            {body}
        </section>
    );
});
