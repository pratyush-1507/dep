"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  const { user, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="navbar-brand">
          <span className="brand-icon">🩺</span>
          <span className="brand-text">HealthScan</span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ThemeToggle />
          <button
            className="mobile-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span className={`hamburger ${mobileOpen ? "open" : ""}`} />
          </button>
        </div>

        <div className={`navbar-links ${mobileOpen ? "show" : ""}`}>
          {!loading && user ? (
            <>
              <Link href="/dashboard" className="nav-link" onClick={() => setMobileOpen(false)}>
                Dashboard
              </Link>
              <Link href="/scan" className="nav-link" onClick={() => setMobileOpen(false)}>
                Scan
              </Link>
              <Link href="/history" className="nav-link" onClick={() => setMobileOpen(false)}>
                History
              </Link>
              <Link href="/profile" className="nav-link" onClick={() => setMobileOpen(false)}>
                Profile
              </Link>
              <button onClick={signOut} className="nav-btn nav-btn-outline">
                Sign Out
              </button>
            </>
          ) : !loading ? (
            <>
              <Link href="/login" className="nav-link" onClick={() => setMobileOpen(false)}>
                Log In
              </Link>
              <Link href="/signup" className="nav-btn nav-btn-primary" onClick={() => setMobileOpen(false)}>
                Sign Up
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
