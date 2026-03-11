import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/proxy";

// POST /api/ocr — Upload OCR text for a candidate product
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireAuth();
    const body = await request.json();
    const { barcode, raw_ocr_text, parsed_name, parsed_ingredients, parsed_nutrition, ocr_confidence } = body;

    if (!barcode) {
      return NextResponse.json({ error: "Barcode is required" }, { status: 400 });
    }

    // Check if candidate already exists for this barcode
    const { data: existing } = await supabase
      .from("candidate_products")
      .select("*")
      .eq("barcode", barcode)
      .single();

    if (existing) {
      // Check anti-abuse: one scan per user per product per day
      const { data: todayScan } = await supabase
        .from("candidate_scans")
        .select("*")
        .eq("candidate_id", existing.id)
        .eq("user_id", user.id)
        .eq("scanned_at", new Date().toISOString().split("T")[0])
        .single();

      if (todayScan) {
        return NextResponse.json({ error: "You have already scanned this product today" }, { status: 429 });
      }

      // Increment scan count
      const newCount = (existing.scan_count || 0) + 1;
      await supabase
        .from("candidate_products")
        .update({ scan_count: newCount })
        .eq("id", existing.id);

      // Record the scan
      await supabase.from("candidate_scans").insert({
        candidate_id: existing.id,
        user_id: user.id,
      });

      // Check promotion threshold
      const { data: settings } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "promotion_threshold")
        .single();

      const threshold = parseInt(settings?.value || "5", 10);

      if (newCount >= threshold && !existing.is_promoted) {
        // Promote to main products table
        const { data: promoted } = await supabase
          .from("products")
          .insert({
            barcode: existing.barcode,
            name: existing.parsed_name || "Unknown Product",
            ingredients: existing.parsed_ingredients || [],
            calories: existing.parsed_calories,
            total_fat: existing.parsed_total_fat,
            sugars: existing.parsed_sugars,
            sodium: existing.parsed_sodium,
            protein: existing.parsed_protein,
            source: "ocr",
            is_verified: false,
          })
          .select()
          .single();

        await supabase
          .from("candidate_products")
          .update({ is_promoted: true })
          .eq("id", existing.id);

        return NextResponse.json({
          status: "promoted",
          product: promoted,
          message: `Product promoted after ${newCount} scans`,
        });
      }

      return NextResponse.json({
        status: "updated",
        scan_count: newCount,
        threshold,
        message: `Scan recorded. ${threshold - newCount} more scans needed for promotion.`,
      });
    }

    // Create new candidate product
    const { data: candidate, error } = await supabase
      .from("candidate_products")
      .insert({
        barcode,
        raw_ocr_text: raw_ocr_text || "",
        parsed_name: parsed_name || "",
        parsed_ingredients: parsed_ingredients || [],
        parsed_calories: parsed_nutrition?.calories,
        parsed_total_fat: parsed_nutrition?.total_fat,
        parsed_sugars: parsed_nutrition?.sugars,
        parsed_sodium: parsed_nutrition?.sodium,
        parsed_protein: parsed_nutrition?.protein,
        ocr_confidence: ocr_confidence || 0,
        submitted_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Record scan
    await supabase.from("candidate_scans").insert({
      candidate_id: candidate.id,
      user_id: user.id,
    });

    return NextResponse.json({
      status: "created",
      candidate,
      message: "Candidate product created from OCR data.",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
