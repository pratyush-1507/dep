"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface VerdictResult {
  product_name: string;
  verdict: "safe" | "caution" | "avoid";
  confidence: number;
  reasoning: string;
  triggered_rules: string[];
  data_source: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function ScanPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [barcode, setBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [verdict, setVerdict] = useState<VerdictResult | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"barcode" | "ocr">("barcode");

  // OCR state
  const [ocrBarcode, setOcrBarcode] = useState("");
  const [ocrName, setOcrName] = useState("");
  const [ocrIngredients, setOcrIngredients] = useState("");
  const [ocrCalories, setOcrCalories] = useState("");
  const [ocrSugars, setOcrSugars] = useState("");
  const [ocrSodium, setOcrSodium] = useState("");
  const [ocrFat, setOcrFat] = useState("");
  const [ocrProtein, setOcrProtein] = useState("");
  const [ocrMessage, setOcrMessage] = useState("");
  const [submittingOcr, setSubmittingOcr] = useState(false);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    setScanning(true);
    setError("");
    setVerdict(null);

    try {
      // Look up product
      const prodRes = await fetch(`/api/products?barcode=${encodeURIComponent(barcode)}`);
      const prodData = await prodRes.json();

      if (!prodData.found) {
        setError("Product not found. Try adding it via OCR upload.");
        setScanning(false);
        return;
      }

      // Get verdict
      const verdictBody: { product_id?: string; candidate_id?: string } = {};
      if (prodData.source === "products") {
        verdictBody.product_id = prodData.product.id;
      } else {
        verdictBody.candidate_id = prodData.product.id;
      }

      const verdictRes = await fetch("/api/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verdictBody),
      });

      const verdictData = await verdictRes.json();

      if (verdictData.error) {
        setError(verdictData.error);
      } else {
        setVerdict(verdictData);
      }
    } catch {
      setError("Failed to scan product. Please try again.");
    }

    setScanning(false);
  };

  const handleOcrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ocrBarcode.trim()) return;
    setSubmittingOcr(true);
    setOcrMessage("");

    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: ocrBarcode,
          parsed_name: ocrName,
          parsed_ingredients: ocrIngredients
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          parsed_nutrition: {
            calories: ocrCalories ? parseFloat(ocrCalories) : null,
            sugars: ocrSugars ? parseFloat(ocrSugars) : null,
            sodium: ocrSodium ? parseFloat(ocrSodium) : null,
            total_fat: ocrFat ? parseFloat(ocrFat) : null,
            protein: ocrProtein ? parseFloat(ocrProtein) : null,
          },
          ocr_confidence: 0.85,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setOcrMessage(`Error: ${data.error}`);
      } else {
        setOcrMessage(data.message || "Product data submitted!");
      }
    } catch {
      setOcrMessage("Failed to submit. Please try again.");
    }

    setSubmittingOcr(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          verdict_context: verdict,
          product_context: verdict ? { name: verdict.product_name, ingredients: verdict.triggered_rules } : null,
        }),
      });

      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't process your request." },
      ]);
    }

    setChatLoading(false);
  };

  const verdictIcon = (v: string) => {
    if (v === "safe") return "✅";
    if (v === "caution") return "⚠️";
    return "🚫";
  };

  if (authLoading) {
    return (
      <div className="page-container">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Scan Product</h1>
        <p className="page-subtitle">Check if a food product is safe for you</p>
      </div>

      {/* Tab Switcher */}
      <div className="tab-bar">
        <button
          className={`tab ${tab === "barcode" ? "tab-active" : ""}`}
          onClick={() => setTab("barcode")}
        >
          📷 Barcode Scan
        </button>
        <button
          className={`tab ${tab === "ocr" ? "tab-active" : ""}`}
          onClick={() => setTab("ocr")}
        >
          📝 Manual / OCR Entry
        </button>
      </div>

      {tab === "barcode" ? (
        <div className="glass-card">
          <h2 className="section-title">Enter Barcode</h2>
          <form onSubmit={handleScan} className="scan-form">
            <div className="scan-input-row">
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Enter barcode number..."
                className="scan-input"
              />
              <button type="submit" className="btn btn-primary" disabled={scanning}>
                {scanning ? "Scanning..." : "Scan"}
              </button>
            </div>
          </form>

          {error && <div className="auth-error">{error}</div>}

          {verdict && (
            <div className={`verdict-card verdict-card-${verdict.verdict}`}>
              <div className="verdict-header">
                <span className="verdict-icon-large">{verdictIcon(verdict.verdict)}</span>
                <div>
                  <h3 className="verdict-product">{verdict.product_name}</h3>
                  <div className={`verdict-badge verdict-${verdict.verdict}`}>
                    {verdict.verdict.toUpperCase()}
                  </div>
                </div>
              </div>

              <div className="verdict-details">
                <div className="verdict-meta">
                  <span>Confidence: {Math.round(verdict.confidence * 100)}%</span>
                  <span>Source: {verdict.data_source}</span>
                </div>

                {verdict.reasoning && (
                  <div className="verdict-reasoning">
                    <h4>Reasoning</h4>
                    <pre>{verdict.reasoning}</pre>
                  </div>
                )}

                {verdict.triggered_rules.length > 0 && (
                  <div className="verdict-rules">
                    <h4>Triggered Rules</h4>
                    <div className="tag-list">
                      {verdict.triggered_rules.map((rule, i) => (
                        <span key={i} className="tag tag-rule">
                          {rule}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                className="btn btn-outline btn-full"
                onClick={() => {
                  setChatOpen(true);
                  setChatMessages([]);
                }}
              >
                💬 Ask AI About This Product
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card">
          <h2 className="section-title">Manual Product Entry</h2>
          <p className="section-desc">
            Enter product details manually. Community scans help improve our database.
          </p>
          <form onSubmit={handleOcrSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="ocrBarcode">Barcode *</label>
                <input
                  id="ocrBarcode"
                  type="text"
                  value={ocrBarcode}
                  onChange={(e) => setOcrBarcode(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="ocrName">Product Name</label>
                <input
                  id="ocrName"
                  type="text"
                  value={ocrName}
                  onChange={(e) => setOcrName(e.target.value)}
                />
              </div>
              <div className="form-group full-width">
                <label htmlFor="ocrIngredients">Ingredients (comma-separated)</label>
                <textarea
                  id="ocrIngredients"
                  value={ocrIngredients}
                  onChange={(e) => setOcrIngredients(e.target.value)}
                  rows={3}
                  placeholder="sugar, flour, milk, salt..."
                />
              </div>
              <div className="form-group">
                <label htmlFor="ocrCal">Calories (per 100g)</label>
                <input id="ocrCal" type="number" value={ocrCalories} onChange={(e) => setOcrCalories(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="ocrSug">Sugars (g)</label>
                <input id="ocrSug" type="number" value={ocrSugars} onChange={(e) => setOcrSugars(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="ocrSod">Sodium (mg)</label>
                <input id="ocrSod" type="number" value={ocrSodium} onChange={(e) => setOcrSodium(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="ocrFat">Total Fat (g)</label>
                <input id="ocrFat" type="number" value={ocrFat} onChange={(e) => setOcrFat(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="ocrProt">Protein (g)</label>
                <input id="ocrProt" type="number" value={ocrProtein} onChange={(e) => setOcrProtein(e.target.value)} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={submittingOcr}>
              {submittingOcr ? "Submitting..." : "Submit Product Data"}
            </button>
          </form>
          {ocrMessage && (
            <div className={`message ${ocrMessage.startsWith("Error") ? "message-error" : "message-success"}`}>
              {ocrMessage}
            </div>
          )}
        </div>
      )}

      {/* Chat Panel */}
      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <h3>🤖 AI Health Assistant</h3>
            <button className="btn btn-icon" onClick={() => setChatOpen(false)}>
              ✕
            </button>
          </div>
          <div className="chat-messages">
            {chatMessages.length === 0 && (
              <div className="chat-hint">
                Ask me about the scanned product — e.g. &quot;Why should I avoid this?&quot; or
                &quot;Suggest alternatives&quot;
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                <div className="chat-msg-content">{msg.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="chat-msg chat-msg-assistant">
                <div className="chat-msg-content typing">Thinking...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-row">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Ask about this product..."
            />
            <button className="btn btn-primary" onClick={sendChat} disabled={chatLoading}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
