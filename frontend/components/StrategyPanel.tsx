"use client";
import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import type { MetaTip, ExpiryCol } from '../types';
import type { LadderPick, StrategyLeg, FeeRole } from '../utils/optionsMath';
import { isRecommended } from '../utils/optionsMath';
import { RECOMMEND_MIN_SCORE } from '../config/constants';
import { AssetSymbol, getAssetConfig } from '../config/assets';
import { formatPrice } from '../utils/format';
import { deriveTradeUrl } from '../utils/instruments';
import { MetaLabel } from './Tooltips';

export type LadderResult = LadderPick;

/** Copies a Derive instrument name and briefly confirms — the app can't place
 *  the order, so the copyable name is how a user locates the strike on Derive. */
function CopyInstrument({ name }: { name: string }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>();
    useEffect(() => () => clearTimeout(timer.current), []);
    const copy = useCallback(() => {
        try {
            navigator.clipboard?.writeText(name);
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1200);
        } catch { /* clipboard blocked — no-op */ }
    }, [name]);
    return (
        <button type="button" onClick={copy} title={`Copy instrument name: ${name}`} aria-label={`Copy instrument name ${name}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--green)' : 'var(--text-muted)', fontSize: 'var(--t-micro)', padding: '0 2px', letterSpacing: '0.06em' }}>
            {copied ? '✓ copied' : '⧉ copy'}
        </button>
    );
}

const fmtUsd = (v: number, dec: number) => `$${formatPrice(v, Math.min(2, dec))}`;

function StrategyCard({ result, isCall, asset, spot, priceSource, feeRole, contracts, hasFairValue, loading, onHoverMeta }: {
    result: LadderResult | null;
    isCall: boolean;
    asset: AssetSymbol;
    spot: number | null;
    priceSource: 'mark' | 'market';
    feeRole: FeeRole;
    contracts: number;
    hasFairValue: boolean;
    loading: boolean;
    onHoverMeta: (m: MetaTip | null) => void;
}) {
    const cfg = getAssetConfig(asset, spot ?? result?.best.legs[0]?.futuresPrice ?? 0);
    const accent = isCall ? 'var(--call)' : 'var(--put)';
    const dir = isCall ? 'below' : 'above';
    const pDec = cfg.priceDecimals;
    if (!result) {
        return <div className="sc-empty">{loading ? 'Computing strategies…' : `No ${isCall ? 'CALL' : 'PUT'} candidates pass the current filters (DTE > 7d, net APR 5–300%, P(ex) cap${priceSource === 'market' ? ', live bid required' : ''}).`}</div>;
    }

    const l = result.best;
    const { legs, score, totalPrem, totalFees, avgApr, topFactor, probAllOTM, crossExpiry, evIsIndependent, ev, evAnnual, thetaEff, volEdge, edge, riskReturn } = l;
    const probAnyEx = 1 - probAllOTM;
    const recommended = isRecommended(result, RECOMMEND_MIN_SCORE);
    const { kind } = result;
    // Verdict badge: what kind of pick this is, in plain words.
    const verdict = kind === 'edge'
        ? { label: '+EV vs Deribit', color: 'var(--green)', text: 'Ranked on expected value against the matching Deribit marks, an independent venue. This ladder clears that fair value after fees.' }
        : kind === 'negative'
            ? { label: '−EV vs Deribit', color: 'var(--red)', text: 'Every candidate sells below the matching Deribit fair value after fees. This is still the best-ranked ladder available on Derive (on EV and edge vs Deribit, and premium per day), so it is selected — but the same strikes price higher on Deribit.' }
            : { label: 'Yield pick', color: 'var(--purple)', text: hasFairValue
                ? 'Deribit has no matching strikes for enough of these candidates, so there is no independent fair value. This is the best net premium per day inside your P(ex) cap, not an edge signal.'
                : `Deribit lists no ${asset} options, so there is no independent fair value. This is the best net premium per day inside your P(ex) cap, not an edge signal.` };
    const uniqueExpiries = Array.from(new Set(legs.map((x: StrategyLeg) => x.expiry))).join(' / ');
    const avgDte = (legs.reduce((sum: number, leg: StrategyLeg) => sum + leg.dte, 0) / legs.length).toFixed(0);
    const yieldOnCapital = legs.reduce((sum: number, leg: StrategyLeg) => {
        const cap = isCall ? (spot || leg.futuresPrice) : leg.strike;
        const net = Math.max(0, leg.premiumUsd - leg.feeUsd);
        return sum + (cap > 0 ? (net / cap) * (365 / Math.max(leg.tYears * 365, 0.5)) * 100 : 0);
    }, 0) / legs.length;

    // Position sizing: scale the ladder's per-contract figures by the contract
    // count. Capital and Max loss share ONE collateral basis (spot for the
    // covered-call coin, strike for the CSP) so the two figures reconcile.
    const collateralPerSet = legs.reduce((s, leg) => s + (isCall ? (spot || leg.futuresPrice) : leg.strike), 0);
    const maxLossPerSet = legs.reduce((s, leg) => {
        const collat = isCall ? (spot || leg.futuresPrice) : leg.strike;
        return s + Math.max(0, collat - Math.max(0, leg.premiumUsd - leg.feeUsd));
    }, 0);
    const netPremPerSet = totalPrem - totalFees;
    const posCapital = collateralPerSet * contracts;
    const posNetPrem = netPremPerSet * contracts;
    const posMaxLoss = maxLossPerSet * contracts;
    const feeNote = feeRole === 'maker'
        ? 'Estimated Derive MAKER fees: 0.01% of the index price per contract, no base fee, capped at 12.5% of the option value. Already subtracted from APR, EV and premium/day. Switch to Taker in the top bar if you cross the spread.'
        : `Estimated Derive TAKER fees: 0.03% of the index price per contract (capped at 12.5% of the option value) plus a $0.50 base fee per order, shared across your ${contracts} contract${contracts === 1 ? '' : 's'}. Already subtracted from APR, EV and premium/day.${priceSource === 'market' ? ' MARKET pricing sells into the bid, so it is always a taker fill.' : ''}`;
    const netPerLeg = (totalPrem - totalFees) / legs.length;
    const na = <span style={{ color: 'var(--dim)' }}>n/a</span>;

    return (
        <div className="sc-card" style={{ '--accent': accent } as React.CSSProperties}>
            <div className="sc-head">
                <div>
                    <div className="sc-title">
                        <span>{isCall ? 'Covered Call' : 'CSP'} Ladder</span>
                        <span className="sc-score" title="Relative score, 0–10, against every candidate in this pool">{score.toFixed(1)}</span>
                        <span className="unit" style={{ borderColor: verdict.color, color: verdict.color }}>
                            <MetaLabel title={verdict.label} text={verdict.text} label={verdict.label} onHoverMeta={onHoverMeta} />
                        </span>
                        {!recommended && (
                            <span className="unit">
                                <MetaLabel
                                    title="Not highlighted"
                                    text={result.poolSize <= 1
                                        ? 'Only one candidate ladder was found, so the relative score carries no information.'
                                        : `Score below the ${RECOMMEND_MIN_SCORE.toFixed(1)} recommendation threshold — shown for reference, not highlighted in the matrix.`}
                                    label="not rec."
                                    onHoverMeta={onHoverMeta}
                                />
                            </span>
                        )}
                    </div>
                    <div className="sc-meta">{uniqueExpiries} · {avgDte}d avg · {legs.length} legs · {topFactor} · {result.poolSize} candidates</div>
                </div>
                <div className="sc-apr">
                    <div className="v">{avgApr.toFixed(1)}%</div>
                    <div className="k">avg APR net {feeRole} fees ({priceSource})</div>
                </div>
            </div>
            <div className="sc-legs">
                {legs.map((leg: StrategyLeg, idx: number) => (
                    <div key={idx} className="sc-leg">
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="tri" aria-hidden>▸</span>Sell {isCall ? 'CC' : 'CSP'} <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${formatPrice(leg.strike)}</span> <span style={{ color: 'var(--text-muted)' }}>{leg.expiry}</span>
                            <CopyInstrument name={leg.instrument} />
                        </span>
                        <span>${leg.premiumUsd.toFixed(pDec)} · {(leg.premiumUsd / leg.futuresPrice).toFixed(4)}{cfg.symbol} · {leg.apr.toFixed(0)}% · P(ex) {(leg.probExercise * 100).toFixed(0)}%</span>
                    </div>
                ))}
            </div>

            {/* Position sizing — the per-contract ladder scaled to N contracts. */}
            <div className="sc-size">
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{contracts}×</span>
                <span><MetaLabel title="Capital required" text={`Collateral to hold this ladder ${contracts}× — ${isCall ? '1 coin at spot per covered call' : 'the strike in cash per CSP'}, summed across legs.`} label="Capital:" onHoverMeta={onHoverMeta} /> <b>{fmtUsd(posCapital, pDec)}</b></span>
                <span><MetaLabel title="Net premium collected" text="Total premium you keep across all legs if none are exercised, net of estimated fees, scaled to the contract count." label="Keep:" onHoverMeta={onHoverMeta} /> <b style={{ color: 'var(--accent)' }}>{fmtUsd(posNetPrem, 2)}</b></span>
                <span><MetaLabel title="Max loss (collateral → 0)" text="Structural worst case: the underlying / strike collateral goes to zero, net of premium kept. Displayed only — NOT a ranking input." label="Max loss:" onHoverMeta={onHoverMeta} /> <b style={{ color: 'var(--red)' }}>−{fmtUsd(posMaxLoss, pDec)}</b></span>
                <a href={deriveTradeUrl(asset)} target="_blank" rel="noopener noreferrer">Trade on Derive ↗</a>
            </div>

            <div className="sc-notes">
                {(() => {
                    const avgStrike = legs.reduce((s: number, lg: StrategyLeg) => s + lg.strike, 0) / legs.length;
                    const scaledCap = isCall ? (spot || legs[0].futuresPrice) : avgStrike;
                    // Net of fees, like APR and Keep — gross premium overstated B/E.
                    const scaledPrem = netPerLeg;
                    const breakeven = isCall ? scaledCap - scaledPrem : avgStrike - scaledPrem;
                    const maxExit = isCall ? avgStrike + scaledPrem : null;

                    return <><MetaLabel title="Capital per contract" text={isCall ? `Covered call collateral: 1 ${asset} per contract, valued at spot.` : 'Cash-secured put collateral: the strike in cash per contract.'} label="Cap req (1 ct):" onHoverMeta={onHoverMeta} /> <span className="hl">${scaledCap.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span> − ${scaledPrem.toFixed(pDec)} net prem = <span className="hl">${(scaledCap - scaledPrem).toLocaleString(undefined, { maximumFractionDigits: pDec })}</span> net · <span className="ac">{yieldOnCapital.toFixed(1)}% yield</span>
                        {isCall ? (
                            <> · Downside B/E: <span className="ac">${breakeven.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span> · Max Exit: <span className="ac">${maxExit?.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span></>
                        ) : (
                            <> · B/E: <span className="ac">${breakeven.toLocaleString(undefined, { maximumFractionDigits: pDec })}</span></>
                        )}
                    </>;
                })()}
                <br />
                <MetaLabel title="Expected Value (EV)" text={evIsIndependent
                    ? `Expected P/L for the short position: premium ${priceSource === 'market' ? '(live bid)' : '(mark)'} net of fees, minus the matching Deribit mark — an independent venue's fair value. Positive = you are selling above fair value.`
                    : `No independent fair value covers every leg, so EV can only be measured against Derive's own model — which is priced off the same mark, making it ≈ −fees${priceSource === 'market' ? ' − half the spread' : ''} by construction. Shown for transparency; not ranked.`} label="EV (1 ct):" onHoverMeta={onHoverMeta} /> ${(ev / legs.length).toFixed(pDec)} (${evAnnual.toFixed(pDec)}/yr){evIsIndependent ? '' : ' *'} · <MetaLabel title="P(any exercise)" text={`The probability that at least one leg finishes In-The-Money at expiry.${crossExpiry ? ' This ladder spans multiple expiries, so the figure is a LOWER bound — true joint risk is higher.' : ''}`} label="P(any ex):" onHoverMeta={onHoverMeta} /> <span className="ac">{crossExpiry ? '≥' : ''}{(probAnyEx * 100).toFixed(0)}%</span> · <MetaLabel title="Fees (est.)" text={feeNote} label="Fees:" onHoverMeta={onHoverMeta} /> <span style={{ color: 'var(--red)' }}>−${formatPrice(totalFees, 2)}</span> · <MetaLabel title="Premium / day" text="Net premium amortized over days to expiry — a decay proxy for the seller, NOT the Black-Scholes theta greek." label="Prem/day:" onHoverMeta={onHoverMeta} /> ${thetaEff.toFixed(pDec)}/d
                <br />
                <MetaLabel title="Edge / premium" text="EV as a share of the net premium you collect. For a short option this equals the binary Kelly fraction 1 − E[payoff] ÷ premium. Only meaningful against an independent fair value." label="Edge:" onHoverMeta={onHoverMeta} /> {evIsIndependent ? <span style={{ color: edge > 0 ? 'var(--green)' : 'var(--red)' }}>{(edge * 100).toFixed(1)}%</span> : na} · <MetaLabel title="Risk/Reward" text="EV over the expected exercise payoff (same fair value as EV). Moves in lock-step with Edge, so it is shown, not double-counted in the score." label="R/R:" onHoverMeta={onHoverMeta} /> {evIsIndependent ? riskReturn.toFixed(2) : na} · <MetaLabel title="Skew vs ATM (display only)" text="This strike's IV minus the ATM IV of the SAME expiry, as a fraction of ATM. Every OTM strike on a smile reads positive, so this describes the smile's shape — it is not evidence of mispricing and is not ranked." label="Skew:" onHoverMeta={onHoverMeta} /> {(volEdge * 100).toFixed(1)}% vs ATM
                <br />
                {asset} stays {dir} all strikes by {uniqueExpiries} → keep <span className="ac">${netPerLeg.toFixed(pDec)} net · {(netPerLeg / (spot || legs[0].futuresPrice)).toFixed(4)}{cfg.symbol}</span>
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
    feeRole: FeeRole;
    contracts: number;
    hasFairValue: boolean;
    exps: ExpiryCol[];
    excludedExp: Set<string>;
    loading: boolean;
    onPriceSource: (s: 'mark' | 'market') => void;
    onToggleExp: (label: string) => void;
    onHoverMeta: (m: MetaTip | null) => void;
}

