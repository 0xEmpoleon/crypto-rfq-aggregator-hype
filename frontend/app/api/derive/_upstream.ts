import { NextResponse } from 'next/server';

const DERIVE_API = 'https://api.lyra.finance';

/** Chains move slowly at this app's 15s cadence — let Vercel's edge cache
 *  serve all concurrent users from ONE upstream call per URL per window. */
const CACHE_HEADER = 'public, s-maxage=15, stale-while-revalidate=45';

export const CURRENCY_RE = /^[A-Z0-9]{1,10}$/;
export const EXPIRY_RE = /^\d{8}$/;
export const PERP_RE = /^[A-Z0-9]{1,10}-PERP$/;

export function badRequest(msg: string) {
    return NextResponse.json({ error: msg }, { status: 400 });
}

/**
 * Forwards a validated, server-constructed body to one whitelisted Derive
 * endpoint. Client input never reaches the upstream URL or body directly.
 * Upstream failures surface with their real status instead of a masked 200.
 */
export async function forwardToDerive(path: string, body: Record<string, unknown>) {
    let res: Response;
    try {
        res = await fetch(`${DERIVE_API}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        return NextResponse.json({ error: 'Upstream unreachable' }, { status: 502 });
    }
    if (!res.ok) {
        return NextResponse.json({ error: `Upstream returned ${res.status}` }, { status: 502 });
    }
    let data: unknown;
    try {
        data = await res.json();
    } catch {
        return NextResponse.json({ error: 'Upstream returned non-JSON' }, { status: 502 });
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': CACHE_HEADER } });
}
