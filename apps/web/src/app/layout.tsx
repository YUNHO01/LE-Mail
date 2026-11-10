import './globals.css';
import type { Metadata } from 'next';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { AuthProvider } from '../contexts/AuthContext';
import { NavigationProvider } from '../contexts/NavigationContext';

export const metadata: Metadata = {
  title: 'LEMail Enterprise Mail Console',
  description: 'NestJS + BullMQ + Piscina 기반의 고성능 SMTP 메일 콘솔',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (var registration of registrations) {
                    registration.unregister();
                  }
                });
              }
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <NavigationProvider>
            <DashboardLayout>{children}</DashboardLayout>
          </NavigationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
