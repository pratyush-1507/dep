"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface DashboardData {
  profile: {
    full_name?: string;
    bmi?: number;
    bmi_category?: string;
    weight_kg?: number;
    height_cm?: number;
    activity_level?: string;
  };
  conditions: { id: string; condition_name: string; severity: string }[];
  allergies: { id: string; allergen: string; severity: string }[];
  preferences: { id: string; preference: string }[];
  recentScans: {
    id: string;
    verdict: string;
    confidence: number;
    reasoning: string;
    data_source: string;
    scanned_at: string;
    products: { name: string; barcode: string } | null;
    candidate_products: { parsed_name: string; barcode: string } | null;
  }[];
  stats: { total: number; safe: number; caution: number; avoid: number };
  alerts: string[];
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      fetch("/api/dashboard")
        .then((r) => r.json())
        .then((d) => {
          setData(d);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="page-container">
        <div className="loading-spinner">Loading dashboard...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <p>Unable to load dashboard. Please try again.</p>
        </div>
      </div>
    );
  }

  const verdictColor = (v: string) => {
    if (v === "safe") return "verdict-safe";
    if (v === "caution") return "verdict-caution";
    return "verdict-avoid";
  };

  const bmiColor = (cat?: string) => {
    if (cat === "normal") return "var(--accent)";
    if (cat === "underweight") return "var(--warning)";
    if (cat === "overweight") return "var(--warning)";
    return "var(--danger)";
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="page-subtitle">
          Welcome back, {data.profile.full_name || "User"} 👋
        </p>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="alerts-section">
          {data.alerts.map((alert, i) => (
            <div key={i} className="alert-card">
              <span className="alert-icon">⚠️</span>
              <span>{alert}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{data.stats.total}</div>
          <div className="stat-label">Total Scans</div>
        </div>
        <div className="stat-card stat-safe">
          <div className="stat-number">{data.stats.safe}</div>
          <div className="stat-label">Safe</div>
        </div>
        <div className="stat-card stat-caution">
          <div className="stat-number">{data.stats.caution}</div>
          <div className="stat-label">Caution</div>
        </div>
        <div className="stat-card stat-avoid">
          <div className="stat-number">{data.stats.avoid}</div>
          <div className="stat-label">Avoid</div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="dashboard-grid">
        {/* Left: Health Profile Summary */}
        <div className="glass-card">
          <div className="card-header">
            <h2>Health Profile</h2>
            <Link href="/profile" className="card-action">
              Edit
            </Link>
          </div>

          {data.profile.bmi ? (
            <div className="bmi-display">
              <div className="bmi-value" style={{ color: bmiColor(data.profile.bmi_category) }}>
                {data.profile.bmi}
              </div>
              <div className="bmi-label">
                BMI — {data.profile.bmi_category?.replace("_", " ") || "N/A"}
              </div>
              <div className="bmi-detail">
                {data.profile.weight_kg}kg • {data.profile.height_cm}cm •{" "}
                {data.profile.activity_level?.replace("_", " ") || "N/A"}
              </div>
            </div>
          ) : (
            <div className="empty-state compact">
              <p>
                No profile set up yet.{" "}
                <Link href="/profile" className="link">
                  Set up your profile →
                </Link>
              </p>
            </div>
          )}

          {data.conditions.length > 0 && (
            <div className="tag-section">
              <h3>Health Conditions</h3>
              <div className="tag-list">
                {data.conditions.map((c) => (
                  <span key={c.id} className="tag tag-condition">
                    {c.condition_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.allergies.length > 0 && (
            <div className="tag-section">
              <h3>Allergies</h3>
              <div className="tag-list">
                {data.allergies.map((a) => (
                  <span key={a.id} className={`tag tag-allergy-${a.severity}`}>
                    {a.allergen}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.preferences.length > 0 && (
            <div className="tag-section">
              <h3>Diet</h3>
              <div className="tag-list">
                {data.preferences.map((p) => (
                  <span key={p.id} className="tag tag-diet">
                    {p.preference}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Recent Scans */}
        <div className="glass-card">
          <div className="card-header">
            <h2>Recent Scans</h2>
            <Link href="/history" className="card-action">
              View All
            </Link>
          </div>

          {data.recentScans.length > 0 ? (
            <div className="scan-list">
              {data.recentScans.map((scan) => {
                const prodName =
                  scan.products?.name || scan.candidate_products?.parsed_name || "Unknown";
                return (
                  <div key={scan.id} className="scan-item">
                    <div className="scan-item-left">
                      <div className="scan-product-name">{prodName}</div>
                      <div className="scan-time">
                        {new Date(scan.scanned_at).toLocaleDateString()} •{" "}
                        {scan.data_source}
                      </div>
                    </div>
                    <div className={`verdict-badge ${verdictColor(scan.verdict)}`}>
                      {scan.verdict}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state compact">
              <p>
                No scans yet.{" "}
                <Link href="/scan" className="link">
                  Scan a product →
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <Link href="/scan" className="action-card">
          <span className="action-icon">📸</span>
          <span className="action-label">Scan Product</span>
        </Link>
        <Link href="/profile" className="action-card">
          <span className="action-icon">👤</span>
          <span className="action-label">Update Profile</span>
        </Link>
        <Link href="/history" className="action-card">
          <span className="action-icon">📋</span>
          <span className="action-label">View History</span>
        </Link>
      </div>
    </div>
  );
}
