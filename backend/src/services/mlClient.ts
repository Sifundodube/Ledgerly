import { z } from "zod";

const predictionSchema = z.array(z.object({
  category: z.string(),
  confidence: z.number().min(0).max(1),
}));

export async function predictDescriptions(descriptions: string[]): Promise<Array<{ category: string; confidence: number }>> {
  const base = (process.env.ML_SERVICE_URL ?? "http://localhost:8000").replace(/\/$/, "");
  const response = await fetch(`${base}/ml/predict`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ descriptions }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`ML service returned ${response.status}`);
  const body: unknown = await response.json();
  return predictionSchema.parse(body);
}
