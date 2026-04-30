const fs = require('fs');

async function test() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const payload = {
    contents: [
      {
        parts: [
          { text: "What is this?" },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
            }
          }
        ],
      },
    ]
  };

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text.substring(0, 300));
}

test();
