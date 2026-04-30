import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/proxy";
import { evaluateHealthRules, type ProductData, type UserProfile, type HealthRule } from "@/lib/health-rules";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=`;

// POST /api/verdict — evaluate product for user
// Accepts: { product_id } | { candidate_id } | { inline_product: ProductData & { name, barcode } }
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireAuth();
    const body = await request.json();
    const { product_id, candidate_id, inline_product } = body;

    if (!product_id && !candidate_id && !inline_product) {
      return NextResponse.json(
        { error: "product_id, candidate_id, or inline_product required" },
        { status: 400 }
      );
    }

    // Fetch product data
    let productData: ProductData | null = null;
    let dataSource: "barcode" | "ocr" | "openfoodfacts" = "barcode";
    let savedProductId: string | null = product_id || null;
    let savedCandidateId: string | null = candidate_id || null;

    if (product_id) {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("id", product_id)
        .single();

      if (data) {
        productData = {
          name: data.name,
          ingredients: data.ingredients || [],
          calories: data.calories,
          total_fat: data.total_fat,
          saturated_fat: data.saturated_fat,
          trans_fat: data.trans_fat,
          cholesterol: data.cholesterol,
          sodium: data.sodium,
          total_carbs: data.total_carbs,
          dietary_fiber: data.dietary_fiber,
          sugars: data.sugars,
          protein: data.protein,
        };
        dataSource = data.source === "ocr" ? "ocr" : "barcode";
      }
    } else if (candidate_id) {
      const { data } = await supabase
        .from("candidate_products")
        .select("*")
        .eq("id", candidate_id)
        .single();

      if (data) {
        productData = {
          name: data.parsed_name || "Unknown",
          ingredients: data.parsed_ingredients || [],
          calories: data.parsed_calories,
          total_fat: data.parsed_total_fat,
          sugars: data.parsed_sugars,
          sodium: data.parsed_sodium,
          protein: data.parsed_protein,
          saturated_fat: null,
          trans_fat: null,
          cholesterol: null,
          total_carbs: null,
          dietary_fiber: null,
        };
        dataSource = "ocr";
      }
    } else if (inline_product) {
      // Product came directly from Open Food Facts (already cached in DB by /api/products)
      productData = {
        name: inline_product.name || "Unknown Product",
        ingredients: inline_product.ingredients || [],
        calories: inline_product.calories ?? null,
        total_fat: inline_product.total_fat ?? null,
        saturated_fat: inline_product.saturated_fat ?? null,
        trans_fat: inline_product.trans_fat ?? null,
        cholesterol: inline_product.cholesterol ?? null,
        sodium: inline_product.sodium ?? null,
        total_carbs: inline_product.total_carbs ?? null,
        dietary_fiber: inline_product.dietary_fiber ?? null,
        sugars: inline_product.sugars ?? null,
        protein: inline_product.protein ?? null,
      };
      dataSource = "openfoodfacts";
      // If the product was cached with an id, use it
      if (inline_product.id) {
        savedProductId = inline_product.id;
      }
    }

    if (!productData) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Fetch user profile & rules in parallel
    const { data: profile } = await supabase
      .from("profiles")
      .select("bmi_category")
      .eq("id", user.id)
      .single();

    const [conditionsRes, allergiesRes, prefsRes, limitsRes, rulesRes] = await Promise.all([
      supabase.from("health_conditions").select("condition_name").eq("user_id", user.id),
      supabase.from("allergies").select("allergen, severity").eq("user_id", user.id),
      supabase.from("dietary_preferences").select("preference").eq("user_id", user.id),
      supabase.from("nutrient_limits").select("nutrient, max_daily_value, unit").eq("user_id", user.id),
      supabase.from("health_rules").select("*").eq("is_active", true).order("priority", { ascending: false }),
    ]);

    const userProfile: UserProfile = {
      bmi_category: profile?.bmi_category,
      conditions: (conditionsRes.data || []).map((c) => c.condition_name),
      allergies: (allergiesRes.data || []).map((a) => ({ allergen: a.allergen, severity: a.severity })),
      dietary_preferences: (prefsRes.data || []).map((p) => p.preference),
      nutrient_limits: (limitsRes.data || []).map((l) => ({
        nutrient: l.nutrient,
        max_daily_value: l.max_daily_value,
        unit: l.unit,
      })),
    };

    const healthRules: HealthRule[] = (rulesRes.data || []).map((r) => ({
      rule_name: r.rule_name,
      condition_target: r.condition_target,
      nutrient: r.nutrient,
      operator: r.operator,
      threshold: r.threshold,
      verdict: r.verdict as "caution" | "avoid",
      priority: r.priority,
    }));

    // Evaluate with AI (fallback to deterministic if it fails)
    const apiKey = process.env.GEMINI_API_KEY;
    let result = null;

    if (apiKey) {
      result = await evaluateWithAI(productData, userProfile, healthRules, apiKey);
    }

    if (!result) {
      console.warn("[Verdict] AI evaluation failed or missing key, falling back to deterministic rules");
      result = evaluateHealthRules(productData, userProfile, healthRules);
    }

    // Store scan history
    await supabase.from("scan_history").insert({
      user_id: user.id,
      product_id: savedProductId || null,
      candidate_id: savedCandidateId || null,
      verdict: result.verdict,
      confidence: result.confidence,
      reasoning: result.reasoning,
      triggered_rules: result.triggered_rules,
      data_source: dataSource === "openfoodfacts" ? "barcode" : dataSource,
    });

    return NextResponse.json({
      product_name: productData.name,
      ...result,
      data_source: dataSource,
    });
  } catch (err: unknown) {
    console.error("[Verdict API Error]:", err);
    return NextResponse.json({ error: "Unauthorized or Error occurred" }, { status: 401 });
  }
}

// ── AI Verdict Evaluator ──────────────────────────────────────────────

async function evaluateWithAI(
  product: ProductData,
  profile: UserProfile,
  rules: HealthRule[],
  apiKey: string
) {
  try {
    const prompt = `
