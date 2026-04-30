const fs = require('fs');

async function test() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  const prompt = "You are an expert food label OCR reader...";
  // Dummy 1x1 png base64
  const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
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
      maxOutputTokens: 1200,
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          parsed_name: { type: "STRING", nullable: true },
          parsed_ingredients: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          parsed_nutrition: {
            type: "OBJECT",
            properties: {
              calories: { type: "NUMBER", nullable: true },
              total_fat: { type: "NUMBER", nullable: true },
              sugars: { type: "NUMBER", nullable: true },
              sodium: { type: "NUMBER", nullable: true },
              protein: { type: "NUMBER", nullable: true },
            },
          },
        },
        required: ["parsed_name", "parsed_ingredients", "parsed_nutrition"],
      },
    },
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
