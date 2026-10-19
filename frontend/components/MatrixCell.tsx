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
    isPinned, dbitPrice, assetSymbol, onHover, onTogglePin,
}: MatrixCellProps) {
    if (!d) {
        return <td style={{ color: 'var(--dim)', textAlign: 'center', fontSize: 'var(--t-data)' }}>—</td>;
    }

    const isP = isPinned;
    const tipData = (): HoverTip['d'] => ({ ...d, type: type === 'P' ? 'Put' : 'Call', strike, exp: expLabel });

    // Cross-venue signal vs Deribit — encoded by a direction GLYPH (not colour
    // alone, which would collide with the green=puts heat and fail for
    // colour-blind users): ▲ richer (better for a seller), ▼ cheaper.
    let glyphColor = '';
    let venueGlyph = '';
    let venueLabel = '';
    if (dbitPrice && !isExcluded) {
        if (d.premiumUsd > dbitPrice * 1.001) { glyphColor = 'var(--green)'; venueGlyph = '▲'; venueLabel = ', premium richer than Deribit'; }
        else if (d.premiumUsd < dbitPrice * 0.999) { glyphColor = 'var(--red)'; venueGlyph = '▼'; venueLabel = ', premium cheaper than Deribit'; }
    }

    const accent = type === 'C' ? 'var(--call)' : 'var(--put)';
    const bg = heatColor(d.apr, type);
    const premAsset = d.premiumUsd / d.futuresPrice;
    const label = `${type === 'P' ? 'Put' : 'Call'} ${strike} ${expLabel}: ${d.apr.toFixed(1)} percent net APR, ${(d.probExercise * 100).toFixed(0)} percent exercise probability${venueLabel}`;

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
                color: (isExcluded || overCap) ? 'var(--text-muted)' : (isRec ? '#fff' : 'var(--text-primary)'),
                opacity: (isExcluded || overCap) ? 0.3 : undefined,
                padding: '2px 4px', fontSize: '11px', textAlign: 'center', cursor: 'pointer',
                fontVariantNumeric: 'tabular-nums', fontWeight: isRec ? 700 : 400,
                boxShadow: isP
                    ? 'inset 0 0 0 2px var(--pin)'
                    : isRec ? `inset 0 0 0 1.5px ${accent}, inset 4px 0 0 0 ${accent}` : 'none',
                height: '32px',
            }}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', alignItems: 'baseline', lineHeight: 1 }}>
                    <span style={{ fontSize: '12px' }}>{d.apr.toFixed(1)}%</span>
                    <span style={{ fontSize: '10px', opacity: 0.6 }}>{(d.probExercise * 100).toFixed(0)}%</span>
                </div>
                <div style={{
                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2px', fontSize: '10px',
                    color: venueGlyph ? '#fff' : 'var(--text-secondary)',
                    // Compared cells stay full-opacity with a lift shadow so the
                    // coloured text is legible over the translucent heat fill.
                    opacity: venueGlyph ? 1 : (isRec ? 1 : 0.7),
                    fontWeight: venueGlyph ? 700 : 400, marginTop: '1px',
                    textShadow: venueGlyph ? '0 0 3px rgba(0,0,0,0.9)' : 'none',
                }}>
                    {venueGlyph && <span aria-hidden style={{ fontSize: '8px', color: glyphColor }}>{venueGlyph}</span>}
                    {premAsset.toFixed(4)}{assetSymbol}
                </div>
            </div>
        </td>
    );
});
