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

    // Fetch conditions
    const { data: conditions } = await supabase
      .from("health_conditions")
      .select("*")
      .eq("user_id", user.id);

    // Fetch allergies
    const { data: allergies } = await supabase
      .from("allergies")
      .select("*")
      .eq("user_id", user.id);

    // Fetch preferences
    const { data: preferences } = await supabase
      .from("dietary_preferences")
      .select("*")
      .eq("user_id", user.id);

    // Recent scans (last 10)
    const { data: recentScans } = await supabase
      .from("scan_history")
      .select("*, products(name, barcode, image_url), candidate_products(parsed_name, barcode)")
      .eq("user_id", user.id)
      .order("scanned_at", { ascending: false })
      .limit(10);

    // Scan statistics
    const { count: totalScans } = await supabase
      .from("scan_history")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    const { count: safeCount } = await supabase
      .from("scan_history")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("verdict", "safe");

    const { count: cautionCount } = await supabase
      .from("scan_history")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("verdict", "caution");

    const { count: avoidCount } = await supabase
      .from("scan_history")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("verdict", "avoid");

    // Nutrition alerts based on profile
    const alerts: string[] = [];
    if (profile?.bmi_category === "obese") {
      alerts.push("Your BMI indicates obesity. Consider low-calorie options.");
    } else if (profile?.bmi_category === "overweight") {
      alerts.push("Your BMI indicates overweight. Monitor caloric intake.");
    } else if (profile?.bmi_category === "underweight") {
      alerts.push("Your BMI indicates underweight. Ensure adequate nutrition.");
    }
    if (conditions && conditions.length > 0) {
      alerts.push(`You have ${conditions.length} health condition(s) being monitored.`);
    }
    if (allergies && allergies.length > 0) {
      alerts.push(`${allergies.length} allergen(s) being tracked in product scans.`);
    }

    return NextResponse.json({
      profile: profile || {},
      conditions: conditions || [],
      allergies: allergies || [],
      preferences: preferences || [],
      recentScans: recentScans || [],
      stats: {
        total: totalScans || 0,
        safe: safeCount || 0,
        caution: cautionCount || 0,
        avoid: avoidCount || 0,
      },
      alerts,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
