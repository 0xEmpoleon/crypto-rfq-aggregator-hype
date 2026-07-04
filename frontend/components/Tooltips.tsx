"use client";
import React from 'react';
import type { HoverTip, MetaTip, Status } from '../types';
import { deriveTakerFee } from '../utils/optionsMath';

/** Dashed-underline label that explains itself in a MetaTooltip on hover. */
export function MetaLabel({ title, text, label, onHoverMeta }: {
    title: string; text: string; label: string;
    onHoverMeta: (m: MetaTip | null) => void;
}) {
    return (
        <span
            onMouseEnter={(e) => onHoverMeta({ title, text, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => onHoverMeta(null)}
            style={{ borderBottom: '1px dashed var(--text-muted)', cursor: 'help', textUnderlineOffset: '2px' }}
        >
            {label}
        </span>
    );
}

export function MetaTooltip({ tip }: { tip: MetaTip }) {
    return (
        <div style={{ position: 'fixed', top: tip.y + 15, left: tip.x - 100, backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '4px', zIndex: 10000, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', width: '220px', pointerEvents: 'none', color: '#fff', fontSize: '11px', lineHeight: '1.4', backdropFilter: 'blur(4px)' }}>
            <div style={{ fontWeight: 800, marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '3px', color: 'var(--yellow)', fontSize: '10px', textTransform: 'uppercase' }}>{tip.title}</div>
            {tip.text}
        </div>
    );
}

/**
 * Cell detail card, rendered by the page root at fixed viewport coordinates
 * (never inside the scroll-clipped tables). With `onClose` it is an
 * interactive pinned card; without, a pass-through hover tooltip.
 */
export function Tooltip({ tip, onClose, priceSource, assetSymbol, onHoverMeta }: {
    tip: HoverTip; onClose?: () => void; priceSource: string;
    assetSymbol: string; onHoverMeta: (m: MetaTip | null) => void;
}) {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1600;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
    const style: React.CSSProperties = {
        position: 'fixed',
        top: Math.max(8, Math.min((tip.y || 100), vh - 430)),
        left: Math.max(8, Math.min((tip.x || 100) + 15, vw - 275)),
        backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-strong)', padding: '10px',
        borderRadius: '6px', zIndex: 9999, boxShadow: '0 10px 30px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.05)',
        width: '16rem', textAlign: 'left', pointerEvents: onClose ? 'auto' : 'none',
    };

    const d = tip.d;
    const feeUsd = d.feeUsd ?? deriveTakerFee(d.futuresPrice, d.premiumUsd);
    const netPrem = Math.max(0, d.premiumUsd - feeUsd);

    return (
        <div style={style}>
            {onClose && <button onClick={onClose} aria-label="Close details" style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', borderBottom: '1px solid var(--border-strong)', paddingBottom: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: d.type === 'Put' ? 'var(--green)' : 'var(--yellow)' }}></div>
                <div style={{ fontWeight: 800, fontSize: '13px', color: d.type === 'Put' ? 'var(--green)' : 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {d.type === 'Put' ? 'Strategy Note: CSP' : 'Strategy Note: Call'}
                </div>
            </div>

            <div style={{ fontSize: '11px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 0', color: 'var(--text-secondary)' }}>
                <span>Strike</span><span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>${d.strike.toLocaleString()}</span>
                <span>Expiry</span><span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>{d.exp} ({d.dte.toFixed(0)}d)</span>
                <span>IV</span><span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>{d.markIv?.toFixed(1)}%</span>
                <span>Prem $ ({priceSource})</span><span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>${d.premiumUsd?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <MetaLabel title="Estimated fee" text="Derive taker fee: $0.50 base + 0.04% of spot notional, capped at 12.5% of the option's value. Per 1 contract; makers pay less." label="Est. fee" onHoverMeta={onHoverMeta} />
                <span style={{ color: 'var(--red)', fontWeight: 600, textAlign: 'right' }}>−${feeUsd.toFixed(2)}</span>
                <span>Net prem</span><span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>${netPrem.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span>Prem {assetSymbol}</span><span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>{(d.premiumUsd / d.futuresPrice)?.toFixed(4)} {assetSymbol}</span>
            </div>

            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-strong)' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px', textTransform: 'uppercase', opacity: 0.8 }}>Values & Greeks</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 8px' }}>
                    <MetaLabel title="P(ex)" text="Probability of the option being In-The-Money (ITM) at expiration. A higher value means a higher risk of exercise." label="P(ex)" onHoverMeta={onHoverMeta} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{(d.probExercise * 100).toFixed(1)}%</span>

                    <MetaLabel title="Delta (Δ)" text="Measures the change in the option price for every $1 change in the underlying asset's price." label="Delta (Δ)" onHoverMeta={onHoverMeta} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{d.greeks?.delta?.toFixed(2)}</span>

                    <MetaLabel title="Gamma (Γ)" text="Measures the rate of change in Delta for every $1 change in the underlying asset's price. Highlights the sensitivity of Delta." label="Gamma (Γ)" onHoverMeta={onHoverMeta} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{d.greeks?.gamma?.toFixed(5)}</span>

                    <MetaLabel title="Theta (Θ) — seller" text="Daily time decay shown from the seller's side: positive = premium you collect per day as the option decays toward expiry." label="Theta (Θ)" onHoverMeta={onHoverMeta} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{(-(d.greeks?.theta ?? 0)).toFixed(2)}</span>

                    <MetaLabel title="Vega (ν)" text="Measures the sensitivity of the option price to a 1% change in the implied volatility (IV) of the underlying asset." label="Vega (ν)" onHoverMeta={onHoverMeta} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{d.greeks?.vega?.toFixed(2)}</span>
                </div>
            </div>

            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600 }}>EST. APR · NET FEES</span>
                <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>{d.apr.toFixed(1)}%</span>
            </div>
        </div>
    );
}

export function Dot({ s, label }: { s: Status; label: string }) {
    const state = s === 'ok' ? 'live' : s === 'err' ? 'error' : 'loading';
    return (
        <span title={label ? `${label}: ${state}` : state} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'var(--t-meta)', color: 'var(--text-secondary)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: s === 'ok' ? 'var(--green)' : s === 'err' ? 'var(--red)' : 'var(--yellow)' }} />
            {label}{s === 'err' && label ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>!</span> : null}
        </span>
    );
}
