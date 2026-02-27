import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const res = await fetch('https://api.lyra.finance/public/get_tickers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        console.log(`[Proxy] Fetched ${body.expiry_date} - Status: ${res.status}, Entries: ${data.result?.tickers ? Object.keys(data.result.tickers).length : 'None'}`);
        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: 'Failed to fetch tickers' }, { status: 500 });
    }
}
