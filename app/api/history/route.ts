import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/proxy";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

    const { data: scans, count } = await supabase
      .from("scan_history")
      .select("*, products(name, barcode, image_url), candidate_products(parsed_name, barcode)", {
        count: "exact",
      })
      .eq("user_id", user.id)
      .order("scanned_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return NextResponse.json({
      scans: scans || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
