import './globals.css';
import type { Metadata } from 'next';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { AuthProvider } from '../contexts/AuthContext';

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
      <body>
        <AuthProvider>
          <DashboardLayout>{children}</DashboardLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
