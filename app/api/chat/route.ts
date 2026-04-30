import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/proxy";

const OPENROUTER_MODEL = "google/gemini-2.0-flash-001";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// POST /api/chat — AI chatbot powered by OpenRouter, with rule-based fallback
export async function POST(request: Request) {
  // Auth check — use getAuthUser (not requireAuth) to avoid 307 redirects from API routes
  const { user, supabase } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to use the AI assistant." }, { status: 401 });
  }

  // Fetch User Profile Context
  const [profileRes, conditionsRes, allergiesRes] = await Promise.all([
    supabase.from("profiles").select("bmi_category").eq("id", user.id).single(),
    supabase.from("health_conditions").select("condition_name").eq("user_id", user.id),
    supabase.from("allergies").select("allergen, severity").eq("user_id", user.id),
  ]);

  const userProfileText = [
    `User BMI Category: ${profileRes.data?.bmi_category || "Unknown"}`,
    `Medical Conditions: ${conditionsRes.data?.map(c => c.condition_name).join(", ") || "None"}`,
    `Allergies: ${allergiesRes.data?.map(a => `${a.allergen} (${a.severity})`).join(", ") || "None"}`,
  ].join("\n");

  try {
    const body = await request.json();
    const {
      messages,        // full conversation history: { role: "user"|"assistant", content: string }[]
      product_context, // { name, brand, ingredients, calories, sodium, sugars, total_fat, protein }
      verdict_context, // { product_name, verdict, confidence, reasoning, triggered_rules, data_source }
    } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400 });
    }

    // Try OpenRouter first, fall back to deterministic if it fails
    const apiKey = process.env.OPENROUTER_API_KEY;
    const aiReply = apiKey
      ? await callOpenRouter(messages, product_context, verdict_context, userProfileText, apiKey)
      : null;

    if (aiReply) {
      if (aiReply === "__RATE_LIMIT__") {
        return NextResponse.json({
          reply: "⏳ The AI is currently experiencing high demand. Please wait a few seconds and try again.",
          disclaimer: "System Message",
        });
      }
      return NextResponse.json({
        reply: aiReply,
        disclaimer: "This is AI-generated informational content, not medical advice.",
      });
    }

    // Fallback: deterministic rule-based replies
    const reply = generateFallbackReply(messages, product_context, verdict_context);
    return NextResponse.json({
      reply,
      disclaimer: "This is informational content, not medical advice.",
    });
  } catch (err: unknown) {
    console.error("[/api/chat] Unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "AI assistant encountered an error. Please try again." },
      { status: 500 }
    );
  }
}

// ── OpenRouter API (OpenAI-compatible) ───────────────────────────────

async function callOpenRouter(
  messages: { role: string; content: string }[],
  product_context: Record<string, unknown> | null,
  verdict_context: Record<string, unknown> | null,
  userProfileText: string,
  apiKey: string
): Promise<string | null> {
  try {
    const systemPrompt = buildSystemPrompt(product_context, verdict_context, userProfileText);

    // Build OpenAI-compatible messages array
    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      })),
    ];

    const payload = {
      model: OPENROUTER_MODEL,
      messages: openaiMessages,
      max_tokens: 600,
      temperature: 0.5,
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
      const errBody = await res.text();
      console.error(`[OpenRouter Chat] HTTP ${res.status}: ${errBody.substring(0, 200)}`);
      if (res.status === 429 || res.status === 503) {
        return "__RATE_LIMIT__";
      }
      return null; // fall back to deterministic for other errors
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return text || null;
  } catch (err) {
    console.error("[OpenRouter Chat] Call failed:", err instanceof Error ? err.message : err);
    return null; // fall back to deterministic
  }
}

// ── System Prompt Builder ────────────────────────────────────────────

