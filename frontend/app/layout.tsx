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

// Runs before first paint: applies the saved theme (or the OS preference) so
// light-mode users never see a dark flash. Kept tiny and dependency-free.
const themeScript = `(function(){try{var d;var v=localStorage.getItem('optionStrategist.view.v1');if(v){var p=JSON.parse(v);if(typeof p.darkMode==='boolean')d=p.darkMode}if(typeof d!=='boolean'){d=!window.matchMedia('(prefers-color-scheme: light)').matches}document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={inter.variable} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
            </head>
            <body>{children}</body>
        </html>
    );
}
