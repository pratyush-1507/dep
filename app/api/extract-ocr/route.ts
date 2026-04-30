import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/proxy";


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
      console.error("[Extract OCR] Body parse error:", parseErr);
      return NextResponse.json({ error: "Request too large or invalid. Try a smaller image." }, { status: 413 });
    }

    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    console.log(`[Extract OCR] Image size: ${(imageBase64.length / 1024).toFixed(0)}KB base64`);

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key missing" }, { status: 503 });
    }

    const prompt = `You are an expert food label OCR reader.
Look at this image carefully and extract:
1. The product name (if visible)
2. ALL ingredients as a flat list of individual ingredient names (split compound entries into individual items)
3. Nutrition facts per serving or per 100g

Important rules:
- Each ingredient should be a short, clean string (e.g. "Sugar", "Palm Oil", "Salt")
- Do NOT combine multiple ingredients into one string
- If ingredients have sub-ingredients in parentheses, list the main ingredient and sub-ingredients separately
- Nutrition values should be numbers only (no units)
- Sodium should be in milligrams (mg)
- If something is not readable or missing, use null

You MUST return ONLY a valid JSON object (no markdown, no explanation) exactly matching this schema:
{
  "parsed_name": string | null,
  "parsed_ingredients": string[],
  "parsed_nutrition": {
    "calories": number | null,
    "total_fat": number | null,
    "sugars": number | null,
    "sodium": number | null,
    "protein": number | null
  }
}`;

    const payload = {
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1200,
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
      const errText = await res.text();
      console.error("[Extract OCR] HTTP", res.status, errText.substring(0, 300));
      return NextResponse.json(
        { error: `AI extraction failed (HTTP ${res.status}). Please try again.` },
        { status: 500 }
      );
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      console.error("[Extract OCR] No text in response:", JSON.stringify(data).substring(0, 300));
      return NextResponse.json({ error: "No text could be extracted from the image" }, { status: 500 });
    }

    // Robust JSON parsing with multiple fallback strategies
    const parsed = safeParseJSON(text);
    if (!parsed) {
      console.error("[Extract OCR] All parse strategies failed. Raw text:", text.substring(0, 500));
      return NextResponse.json({ error: "Could not parse AI response. Please try a clearer image." }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[Extract OCR] Error:", err);
    return NextResponse.json({ error: "Server error during extraction" }, { status: 500 });
  }
}

function safeParseJSON(text: string): Record<string, unknown> | null {
  // Strategy 1: Direct parse
  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  // Strategy 2: Strip markdown code blocks
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }

  // Strategy 3: Extract first { ... } block using brace matching
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
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch { /* continue */ }
    }
  }

  // Strategy 4: Fix common issues (trailing commas, unescaped newlines in strings)
  try {
    const fixed = cleaned
      .replace(/,\s*([\]}])/g, "$1") // trailing commas
      .replace(/\n/g, "\\n"); // unescaped newlines
    return JSON.parse(fixed);
  } catch { /* continue */ }

  return null;
}