export const StrategyPanel = memo(function StrategyPanel({
    call, put, asset, spot, dvol, priceSource, feeRole, contracts, hasFairValue, exps, excludedExp, loading,
    onPriceSource, onToggleExp, onHoverMeta,
}: StrategyPanelProps) {
    return (
        <section style={{ flex: '0 0 auto' }} aria-labelledby="rec-h">
            <div className="sec-row">
                <h2 id="rec-h" className="sec-h" style={{ flex: '1 1 220px' }}>Recommendations</h2>
                <div className="ctl-item sec-tools">
                    <MetaLabel title="Price source" text="MARK prices from Derive's model (always available, not directly executable). Market uses the live best bid only — strikes without a resting bid are excluded entirely rather than priced synthetically." label="PX" onHoverMeta={onHoverMeta} />
                    <div className="seg" role="group" aria-label="Price source">
                        <button type="button" onClick={() => onPriceSource('mark')} aria-pressed={priceSource === 'mark'}>Mark</button>
                        <button type="button" onClick={() => onPriceSource('market')} aria-pressed={priceSource === 'market'}>Market</button>
                    </div>
                    {spot != null && <span className="readout">{asset} <b>${formatPrice(spot)}</b></span>}
                    {dvol != null && <span className="readout">~30d ATM IV <b>{dvol.toFixed(1)}</b></span>}
                </div>
            </div>
            <div className="exp-row">
                <span>Expiries</span>
                {exps.map(e => (
                    <button key={e.label} type="button" className="chip" onClick={() => onToggleExp(e.label)} aria-pressed={!excludedExp.has(e.label)}>
                        {e.label}
                    </button>
                ))}
            </div>
            <div className="two-col" style={{ gap: '10px' }}>
                <StrategyCard result={call} isCall asset={asset} spot={spot} priceSource={priceSource} feeRole={feeRole} contracts={contracts} hasFairValue={hasFairValue} loading={loading} onHoverMeta={onHoverMeta} />
                <StrategyCard result={put} isCall={false} asset={asset} spot={spot} priceSource={priceSource} feeRole={feeRole} contracts={contracts} hasFairValue={hasFairValue} loading={loading} onHoverMeta={onHoverMeta} />
            </div>
        </section>
    );
});
