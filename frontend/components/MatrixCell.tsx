"use client";
import React, { memo } from 'react';
import type { CellData, HoverTip } from '../types';
import { heatColor } from '../utils/instruments';

export interface MatrixCellProps {
    cellKey: string;
    type: 'C' | 'P';
    strike: number;
    expLabel: string;
    data?: CellData;
    isRec: boolean;
    isExcluded: boolean;
    overCap: boolean;
    isPinned: boolean;
    dbitPrice?: number;
    darkMode: boolean;
    assetSymbol: string;
    onHover: (tip: HoverTip | null) => void;
    onTogglePin: (k: string, x: number, y: number) => void;
}

/**
 * One strike×expiry cell. Memoized so hover state (which lives in the page
 * root) re-renders only the floating tooltip, not ~140 cells per mouse move.
 */
export const MatrixCell = memo(function MatrixCell({
    cellKey: k, type, strike, expLabel, data: d, isRec, isExcluded, overCap,
    isPinned, dbitPrice, darkMode, assetSymbol, onHover, onTogglePin,
}: MatrixCellProps) {
    if (!d) {
        return <td style={{ color: 'var(--text-muted)', textAlign: 'center', borderBottom: '1px solid var(--border-color)', fontSize: 'var(--t-data)' }}>—</td>;
    }

    const isP = isPinned;
    const tipData = (): HoverTip['d'] => ({ ...d, type: type === 'P' ? 'Put' : 'Call', strike, exp: expLabel });

    // Cross-venue coloring: green = Derive premium richer than Deribit's
    // (better for a seller), red = cheaper.
    let priceColor = 'var(--text-primary)';
    if (dbitPrice && !isExcluded) {
        if (d.premiumUsd > dbitPrice * 1.001) priceColor = 'var(--green)';
        else if (d.premiumUsd < dbitPrice * 0.999) priceColor = 'var(--red)';
    }

    const bg = heatColor(d.apr, type, darkMode);
    const premAsset = d.premiumUsd / d.futuresPrice;
    const label = `${type === 'P' ? 'Put' : 'Call'} ${strike} ${expLabel}: ${d.apr.toFixed(1)} percent net APR, ${(d.probExercise * 100).toFixed(0)} percent exercise probability`;

    // The pinned detail card itself is rendered by the page root at fixed
    // viewport coordinates (see DeriveAssetYields) so it can never be clipped
    // by the tables' scroll containers; the cell only shows a pinned outline.
    return (
        <td onClick={(e) => onTogglePin(k, e.clientX, e.clientY)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    onTogglePin(k, r.right, r.top);
                }
            }}
            onMouseEnter={(e) => !isP && onHover({ d: tipData(), x: e.clientX, y: e.clientY })}
            onMouseLeave={() => !isP && onHover(null)}
            tabIndex={0}
            role="button"
            aria-pressed={isP}
            aria-label={label}
            style={{
                backgroundColor: bg,
                color: (isExcluded || overCap) ? 'var(--text-muted)' : (isRec ? (type === 'C' ? 'var(--yellow)' : 'var(--green)') : 'var(--text-primary)'),
                opacity: (isExcluded || overCap) ? 0.3 : undefined,
                padding: '2px 4px', fontSize: '11px', textAlign: 'center', cursor: 'pointer',
                borderBottom: '1px solid var(--border-color)',
                fontVariantNumeric: 'tabular-nums', fontWeight: isRec ? 700 : 400,
                boxShadow: isP
                    ? 'inset 0 0 0 1.5px var(--blue)'
                    : isRec ? `inset 0 0 0 1.5px ${type === 'C' ? 'var(--yellow)' : 'var(--green)'}` : 'none',
                height: '32px',
            }}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', alignItems: 'baseline', lineHeight: 1 }}>
                    <span style={{ fontSize: '12px' }}>{d.apr.toFixed(1)}%</span>
                    <span style={{ fontSize: '10px', opacity: 0.6 }}>{(d.probExercise * 100).toFixed(0)}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', fontSize: '10px', color: priceColor, opacity: isRec ? 1 : 0.7, fontWeight: dbitPrice ? 700 : 400, marginTop: '1px' }}>
                    {premAsset.toFixed(4)}{assetSymbol}
                </div>
            </div>
        </td>
    );
});
