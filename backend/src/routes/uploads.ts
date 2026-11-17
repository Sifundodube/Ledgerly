import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { predictDescriptions } from "../services/mlClient";

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);
const uploadFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
type ParsedRow = { date: string; description: string; amount: number; line: number };

function parseDate(value: string): string | null {
  const input = value.trim();
  let year: number; let month: number; let day: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) [year, month, day] = input.split("-").map(Number);
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(input)) [month, day, year] = input.split("/").map(Number);
  else return null;
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) return null;
  return `${year!.toString().padStart(4, "0")}-${month!.toString().padStart(2, "0")}-${day!.toString().padStart(2, "0")}`;
}

function decodeCsv(buffer: Buffer): { rows: ParsedRow[]; errors: Array<{ row: number; message: string }> } {
  const source = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = source.split(/\r?\n/);
  const errors: Array<{ row: number; message: string }> = [];
  if (!lines.length || !lines[0].trim()) throw new ApiError(400, "CSV must include date, description, and amount headers");
  let headers: string[];
  try {
    headers = (parse(lines[0], { bom: true, skip_empty_lines: true }) as string[][])[0].map((value) => value.trim().toLowerCase());
  } catch { throw new ApiError(400, "CSV header row is malformed"); }
  const dateIndex = headers.indexOf("date");
  const descriptionIndex = headers.indexOf("description");
  const amountIndex = headers.indexOf("amount");
  if ([dateIndex, descriptionIndex, amountIndex].some((index) => index < 0)) {
    throw new ApiError(400, "CSV must include date, description, and amount headers");
  }
  const requiredLength = Math.max(dateIndex, descriptionIndex, amountIndex) + 1;
  const rows: ParsedRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    const lineNumber = index + 1;
    let columns: string[];
    try {
      const records = parse(lines[index], { relax_column_count: false, skip_empty_lines: false }) as string[][];
      if (records.length !== 1) throw new Error("Expected one CSV record");
      columns = records[0];
    } catch {
      errors.push({ row: lineNumber, message: "Malformed CSV row" });
      continue;
    }
    if (columns.length < requiredLength || !columns[dateIndex]?.trim() || !columns[descriptionIndex]?.trim() || !columns[amountIndex]?.trim()) {
      errors.push({ row: lineNumber, message: "Missing date, description, or amount" });
      continue;
    }
    const date = parseDate(columns[dateIndex]);
    const amountText = columns[amountIndex].trim();
    const amount = Number(amountText);
    if (!date) { errors.push({ row: lineNumber, message: "Date must use YYYY-MM-DD or MM/DD/YYYY" }); continue; }
    if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || Math.abs(amount) >= 10_000_000_000) {
      errors.push({ row: lineNumber, message: "Amount must be a valid number with at most two decimal places" });
      continue;
    }
    rows.push({ date, description: columns[descriptionIndex].trim().slice(0, 500), amount, line: lineNumber });
  }
  return { rows, errors: errors.slice(0, 500) };
}

uploadsRouter.post("/", uploadFile.single("file"), async (request, response, next) => {
  const client = await pool.connect();
  let uploadId: string | undefined;
  try {
    const file = request.file;
    if (!file) throw new ApiError(400, "Attach a CSV file in the 'file' field");
    if (!file.originalname.toLowerCase().endsWith(".csv")) throw new ApiError(400, "Only CSV files are accepted");
    const parsed = decodeCsv(file.buffer);
    const created = await pool.query<{ id: string }>(
      "INSERT INTO uploads(user_id, filename, status) VALUES ($1, $2, 'processing') RETURNING id",
      [request.user!.id, file.originalname.slice(0, 255)],
    );
    uploadId = created.rows[0].id;

    let predictions: Array<{ category: string; confidence: number }> | null = null;
    let warning: string | null = null;
    if (parsed.rows.length) {
      try {
        predictions = null /* await predictDescriptions(parsed.rows.map((row) => row.description)); */
        if (predictions.length !== parsed.rows.length) throw new Error("ML service returned a different prediction count");
      } catch (error) {
        warning = `Transactions were saved without predictions because the categorization service was unavailable: ${error instanceof Error ? error.message : "unknown error"}`;
        predictions = null;
      }
    }

    const categories = await pool.query<{ id: number; name: string }>(
      "SELECT id, name FROM categories WHERE user_id IS NULL OR user_id = $1",
      [request.user!.id],
    );
    const categoryIds = new Map(categories.rows.map((category) => [category.name.toLowerCase(), category.id]));
    const otherId = categoryIds.get("other") ?? null;
    await client.query("BEGIN");
    for (let index = 0; index < parsed.rows.length; index += 1) {
      const row = parsed.rows[index];
      const prediction = predictions?.[index];
      const predictionId = prediction ? categoryIds.get(prediction.category.toLowerCase()) ?? otherId : null;
      await client.query(
        `INSERT INTO transactions(user_id, date, description, amount, category_id, predicted_category_id, confidence, source_file)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [request.user!.id, row.date, row.description, row.amount, predictionId, predictionId, prediction?.confidence ?? null, file.originalname.slice(0, 255)],
      );
    }
    const accepted = parsed.rows.length;
    const skipped = Math.max(0, linesInCsv(file.buffer) - 1 - accepted);
    const errors = parsed.errors;
    await client.query(
      `UPDATE uploads SET status = 'done', row_count = $2, accepted_rows = $2, skipped_rows = $3,
       errors = $4::jsonb, warning = $5 WHERE id = $1 AND user_id = $6`,
      [uploadId, accepted, skipped, JSON.stringify(errors), warning, request.user!.id],
    );
    await client.query("COMMIT");
    response.status(201).json({ id: uploadId, status: "done", accepted_rows: accepted, skipped_rows: skipped, errors, warning });
  } catch (error) {
    await client.query("ROLLBACK");
    if (uploadId) await pool.query("UPDATE uploads SET status = 'failed', warning = $2 WHERE id = $1", [uploadId, "Upload could not be processed"]);
    next(error);
  } finally { client.release(); }
});

function linesInCsv(buffer: Buffer): number {
  return buffer.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

uploadsRouter.get("/", async (request, response, next) => {
  try {
    const { page, limit } = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(25),
    }).parse(request.query);
    const count = await pool.query<{ total: string }>("SELECT count(*)::text AS total FROM uploads WHERE user_id = $1", [request.user!.id]);
    const result = await pool.query(
      `SELECT id, filename, row_count AS "rowCount", accepted_rows AS "acceptedRows", skipped_rows AS "skippedRows",
       status, warning, errors, created_at AS "createdAt" FROM uploads WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [request.user!.id, limit, (page - 1) * limit],
    );
    response.json({ data: result.rows, page, limit, total: Number(count.rows[0].total) });
  } catch (error) { next(error); }
});

uploadsRouter.get("/:id/status", async (request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, status, row_count AS "rowCount", accepted_rows AS "acceptedRows", skipped_rows AS "skippedRows",
       errors, warning, created_at AS "createdAt" FROM uploads WHERE id = $1 AND user_id = $2`,
      [request.params.id, request.user!.id],
    );
    if (!result.rowCount) throw new ApiError(404, "Upload not found");
    response.json(result.rows[0]);
  } catch (error) { next(error); }
});
