import type { Metadata, Viewport } from "next";
import { Source_Code_Pro } from "next/font/google";
import "./globals.css";

// NERV data face. Self-hosted via next/font (no render-blocking @import, and
// the CSP's font-src 'self' stays intact). The masthead serif is a system
// Times stack, so it needs no download.
const mono = Source_Code_Pro({
    subsets: ["latin"],
    weight: ["400", "600", "700", "900"],
    variable: "--font-mono",
    display: "swap",
});

const description =
    "Covered-call & cash-secured-put yield strategist for Derive options — " +
    "live strike×expiry APR matrix net of fees, Black-Scholes risk metrics, and Deribit cross-venue reference.";

export const metadata: Metadata = {
    title: "NERV // Option Strategist — Derive Covered-Call & CSP Yields",
    description,
    openGraph: {
        title: "Option Strategist",
        description,
        type: "website",
        url: "https://crypto-rfq-aggregator-hype.vercel.app",
    },
    twitter: {
        card: "summary",
        title: "Option Strategist",
        description,
    },
};

export const viewport: Viewport = {
    themeColor: "#050505",
    colorScheme: "dark",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={mono.variable}>
            <body>{children}</body>
        </html>
    );
}
