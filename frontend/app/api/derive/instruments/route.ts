import { forwardToDerive, badRequest, CURRENCY_RE } from '../_upstream';

export async function GET(req: Request) {
    const currency = new URL(req.url).searchParams.get('currency') || '';
    if (!CURRENCY_RE.test(currency)) return badRequest('currency must be an uppercase symbol');
    return forwardToDerive('/public/get_instruments', {
        currency,
        instrument_type: 'option',
        expired: false,
    });
}
