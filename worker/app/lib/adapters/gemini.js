"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ideation50Gemini = ideation50Gemini;
exports.script5Gemini = script5Gemini;
const generative_ai_1 = require("@google/generative-ai");
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// Using Gemini 1.5 Flash (faster and cheaper)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
async function ideation50Gemini(product, basicIdea) {
    const prompt = `Generate 50 distinct marketing angles for this product:
Product: ${JSON.stringify(product)}
Basic Idea: ${basicIdea}

Cover these categories:
- Problem-solution angles (15)
- Lifestyle/aspiration angles (15)
- Social proof/UGC angles (10)
- Educational/how-to angles (5)
- Trend/seasonal angles (5)

Return as JSON object with "ideas" array: {"ideas": ["angle 1", "angle 2", ...]}`;
    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 2000,
        },
    });
    const response = result.response;
    const text = response.text();
    const parsed = JSON.parse(text);
    return parsed.ideas || parsed.angles || [];
}
async function script5Gemini(theme) {
    const prompt = `Create 5 different script variations for this theme: "${theme}"

Each script must have 3-4 scenes with this structure:
{
  "id": "unique_id",
  "theme": "${theme}",
  "scenes": [
    {
      "struktur": "Hook",
      "naskah_vo": "voiceover text in Bahasa Indonesia",
      "visual_idea": "visual description"
    },
    {
      "struktur": "Problem",
      "naskah_vo": "...",
      "visual_idea": "..."
    },
    {
      "struktur": "Solution",
      "naskah_vo": "...",
      "visual_idea": "..."
    },
    {
      "struktur": "CTA",
      "naskah_vo": "...",
      "visual_idea": "..."
    }
  ]
}

Keep each script under 320 tokens total. Return JSON object with "scripts" array.`;
    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 2500,
        },
    });
    const text = result.response.text();
    const parsed = JSON.parse(text);
    return parsed.scripts || [];
}
