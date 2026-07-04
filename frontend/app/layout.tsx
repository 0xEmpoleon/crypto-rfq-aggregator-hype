import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800"],
    variable: "--font-inter",
    display: "swap",
});

const description =
    "Covered-call & cash-secured-put yield strategist for Derive (Lyra v2) options — " +
    "live strike×expiry APR matrix net of fees, Black-Scholes risk metrics, and Deribit cross-venue reference.";

export const metadata: Metadata = {
    title: "Option Strategist — Derive Covered-Call & CSP Yields",
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

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={inter.variable}>
            <body>{children}</body>
        </html>
    );
}
