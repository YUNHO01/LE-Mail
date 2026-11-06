'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AdminSidebar } from './AdminSidebar';
import { UserSidebar } from './UserSidebar';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sidebarOpen,
  setSidebarOpen,
}) => {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  if (isAdminRoute) {
    return (
      <AdminSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
    );
  }

  return (
    <UserSidebar
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    />
  );
};
