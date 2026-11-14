import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '../contexts/AuthContext';
import { NavigationProvider } from '../contexts/NavigationContext';
import { PwaProvider } from '../contexts/PwaContext';
import { MobileLayout } from '../components/layout/MobileLayout';

export const metadata: Metadata = {
  title: 'LEMail 모바일 웹메일',
  description: 'LEMail 외부 접속용 모바일 웹메일 서비스',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LEMail',
  },
  formatDetection: {
    telephone: false,
    date: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#007AFF',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased bg-slate-50 text-slate-900 selection:bg-sky-100" suppressHydrationWarning>
        <PwaProvider>
          <AuthProvider>
            <NavigationProvider>
              <MobileLayout>{children}</MobileLayout>
            </NavigationProvider>
          </AuthProvider>
        </PwaProvider>
      </body>
    </html>
  );
}
