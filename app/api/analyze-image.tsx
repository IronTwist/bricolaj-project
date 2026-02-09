import { aiKey } from "../utils";

export const analizeImage = async (
  base64Image: string,
  controller: AbortController
) => {
  const apiKey = aiKey;
  const base64Data = base64Image.split(",")[1];
  const mimeType = base64Image.split(";")[0].split(":")[1];

  // const prompt = `
  //     Ești un consultant Dedeman expert.
  //     Analizează imaginea. Dacă imaginea NU conține un produs clar (este neagră, blurată, sau conține fețe de oameni, peisaje fără legătură cu bricolajul), returnează JSON cu "valid_product": false.

  //     Dacă este un produs valid:
  //     1. Identifică produsul (Brand, Model).
  //     2. Extrage BRANDUL produsului separat.
  //     3. Generează o descriere de MAXIM 80 de cuvinte.
  //     4. Listează specificațiile tehnice.
  //     5. Generează produse compatibile.

  //     Răspunde DOAR cu JSON valid:
  //     {
  //       "valid_product": true,
  //       "brand": "Brand Identificat sau null",
  //       "nume_produs": "Nume Complet",
  //       "descriere": "Descriere...",
  //       "specificatii": ["Spec 1", "Spec 2"],
  //       "produse_recomandate": [
  //          { "nume": "Produs 1", "categorie": "Accesoriu" }
  //          // ... minim 3 produse
  //       ],
  //       "utilizare": "Sfat utilizare.",
  //       "motiv_invalid": "Mesaj scurt de eroare dacă valid_product e false"
  //     }
  //   `;

  const prompt = `Ești un consultant Dedeman expert. Identifică produsul din imagine. Dacă nu e produs de bricolaj, valid_product=false. Altfel, completează schema. Fără coduri SAP inventate.`;

  // OPTIMIZARE 2: Schema JSON explicită (Reduce "gândirea" modelului)
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
          temperature: 0.1, // OPTIMIZARE 3: Temperatură mică pentru răspunsuri deterministe
        },
      }),
      signal: controller.signal,
    }
  );

  if (!response.ok) throw new Error("Eroare API.");

  const data = await response.json();
  return data;
};
