const fs = require('fs');

async function test() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const payload = {
    system_instruction: {
      parts: [{ text: "You are a clinical blood report analyzer." }]
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: "Analyze this" },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 1000,
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          summary: { type: "STRING" },
          suggested_conditions: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                condition_name: { type: "STRING" },
                severity: { type: "STRING" }
              },
              required: ["condition_name", "severity"]
            }
          },
          suggested_preferences: {
            type: "ARRAY",
            items: { type: "STRING" }
          },
          suggested_limits: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                nutrient: { type: "STRING" },
                max_daily_value: { type: "NUMBER" },
                unit: { type: "STRING" }
              },
              required: ["nutrient", "max_daily_value", "unit"]
            }
          },
          abnormal_biomarkers: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                value: { type: "STRING" },
                status: { type: "STRING" }
              },
              required: ["name", "value", "status"]
            }
          }
        },
        required: ["summary", "suggested_conditions", "suggested_preferences", "suggested_limits", "abnormal_biomarkers"]
      }
    }
  };

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text.substring(0, 500));
}

test();
