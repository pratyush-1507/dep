"use client";

import { AuthProvider } from "./AuthProvider";
import Navbar from "./Navbar";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Navbar />
      <main>{children}</main>
      <footer className="footer">
        <p>© {new Date().getFullYear()} HealthScan — Personalized Food Safety. Not medical advice.</p>
      </footer>
    </AuthProvider>
  );
}
