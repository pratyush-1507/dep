/**
 * HealthScan Deterministic Health Rules Engine
 *
 * Evaluates a product against a user's health profile to produce
 * a verdict: "safe", "caution", or "avoid" with reasoning.
 */

export interface ProductData {
  name: string;
  ingredients: string[];
  calories?: number | null;
  total_fat?: number | null;
  saturated_fat?: number | null;
  trans_fat?: number | null;
  cholesterol?: number | null;
  sodium?: number | null;
  total_carbs?: number | null;
  dietary_fiber?: number | null;
  sugars?: number | null;
  protein?: number | null;
}

export interface UserProfile {
  bmi_category?: string | null;
  conditions: string[];
  allergies: { allergen: string; severity: string }[];
  dietary_preferences: string[];
  nutrient_limits: { nutrient: string; max_daily_value: number; unit: string }[];
}

export interface HealthRule {
  rule_name: string;
  condition_target: string;
  nutrient: string;
  operator: string;
  threshold: number;
  verdict: "caution" | "avoid";
  priority: number;
}

export interface VerdictResult {
  verdict: "safe" | "caution" | "avoid";
  confidence: number;
  reasoning: string;
  triggered_rules: string[];
}

function getNutrientValue(product: ProductData, nutrient: string): number | null {
  const map: Record<string, number | null | undefined> = {
    calories: product.calories,
    total_fat: product.total_fat,
    saturated_fat: product.saturated_fat,
    trans_fat: product.trans_fat,
    cholesterol: product.cholesterol,
    sodium: product.sodium,
    total_carbs: product.total_carbs,
    dietary_fiber: product.dietary_fiber,
    sugars: product.sugars,
    protein: product.protein,
  };
  return map[nutrient] ?? null;
}

function evaluateOperator(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case ">": return value > threshold;
    case "<": return value < threshold;
    case ">=": return value >= threshold;
    case "<=": return value <= threshold;
    case "=": return value === threshold;
    default: return false;
  }
}

export function evaluateHealthRules(
  product: ProductData,
  profile: UserProfile,
  rules: HealthRule[]
): VerdictResult {
  const triggeredRules: { rule: HealthRule; reason: string }[] = [];

  // 1. Check allergies against ingredients
  for (const allergy of profile.allergies) {
    const allergenLower = allergy.allergen.toLowerCase();
    for (const ingredient of product.ingredients) {
      if (ingredient.toLowerCase().includes(allergenLower)) {
        const severity = allergy.severity;
        triggeredRules.push({
          rule: {
            rule_name: `Allergen: ${allergy.allergen}`,
            condition_target: `allergy:${allergy.allergen}`,
            nutrient: "",
            operator: "contains",
            threshold: 0,
            verdict: severity === "severe" ? "avoid" : "caution",
            priority: severity === "severe" ? 100 : 50,
          },
          reason: `Contains ${allergy.allergen} (${severity} allergy detected in ingredient: "${ingredient}")`,
        });
      }
    }
  }

  // 2. Check dietary preferences
  const ingredientsJoined = product.ingredients.join(" ").toLowerCase();

  for (const pref of profile.dietary_preferences) {
    const prefLower = pref.toLowerCase();
    if (prefLower === "vegetarian" || prefLower === "vegan") {
      const meatKeywords = ["chicken", "beef", "pork", "fish", "meat", "gelatin", "lard", "tallow"];
      const dairyKeywords = ["milk", "cheese", "butter", "cream", "whey", "casein", "lactose"];
      const checkList = prefLower === "vegan" ? [...meatKeywords, ...dairyKeywords, "honey", "eggs", "egg"] : meatKeywords;

      for (const keyword of checkList) {
        if (ingredientsJoined.includes(keyword)) {
          triggeredRules.push({
            rule: {
              rule_name: `Dietary: ${pref}`,
              condition_target: `diet:${pref}`,
              nutrient: "",
              operator: "contains",
              threshold: 0,
              verdict: "avoid",
              priority: 80,
            },
            reason: `Contains "${keyword}" which conflicts with ${pref} diet`,
          });
          break;
        }
      }
    }
  }

  // 3. Check nutrient-based rules against health conditions
  const userConditions = new Set(profile.conditions.map((c) => c.toLowerCase().replace(/\s+/g, "_")));
  if (profile.bmi_category) {
    userConditions.add(profile.bmi_category.toLowerCase());
  }

  for (const rule of rules) {
    if (!rule.condition_target || !userConditions.has(rule.condition_target.toLowerCase())) {
      continue;
    }

    const nutrientValue = getNutrientValue(product, rule.nutrient);
    if (nutrientValue === null) continue;

    if (evaluateOperator(nutrientValue, rule.operator, rule.threshold)) {
      triggeredRules.push({
        rule,
        reason: `${rule.rule_name}: ${rule.nutrient} is ${nutrientValue} (threshold: ${rule.operator} ${rule.threshold})`,
      });
    }
  }

  // 4. Check personal nutrient limits
  for (const limit of profile.nutrient_limits) {
    const value = getNutrientValue(product, limit.nutrient);
    if (value !== null && value > limit.max_daily_value) {
      triggeredRules.push({
        rule: {
          rule_name: `Personal Limit: ${limit.nutrient}`,
          condition_target: "personal",
          nutrient: limit.nutrient,
          operator: ">",
          threshold: limit.max_daily_value,
          verdict: "caution",
          priority: 30,
        },
        reason: `${limit.nutrient} (${value}${limit.unit}) exceeds your personal limit of ${limit.max_daily_value}${limit.unit}`,
      });
    }
  }

  // Determine final verdict
  if (triggeredRules.length === 0) {
    return {
      verdict: "safe",
      confidence: 0.95,
      reasoning: "No health concerns detected for your profile.",
      triggered_rules: [],
    };
  }

  // Sort by priority, highest first
  triggeredRules.sort((a, b) => b.rule.priority - a.rule.priority);

  const hasAvoid = triggeredRules.some((r) => r.rule.verdict === "avoid");
  const verdict: "avoid" | "caution" = hasAvoid ? "avoid" : "caution";
  const confidence = Math.min(0.95, 0.6 + triggeredRules.length * 0.1);

  const reasoning = triggeredRules.map((r) => `• ${r.reason}`).join("\n");

  return {
    verdict,
    confidence: Math.round(confidence * 100) / 100,
    reasoning,
    triggered_rules: triggeredRules.map((r) => r.rule.rule_name),
  };
}
