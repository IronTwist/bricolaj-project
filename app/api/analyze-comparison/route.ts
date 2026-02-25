import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { mime1, data1, mime2, data2 } = await request.json();

    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const prompt = `
    Compară aceste două produse din punct de vedere tehnic, ca un expert Dedeman.
    1. Identifică Produsul A și Produsul B.
    2. Listează 3 diferențe cheie.
    3. Listează un avantaj major pentru fiecare.
    4. Oferă o concluzie: pe care să îl cumpăr și de ce?
  `;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        produs1_nume: { type: "STRING" },
        produs2_nume: { type: "STRING" },
        diferente: { type: "ARRAY", items: { type: "STRING" } },
        produs1_avantaj: { type: "STRING" },
        produs2_avantaj: { type: "STRING" },
        concluzie: { type: "STRING" },
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: mime1, data: data1 } },
                { inlineData: { mimeType: mime2, data: data2 } },
              ],
            },
          ],
          generationConfig: {
            responseSchema: responseSchema,
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Analyze comparison error:", error);
    return NextResponse.json(
      { error: "Failed to analyze comparison" },
      { status: 500 }
    );
  }
}
