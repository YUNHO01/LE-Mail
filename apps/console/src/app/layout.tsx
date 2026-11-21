import './globals.css';
import type { Metadata, Viewport } from 'next';
import { ConsoleLayout } from '../components/layout/ConsoleLayout';
import { AuthProvider } from '../contexts/AuthContext';
import { NavigationProvider } from '../contexts/NavigationContext';
import { getServerBrandName } from '../lib/brand';

export async function generateMetadata(): Promise<Metadata> {
  const brandName = await getServerBrandName();
  return {
    title: `${brandName} Admin Console`,
    description: `${brandName} 시스템 관리자 전용 콘솔`,
    icons: {
      icon: [
        { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    formatDetection: {
      telephone: false,
      date: false,
      email: false,
      address: false,
    },
  };
}

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
        <AuthProvider>
          <NavigationProvider>
            <ConsoleLayout>{children}</ConsoleLayout>
          </NavigationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
