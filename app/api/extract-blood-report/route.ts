import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/proxy";

export const maxDuration = 30; // App Router API config for max duration

const OPENROUTER_MODEL = "google/gemini-2.0-flash-001"; // vision-capable model
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key missing" }, { status: 503 });
    }

    const systemPrompt = "You are a clinical blood report analyzer. Always respond with valid JSON only, no markdown or explanation.";

    const userPrompt = `You are HealthScan AI's medical OCR agent. Your job is to extract data from a user's blood report (CBC, Lipid Panel, Metabolic Panel, etc.) and recommend updates to their HealthScan profile.
Review the numerical results and reference ranges in the image.
If you spot high/abnormal values (like high HbA1c, high LDL, high glucose), suggest the appropriate health conditions, dietary preferences to adopt, and daily nutrient limits to enforce.

You MUST return your answer as a strictly valid JSON object (no markdown, no code blocks) matching exactly this schema:
{
  "summary": "A short, user-friendly 2-3 sentence summary of what the blood report shows",
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
If the blood test is normal, suggest an empty array for conditions and limits, and say everything looks healthy in the summary.`;

    const payload = {
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    };

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://healthscan.app",
        "X-Title": "HealthScan AI",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("[Blood Report OCR] HTTP", res.status, (await res.text()).substring(0, 200));
      return NextResponse.json({ error: "Failed to analyze image with AI." }, { status: 502 });
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;

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
        // Try extracting JSON object from response
        const firstBrace = cleaned.indexOf("{");
        if (firstBrace !== -1) {
          let depth = 0;
          let lastBrace = -1;
          for (let i = firstBrace; i < cleaned.length; i++) {
            if (cleaned[i] === "{") depth++;
            else if (cleaned[i] === "}") {
              depth--;
              if (depth === 0) { lastBrace = i; break; }
            }
          }
          if (lastBrace !== -1) {
            try {
              parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
            } catch {
              return NextResponse.json({ error: "Failed to parse JSON from AI" }, { status: 500 });
            }
          } else {
            return NextResponse.json({ error: "Failed to parse JSON from AI" }, { status: 500 });
          }
        } else {
          return NextResponse.json({ error: "Failed to parse JSON from AI" }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ result: parsed });
  } catch (err) {
    console.error("[Blood Report OCR] Failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Server error during OCR extraction" }, { status: 500 });
  }
}
