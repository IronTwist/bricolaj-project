import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { base64Image } = await request.json();

    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const base64Data = base64Image.split(",")[1];
    const mimeType = base64Image.split(":")[1].split(";")[0];

    const prompt = `Ești un consultant Dedeman expert. Identifică produsul din imagine. Dacă nu e produs de bricolaj, valid_product=false. Altfel, completează schema. Fără coduri SAP inventate.`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        valid_product: { type: "BOOLEAN" },
        brand: { type: "STRING", nullable: true },
        nume_produs: { type: "STRING" },
        descriere: { type: "STRING" },
        specificatii: { type: "ARRAY", items: { type: "STRING" } },
        produse_recomandate: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              nume: { type: "STRING" },
              categorie: { type: "STRING" },
            },
          },
        },
        utilizare: { type: "STRING" },
        motiv_invalid: { type: "STRING", nullable: true },
      },
      required: [
        "valid_product",
        "nume_produs",
        "descriere",
        "specificatii",
        "produse_recomandate",
        "utilizare",
      ],
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
                { inlineData: { mimeType: mimeType, data: base64Data } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.1,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("Google API error:", error);
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    console.log("Analyze image success:", JSON.stringify(data, null, 2));
    return NextResponse.json(data);
  } catch (error) {
    console.error("Analyze image error:", error);
    return NextResponse.json(
      { error: "Failed to analyze image" },
      { status: 500 }
    );
  }
}
