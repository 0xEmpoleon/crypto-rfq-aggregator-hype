import { forwardToDerive, badRequest, CURRENCY_RE } from '../_upstream';

export async function GET(req: Request) {
    const currency = new URL(req.url).searchParams.get('currency') || '';
    if (!CURRENCY_RE.test(currency)) return badRequest('currency must be an uppercase symbol');
    // v3 removed get_instruments. The live-name list is unpaginated and
    // includes every asset/type; expose only this currency's active options.
    return forwardToDerive('/public/get_all_live_instruments', {}, result => {
        if (!Array.isArray(result) || !result.every(name => typeof name === 'string')) {
            throw new Error('Invalid instrument names');
        }
        const optionName = new RegExp(`^${currency}-\\d{8}-\\d+(?:_\\d+)?-[CP]$`);
        return result.filter(name => optionName.test(name)).map(instrument_name => ({ instrument_name }));
    });
}
