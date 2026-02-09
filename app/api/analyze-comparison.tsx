import { aiKey } from "../utils";

export const analyzeComparisonApi = async (
  mime1: string,
  data1: string,
  mime2: string,
  data2: string
) => {
  const apiKey = aiKey;
  const prompt = `
    Compară aceste două produse din punct de vedere tehnic, ca un expert Dedeman.
    1. Identifică Produsul A și Produsul B.
    2. Listează 3 diferențe cheie.
    3. Listează un avantaj major pentru fiecare.
    4. Oferă o concluzie: pe care să îl cumpăr și de ce?

    Returnează JSON valid:
    {
      "produs1_nume": "Nume A",
      "produs2_nume": "Nume B",
      "diferente": ["Dif 1", "Dif 2", "Dif 3"],
      "produs1_avantaj": "Avantaj A",
      "produs2_avantaj": "Avantaj B",
      "concluzie": "Recomandarea finală..."
    }
  `;

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
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  const data = await response.json();
  return data;
};
