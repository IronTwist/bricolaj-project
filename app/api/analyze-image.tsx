import { aiKey } from "../utils";

export const analizeImage = async (
  base64Image: string,
  controller: AbortController
) => {
  const apiKey = aiKey;
  const base64Data = base64Image.split(",")[1];
  const mimeType = base64Image.split(";")[0].split(":")[1];

  const prompt = `
      Ești un consultant Dedeman expert.
      Analizează imaginea. Dacă imaginea NU conține un produs clar (este neagră, blurată, sau conține fețe de oameni, peisaje fără legătură cu bricolajul), returnează JSON cu "valid_product": false.

      Dacă este un produs valid:
      1. Identifică produsul (Brand, Model).
      2. Extrage BRANDUL produsului separat.
      3. Generează o descriere de MAXIM 80 de cuvinte.
      4. Listează specificațiile tehnice.
      5. Generează produse compatibile.

      Răspunde DOAR cu JSON valid:
      {
        "valid_product": true,
        "brand": "Brand Identificat sau null",
        "nume_produs": "Nume Complet",
        "descriere": "Descriere...",
        "specificatii": ["Spec 1", "Spec 2"],
        "produse_recomandate": [
           { "nume": "Produs 1", "categorie": "Accesoriu" }
           // ... minim 3 produse
        ],
        "utilizare": "Sfat utilizare.",
        "motiv_invalid": "Mesaj scurt de eroare dacă valid_product e false"
      }
    `;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
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
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: controller.signal,
    }
  );

  if (!response.ok) throw new Error("Eroare API.");

  const data = await response.json();
  return data;
};
