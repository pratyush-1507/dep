import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/proxy";

// Allow larger request bodies for image uploads (default is 1MB)
export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
};

const GEMINI_MODEL = "gemini-2.5-flash";
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
      console.error("[Extract OCR] Body parse error:", parseErr);
      return NextResponse.json({ error: "Request too large or invalid. Try a smaller image." }, { status: 413 });
    }

    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    console.log(`[Extract OCR] Image size: ${(imageBase64.length / 1024).toFixed(0)}KB base64`);

    const apiKey = process.env.GEMINI_API_KEY;
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
- If something is not readable or missing, use null`;

    const payload = {
      contents: [
        {
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
        maxOutputTokens: 1200,
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            parsed_name: { type: "STRING", nullable: true },
            parsed_ingredients: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
            parsed_nutrition: {
              type: "OBJECT",
              properties: {
                calories: { type: "NUMBER", nullable: true },
                total_fat: { type: "NUMBER", nullable: true },
                sugars: { type: "NUMBER", nullable: true },
                sodium: { type: "NUMBER", nullable: true },
                protein: { type: "NUMBER", nullable: true },
              },
            },
          },
          required: ["parsed_name", "parsed_ingredients", "parsed_nutrition"],
        },
      },
    };

    const res = await fetch(`${GEMINI_URL}${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error("[Extract OCR] No text in response. Candidate:", JSON.stringify(data?.candidates?.[0]));
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
