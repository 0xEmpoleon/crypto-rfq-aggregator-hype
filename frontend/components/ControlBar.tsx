"use client";
import React, { memo } from 'react';
import type { FeeRole } from '../utils/optionsMath';

export interface ControlBarProps {
    allowRep: boolean;
    numLegs: number;
    maxPexCap: number;
    feeRole: FeeRole;
    /** MARKET pricing sells into the bid, which can only be a taker fill. */
    feeLocked: boolean;
    contracts: number;
    onAllowRep: (v: boolean) => void;
    onNumLegs: (v: number) => void;
    onMaxPexCap: (v: number) => void;
    onFeeRole: (r: FeeRole) => void;
    onContracts: (v: number) => void;
}

/** Strategy-search controls. Feed status and the data clock live in the Masthead. */
export const ControlBar = memo(function ControlBar({
    allowRep, numLegs, maxPexCap, feeRole, feeLocked, contracts,
    onAllowRep, onNumLegs, onMaxPexCap, onFeeRole, onContracts,
}: ControlBarProps) {
    return (
        <div className="ctl">
            <div className="ctl-item">
                <label htmlFor="legs-slider">Legs</label>
                <input id="legs-slider" type="range" min="0" max="5" value={numLegs} onChange={e => onNumLegs(+e.target.value)}
                    aria-label="Number of ladder legs (0 = automatic)" />
                <span className="ctl-val" style={{ minWidth: '2.6em' }}>{numLegs || 'AUTO'}</span>
            </div>

            <div className="ctl-item">
                <label htmlFor="pex-slider">P(ex) cap</label>
                <input id="pex-slider" type="range" min="5" max="90" value={maxPexCap} onChange={e => onMaxPexCap(+e.target.value)}
                    aria-label="Maximum acceptable probability of exercise, percent" />
                <span className="ctl-val" style={{ minWidth: '2.4em' }}>{maxPexCap}%</span>
            </div>

            <label className="ctl-item" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={allowRep} onChange={e => onAllowRep(e.target.checked)} />
                <span>Repeat legs</span>
            </label>

            <div className="ctl-item" title={feeLocked
                ? 'MARKET pricing sells into the resting bid — always a taker fill ($0.50 per order + 0.03% of index).'
                : 'Maker = post a resting quote (0.01% of index, no base fee). Taker = cross the spread ($0.50 per order + 0.03% of index).'}>
                <span>Fee</span>
                <div className="seg" role="group" aria-label="Fee role">
                    <button type="button" onClick={() => onFeeRole('maker')} aria-pressed={feeRole === 'maker'} disabled={feeLocked}>Maker</button>
                    <button type="button" onClick={() => onFeeRole('taker')} aria-pressed={feeRole === 'taker'}>Taker</button>
                </div>
            </div>

            <div className="ctl-item">
                <label htmlFor="contracts-input">Contracts</label>
                <input id="contracts-input" className="num" type="number" min="1" max="10000" step="1" value={contracts}
                    onChange={e => onContracts(+e.target.value)}
                    aria-label="Number of contracts for position sizing" />
            </div>
        </div>
    );
});
