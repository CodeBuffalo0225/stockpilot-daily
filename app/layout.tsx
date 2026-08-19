import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StockPilot Daily',
  description: 'The daily StockPilot run — ticker, allocation, and the rendered brief.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* The Remotion scenes load these through @remotion/google-fonts; the
            surrounding UI needs them too and should not wait on the player. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
