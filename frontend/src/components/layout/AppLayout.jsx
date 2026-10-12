import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

export function AppLayout() {
  return (
    <div className="app-container">
      <Navbar />
      <div className="main-layout">
        <Sidebar />
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
