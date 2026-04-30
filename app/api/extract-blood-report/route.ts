import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/proxy";

export const maxDuration = 30; // App Router API config for max duration

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=`;

export async function POST(request: Request) {
  try {
    const { user } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch (parseErr) {
      return NextResponse.json({ error: "Request too large or invalid. Try a smaller image." }, { status: 413 });
    }

    const { imageBase64, mimeType } = body;
    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key missing" }, { status: 503 });
    }

    const prompt = `
You are HealthScan AI's medical OCR agent. Your job is to extract data from a user's blood report (CBC, Lipid Panel, Metabolic Panel, etc.) and recommend updates to their HealthScan profile.
Review the numerical results and reference ranges in the image.
If you spot high/abnormal values (like high HbA1c, high LDL, high glucose), suggest the appropriate health conditions, dietary preferences to adopt, and daily nutrient limits to enforce.

You MUST return your answer as a strictly valid JSON object matching exactly this schema, and nothing else:
{
  "summary": "A short, user-friendly 2-3 sentence summary of what the blood report shows (e.g. 'Your lipid panel shows elevated LDL cholesterol and your fasting glucose is high.')",
  "suggested_conditions": [
    { "condition_name": "Diabetes" | "Hypertension" | "Heart Disease" | "Kidney Disease" | "Liver Disease" | "Thyroid Disorder" | "PCOS", "severity": "mild" | "moderate" | "severe" }
  ],
  "suggested_preferences": [
    "Vegetarian" | "Keto" | "Low-Sugar" | "Low-Sodium" | "Low-Fat" | "High-Protein" | "Mediterranean"
  ],
  "suggested_limits": [
    { "nutrient": "sugars" | "sodium" | "total_fat" | "saturated_fat" | "cholesterol", "max_daily_value": number, "unit": "g" | "mg" }
  ],
  "abnormal_biomarkers": [
    { "name": "e.g., LDL Cholesterol", "value": "e.g., 160 mg/dL", "status": "high" | "low" }
  ]
}
If the blood test is normal, suggest an empty array for conditions and limits, and say everything looks healthy in the summary.
`;

    const payload = {
      system_instruction: {
        parts: [{ text: "You are a clinical blood report analyzer." }]
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType || "image/jpeg",
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            summary: { type: "STRING" },
            suggested_conditions: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  condition_name: { type: "STRING" },
                  severity: { type: "STRING" }
                },
                required: ["condition_name", "severity"]
              }
            },
            suggested_preferences: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            suggested_limits: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  nutrient: { type: "STRING" },
                  max_daily_value: { type: "NUMBER" },
                  unit: { type: "STRING" }
                },
                required: ["nutrient", "max_daily_value", "unit"]
              }
            },
            abnormal_biomarkers: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  value: { type: "STRING" },
                  status: { type: "STRING" }
                },
                required: ["name", "value", "status"]
              }
            }
          },
          required: ["summary", "suggested_conditions", "suggested_preferences", "suggested_limits", "abnormal_biomarkers"]
        }
      },
    };

    const res = await fetch(`${GEMINI_URL}${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("[Blood Report OCR] HTTP", res.status, (await res.text()).substring(0, 200));
      return NextResponse.json({ error: "Failed to analyze image with AI." }, { status: 502 });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json({ error: "AI returned empty text" }, { status: 500 });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json\n?/gi, "").replace(/```\n?/gi, "").trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch (err) {
        return NextResponse.json({ error: "Failed to parse JSON from AI" }, { status: 500 });
      }
    }

    return NextResponse.json({ result: parsed });
  } catch (err) {
    console.error("[Blood Report OCR] Failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Server error during OCR extraction" }, { status: 500 });
  }
}
