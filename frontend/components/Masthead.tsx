"use client";
import React, { memo } from 'react';
import type { FeedStatus, Status } from '../types';

/* The app polls exactly three feeds, so each gets one MAGI unit — the same
   three-computer status the report panel shows. Order and names are fixed. */
const UNITS: { key: keyof FeedStatus; magi: string; feed: string }[] = [
    { key: 'spot', magi: 'MELCHIOR-1', feed: 'SPOT' },
    { key: 'opt', magi: 'BALTHASAR-2', feed: 'OPTIONS' },
    { key: 'dvol', magi: 'CASPER-3', feed: 'ATM IV' },
];

const STATE_WORD: Record<Status, string> = { ok: 'LIVE', load: 'SYNC', err: 'FAULT' };

const fmtTime = (d: Date | null) => d ? d.toLocaleTimeString('en-GB') : '--:--:--';

export interface MastheadProps {
    asset: string;
    st: FeedStatus;
    dataAt: Date | null;
    countdown: number;
}

/** Serif title card + MAGI feed status. Lives under the asset tab bar. */
export const Masthead = memo(function Masthead({ asset, st, dataAt, countdown }: MastheadProps) {
    const states = UNITS.map(u => st[u.key]);
    const verdict = states.includes('err') ? 'fault' : states.includes('load') ? 'warn' : 'ok';
    const verdictWord = verdict === 'fault' ? 'FAULT' : verdict === 'warn' ? 'SYNCING' : 'NOMINAL';

    return (
        <header id="card">
            <div>
                <h1>OPTION <em>STRATEGIST</em></h1>
                <div className="sub">{asset} covered calls &amp; cash-secured puts on Derive // yields net of fees</div>
            </div>
            <div id="magi">
                <div className="clock" title="Time of the last successful data pull, and seconds to the next one">
                    {fmtTime(dataAt)}
                    <small className={countdown < 5 ? 'soon' : undefined}>T-{String(countdown).padStart(2, '0')}s</small>
                </div>
                <div className="magi-units">
                    {UNITS.map(u => {
                        const s = st[u.key];
                        return (
                            <div key={u.key} className={`magi-unit ${s}`} title={`${u.feed} feed: ${STATE_WORD[s].toLowerCase()}`}>
                                <span className="nm">{u.magi}</span>
                                <span className="feed">{u.feed}<b>{STATE_WORD[s]}</b></span>
                            </div>
                        );
                    })}
                </div>
                <div className={`verdict ${verdict === 'ok' ? '' : verdict}`} role="status">
                    MAGI status <b>{verdictWord}</b>
                </div>
            </div>
        </header>
    );
});
