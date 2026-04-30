"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

const CONDITION_OPTIONS = [
  "Diabetes",
  "Hypertension",
  "Heart Disease",
  "Kidney Disease",
  "Liver Disease",
  "Thyroid Disorder",
  "PCOS",
  "Celiac Disease",
];

const ALLERGEN_OPTIONS = [
  "Milk",
  "Gluten",
  "Peanuts",
  "Tree Nuts",
  "Soy",
  "Eggs",
  "Shellfish",
  "Fish",
  "Wheat",
  "Sesame",
];

const DIET_OPTIONS = [
  "Vegetarian",
  "Vegan",
  "Keto",
  "Low-Sugar",
  "Low-Sodium",
  "Low-Fat",
  "High-Protein",
  "Paleo",
  "Mediterranean",
];

const SEVERITY_OPTIONS = ["mild", "moderate", "severe"];

interface ProfileData {
  full_name: string;
  age: number | "";
  gender: string;
  height_cm: number | "";
  weight_kg: number | "";
  activity_level: string;
}

interface ConditionItem {
  condition_name: string;
  severity: string;
}

interface AllergyItem {
  allergen: string;
  severity: string;
}

interface LimitItem {
  nutrient: string;
  max_daily_value: number | "";
  unit: string;
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [profile, setProfile] = useState<ProfileData>({
    full_name: "",
    age: "",
    gender: "",
    height_cm: "",
    weight_kg: "",
    activity_level: "",
  });

