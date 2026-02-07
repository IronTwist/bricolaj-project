import { aiKey } from "../utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const chatApi = async (payload: any) => {
  const apiKey = aiKey;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();
  return data;
};
