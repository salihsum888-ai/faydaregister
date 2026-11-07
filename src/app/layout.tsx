
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/navbar';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { MfaGuard } from '@/components/auth/mfa-guard';

const INSTITUTIONAL_ICON = "https://services.eaes.et/NID-Logos/Fayda%20For%20Ethiopia%20logo-%20english-2-01.png";

export const metadata: Metadata = {
  title: 'FaydaTrack | Professional Registration Tracking',
  description: 'High-fidelity terminal for institutional registration tracking, real-time field coordination, and operational triage.',
  openGraph: {
    title: 'FaydaTrack | Professional Registration Tracking',
    description: 'High-fidelity terminal for institutional registration tracking, real-time field coordination, and operational triage.',
  },
  icons: {
    icon: INSTITUTIONAL_ICON,
    shortcut: INSTITUTIONAL_ICON,
    apple: INSTITUTIONAL_ICON,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FaydaTrack',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&family=JetBrains+Mono:wght@400..800&display=swap" rel="stylesheet" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground min-h-screen flex flex-col overflow-x-hidden transition-colors duration-300 relative">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Ambient Refraction Backdrop for Glassmorphic Cards & Graphs */}
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden no-print">
            <div className="absolute -top-28 -left-24 h-[420px] w-[420px] rounded-full bg-primary/15 dark:bg-primary/12 blur-[110px] animate-orb-1" />
            <div className="absolute top-1/3 -right-28 h-[380px] w-[380px] rounded-full bg-sky-400/15 dark:bg-sky-500/10 blur-[110px] animate-orb-2" />
            <div className="absolute -bottom-32 left-1/4 h-[360px] w-[360px] rounded-full bg-emerald-400/12 dark:bg-indigo-500/10 blur-[110px] animate-orb-3" />
          </div>

          <FirebaseClientProvider>
            <MfaGuard>
              <Navbar />
              <main className="flex-1 w-full max-w-7xl mx-auto pt-6 sm:pt-8 pb-32 md:pb-12 px-4 sm:px-6 lg:px-8 min-w-0 relative z-0">
                {children}
              </main>
            </MfaGuard>
            <Toaster />
          </FirebaseClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
