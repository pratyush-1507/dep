import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/proxy";
import { fetchFromOpenFoodFacts } from "@/lib/openfoodfacts";

// GET /api/products?barcode=XXXXX
export async function GET(request: Request) {
  try {
    const { supabase } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get("barcode");

    if (!barcode) {
      return NextResponse.json({ error: "Barcode is required" }, { status: 400 });
    }

    // 1. Check main products table
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("barcode", barcode)
      .single();

    if (product) {
      return NextResponse.json({ found: true, source: "products", product });
    }

    // 2. Check candidate products
    const { data: candidate } = await supabase
      .from("candidate_products")
      .select("*")
      .eq("barcode", barcode)
      .single();

    if (candidate) {
      return NextResponse.json({ found: true, source: "candidate", product: candidate });
    }

    // 3. Fallback: Open Food Facts
    const offProduct = await fetchFromOpenFoodFacts(barcode);

    if (offProduct) {
      // Cache it in our products table for future lookups
      const { data: cached, error: insertError } = await supabase
        .from("products")
        .insert({
          barcode,
          name: offProduct.name,
          brand: offProduct.brand || null,
          category: offProduct.category || null,
          ingredients: offProduct.ingredients,
          calories: offProduct.calories,
          total_fat: offProduct.total_fat,
          saturated_fat: offProduct.saturated_fat,
          trans_fat: offProduct.trans_fat,
          cholesterol: offProduct.cholesterol,
          sodium: offProduct.sodium,
          total_carbs: offProduct.total_carbs,
          dietary_fiber: offProduct.dietary_fiber,
          sugars: offProduct.sugars,
          protein: offProduct.protein,
          source: "barcode_db",
          is_verified: false,
          image_url: offProduct.imageUrl || null,
        })
        .select()
        .single();

      if (!insertError && cached) {
        return NextResponse.json({
          found: true,
          source: "openfoodfacts",
          product: cached,
          offData: {
            allergensTags: offProduct.allergensTags,
            ingredients: offProduct.ingredients,
            ingredientsText: offProduct.ingredientsText,
            imageUrl: offProduct.imageUrl,
            brand: offProduct.brand,
          },
        });
      }

      // Insert failed (e.g. duplicate race condition) — return OFF data directly
      return NextResponse.json({
        found: true,
        source: "openfoodfacts",
        // Return as a virtual product in the same shape the client expects
        product: {
          id: null,
          barcode,
          name: offProduct.name,
          brand: offProduct.brand,
          ingredients: offProduct.ingredients,
          calories: offProduct.calories,
          total_fat: offProduct.total_fat,
          saturated_fat: offProduct.saturated_fat,
          trans_fat: offProduct.trans_fat,
          cholesterol: offProduct.cholesterol,
          sodium: offProduct.sodium,
          total_carbs: offProduct.total_carbs,
          dietary_fiber: offProduct.dietary_fiber,
          sugars: offProduct.sugars,
          protein: offProduct.protein,
          image_url: offProduct.imageUrl,
        },
        offData: {
          allergensTags: offProduct.allergensTags,
          ingredients: offProduct.ingredients,
          ingredientsText: offProduct.ingredientsText,
          imageUrl: offProduct.imageUrl,
          brand: offProduct.brand,
        },
      });
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
