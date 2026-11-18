import type { Metadata } from 'next';
import 'react-toastify/ReactToastify.css';
import './globals.css';
export const metadata: Metadata = { title: 'AlgoTrail — Your DSA journey', description: 'A focused space to practise DSA, follow your roadmap, and build consistency.' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