  const [conditions, setConditions] = useState<ConditionItem[]>([]);
  const [allergies, setAllergies] = useState<AllergyItem[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [limits, setLimits] = useState<LimitItem[]>([]);
  const [bmi, setBmi] = useState<number | null>(null);
  const [bmiCategory, setBmiCategory] = useState<string | null>(null);

  const [bloodReportUploading, setBloodReportUploading] = useState(false);
  const [bloodReportResults, setBloodReportResults] = useState<any>(null);

  const compressImage = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 1200; // max dimension for blood report (needs slightly higher res for text)
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

  const handleBloodReportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBloodReportUploading(true);
    setMessage(null);

    try {
      const { base64, mimeType } = await compressImage(file);
      
      const res = await fetch("/api/extract-blood-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      let data;
      try { data = await res.json(); } catch { throw new Error("Invalid response from server"); }

      if (!res.ok) {
        throw new Error(data.error || "Failed to analyze blood report");
      }

      setBloodReportResults(data.result);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Blood report analysis failed." });
    }
    
    setBloodReportUploading(false);
  };

  const applyBloodReportSuggestions = () => {
    if (!bloodReportResults) return;
    
    // Merge conditions
    if (bloodReportResults.suggested_conditions?.length > 0) {
      const existingNames = new Set(conditions.map(c => c.condition_name));
      const newConditions = bloodReportResults.suggested_conditions
        .filter((c: any) => !existingNames.has(c.condition_name.toLowerCase()))
        .map((c: any) => ({ condition_name: c.condition_name.toLowerCase().replace(/\s+/g, "_"), severity: c.severity }));
      setConditions(prev => [...prev, ...newConditions]);
    }

    // Merge preferences
    if (bloodReportResults.suggested_preferences?.length > 0) {
      const existingPrefs = new Set(preferences);
      const newPrefs = bloodReportResults.suggested_preferences
        .map((p: string) => p.toLowerCase().replace(/\s+/g, "-"))
        .filter((p: string) => !existingPrefs.has(p));
      setPreferences(prev => [...prev, ...newPrefs]);
    }

    // Merge limits
    if (bloodReportResults.suggested_limits?.length > 0) {
      const existingNutrients = new Set(limits.map(l => l.nutrient));
      const newLimits = bloodReportResults.suggested_limits
        .filter((l: any) => !existingNutrients.has(l.nutrient.toLowerCase()))
        .map((l: any) => ({ nutrient: l.nutrient.toLowerCase(), max_daily_value: l.max_daily_value, unit: l.unit }));
      setLimits(prev => [...prev, ...newLimits]);
    }

    setBloodReportResults(null);
    setMessage({ type: "success", text: "Suggestions applied! Click 'Save Profile' to permanently save them." });
  };

  const calcBmi = useCallback(() => {
    if (profile.height_cm && profile.weight_kg) {
      const h = Number(profile.height_cm) / 100;
      const b = Math.round((Number(profile.weight_kg) / (h * h)) * 10) / 10;
      setBmi(b);
      if (b < 18.5) setBmiCategory("underweight");
      else if (b < 25) setBmiCategory("normal");
      else if (b < 30) setBmiCategory("overweight");
      else setBmiCategory("obese");
    } else {
      setBmi(null);
      setBmiCategory(null);
    }
  }, [profile.height_cm, profile.weight_kg]);

  useEffect(() => {
    calcBmi();
  }, [calcBmi]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      fetch("/api/profile")
        .then((r) => r.json())
        .then((d) => {
          if (d.profile) {
            setProfile({
              full_name: d.profile.full_name || "",
              age: d.profile.age || "",
              gender: d.profile.gender || "",
              height_cm: d.profile.height_cm || "",
              weight_kg: d.profile.weight_kg || "",
              activity_level: d.profile.activity_level || "",
            });
            if (d.profile.bmi) setBmi(d.profile.bmi);
            if (d.profile.bmi_category) setBmiCategory(d.profile.bmi_category);
          }
          setConditions(
            (d.conditions || []).map((c: { condition_name: string; severity: string }) => ({
              condition_name: c.condition_name,
              severity: c.severity,
            }))
          );
          setAllergies(
            (d.allergies || []).map((a: { allergen: string; severity: string }) => ({
              allergen: a.allergen,
              severity: a.severity,
            }))
          );
          setPreferences((d.preferences || []).map((p: { preference: string }) => p.preference));
          setLimits(
            (d.limits || []).map((l: { nutrient: string; max_daily_value: number; unit: string }) => ({
              nutrient: l.nutrient,
              max_daily_value: l.max_daily_value,
              unit: l.unit,
            }))
          );
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [user, authLoading, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            ...profile,
            age: profile.age || null,
            height_cm: profile.height_cm || null,
            weight_kg: profile.weight_kg || null,
          },
          conditions,
          allergies,
          preferences,
          limits: limits.map((l) => ({
            ...l,
            max_daily_value: l.max_daily_value || 0,
          })),
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (data.bmi) setBmi(data.bmi);
        if (data.bmi_category) setBmiCategory(data.bmi_category);
        setMessage({ type: "success", text: "Profile saved successfully!" });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    }

    setSaving(false);
  };

  const togglePreference = (pref: string) => {
    setPreferences((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    );
  };

  const addCondition = () => {
    setConditions((prev) => [...prev, { condition_name: "", severity: "moderate" }]);
  };

  const removeCondition = (i: number) => {
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addAllergy = () => {
    setAllergies((prev) => [...prev, { allergen: "", severity: "moderate" }]);
  };

  const removeAllergy = (i: number) => {
    setAllergies((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addLimit = () => {
    setLimits((prev) => [...prev, { nutrient: "", max_daily_value: "", unit: "g" }]);
  };

  const removeLimit = (i: number) => {
    setLimits((prev) => prev.filter((_, idx) => idx !== i));
  };

  if (authLoading || loading) {
    return (
      <div className="page-container">
        <div className="loading-spinner">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="page-container position-relative">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>Health Profile</h1>
          <p className="page-subtitle">Manage your personal health information</p>
        </div>
        <div style={{ position: "relative" }}>
          <label htmlFor="blood-report-upload" className="btn btn-primary" style={{ cursor: "pointer" }}>
            {bloodReportUploading ? "⏳ Analyzing..." : "📄 Upload Blood Report (OCR)"}
          </label>
          <input
            id="blood-report-upload"
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleBloodReportUpload}
            disabled={bloodReportUploading}
          />
        </div>
      </div>

      {bloodReportResults && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", padding: "1rem" }}>
          <div className="glass-card" style={{ maxWidth: "600px", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "2rem" }}>
            <h2 style={{ marginBottom: "1rem", color: "var(--primary-color)" }}>Blood Report Analysis</h2>
            
            <p style={{ marginBottom: "1.5rem", lineHeight: "1.5" }}>{bloodReportResults.summary}</p>
            
            {bloodReportResults.abnormal_biomarkers?.length > 0 && (
              <div style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Abnormal Biomarkers</h3>
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {bloodReportResults.abnormal_biomarkers.map((b: any, i: number) => (
                    <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: "8px", marginBottom: "0.5rem" }}>
                      <span>{b.name}</span>
                      <span style={{ color: b.status === "high" ? "#ef4444" : "#3b82f6", fontWeight: "bold" }}>{b.value} ({b.status})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Suggested Profile Updates</h3>
              <ul style={{ paddingLeft: "1.5rem", lineHeight: "1.6" }}>
                {bloodReportResults.suggested_conditions?.map((c: any) => (
                  <li key={c.condition_name}>Add Condition: <strong>{c.condition_name}</strong> ({c.severity})</li>
                ))}
                {bloodReportResults.suggested_preferences?.map((p: string) => (
                  <li key={p}>Add Diet Preference: <strong>{p}</strong></li>
                ))}
                {bloodReportResults.suggested_limits?.map((l: any) => (
                  <li key={l.nutrient}>Add Limit: <strong>{l.nutrient}</strong> (max {l.max_daily_value}{l.unit})</li>
                ))}
                {(!bloodReportResults.suggested_conditions?.length && !bloodReportResults.suggested_preferences?.length && !bloodReportResults.suggested_limits?.length) && (
                  <li>No profile updates suggested. Your report looks normal!</li>
                )}
              </ul>
            </div>

            <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={applyBloodReportSuggestions}>
                Apply Suggestions
              </button>
              <button type="button" className="btn" style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)" }} onClick={() => setBloodReportResults(null)}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className={`message ${message.type === "success" ? "message-success" : "message-error"}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave}>
        {/* Personal Information */}
        <div className="glass-card">
          <h2 className="section-title">Personal Information</h2>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                value={profile.full_name}
                onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="age">Age</label>
              <input
                id="age"
                type="number"
                min="1"
                max="150"
                value={profile.age}
                onChange={(e) => setProfile((p) => ({ ...p, age: e.target.value ? parseInt(e.target.value) : "" }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="gender">Gender</label>
              <select
                id="gender"
                value={profile.gender}
                onChange={(e) => setProfile((p) => ({ ...p, gender: e.target.value }))}
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="height">Height (cm)</label>
              <input
                id="height"
                type="number"
                min="50"
                max="300"
                step="0.1"
                value={profile.height_cm}
                onChange={(e) => setProfile((p) => ({ ...p, height_cm: e.target.value ? parseFloat(e.target.value) : "" }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="weight">Weight (kg)</label>
              <input
                id="weight"
                type="number"
                min="10"
                max="500"
                step="0.1"
                value={profile.weight_kg}
                onChange={(e) => setProfile((p) => ({ ...p, weight_kg: e.target.value ? parseFloat(e.target.value) : "" }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="activity">Activity Level</label>
              <select
                id="activity"
                value={profile.activity_level}
                onChange={(e) => setProfile((p) => ({ ...p, activity_level: e.target.value }))}
              >
                <option value="">Select</option>
                <option value="sedentary">Sedentary</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="active">Active</option>
                <option value="very_active">Very Active</option>
              </select>
            </div>
          </div>

          {bmi !== null && (
            <div className="bmi-inline">
              <span className="bmi-inline-label">BMI:</span>
              <span className="bmi-inline-value">{bmi}</span>
              <span className={`bmi-inline-category bmi-${bmiCategory}`}>
                {bmiCategory?.replace("_", " ")}
              </span>
            </div>
          )}
        </div>

        {/* Health Conditions */}
        <div className="glass-card">
          <div className="card-header">
            <h2 className="section-title">Health Conditions</h2>
            <button type="button" className="btn btn-small" onClick={addCondition}>
              + Add
            </button>
          </div>
          {conditions.map((c, i) => (
            <div key={i} className="inline-form-row">
              <select
                value={c.condition_name}
                onChange={(e) => {
                  const updated = [...conditions];
                  updated[i].condition_name = e.target.value;
                  setConditions(updated);
                }}
              >
                <option value="">Select condition</option>
                {CONDITION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt.toLowerCase().replace(/\s+/g, "_")}>
                    {opt}
                  </option>
                ))}
              </select>
              <select
                value={c.severity}
                onChange={(e) => {
                  const updated = [...conditions];
                  updated[i].severity = e.target.value;
                  setConditions(updated);
                }}
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-icon btn-danger" onClick={() => removeCondition(i)}>
                ✕
              </button>
            </div>
          ))}
          {conditions.length === 0 && (
            <p className="empty-hint">No conditions added.</p>
          )}
        </div>

        {/* Allergies */}
        <div className="glass-card">
          <div className="card-header">
            <h2 className="section-title">Allergies & Intolerances</h2>
            <button type="button" className="btn btn-small" onClick={addAllergy}>
              + Add
            </button>
          </div>
          {allergies.map((a, i) => (
            <div key={i} className="inline-form-row">
              <select
                value={a.allergen}
                onChange={(e) => {
                  const updated = [...allergies];
                  updated[i].allergen = e.target.value;
                  setAllergies(updated);
                }}
              >
                <option value="">Select allergen</option>
                {ALLERGEN_OPTIONS.map((opt) => (
                  <option key={opt} value={opt.toLowerCase()}>
                    {opt}
                  </option>
                ))}
              </select>
              <select
                value={a.severity}
                onChange={(e) => {
                  const updated = [...allergies];
                  updated[i].severity = e.target.value;
                  setAllergies(updated);
                }}
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-icon btn-danger" onClick={() => removeAllergy(i)}>
                ✕
              </button>
            </div>
          ))}
          {allergies.length === 0 && <p className="empty-hint">No allergies added.</p>}
        </div>

        {/* Dietary Preferences */}
        <div className="glass-card">
          <h2 className="section-title">Dietary Preferences</h2>
          <div className="chip-grid">
            {DIET_OPTIONS.map((pref) => (
              <button
                key={pref}
                type="button"
                className={`chip ${preferences.includes(pref.toLowerCase().replace(/\s+/g, "-")) ? "chip-active" : ""}`}
                onClick={() => togglePreference(pref.toLowerCase().replace(/\s+/g, "-"))}
              >
                {pref}
              </button>
            ))}
          </div>
        </div>

        {/* Nutrient Limits */}
        <div className="glass-card">
          <div className="card-header">
            <h2 className="section-title">Personal Nutrient Limits</h2>
            <button type="button" className="btn btn-small" onClick={addLimit}>
              + Add
            </button>
          </div>
          {limits.map((l, i) => (
            <div key={i} className="inline-form-row">
              <select
                value={l.nutrient}
                onChange={(e) => {
                  const updated = [...limits];
                  updated[i].nutrient = e.target.value;
                  setLimits(updated);
                }}
              >
                <option value="">Select nutrient</option>
                <option value="calories">Calories</option>
                <option value="sugars">Sugar</option>
                <option value="sodium">Sodium</option>
                <option value="total_fat">Total Fat</option>
                <option value="saturated_fat">Saturated Fat</option>
                <option value="cholesterol">Cholesterol</option>
                <option value="protein">Protein</option>
              </select>
              <input
                type="number"
                placeholder="Max value"
                value={l.max_daily_value}
                onChange={(e) => {
                  const updated = [...limits];
                  updated[i].max_daily_value = e.target.value ? parseFloat(e.target.value) : "";
                  setLimits(updated);
                }}
              />
              <select
                value={l.unit}
                onChange={(e) => {
                  const updated = [...limits];
                  updated[i].unit = e.target.value;
                  setLimits(updated);
                }}
              >
                <option value="g">g</option>
                <option value="mg">mg</option>
                <option value="kcal">kcal</option>
              </select>
              <button type="button" className="btn btn-icon btn-danger" onClick={() => removeLimit(i)}>
                ✕
              </button>
            </div>
          ))}
          {limits.length === 0 && <p className="empty-hint">No custom limits set.</p>}
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-large" disabled={saving}>
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
