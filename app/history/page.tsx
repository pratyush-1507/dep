"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

interface ScanRecord {
  id: string;
  verdict: string;
  confidence: number;
  reasoning: string;
  data_source: string;
  scanned_at: string;
  triggered_rules: string[];
  products: { name: string; barcode: string } | null;
  candidate_products: { parsed_name: string; barcode: string } | null;
}

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) fetchHistory(page);
  }, [user, authLoading, page, router]);

  const fetchHistory = async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history?page=${p}&limit=15`);
      const data = await res.json();
      setScans(data.scans || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const verdictColor = (v: string) => {
    if (v === "safe") return "verdict-safe";
    if (v === "caution") return "verdict-caution";
    return "verdict-avoid";
  };

  const verdictIcon = (v: string) => {
    if (v === "safe") return "✅";
    if (v === "caution") return "⚠️";
    return "🚫";
  };

  if (authLoading || loading) {
    return (
      <div className="page-container">
        <div className="loading-spinner">Loading history...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Scan History</h1>
        <p className="page-subtitle">{total} total scan{total !== 1 ? "s" : ""}</p>
      </div>

      {scans.length === 0 ? (
        <div className="glass-card">
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            <h3>No scan history yet</h3>
            <p>Products you scan will appear here.</p>
            <button className="btn btn-primary" onClick={() => router.push("/scan")}>
              Scan a Product
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="history-list">
            {scans.map((scan) => {
              const name =
                scan.products?.name || scan.candidate_products?.parsed_name || "Unknown Product";
              const bcode =
                scan.products?.barcode || scan.candidate_products?.barcode || "-";
              const isExpanded = expanded === scan.id;

              return (
                <div
                  key={scan.id}
                  className={`history-item ${isExpanded ? "history-item-expanded" : ""}`}
                  onClick={() => setExpanded(isExpanded ? null : scan.id)}
                >
                  <div className="history-item-main">
                    <div className="history-item-left">
                      <span className="history-verdict-icon">{verdictIcon(scan.verdict)}</span>
                      <div>
                        <div className="history-product-name">{name}</div>
                        <div className="history-meta">
                          {bcode} • {scan.data_source} •{" "}
                          {new Date(scan.scanned_at).toLocaleDateString("en-US", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="history-item-right">
                      <span className={`verdict-badge ${verdictColor(scan.verdict)}`}>
                        {scan.verdict}
                      </span>
                      <span className="history-confidence">
                        {Math.round(scan.confidence * 100)}%
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="history-item-details">
                      {scan.reasoning && (
                        <div className="history-reasoning">
                          <h4>Reasoning</h4>
                          <pre>{scan.reasoning}</pre>
                        </div>
                      )}
                      {scan.triggered_rules && scan.triggered_rules.length > 0 && (
                        <div className="history-rules">
                          <h4>Triggered Rules</h4>
                          <div className="tag-list">
                            {scan.triggered_rules.map((rule, i) => (
                              <span key={i} className="tag tag-rule">
                                {rule}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ← Previous
              </button>
              <span className="pagination-info">
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
