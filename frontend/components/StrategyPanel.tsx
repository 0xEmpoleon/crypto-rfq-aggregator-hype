"use client";
import React, { memo } from 'react';
import type { MetaTip, ExpiryCol } from '../types';
import type { ScoredLadder, StrategyLeg } from '../utils/optionsMath';
import { RECOMMEND_MIN_SCORE } from '../config/constants';
import { AssetSymbol, ASSET_CONFIG } from '../config/assets';
import { MetaLabel } from './Tooltips';

export interface LadderResult { best: ScoredLadder; poolSize: number }

function StrategyCard({ result, isCall, asset, spot, priceSource, loading, onHoverMeta }: {
    result: LadderResult | null;
    isCall: boolean;
    asset: AssetSymbol;
    spot: number | null;
    priceSource: 'mark' | 'market';
    loading: boolean;
    onHoverMeta: (m: MetaTip | null) => void;
}) {
    const cfg = ASSET_CONFIG[asset];
    const accent = isCall ? 'var(--yellow)' : 'var(--green)';
    const dir = isCall ? 'below' : 'above';
    const pDec = cfg.priceDecimals;
    const emptyStyle: React.CSSProperties = { border: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '6px', borderRadius: '4px', color: 'var(--text-muted)', fontSize: 'var(--t-data)' };

    if (!result) {
        return <div style={emptyStyle}>{loading ? 'Computing strategies…' : `No ${isCall ? 'CALL' : 'PUT'} candidates pass the current filters (DTE > 7d, net APR 5–300%, P(ex) cap${priceSource === 'market' ? ', live bid required' : ''}).`}</div>;
    }

    const l = result.best;
    const { legs, score, totalPrem, totalFees, avgApr, topFactor, probAllOTM, crossExpiry, ev, evAnnual, thetaEff, volEdge, kelly, riskReturn } = l;
    const probAnyEx = 1 - probAllOTM;
    const recommended = result.poolSize > 1 && score >= RECOMMEND_MIN_SCORE;
    const uniqueExpiries = Array.from(new Set(legs.map((x: StrategyLeg) => x.expiry))).join(' / ');
    const avgDte = (legs.reduce((sum: number, leg: StrategyLeg) => sum + leg.dte, 0) / legs.length).toFixed(0);
    const yieldOnCapital = legs.reduce((sum: number, leg: StrategyLeg) => {
        const cap = isCall ? (spot || leg.futuresPrice) : leg.strike;
        const net = Math.max(0, leg.premiumUsd - leg.feeUsd);
        return sum + (cap > 0 ? (net / cap) * (365 / Math.max(leg.tYears * 365, 0.5)) * 100 : 0);
    }, 0) / legs.length;

    return (
        <div style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', borderRadius: '4px', borderLeft: `3px solid ${accent}`, overflow: 'hidden' }}>
            <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: 'var(--t-label)', textTransform: 'uppercase', color: accent }}>{isCall ? 'Covered Call' : 'CSP'} Ladder</span>
                        <span style={{ fontSize: 'var(--t-micro)', fontWeight: 700, color: accent, background: 'rgba(255,255,255,0.05)', padding: '0 4px', borderRadius: '3px', border: `1px solid ${accent}` }}>{score.toFixed(1)}</span>
                        {!recommended && (
                            <MetaLabel
                                title="Not highlighted"
                                text={result.poolSize <= 1
                                    ? 'Only one candidate ladder was found, so the relative score carries no information.'
                                    : `Score below the ${RECOMMEND_MIN_SCORE.toFixed(1)} recommendation threshold — shown for reference, not highlighted in the matrix.`}
                                label="not rec."
                                onHoverMeta={onHoverMeta}
                            />
                        )}
                    </div>
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>{uniqueExpiries} · {avgDte}d avg · {legs.length} legs · {topFactor} · {result.poolSize} candidates</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 'var(--t-hero)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1' }}>{avgApr.toFixed(1)}%</div>
                    <div style={{ fontSize: 'var(--t-micro)', color: 'var(--text-muted)' }}>avg APR net fees ({priceSource})</div>
                </div>
            </div>
            <div style={{ padding: '0 8px 4px', fontSize: 'var(--t-meta)', fontVariantNumeric: 'tabular-nums' }}>
                {legs.map((leg: StrategyLeg, idx: number) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', borderTop: idx > 0 ? '1px solid var(--border-color)' : 'none', color: 'var(--text-secondary)' }}>
                        <span>Sell {isCall ? 'CC' : 'CSP'} <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>${leg.strike.toLocaleString()}</span> <span style={{ color: 'var(--text-muted)' }}>{leg.expiry}</span></span>
                        <span>${leg.premiumUsd.toFixed(pDec)} · {(leg.premiumUsd / leg.futuresPrice).toFixed(4)}{cfg.symbol} · {leg.apr.toFixed(0)}% · P(ex) {(leg.probExercise * 100).toFixed(0)}%</span>
                    </div>
                ))}
            </div>
            <div style={{ padding: '4px 8px', borderTop: '1px solid var(--border-color)', fontSize: 'var(--t-meta)', color: 'var(--text-muted)', backgroundColor: 'rgba(0,0,0,0.2)', lineHeight: '1.4' }}>
                {(() => {
                    const avgStrike = legs.reduce((s: number, lg: StrategyLeg) => s + lg.strike, 0) / legs.length;
                    const scaledCap = isCall ? (spot || legs[0].futuresPrice) : avgStrike;
                    const scaledPrem = totalPrem / legs.length;
                    const breakeven = isCall ? scaledCap - scaledPrem : avgStrike - scaledPrem;
                    const maxExit = isCall ? avgStrike + scaledPrem : null;

                    return <><MetaLabel title="Capital per contract" text={isCall ? `Covered call collateral: 1 ${asset} per contract, valued at spot.` : 'Cash-secured put collateral: the strike in cash per contract.'} label="Cap req (1 ct):" onHoverMeta={onHoverMeta} /> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${scaledCap.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span> − ${scaledPrem.toFixed(pDec)} prem = <span style={{ fontWeight: 600 }}>${(scaledCap - scaledPrem).toLocaleString(undefined, { maximumFractionDigits: pDec })}</span> net · <span style={{ color: accent, fontWeight: 600 }}>{yieldOnCapital.toFixed(1)}% yield</span>
                        {isCall ? (
                            <> · Downside B/E: <span style={{ color: accent, fontWeight: 600 }}>${breakeven.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span> · Max Exit: <span style={{ color: accent, fontWeight: 600 }}>${maxExit?.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span></>
                        ) : (
                            <> · B/E: <span style={{ color: accent, fontWeight: 600 }}>${breakeven.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span></>
                        )}
                    </>;
                })()}
                <br />
                <MetaLabel title="Expected Value (EV)" text={`Expected P/L for the short position: premium collected net of estimated taker fees, minus the option's unconditional expected exercise payoff (Black-Scholes).${priceSource === 'mark' ? ' Under MARK pricing EV compares the venue mark to a model priced from that same mark IV, so it is excluded from the ranking score.' : ''}`} label="EV (1 ct):" onHoverMeta={onHoverMeta} /> ${(ev / legs.length).toFixed(pDec)} (${evAnnual.toFixed(pDec)}/yr) · <MetaLabel title="P(any exercise)" text={`The probability that at least one leg finishes In-The-Money at expiry.${crossExpiry ? ' This ladder spans multiple expiries, so the figure is a LOWER bound — true joint risk is higher.' : ''}`} label="P(any ex):" onHoverMeta={onHoverMeta} /> <span style={{ color: accent, fontWeight: 600 }}>{crossExpiry ? '≥' : ''}{(probAnyEx * 100).toFixed(0)}%</span> · <MetaLabel title="Fees (est.)" text="Estimated Derive taker fees across all legs: $0.50 base + 0.04% of spot notional per contract, capped at 12.5% of the option's value. Already subtracted from APR, EV and premium/day." label="Fees:" onHoverMeta={onHoverMeta} /> <span style={{ color: 'var(--red)' }}>−${totalFees.toFixed(2)}</span> · <MetaLabel title="Premium / day" text="Net premium amortized over days to expiry — a decay proxy for the seller, NOT the Black-Scholes theta greek." label="Prem/day:" onHoverMeta={onHoverMeta} /> ${thetaEff.toFixed(pDec)}/d
                <br />
                <MetaLabel title="Volatility Edge (skew)" text="This strike's IV minus the ATM IV of the SAME expiry, as a fraction of ATM. A same-snapshot skew reading — positive means this strike is bid up vs its own expiry's ATM." label="Vol edge:" onHoverMeta={onHoverMeta} /> {(volEdge * 100).toFixed(1)}% vs ATM · <MetaLabel title="Edge Score (heuristic)" text="Internal edge-vs-variance ranking heuristic. NOT the literal Kelly criterion — do not use it to size capital." label="Edge:" onHoverMeta={onHoverMeta} /> {(kelly * 100).toFixed(1)}% · <MetaLabel title="Risk/Reward Ratio" text="Net EV over probability-weighted structural risk across the ladder." label="R/R:" onHoverMeta={onHoverMeta} /> {riskReturn.toFixed(2)}
                <br />
                {asset} stays {dir} all strikes by {uniqueExpiries} → keep <span style={{ color: accent, fontWeight: 600 }}>${((totalPrem - totalFees) / legs.length).toFixed(pDec)} net · {((totalPrem - totalFees) / legs.length / (spot || legs[0].futuresPrice)).toFixed(4)}{cfg.symbol}</span>
            </div>
        </div>
    );
}

export interface StrategyPanelProps {
    call: LadderResult | null;
    put: LadderResult | null;
    asset: AssetSymbol;
    spot: number | null;
    dvol: number | null;
    priceSource: 'mark' | 'market';
    exps: ExpiryCol[];
    excludedExp: Set<string>;
    loading: boolean;
    onPriceSource: (s: 'mark' | 'market') => void;
    onToggleExp: (label: string) => void;
    onHoverMeta: (m: MetaTip | null) => void;
}

export const StrategyPanel = memo(function StrategyPanel({
    call, put, asset, spot, dvol, priceSource, exps, excludedExp, loading,
    onPriceSource, onToggleExp, onHoverMeta,
}: StrategyPanelProps) {
    return (
        <div className="neo-panel" style={{ flex: '0 0 auto', marginTop: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px', flexWrap: 'wrap', gap: '4px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--t-title)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ color: 'var(--yellow)', filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.5))' }} aria-hidden>⚡</span> Recommendations
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-card)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                        <MetaLabel title="Price source" text="MARK prices from Derive's model (always available, not directly executable). Market uses the live best bid only — strikes without a resting bid are excluded entirely rather than priced synthetically." label="PX:" onHoverMeta={onHoverMeta} />
                        <button onClick={() => onPriceSource('mark')} aria-pressed={priceSource === 'mark'} style={{ padding: '0px 4px', fontSize: 'var(--t-micro)', border: 'none', background: priceSource === 'mark' ? 'var(--blue)' : 'transparent', color: priceSource === 'mark' ? 'white' : 'var(--text-muted)', cursor: 'pointer', borderRadius: '2px' }}>MARK</button>
                        <button onClick={() => onPriceSource('market')} aria-pressed={priceSource === 'market'} style={{ padding: '0px 4px', fontSize: 'var(--t-micro)', border: 'none', background: priceSource === 'market' ? 'var(--blue)' : 'transparent', color: priceSource === 'market' ? 'white' : 'var(--text-muted)', cursor: 'pointer', borderRadius: '2px' }}>Market</button>
                    </div>
                    {spot != null && <span style={{ fontSize: 'var(--t-data)', fontWeight: 600 }}>{asset} ${spot.toLocaleString()}</span>}
                    {dvol != null && <span style={{ fontSize: 'var(--t-data)', color: 'var(--text-secondary)' }}>30d ATM IV {dvol.toFixed(1)}</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>Expiries:</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {exps.map(e => (
                            <button key={e.label} onClick={() => onToggleExp(e.label)} aria-pressed={!excludedExp.has(e.label)}
                                style={{ padding: '1px 6px', fontSize: 'var(--t-micro)', borderRadius: '4px', border: '1px solid var(--border-color)', background: excludedExp.has(e.label) ? 'transparent' : 'var(--bg-panel)', color: excludedExp.has(e.label) ? 'var(--text-muted)' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>
                                {e.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="two-col" style={{ gap: '6px' }}>
                <StrategyCard result={call} isCall asset={asset} spot={spot} priceSource={priceSource} loading={loading} onHoverMeta={onHoverMeta} />
                <StrategyCard result={put} isCall={false} asset={asset} spot={spot} priceSource={priceSource} loading={loading} onHoverMeta={onHoverMeta} />
            </div>
        </div>
    );
});
