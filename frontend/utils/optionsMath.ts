/**
 * Option Strategy Math & Statistics Utilities
 * 
 * Optimized for high-frequency strategy inference by pre-computing 
 * Black-Scholes greeks and probability metrics.
 */

/**
 * Normal Cumulative Distribution Function (Approximation)
 */
export function normCdf(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const t = 1 / (1 + p * Math.abs(x));
    return 0.5 * (1 + sign * (1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2)));
}

/**
 * Normal Probability Density Function
 */
export function normPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes Greeks Calculation
 */
export function calculateGreeks(S: number, K: number, T: number, sigma: number, type: 'C' | 'P') {
    if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 };
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);

    const Nd1 = normCdf(d1);
    const nPdfd1 = normPdf(d1);

    const delta = type === 'C' ? Nd1 : Nd1 - 1;
    const gamma = nPdfd1 / (S * sigma * sqrtT);
    const vega = S * nPdfd1 * sqrtT / 100;
    const theta = -(S * sigma * nPdfd1) / (2 * sqrtT) / 365;

    return { delta, gamma, theta, vega };
}

/**
 * Probability of Exercise (P(ex))
 */
export function calculateProbExercise(S: number, K: number, T: number, sigma: number, type: 'C' | 'P'): number {
    if (T <= 0 || sigma <= 0) return 0;
    const d2 = (Math.log(S / K) - 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
    return type === 'C' ? normCdf(d2) : normCdf(-d2);
}

/**
 * Conditional Tail Loss (Expected Shortfall / ITM Payoff)
 */
export function calculateTailLoss(S: number, K: number, T: number, sigma: number, type: 'C' | 'P'): number {
    if (T <= 0 || sigma <= 0) return 0;
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;

    if (type === 'P') {
        const Nd2 = normCdf(-d2);
        if (Nd2 < 1e-10) return 0;
        return Math.max(0, K * normCdf(-d2) - S * normCdf(-d1));
    } else {
        const Nd2 = normCdf(d2);
        if (Nd2 < 1e-10) return 0;
        return Math.max(0, S * normCdf(d1) - K * normCdf(d2));
    }
}

/**
 * APY Calculation for Puts (Cash Secured Puts)
 */
export function calculatePutApy(mp: number, fp: number, k: number, d: number): number {
    return d > 0 && k > 0 ? (mp / k) * (365 / d) * 100 : 0;
}

/**
 * APY Calculation for Calls (Covered Calls)
 */
export function calculateCallApy(mp: number, fp: number, d: number): number {
    return d > 0 && fp > 0 ? (mp / fp) * (365 / d) * 100 : 0;
}

/**
 * Array combination utility
 */
export function combinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    return [...combinations(rest, k - 1).map(c => [first, ...c]), ...combinations(rest, k)];
}

/**
 * Array combination with repetition utility
 */
export function combinationsWithRep<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const [first, ...rest] = arr;
    return [...combinationsWithRep(arr, k - 1).map(c => [first, ...c]), ...combinationsWithRep(rest, k)];
}

/**
 * Statistical Strategy Scoring
 */
export function scoreStrategy(legs: any[], dvolVal: number | null) {
    const n = legs.length;
    const dv = dvolVal || 100;
    let totalEv = 0, totalRisk = 0, totalPrem = 0, totalApy = 0, volEdgeSum = 0, thetaSum = 0;

    for (const l of legs) {
        const sigma = l.markIv / 100;
        const T = l.dte / 365;
        const pITM = l.probExercise;
        const tailLoss = l.tailLoss;
        const ev = l.premiumUsd * (1 - pITM) - tailLoss * pITM;
        const maxLoss = l.type === 'Put' ? Math.max(0, tailLoss) : l.futuresPrice * sigma * 2 * Math.sqrt(T);

        totalEv += ev;
        totalRisk += pITM * maxLoss;
        totalPrem += l.premiumUsd;
        totalApy += l.apy;
        volEdgeSum += (l.markIv - dv) / Math.max(dv, 1);
        thetaSum += l.premiumUsd / l.dte;
    }

    const avgDte = legs.reduce((s, l) => s + l.dte, 0) / n;
    const fp0 = legs[0].futuresPrice;
    const avgApy = totalApy / n;
    const evAnnual = totalEv * (365 / avgDte);
    const volEdge = volEdgeSum / n;
    const thetaEff = thetaSum;
    const riskReturn = totalRisk > 0 ? totalEv / totalRisk : 0;

    const maxPex = Math.max(...legs.map(l => l.probExercise));
    const probAllOTM = 1 - maxPex;
    const avgLoss = totalRisk / Math.max(maxPex, 0.01);

    const kelly = totalPrem > 0 ? Math.max(0, probAllOTM - maxPex * avgLoss / totalPrem) : 0;
    const strikes = legs.map(l => l.strike);
    const diversification = (Math.max(...strikes) - Math.min(...strikes)) / fp0;

    const factors = [evAnnual, Math.max(0, volEdge), riskReturn, thetaEff, kelly, diversification];

    return {
        ev: totalEv,
        evAnnual,
        volEdge,
        thetaEff,
        riskReturn,
        kelly,
        diversification,
        probAllOTM,
        totalPrem,
        avgApy,
        factors
    };
}

