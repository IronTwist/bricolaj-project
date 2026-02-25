export const analizeImage = async (
  base64Image: string,
  controller: AbortController
) => {
  const response = await fetch("/api/analyze-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Image }),
    signal: controller.signal,
  });

  if (!response.ok) {
    throw new Error("Eroare API.");
  }

  return response.json();
};

export const analyzeComparisonApi = async (
  mime1: string,
  data1: string,
  mime2: string,
  data2: string
) => {
  const response = await fetch("/api/analyze-comparison", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mime1, data1, mime2, data2 }),
  });

  if (!response.ok) {
    throw new Error("Eroare API.");
  }

  return response.json();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const chatApi = async (payload: any) => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Eroare API.");
  }

  return response.json();
};
