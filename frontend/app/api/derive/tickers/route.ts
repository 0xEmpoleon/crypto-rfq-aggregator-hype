import { forwardToDerive, badRequest, CURRENCY_RE, EXPIRY_RE } from '../_upstream';

export async function GET(req: Request) {
    const params = new URL(req.url).searchParams;
    const currency = params.get('currency') || '';
    const expiry = params.get('expiry_date') || '';
    if (!CURRENCY_RE.test(currency)) return badRequest('currency must be an uppercase symbol');
    if (!EXPIRY_RE.test(expiry)) return badRequest('expiry_date must be YYYYMMDD');
    return forwardToDerive('/public/get_tickers', {
        currency,
        instrument_type: 'option',
        expiry_date: expiry,
    });
}
