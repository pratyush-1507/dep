import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/proxy";

export async function GET() {
  try {
    const { user, supabase } = await requireAuth();

    // Fetch profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // Fetch related data
    const [conditions, allergies, preferences, limits] = await Promise.all([
      supabase.from("health_conditions").select("*").eq("user_id", user.id),
      supabase.from("allergies").select("*").eq("user_id", user.id),
      supabase.from("dietary_preferences").select("*").eq("user_id", user.id),
      supabase.from("nutrient_limits").select("*").eq("user_id", user.id),
    ]);

    return NextResponse.json({
      profile: profile || {},
      conditions: conditions.data || [],
      allergies: allergies.data || [],
      preferences: preferences.data || [],
      limits: limits.data || [],
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(request: Request) {
  try {
    const { user, supabase } = await requireAuth();
    const body = await request.json();

    const { profile, conditions, allergies, preferences, limits } = body;

    // Calculate BMI if height and weight provided
    let bmi: number | null = null;
    let bmiCategory: string | null = null;

    if (profile.height_cm && profile.weight_kg) {
      const heightM = profile.height_cm / 100;
      bmi = Math.round((profile.weight_kg / (heightM * heightM)) * 10) / 10;

      if (bmi < 18.5) bmiCategory = "underweight";
      else if (bmi < 25) bmiCategory = "normal";
      else if (bmi < 30) bmiCategory = "overweight";
      else bmiCategory = "obese";
    }

    // Upsert profile
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: profile.full_name,
        age: profile.age,
        gender: profile.gender,
        height_cm: profile.height_cm,
        weight_kg: profile.weight_kg,
        bmi,
        bmi_category: bmiCategory,
        activity_level: profile.activity_level,
      });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    // Replace conditions
    await supabase.from("health_conditions").delete().eq("user_id", user.id);
    if (conditions && conditions.length > 0) {
      await supabase.from("health_conditions").insert(
        conditions.map((c: { condition_name: string; severity: string }) => ({
          user_id: user.id,
          condition_name: c.condition_name,
          severity: c.severity || "moderate",
        }))
      );
    }

    // Replace allergies
    await supabase.from("allergies").delete().eq("user_id", user.id);
    if (allergies && allergies.length > 0) {
      await supabase.from("allergies").insert(
        allergies.map((a: { allergen: string; severity: string }) => ({
          user_id: user.id,
          allergen: a.allergen,
          severity: a.severity || "moderate",
        }))
      );
    }

    // Replace dietary preferences
    await supabase.from("dietary_preferences").delete().eq("user_id", user.id);
    if (preferences && preferences.length > 0) {
      await supabase.from("dietary_preferences").insert(
        preferences.map((p: string) => ({
          user_id: user.id,
          preference: p,
        }))
      );
    }

    // Replace nutrient limits
    await supabase.from("nutrient_limits").delete().eq("user_id", user.id);
    if (limits && limits.length > 0) {
      await supabase.from("nutrient_limits").insert(
        limits.map((l: { nutrient: string; max_daily_value: number; unit: string }) => ({
          user_id: user.id,
          nutrient: l.nutrient,
          max_daily_value: l.max_daily_value,
          unit: l.unit || "g",
        }))
      );
    }

    return NextResponse.json({ success: true, bmi, bmi_category: bmiCategory });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
