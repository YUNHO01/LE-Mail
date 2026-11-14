import './globals.css';
import type { Metadata, Viewport } from 'next';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { AuthProvider } from '../contexts/AuthContext';
import { NavigationProvider } from '../contexts/NavigationContext';
import { PwaProvider } from '../contexts/PwaContext';

export const metadata: Metadata = {
  title: 'LEMail Enterprise Mail Console',
  description: 'NestJS + BullMQ + Piscina 기반의 고성능 SMTP 메일 콘솔',
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
    title: 'LEMail Web',
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
  themeColor: '#0071e3',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <PwaProvider>
          <AuthProvider>
            <NavigationProvider>
              <DashboardLayout>{children}</DashboardLayout>
            </NavigationProvider>
          </AuthProvider>
        </PwaProvider>
      </body>
    </html>
  );
}
