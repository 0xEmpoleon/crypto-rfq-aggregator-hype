/** Keep small-token strikes, premiums and fees distinct, including below $0.01. */
export function formatPrice(value: number, minimumDecimals = 0): string {
    if (!Number.isFinite(value)) return '—';
    const magnitude = Math.abs(value);
    const decimals = magnitude > 0 && magnitude < 1
        ? Math.min(12, Math.max(minimumDecimals, 3 - Math.floor(Math.log10(magnitude))))
        : Math.max(minimumDecimals, magnitude < 100 ? 4 : 2);
    return value.toLocaleString('en-US', { minimumFractionDigits: minimumDecimals, maximumFractionDigits: decimals });
}