You are HealthScan AI's verdict engine. Your job is to act as a highly strict medical and nutritional rule evaluator.
You will be provided with a Product's Nutritional Data, the User's Health Profile, and a list of System Health Rules.

YOUR INSTRUCTIONS:
1. Compare the Product Data against the User's Health Profile (conditions, allergies, preferences).
2. Apply standard medical/dietary common sense AND strictly enforce any of the System Health Rules provided.
3. Determine if the product is 'safe', 'caution' (minor flags, moderation required), or 'avoid' (contains allergens or heavily violates conditions).
4. Provide a reasoning paragraph and list any triggered rules.
5. You MUST return your answer as a valid JSON object matching exactly this schema, and nothing else (no markdown blocks like \`\`\`json):
{
  "verdict": "safe" | "caution" | "avoid",
  "confidence": number (0.0 to 1.0),
  "reasoning": "A concise, user-friendly explanation of why this verdict was given",
  "triggered_rules": ["List", "of", "rules", "broken", "or 'none'"]
}

--- DATA ---
PRODUCT DATA:
${JSON.stringify(product, null, 2)}

USER PROFILE:
${JSON.stringify(profile, null, 2)}

SYSTEM RULES TO CONSIDER:
${JSON.stringify(rules, null, 2)}
`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.1, // very low temperature for deterministic evaluation
        responseMimeType: "application/json",
      },
    };

    const res = await fetch(`${GEMINI_URL}${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("[AI Verdict] HTTP", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) return null;

    text = text.replace(/```json\n?/gi, "").replace(/```\n?/gi, "").trim();

    const parsed = JSON.parse(text);
    if (!["safe", "caution", "avoid"].includes(parsed.verdict)) return null;

    return {
      verdict: parsed.verdict,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
      reasoning: parsed.reasoning || "AI evaluated this product based on your profile.",
      triggered_rules: Array.isArray(parsed.triggered_rules) ? parsed.triggered_rules : [],
    };
  } catch (err) {
    console.error("[AI Verdict] Failed:", err);
    return null;
  }
}
