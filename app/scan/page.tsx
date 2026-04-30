"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import CameraCapture from "@/components/CameraCapture";

interface VerdictResult {
  product_name: string;
  verdict: "safe" | "caution" | "avoid";
  confidence: number;
  reasoning: string;
  triggered_rules: string[];
  data_source: string;
}

interface OFFData {
  allergensTags: string[];
  ingredients: string[];
  ingredientsText: string | null;
  imageUrl: string | null;
  brand: string | null;
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
  const [offData, setOffData] = useState<OFFData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"barcode" | "ocr">("barcode");

  // Camera scanning state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scannedValue, setScannedValue] = useState("");
  const [scannerReady, setScannerReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Attach stream to video element whenever stream or cameraActive changes
  useEffect(() => {
    if (mediaStream && videoRef.current) {
      videoRef.current.srcObject = mediaStream;
      videoRef.current.play().catch(console.error);
      // Give the video a moment to start then begin barcode detection
      const t = setTimeout(() => {
        setScannerReady(true);
        startBarcodeDetection();
      }, 800);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaStream, cameraActive]);


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
  const [extractingOcr, setExtractingOcr] = useState(false);
  const [showOcrCamera, setShowOcrCamera] = useState(false);

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

  // Stop camera when leaving barcode tab
  useEffect(() => {
    if (tab !== "barcode") {
      stopCamera();
    }
  }, [tab]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setMediaStream(null);
    setCameraActive(false);
    setScannerReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError("");
    setScannedValue("");
    setError("");
    setVerdict(null);
    setScannerReady(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      // Set cameraActive FIRST so the <video> element renders,
      // then setMediaStream triggers the useEffect to attach srcObject
      setCameraActive(true);
      setMediaStream(stream);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission") || msg.includes("NotAllowed")) {
        setCameraError("Camera permission denied. Please allow camera access and try again.");
      } else if (msg.includes("NotFound") || msg.includes("DevicesNotFound")) {
        setCameraError("No camera found. Please connect a camera and try again.");
      } else {
        setCameraError("Could not start camera: " + msg);
      }
    }
  }, []);

