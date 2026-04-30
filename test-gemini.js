const fs = require('fs');

async function test() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.log('No API key');
    return;
  }
  
  const payload = {
    system_instruction: { parts: [{ text: "You are a test." }] },
    contents: [
      {
        parts: [
          { text: "What is this?" },
        ],
      },
    ]
  };

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text.substring(0, 300));
}

test();
