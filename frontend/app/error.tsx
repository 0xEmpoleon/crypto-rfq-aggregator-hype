"use client";

/**
 * App Router error boundary. A render throw anywhere in the client tree lands
 * here instead of a blank white screen; the user can recover without a reload.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <main className="container" style={{ alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div role="alert" style={{ maxWidth: '34rem', width: '100%', border: '1px solid #5a2a2a', background: '#140a08' }}>
                <div className="stripe" aria-hidden style={{ background: 'repeating-linear-gradient(-45deg, var(--red) 0 14px, #000 14px 28px)' }} />
                <div style={{ padding: '20px 22px' }}>
                    <div style={{ color: 'var(--red)', fontSize: 'var(--t-micro)', letterSpacing: '0.22em', marginBottom: '6px' }}>PATTERN RED // RENDER FAULT</div>
                    <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 900, fontSize: '26px', color: '#fff', lineHeight: 1.1, marginBottom: '10px' }}>Something broke while rendering</h1>
                    <p style={{ fontSize: 'var(--t-data)', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
                        The market data or a calculation hit an unexpected value. Your inputs are safe — try again, and if it persists, reload the page.
                    </p>
                    {error?.message && (
                        <pre style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)', background: '#000', border: '1px solid var(--line)', padding: '8px', marginBottom: '16px', overflowX: 'auto' }}>{error.message}</pre>
                    )}
                    <button type="button" onClick={reset} style={{ padding: '8px 20px', border: 0, background: 'var(--orange)', color: '#000', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.2em' }}>
                        TRY AGAIN
                    </button>
                </div>
            </div>
        </main>
    );
}
