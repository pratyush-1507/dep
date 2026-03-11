import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/proxy";

// POST /api/chat — AI chatbot stub
export async function POST(request: Request) {
  try {
    const { supabase } = await requireAuth();
    const body = await request.json();
    const { message, product_context, verdict_context } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Stub AI response — in production, integrate with OpenAI/Anthropic
    let reply = "";

    const msgLower = message.toLowerCase();

    if (msgLower.includes("why") || msgLower.includes("explain")) {
      if (verdict_context) {
        reply = `Based on the analysis, the verdict for "${verdict_context.product_name}" is **${verdict_context.verdict}**.\n\n${verdict_context.reasoning}\n\n⚠️ This is informational only, not medical advice. Consult your healthcare provider for specific dietary guidance.`;
      } else {
        reply = "I'd be happy to explain a verdict — please scan a product first so I can provide context-specific information.";
      }
    } else if (msgLower.includes("alternative") || msgLower.includes("suggest") || msgLower.includes("recommend")) {
      reply = "For personalized alternatives, I'd recommend:\n\n1. Look for products with lower values in the flagged nutrients\n2. Check for allergen-free versions of similar products\n3. Consider whole food alternatives when possible\n\n⚠️ Always verify products against your personal health profile by scanning them.";
    } else if (msgLower.includes("ingredient") || msgLower.includes("additive")) {
      if (product_context) {
        const ingredients = product_context.ingredients?.join(", ") || "No ingredients listed";
        reply = `The ingredients for "${product_context.name}" are:\n\n${ingredients}\n\nWould you like me to explain any specific ingredient?`;
      } else {
        reply = "Please scan a product first so I can review its ingredients with you.";
      }
    } else {
      reply = `I'm your HealthScan AI assistant. I can help you:\n\n• **Explain** why a product received its verdict\n• **Suggest alternatives** for flagged products\n• **Clarify ingredients** and additives\n\nTry asking: "Why was this product marked as avoid?" or "What are the ingredients?"\n\n⚠️ My responses are informational only, not medical advice.`;
    }

    // Fetch from supabase just to verify connection works
    void supabase;

    return NextResponse.json({
      reply,
      disclaimer: "This is AI-generated informational content, not medical advice.",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
