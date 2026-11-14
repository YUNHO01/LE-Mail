'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { MailReadingPane } from '@/components/mail/MailReadingPane';

export default function MailDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || null;

  return <MailReadingPane mailId={id} standalone />;
}
