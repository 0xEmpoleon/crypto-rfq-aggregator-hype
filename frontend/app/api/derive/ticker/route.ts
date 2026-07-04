import { forwardToDerive, badRequest, PERP_RE } from '../_upstream';

export async function GET(req: Request) {
    const name = new URL(req.url).searchParams.get('instrument_name') || '';
    if (!PERP_RE.test(name)) return badRequest('instrument_name must be a <CURRENCY>-PERP symbol');
    return forwardToDerive('/public/get_ticker', { instrument_name: name });
}
