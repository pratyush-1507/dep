import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/proxy";

// GET /api/products?barcode=XXXXX
export async function GET(request: Request) {
  try {
    const { supabase } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get("barcode");

    if (!barcode) {
      return NextResponse.json({ error: "Barcode is required" }, { status: 400 });
    }

    // Check main products table
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("barcode", barcode)
      .single();

    if (product) {
      return NextResponse.json({ found: true, source: "products", product });
    }

    // Check candidate products
    const { data: candidate } = await supabase
      .from("candidate_products")
      .select("*")
      .eq("barcode", barcode)
      .single();

    if (candidate) {
      return NextResponse.json({ found: true, source: "candidate", product: candidate });
    }

    return NextResponse.json({ found: false });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// POST /api/products — add a new product (admin/manual entry)
export async function POST(request: Request) {
  try {
    const { supabase } = await requireAuth();
    const body = await request.json();

    const { data, error } = await supabase
      .from("products")
      .insert({
        barcode: body.barcode,
        name: body.name,
        brand: body.brand,
        category: body.category,
        ingredients: body.ingredients || [],
        calories: body.calories,
        total_fat: body.total_fat,
        saturated_fat: body.saturated_fat,
        trans_fat: body.trans_fat,
        cholesterol: body.cholesterol,
        sodium: body.sodium,
        total_carbs: body.total_carbs,
        dietary_fiber: body.dietary_fiber,
        sugars: body.sugars,
        protein: body.protein,
        source: body.source || "manual",
        is_verified: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ product: data });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
