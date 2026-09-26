import { ASSETS } from '../config/assets';
import { expiryToDate } from './instruments';

export interface OptionMarket {
    symbol: string;
    optionCount: number;
    expiryCount: number;
}

/** Spot and perpetual listings alone never imply an options market. */
export function discoverOptionMarkets(result: unknown, now = Date.now()): OptionMarket[] {
    if (!Array.isArray(result) || !result.every(name => typeof name === 'string')) {
        throw new Error('Invalid instrument list');
    }
    const groups = new Map<string, { names: Set<string>; expiries: Set<string> }>();
    for (const name of result) {
        const match = /^([A-Z0-9]{1,10})-(\d{8})-(\d+(?:_\d+)?)-[CP]$/.exec(name);
        if (!match || !(Number(match[3].replace('_', '.')) > 0)) continue;
        const [, symbol, expiry] = match;
        const date = expiryToDate(expiry);
        if (!(date.getTime() > now) || date.toISOString().slice(0, 10).replace(/-/g, '') !== expiry) continue;
        const group = groups.get(symbol) ?? { names: new Set<string>(), expiries: new Set<string>() };
        group.names.add(name);
        group.expiries.add(expiry);
        groups.set(symbol, group);
    }
    return Array.from(groups, ([symbol, group]) => ({ symbol, optionCount: group.names.size, expiryCount: group.expiries.size }))
        .sort((a, b) => {
            const rank = (s: string) => ASSETS.includes(s) ? ASSETS.indexOf(s) : ASSETS.length;
            return rank(a.symbol) - rank(b.symbol) || a.symbol.localeCompare(b.symbol);
        });
}
