/** Instrument-name parsing and display helpers shared by hooks and views. */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export interface InstrumentInfo {
    expiry: string; // YYYYMMDD
    strike: number;
    type: 'C' | 'P';
}

/** Parses a Derive instrument name, e.g. "BTC-20260704-63000-C". */
export function parseInst(n: string): InstrumentInfo | null {
    const p = n.split('-');
    return p.length === 4 ? { expiry: p[1], strike: +p[2].replace('_', '.'), type: p[3] as 'C' | 'P' } : null;
}

/** Derive options expire 08:00 UTC on the expiry date. */
export function expiryToDate(e: string): Date {
    const y = +e.slice(0, 4);
    const m = +e.slice(4, 6) - 1;
    const d = +e.slice(6, 8);
    return new Date(Date.UTC(y, m, d, 8));
}

/**
 * Display label for a YYYYMMDD expiry, e.g. "4JUL26".
 * The day is NOT zero-padded — this exactly matches Deribit instrument-name
 * segments, so the label doubles as the cross-venue lookup key. (The old
 * zero-padded '04JUL26' silently missed every 1st–9th-of-month expiry.)
 */
export function expiryLabel(e: string): string {
    const day = String(+e.slice(6, 8));
    const mon = MONTHS[+e.slice(4, 6) - 1];
    const yy = e.slice(2, 4);
    return `${day}${mon}${yy}`;
}

/** Heat-map background for a matrix cell, scaled 0–120% APR. */
export function heatColor(apr: number, type: 'P' | 'C', dark: boolean): string {
    const i = Math.min(Math.max(apr, 0), 120) / 120;
    if (dark) return type === 'P' ? `rgba(34,197,94,${0.03 + i * 0.22})` : `rgba(234,179,8,${0.03 + i * 0.18})`;
    return type === 'P' ? `rgba(34,197,94,${0.05 + i * 0.25})` : `rgba(234,179,8,${0.05 + i * 0.2})`;
}