/**
 * Normalizes factors across multiple candidates and ranks them by weighted score.
 */
export function rankLadders(candidates: any[]): any[] {
    if (!candidates.length) return [];

    const W = [0.30, 0.20, 0.20, 0.15, 0.10, 0.05];
    const factorNames = ['Expected Value', 'Vol Edge', 'Risk/Return', 'Theta', 'Kelly', 'Diversification'];
    const nFactors = 6;

    const mins = Array(nFactors).fill(Infinity);
    const maxs = Array(nFactors).fill(-Infinity);

    for (const c of candidates) {
        for (let i = 0; i < nFactors; i++) {
            mins[i] = Math.min(mins[i], c.factors[i]);
            maxs[i] = Math.max(maxs[i], c.factors[i]);
        }
    }

    return candidates.map(c => {
        let score = 0;
        let topContrib = 0;
        let topIdx = 0;
        for (let i = 0; i < nFactors; i++) {
            const range = maxs[i] - mins[i];
            const norm = range > 1e-10 ? (c.factors[i] - mins[i]) / range : 0.5;
            const contrib = W[i] * norm;
            score += contrib;
            if (contrib > topContrib) { topContrib = contrib; topIdx = i; }
        }
        const score10 = Math.min(10, Math.max(0, score * 10));
        return { ...c, score: score10, topFactor: factorNames[topIdx] };
    }).sort((a, b) => b.score - a.score);
}

/**
 * Core Strategy Finder
 */
export function buildOptimalLadder(trades: any[], type: 'Call' | 'Put', dvolVal: number | null, numLegs: number, allowRep: boolean): any | null {
    const ofType = trades.filter(t => t.type === type);
    if (!allowRep && ofType.length < numLegs) return null;
    if (allowRep && ofType.length === 0) return null;

    const unique = new Map<string, any>();
    for (const t of ofType) {
        const key = `${t.strike}-${t.expiry}`;
        if (!unique.has(key)) unique.set(key, t);
    }

    const all = Array.from(unique.values()).sort((a, b) => b.apy - a.apy);
    const allCandidates: any[] = [];

    const perExpiryCap = allowRep ? Math.min(5, numLegs + 2) : Math.max(8, numLegs + 5);
    const byExpiry = new Map<string, any[]>();
    for (const t of all) {
        const arr = byExpiry.get(t.expiry) || [];
        arr.push(t);
        byExpiry.set(t.expiry, arr);
    }

    for (const [, expTrades] of Array.from(byExpiry.entries())) {
        const opts = expTrades.sort((a, b) => type === 'Call' ? a.strike - b.strike : b.strike - a.strike).slice(0, perExpiryCap);
        if (!allowRep && opts.length < numLegs) continue;
        const combos = allowRep ? combinationsWithRep(opts, numLegs) : combinations(opts, numLegs);
        for (const combo of combos) {
            const stats = scoreStrategy(combo, dvolVal);
            allCandidates.push({ legs: combo, ...stats });
        }
    }

    const topCap = allowRep ? 8 : 15;
    const top = all.slice(0, topCap);
    if ((allowRep && top.length > 0) || (!allowRep && top.length >= numLegs)) {
        const seen = new Set<string>();
        const combos = allowRep ? combinationsWithRep(top, numLegs) : combinations(top, numLegs);
        for (const combo of combos) {
            const key = combo.map((x: any) => `${x.strike}-${x.expiry}`).sort().join('|');
            if (!seen.has(key)) {
                seen.add(key);
                const stats = scoreStrategy(combo, dvolVal);
                allCandidates.push({ legs: combo, ...stats });
            }
        }
    }

    if (!allCandidates.length) return null;
    return rankLadders(allCandidates)[0] || null;
}

/**
 * DVOL Estimation via Linear Variance Interpolation
 */
export function estimateDvol(expiryAtms: { dte: number; iv: number }[]): number {
    if (expiryAtms.length === 0) return 0;
    if (expiryAtms.length === 1) return expiryAtms[0].iv;

    const sorted = [...expiryAtms].sort((a, b) => a.dte - b.dte);
    const e1 = [...sorted].reverse().find(e => e.dte <= 30);
    const e2 = sorted.find(e => e.dte > 30);

    if (e1 && e2) {
        const t1 = e1.dte / 365, t2 = e2.dte / 365, t30 = 30 / 365;
        const var1 = e1.iv * e1.iv * t1, var2 = e2.iv * e2.iv * t2;
        const var30 = var1 + (var2 - var1) * ((t30 - t1) / (t2 - t1));
        return Math.sqrt(Math.max(0, var30) / t30);
    } else if (e1) return e1.iv;
    else if (e2) return e2.iv;

    return 0;
}
