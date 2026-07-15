"use client";
import React, { memo } from 'react';
import type { FeedStatus } from '../types';
import type { FeeRole } from '../utils/optionsMath';
import { Dot } from './Tooltips';

export interface ControlBarProps {
    st: FeedStatus;
    allowRep: boolean;
    numLegs: number;
    maxPexCap: number;
    feeRole: FeeRole;
    contracts: number;
    dataAt: Date | null;
    countdown: number;
    onAllowRep: (v: boolean) => void;
    onNumLegs: (v: number) => void;
    onMaxPexCap: (v: number) => void;
    onFeeRole: (r: FeeRole) => void;
    onContracts: (v: number) => void;
}

const fmtTime = (d: Date | null) => d ? d.toLocaleTimeString('en-GB') : '--:--:--';

const segBtn = (active: boolean): React.CSSProperties => ({
    padding: '2px 7px', fontSize: 'var(--t-micro)', border: 'none', borderRadius: '2px', cursor: 'pointer',
    minHeight: '20px', fontWeight: 600,
    background: active ? 'var(--blue)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
});

export const ControlBar = memo(function ControlBar({
    st, allowRep, numLegs, maxPexCap, feeRole, contracts, dataAt, countdown,
    onAllowRep, onNumLegs, onMaxPexCap, onFeeRole, onContracts,
}: ControlBarProps) {
    return (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '2px 0', borderBottom: '1px solid var(--border-color)', marginBottom: '2px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Dot s={st.spot} label="Spot" /> <Dot s={st.opt} label="Options" /> <Dot s={st.dvol} label="ATM IV" />
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--t-meta)', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={allowRep} onChange={e => onAllowRep(e.target.checked)} style={{ cursor: 'pointer' }} />
                    <span>Repeat legs</span>
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label htmlFor="legs-slider">Legs</label>
                    <input id="legs-slider" type="range" min="0" max="5" value={numLegs} onChange={e => onNumLegs(+e.target.value)}
                        aria-label="Number of ladder legs (0 = automatic)" style={{ width: '60px', cursor: 'pointer' }} />
                    <span style={{ minWidth: '1em', color: 'var(--blue)', fontWeight: 600 }}>{numLegs || 'A'}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label htmlFor="pex-slider">P(ex) cap</label>
                    <input id="pex-slider" type="range" min="5" max="90" value={maxPexCap} onChange={e => onMaxPexCap(+e.target.value)}
                        aria-label="Maximum acceptable probability of exercise, percent" style={{ width: '80px', cursor: 'pointer' }} />
                    <span style={{ minWidth: '2em', color: 'var(--yellow)', fontWeight: 600 }}>{maxPexCap}%</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Maker = post a resting quote (0.03% notional, no base fee). Taker = hit a resting bid ($0.50 + 0.04%).">
                    <span>Fee</span>
                    <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                        <button type="button" onClick={() => onFeeRole('maker')} aria-pressed={feeRole === 'maker'} style={segBtn(feeRole === 'maker')}>Maker</button>
                        <button type="button" onClick={() => onFeeRole('taker')} aria-pressed={feeRole === 'taker'} style={segBtn(feeRole === 'taker')}>Taker</button>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label htmlFor="contracts-input">Contracts</label>
                    <input id="contracts-input" type="number" min="1" max="10000" step="1" value={contracts}
                        onChange={e => onContracts(+e.target.value)}
                        aria-label="Number of contracts for position sizing"
                        style={{ width: '52px', minHeight: '22px', padding: '1px 4px', fontSize: 'var(--t-meta)', textAlign: 'right', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontVariantNumeric: 'tabular-nums' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '8px', borderLeft: '1px solid var(--border-color)' }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>Data: {fmtTime(dataAt)}</span>
                    <span aria-hidden>·</span>
                    <span style={{ width: '22px', color: countdown < 5 ? 'var(--red)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }} title="Seconds until next refresh">{countdown}s</span>
                </div>
            </div>
        </div>
    );
});
