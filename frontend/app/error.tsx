"use client";

/**
 * App Router error boundary. A render throw anywhere in the client tree lands
 * here instead of a blank white screen; the user can recover without a reload.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <main className="container" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div className="neo-panel" role="alert" style={{ maxWidth: '32rem', textAlign: 'center', padding: '24px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--red)', marginBottom: '8px' }}>Something broke while rendering</div>
                <p style={{ fontSize: 'var(--t-data)', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
                    The market data or a calculation hit an unexpected value. Your inputs are safe — try again, and if it persists, reload the page.
                </p>
                {error?.message && (
                    <pre style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px', marginBottom: '16px', overflowX: 'auto', textAlign: 'left' }}>{error.message}</pre>
                )}
                <button onClick={reset} style={{ padding: '6px 18px', borderRadius: '4px', border: '1px solid var(--border-strong)', background: 'var(--active-bg)', color: 'var(--active-fg)', cursor: 'pointer', fontWeight: 600 }}>
                    Try again
                </button>
            </div>
        </main>
    );
}