function buildSystemPrompt(
  product_context: Record<string, unknown> | null,
  verdict_context: Record<string, unknown> | null,
  userProfileText: string
): string {
  const parts: string[] = [
    "You are HealthScan AI, a highly intelligent food safety assistant embedded in the HealthScan app.",
    "Your job is to help users understand food product analysis results, explain health verdicts, suggest alternatives, and clarify ingredients or additives.",
    "You MUST thoroughly review the USER HEALTH PROFILE below before answering. Tailor all advice and answers specifically to their health conditions, allergies, and BMI.",
    "You MUST always include a brief disclaimer that your responses are informational only and not medical advice.",
    "Keep responses concise, friendly, and easy to understand. Use bullet points where helpful.",
    "Never override the deterministic health verdict. You may explain and elaborate on it, but cannot change it.",
    "",
    "--- USER HEALTH PROFILE ---",
    userProfileText,
    "---------------------------",
  ];

  if (verdict_context) {
    const vc = verdict_context as {
      product_name?: string; verdict?: string; confidence?: number;
      reasoning?: string; triggered_rules?: string[]; data_source?: string;
    };
    parts.push(
      `\nCURRENT PRODUCT ANALYSIS:`,
      `Product: ${vc.product_name}`,
      `Verdict: ${(vc.verdict ?? "unknown").toUpperCase()} (confidence: ${Math.round((vc.confidence ?? 0) * 100)}%)`,
      `Data source: ${vc.data_source ?? "unknown"}`,
      `Reasoning:\n${vc.reasoning ?? "N/A"}`,
      `Triggered health rules: ${vc.triggered_rules?.join(", ") || "none"}`,
    );
  }

  if (product_context) {
    const pc = product_context as {
      name?: string; brand?: string; ingredients?: string[];
      calories?: number; sodium?: number; sugars?: number;
      total_fat?: number; protein?: number;
    };
    const productDetails = [
      `\nPRODUCT DETAILS:`,
      `Name: ${pc.name}`,
      pc.brand ? `Brand: ${pc.brand}` : "",
      pc.ingredients?.length ? `Ingredients: ${pc.ingredients.join(", ")}` : "",
      pc.calories != null ? `Calories: ${pc.calories} kcal` : "",
      pc.sodium != null ? `Sodium: ${pc.sodium} mg` : "",
      pc.sugars != null ? `Sugars: ${pc.sugars} g` : "",
      pc.total_fat != null ? `Total Fat: ${pc.total_fat} g` : "",
      pc.protein != null ? `Protein: ${pc.protein} g` : "",
    ].filter(Boolean);
    parts.push(...productDetails);
  }

  if (!verdict_context && !product_context) {
    parts.push(
      "\nNo product has been scanned yet. Encourage the user to scan a product first, but you can answer general food health questions."
    );
  }

  return parts.join("\n");
}

// ── Deterministic Fallback ───────────────────────────────────────────

function generateFallbackReply(
  messages: { role: string; content: string }[],
  product_context: Record<string, unknown> | null,
  verdict_context: Record<string, unknown> | null,
): string {
  const lastMsg = messages[messages.length - 1]?.content || "";
  const msgLower = lastMsg.toLowerCase();
  const vc = verdict_context as {
    product_name?: string; verdict?: string; reasoning?: string;
  } | null;

  if (msgLower.includes("why") || msgLower.includes("explain")) {
    if (vc) {
      return `Based on the analysis, the verdict for "${vc.product_name}" is **${vc.verdict?.toUpperCase()}**.\n\n${vc.reasoning}\n\n⚠️ This is informational only, not medical advice. Consult your healthcare provider for specific dietary guidance.`;
    }
    return "I'd be happy to explain a verdict — please scan a product first so I can provide context-specific information.";
  }

  if (msgLower.includes("alternative") || msgLower.includes("suggest") || msgLower.includes("recommend")) {
    return "For personalized alternatives, I'd recommend:\n\n1. Look for products with lower values in the flagged nutrients\n2. Check for allergen-free versions of similar products\n3. Consider whole food alternatives when possible\n\n⚠️ Always verify products against your personal health profile by scanning them.";
  }

  if (msgLower.includes("ingredient") || msgLower.includes("additive")) {
    const pc = product_context as { name?: string; ingredients?: string[] } | null;
    if (pc?.ingredients?.length) {
      return `The ingredients for "${pc.name}" are:\n\n${pc.ingredients.join(", ")}\n\nWould you like me to explain any specific ingredient?\n\n⚠️ This is informational only, not medical advice.`;
    }
    return "Please scan a product first so I can review its ingredients with you.";
  }

  if (vc) {
    return `I'm your HealthScan AI assistant. The product "${vc.product_name}" was marked as **${vc.verdict?.toUpperCase()}**.\n\nYou can ask me:\n• **"Why?"** — to understand the verdict reasoning\n• **"Suggest alternatives"** — for healthier options\n• **"What are the ingredients?"** — for ingredient details\n\n⚠️ My responses are informational only, not medical advice.`;
  }

  return `I'm your HealthScan AI assistant. I can help you:\n\n• **Explain** why a product received its verdict\n• **Suggest alternatives** for flagged products\n• **Clarify ingredients** and additives\n\nTry asking: "Why was this product marked as avoid?" or "What are the ingredients?"\n\n⚠️ My responses are informational only, not medical advice.`;
}