  const startBarcodeDetection = useCallback(() => {
    // Use BarcodeDetector API if available (Chrome/Edge)
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      // @ts-expect-error BarcodeDetector is not in TS lib yet
      const detector = new window.BarcodeDetector({
        formats: [
          "ean_13", "ean_8", "upc_a", "upc_e",
          "code_128", "code_39", "code_93",
          "qr_code", "data_matrix",
        ],
      });

      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            setScannedValue(code);
            setBarcode(code);
            stopCamera();
            handleScanBarcode(code);
          }
        } catch {
          // continue scanning
        }
      }, 300);
    } else {
      // Fallback: use canvas + ZXing
      startZXingScanner();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopCamera]);

  const startZXingScanner = useCallback(async () => {
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const codeReader = new BrowserMultiFormatReader();

      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current) return;
        if (videoRef.current.readyState < 2) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        try {
          const result = await codeReader.decodeFromCanvas(canvas);
          if (result) {
            const code = result.getText();
            setScannedValue(code);
            setBarcode(code);
            stopCamera();
            handleScanBarcode(code);
          }
        } catch {
          // No barcode found yet, continue scanning
        }
      }, 300);
    } catch (err) {
      console.error("ZXing failed to load", err);
      setCameraError("Barcode scanner failed to load. Please enter the barcode manually.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopCamera]);

  const handleScanBarcode = async (code: string) => {
    if (!code.trim()) return;
    setScanning(true);
    setError("");
    setVerdict(null);
    setOffData(null);

    try {
      const prodRes = await fetch(`/api/products?barcode=${encodeURIComponent(code)}`);
      const prodData = await prodRes.json();

      if (!prodData.found) {
        // Product not in DB or OFF — switch to OCR tab with barcode pre-filled
        setOcrBarcode(code);
        setTab("ocr");
        setScanning(false);
        return;
      }

      // Store enriched OFF data if present
      if (prodData.offData) {
        setOffData(prodData.offData);
      }

      // Build verdict request body
      let verdictBody: Record<string, unknown> = {};
      if (prodData.source === "products" && prodData.product.id) {
        verdictBody = { product_id: prodData.product.id };
      } else if (prodData.source === "candidate") {
        verdictBody = { candidate_id: prodData.product.id };
      } else {
        // openfoodfacts — pass the product inline (it may have been cached with an id)
        verdictBody = { inline_product: prodData.product };
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

  const handleManualScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    await handleScanBarcode(barcode);
  };

  const compressImage = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 1024; // max dimension in pixels
        let w = img.width;
        let h = img.height;
        if (w > MAX_SIZE || h > MAX_SIZE) {
          if (w > h) { h = Math.round(h * MAX_SIZE / w); w = MAX_SIZE; }
          else { w = Math.round(w * MAX_SIZE / h); h = MAX_SIZE; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleOcrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtractingOcr(true);
    setOcrMessage("Compressing and extracting text from image...");

    try {
      // Compress image client-side to fit within API limits
      const { base64, mimeType } = await compressImage(file);
      
      const res = await fetch("/api/extract-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      // Handle non-JSON responses (e.g., body too large error)
      let data;
      try {
        data = await res.json();
      } catch {
        setOcrMessage("Error: Server returned an invalid response. Image may be too large.");
        setExtractingOcr(false);
        return;
      }

      if (!res.ok) {
        setOcrMessage(`Error: ${data.error || "Extraction failed"}`);
        setExtractingOcr(false);
        return;
      }
      
      if (data.parsed_name) setOcrName(data.parsed_name);
      if (data.parsed_ingredients?.length) setOcrIngredients(data.parsed_ingredients.join(", "));
      if (data.parsed_nutrition) {
        if (data.parsed_nutrition.calories != null) setOcrCalories(data.parsed_nutrition.calories.toString());
        if (data.parsed_nutrition.sugars != null) setOcrSugars(data.parsed_nutrition.sugars.toString());
        if (data.parsed_nutrition.sodium != null) setOcrSodium(data.parsed_nutrition.sodium.toString());
        if (data.parsed_nutrition.total_fat != null) setOcrFat(data.parsed_nutrition.total_fat.toString());
        if (data.parsed_nutrition.protein != null) setOcrProtein(data.parsed_nutrition.protein.toString());
      }
      
      setOcrMessage("✅ Extraction successful! Review the auto-filled fields below.");
    } catch (err) {
      console.error("OCR upload error:", err);
      setOcrMessage("Failed to process image. Please try a different photo.");
    }
    setExtractingOcr(false);
  };

  const handleOcrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ocrBarcode.trim()) return;
    setSubmittingOcr(true);
    setOcrMessage("");
    setError("");
    setVerdict(null);

    const ingredientsList = ocrIngredients
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const nutritionData = {
      calories: ocrCalories ? parseFloat(ocrCalories) : null,
      sugars: ocrSugars ? parseFloat(ocrSugars) : null,
      sodium: ocrSodium ? parseFloat(ocrSodium) : null,
      total_fat: ocrFat ? parseFloat(ocrFat) : null,
      protein: ocrProtein ? parseFloat(ocrProtein) : null,
    };

    try {
      // Step 1: Save to candidate_products database
      const ocrRes = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: ocrBarcode,
          parsed_name: ocrName,
          parsed_ingredients: ingredientsList,
          parsed_nutrition: nutritionData,
          ocr_confidence: 0.85,
        }),
      });

      const ocrData = await ocrRes.json();
      if (ocrData.error) {
        setOcrMessage(`Error: ${ocrData.error}`);
        setSubmittingOcr(false);
        return;
      }

      // Step 2: Immediately get an AI verdict using the OCR data
      setOcrMessage("Analyzing product safety...");

      const inlineProduct = {
        name: ocrName || "Unknown Product",
        barcode: ocrBarcode,
        ingredients: ingredientsList,
        calories: nutritionData.calories,
        total_fat: nutritionData.total_fat,
        saturated_fat: null,
        trans_fat: null,
        cholesterol: null,
        sodium: nutritionData.sodium,
        total_carbs: null,
        dietary_fiber: null,
        sugars: nutritionData.sugars,
        protein: nutritionData.protein,
      };

      const verdictRes = await fetch("/api/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inline_product: inlineProduct }),
      });

      const verdictData = await verdictRes.json();

      if (verdictData.error) {
        setOcrMessage(`Product saved, but verdict failed: ${verdictData.error}`);
      } else {
        // Show the verdict card — switch to barcode tab where it renders
        setVerdict(verdictData);
        setOffData({
          brand: null,
          ingredients: ingredientsList,
          ingredientsText: null,
          allergensTags: [],
          imageUrl: null,
        });
        setTab("barcode");
        setOcrMessage("");
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

    const updatedMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content: userMsg },
    ];
    setChatMessages(updatedMessages);
    setChatLoading(true);

    // Build rich product context from offData + verdict
    const productCtx = verdict
      ? {
          name: verdict.product_name,
          brand: offData?.brand ?? null,
          ingredients: offData?.ingredients ?? [],
          calories: null,
          sodium: null,
          sugars: null,
          total_fat: null,
          protein: null,
        }
      : null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          verdict_context: verdict,
          product_context: productCtx,
        }),
        redirect: "error", // Don't silently follow redirects
      });

      if (!res.ok) {
        // Try to parse error JSON, fallback to status text
        let errorMsg = `Server error (${res.status})`;
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch { /* not JSON */ }
        setChatMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
      } else {
        const data = await res.json();
        const replyText = data.reply ?? "Sorry, I couldn't process your request.";
        setChatMessages((prev) => [...prev, { role: "assistant", content: replyText }]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't connect to the AI assistant. Please try again." },
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
          <h2 className="section-title">Scan Barcode</h2>

          {/* Camera Scanner Area */}
          <div className="camera-wrapper">
            {!cameraActive ? (
              <div className="camera-placeholder">
                <div className="camera-placeholder-icon">📷</div>
                <p className="camera-placeholder-text">Point your camera at a product barcode</p>
                <button
                  className="btn btn-primary btn-large"
                  onClick={startCamera}
                  disabled={scanning}
                >
                  {scanning ? "Processing..." : "Start Camera Scanner"}
                </button>
              </div>
            ) : (
              <div className="camera-live">
                <video
                  ref={videoRef}
                  className="camera-video"
                  autoPlay
                  playsInline
                  muted
                />
                {/* Hidden canvas for ZXing fallback */}
                <canvas ref={canvasRef} style={{ display: "none" }} />
                {/* Scanner overlay */}
                <div className="scanner-overlay">
                  <div className="scanner-frame">
                    <div className="scanner-corner scanner-corner-tl" />
                    <div className="scanner-corner scanner-corner-tr" />
                    <div className="scanner-corner scanner-corner-bl" />
                    <div className="scanner-corner scanner-corner-br" />
                    {scannerReady && <div className="scanner-line" />}
                  </div>
                  <p className="scanner-hint">
                    {scannerReady ? "Align barcode within the frame" : "Initializing scanner..."}
                  </p>
                </div>
                <button className="btn btn-outline camera-stop-btn" onClick={stopCamera}>
                  ✕ Stop Camera
                </button>
              </div>
            )}

            {cameraError && (
              <div className="auth-error" style={{ marginTop: "1rem" }}>
                {cameraError}
              </div>
            )}

            {scannedValue && (
              <div className="scan-success-banner">
                ✅ Barcode detected: <strong>{scannedValue}</strong>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="scan-divider">
            <span>or enter manually</span>
          </div>

          {/* Manual Entry */}
          <form onSubmit={handleManualScan} className="scan-form">
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
          {scanning && (
            <div className="scan-processing">
              <div className="scan-spinner" />
              Looking up product...
            </div>
          )}

          {verdict && (
            <div className={`verdict-card verdict-card-${verdict.verdict}`}>
              {/* Header row: optional image + name + verdict */}
              <div className="verdict-header">
                {offData?.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={offData.imageUrl}
                    alt={verdict.product_name}
                    className="verdict-product-img"
                  />
                )}
                <span className="verdict-icon-large">{verdictIcon(verdict.verdict)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="verdict-product">{verdict.product_name}</h3>
                  {offData?.brand && (
                    <p className="verdict-brand">{offData.brand}</p>
                  )}
                  <div className={`verdict-badge verdict-${verdict.verdict}`}>
                    {verdict.verdict.toUpperCase()}
                  </div>
                </div>
              </div>

              <div className="verdict-details">
                <div className="verdict-meta">
                  <span>Confidence: {Math.round(verdict.confidence * 100)}%</span>
                  <span>Source: {verdict.data_source === "openfoodfacts" ? "Open Food Facts" : verdict.data_source}</span>
                </div>

                {/* Allergens Panel */}
                {offData?.allergensTags && offData.allergensTags.length > 0 && (
                  <div className="verdict-allergens">
                    <h4>⚠️ Allergens Declared</h4>
                    <div className="tag-list">
                      {offData.allergensTags.map((a, i) => (
                        <span key={i} className="tag tag-allergen">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

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

                {/* Ingredients Panel */}
                {offData?.ingredients && offData.ingredients.length > 0 && (
                  <div className="verdict-ingredients">
                    <h4>🧾 Ingredients ({offData.ingredients.length})</h4>
                    <div className="ingredients-chips">
                      {offData.ingredients.map((ing, i) => {
                        const ingLower = ing.toLowerCase();
                        const isAllergen = offData.allergensTags.some((a) =>
                          ingLower.includes(a.toLowerCase())
                        );
                        return (
                          <span
                            key={i}
                            className={`ingredient-chip ${isAllergen ? "ingredient-chip-allergen" : ""}`}
                            title={isAllergen ? "⚠️ Allergen" : undefined}
                          >
                            {isAllergen && <span className="ingredient-allergen-dot" />}
                            {ing}
                          </span>
                        );
                      })}
                    </div>
                    {offData.allergensTags.length > 0 && (
                      <p className="ingredient-legend">
                        <span className="ingredient-allergen-dot" /> = Allergen detected
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button
                className="btn btn-outline btn-full"
                onClick={() => setChatOpen(true)}
              >
                💬 Ask AI About This Product
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card">
          <h2 className="section-title">Manual Product Entry</h2>
          {ocrBarcode && (
            <div className="ocr-redirect-notice">
              🔍 Product with barcode <strong>{ocrBarcode}</strong> was not found in our database.
              Please fill in the details below to help us add it!
            </div>
          )}
          <p className="section-desc">
            Enter product details manually, or upload a photo of the ingredients and nutrition facts to autofill.
          </p>

          <div className="ocr-upload-section" style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
            <button type="button" className="btn btn-outline btn-full" style={{ flex: 1 }} onClick={() => setShowOcrCamera(true)} disabled={extractingOcr}>
              📸 Take Photo
            </button>
            <label className="btn btn-outline btn-full" style={{ flex: 1, display: "block", textAlign: "center", cursor: "pointer" }}>
              {extractingOcr ? "Extracting..." : "📂 Upload File"}
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleOcrImageUpload} 
                style={{ display: "none" }} 
                disabled={extractingOcr}
              />
            </label>
          </div>

          {showOcrCamera && (
            <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", zIndex: 2000, display: "flex", justifyContent: "center", alignItems: "center", padding: "1rem" }}>
              <CameraCapture 
                onCapture={(file) => {
                  setShowOcrCamera(false);
                  const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                  handleOcrImageUpload(fakeEvent);
                }} 
                onCancel={() => setShowOcrCamera(false)} 
              />
            </div>
          )}

          {ocrMessage && <div className={`ocr-message ${ocrMessage.includes("Error") || ocrMessage.includes("Failed") ? "auth-error" : "scan-success-banner"}`} style={{ marginTop: "10px", marginBottom: "1rem" }}>{ocrMessage}</div>}

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
              {submittingOcr ? "Analyzing Product..." : "🔬 Analyze Product Safety"}
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
