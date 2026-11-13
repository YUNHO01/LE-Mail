import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '../contexts/AuthContext';
import { NavigationProvider } from '../contexts/NavigationContext';
import { MobileLayout } from '../components/layout/MobileLayout';

export const metadata: Metadata = {
  title: 'LEMail 모바일 웹메일',
  description: 'LEMail 외부 접속용 모바일 웹메일 서비스',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LEMail',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased bg-slate-50 text-slate-900 selection:bg-sky-100">
        <AuthProvider>
          <NavigationProvider>
            <MobileLayout>{children}</MobileLayout>
          </NavigationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
