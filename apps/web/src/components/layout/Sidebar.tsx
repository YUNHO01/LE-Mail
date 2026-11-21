'use client';

import React from 'react';
import { UserSidebar } from './UserSidebar';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sidebarOpen,
  setSidebarOpen,
}) => {
  return (
    <UserSidebar
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    />
  );
};
