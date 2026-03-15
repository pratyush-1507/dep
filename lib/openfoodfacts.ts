/**
 * Open Food Facts API utility
 * Fetches product data by barcode and normalizes it into our ProductData shape.
 * API docs: https://wiki.openfoodfacts.org/API
 */

export interface OFFProduct {
  /** Product name */
  name: string;
  brand: string;
  category: string;
  imageUrl: string | null;
  /** Ingredients as a raw text string */
  ingredientsText: string;
  /** Normalized ingredients array */
  ingredients: string[];
  /** Allergens declared by the manufacturer (e.g. "en:gluten", "en:milk") */
  allergens: string[];
  /** Allergens in plain English */
  allergensTags: string[];
  // Nutrition per 100g
  calories: number | null;
  total_fat: number | null;
  saturated_fat: number | null;
  trans_fat: number | null;
  cholesterol: number | null;
  sodium: number | null;
  total_carbs: number | null;
  dietary_fiber: number | null;
  sugars: number | null;
  protein: number | null;
  /** Raw nutriments object from OFF for reference */
  nutriments: Record<string, number>;
}

function parseNum(val: unknown): number | null {
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function normalizeAllergenTag(tag: string): string {
  // e.g. "en:gluten" → "Gluten"
  return tag
    .replace(/^[a-z]{2}:/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseIngredients(raw: string | undefined): string[] {
  if (!raw) return [];
  // OFF ingredients_text looks like:
  // "Sugar, Water, Modified Starch, Salt, ..."
  // Split on commas/semicolons, clean up brackets & percentages
  return raw
    .replace(/\(.*?\)/g, "") // remove parenthetical sub-lists
    .split(/[,;]/)
    .map((s) =>
      s
        .replace(/^\s*[-_*]\s*/, "")
        .replace(/\d+(\.\d+)?%/g, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((s) => s.length > 1);
}

export async function fetchFromOpenFoodFacts(barcode: string): Promise<OFFProduct | null> {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=product_name,brands,categories,image_front_url,ingredients_text,allergens_tags,nutriments`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "HealthScan/1.0 (health-scan-six.vercel.app)",
      },
      next: { revalidate: 86400 }, // cache for 24h on Next.js edge
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;

    const p = json.product;
    const n = p.nutriments ?? {};

    const allergensTags: string[] = (p.allergens_tags ?? []).map(normalizeAllergenTag);
    const ingredients = parseIngredients(p.ingredients_text);

    return {
      name: p.product_name || "Unknown Product",
      brand: p.brands || "",
      category: p.categories || "",
      imageUrl: p.image_front_url || null,
      ingredientsText: p.ingredients_text || "",
      ingredients,
      allergens: p.allergens_tags ?? [],
      allergensTags,
      calories: parseNum(n["energy-kcal_100g"] ?? n["energy-kcal"]),
      total_fat: parseNum(n["fat_100g"] ?? n["fat"]),
      saturated_fat: parseNum(n["saturated-fat_100g"] ?? n["saturated-fat"]),
      trans_fat: parseNum(n["trans-fat_100g"] ?? n["trans-fat"]),
      cholesterol: parseNum(n["cholesterol_100g"] ?? n["cholesterol"]),
      sodium: parseNum(n["sodium_100g"] ?? n["sodium"]) !== null
        ? (parseNum(n["sodium_100g"] ?? n["sodium"])! * 1000) // OFF gives sodium in g, convert to mg
        : null,
      total_carbs: parseNum(n["carbohydrates_100g"] ?? n["carbohydrates"]),
      dietary_fiber: parseNum(n["fiber_100g"] ?? n["fiber"]),
      sugars: parseNum(n["sugars_100g"] ?? n["sugars"]),
      protein: parseNum(n["proteins_100g"] ?? n["proteins"]),
      nutriments: n,
    };
  } catch {
    return null;
  }
}
