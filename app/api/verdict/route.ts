import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/proxy";
import { evaluateHealthRules, type ProductData, type UserProfile, type HealthRule } from "@/lib/health-rules";

// POST /api/verdict — evaluate product for user
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireAuth();
    const body = await request.json();
    const { product_id, candidate_id } = body;

    if (!product_id && !candidate_id) {
      return NextResponse.json({ error: "product_id or candidate_id required" }, { status: 400 });
    }

    // Fetch product data
    let productData: ProductData | null = null;
    let dataSource: "barcode" | "ocr" = "barcode";

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
    }

    if (!productData) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Fetch user profile
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

    // Evaluate
    const result = evaluateHealthRules(productData, userProfile, healthRules);

    // Store scan history
    await supabase.from("scan_history").insert({
      user_id: user.id,
      product_id: product_id || null,
      candidate_id: candidate_id || null,
      verdict: result.verdict,
      confidence: result.confidence,
      reasoning: result.reasoning,
      triggered_rules: result.triggered_rules,
      data_source: dataSource,
    });

    return NextResponse.json({
      product_name: productData.name,
      ...result,
      data_source: dataSource,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
