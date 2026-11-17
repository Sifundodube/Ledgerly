import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { predictDescriptions } from "../services/mlClient";

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, "Invalid date");
const transactionInput = z.object({
  date: isoDate,
  description: z.string().trim().min(1).max(500),
  amount: z.coerce.number().finite().refine((amount) => Math.abs(amount) < 1_000_000_000),
  categoryId: z.number().int().positive().nullable().optional(),
});
const uuid = z.string().uuid();

async function assertCategory(categoryId: number | null | undefined, userId: string): Promise<void> {
  if (categoryId == null) return;
  const category = await pool.query("SELECT 1 FROM categories WHERE id = $1 AND (user_id IS NULL OR user_id = $2)", [categoryId, userId]);
  if (!category.rowCount) throw new ApiError(400, "Category does not exist or is not available to this user");
}

transactionsRouter.get("/", async (request, response, next) => {
  try {
    const filters = z.object({
      from: isoDate.optional(),
      to: isoDate.optional(),
      category: z.string().optional(),
      q: z.string().trim().max(200).optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(25),
    }).parse(request.query);
    if (filters.from && filters.to && filters.from > filters.to) throw new ApiError(400, "from must be on or before to");
    const clauses = ["t.user_id = $1"];
    const values: unknown[] = [request.user!.id];
    const add = (sql: string, value: unknown): void => { values.push(value); clauses.push(sql.replace("?", `$${values.length}`)); };
    if (filters.from) add("t.date >= ?::date", filters.from);
    if (filters.to) add("t.date <= ?::date", filters.to);
    if (filters.category) {
      if (filters.category.toLowerCase() === "uncategorized") clauses.push("t.category_id IS NULL");
      else if (/^\d+$/.test(filters.category)) add("t.category_id = ?", Number(filters.category));
      else add("lower(c.name) = lower(?)", filters.category);
    }
    if (filters.q) add("t.description ILIKE ?", `%${filters.q}%`);
    const where = clauses.join(" AND ");
    const count = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE ${where}`,
      values,
    );
    const pageValues = [...values, filters.limit, (filters.page - 1) * filters.limit];
    const result = await pool.query(
      `SELECT t.id, t.date::text AS date, t.description, t.amount::float8 AS amount,
       t.category_id AS "categoryId", c.name AS "categoryName", c.color AS "categoryColor",
       t.predicted_category_id AS "predictedCategoryId", t.confidence,
       t.is_manual AS "isManual", t.source_file AS "sourceFile", t.created_at AS "createdAt"
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${where} ORDER BY t.date DESC, t.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      pageValues,
    );
    response.json({ data: result.rows, page: filters.page, limit: filters.limit, total: Number(count.rows[0].total) });
  } catch (error) { next(error); }
});

transactionsRouter.post("/", async (request, response, next) => {
  try {
    const input = transactionInput.parse(request.body);
    await assertCategory(input.categoryId, request.user!.id);
    const result = await pool.query(
      `INSERT INTO transactions(user_id, date, description, amount, category_id, is_manual)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, date::text AS date, description, amount::float8 AS amount, category_id AS "categoryId", is_manual AS "isManual"`,
      [request.user!.id, input.date, input.description, input.amount, input.categoryId ?? null, input.categoryId != null],
    );
    response.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

transactionsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = uuid.parse(request.params.id);
    const input = transactionInput.partial().parse(request.body);
    if (!Object.keys(input).length) throw new ApiError(400, "Provide at least one transaction field to update");
    if (input.categoryId !== undefined) await assertCategory(input.categoryId, request.user!.id);
    const fields: string[] = [];
    const values: unknown[] = [id, request.user!.id];
    const mapping = { date: "date", description: "description", amount: "amount", categoryId: "category_id" } as const;
    for (const key of Object.keys(mapping) as Array<keyof typeof mapping>) {
      if (input[key] !== undefined) {
        values.push(input[key]);
        fields.push(`${mapping[key]} = $${values.length}`);
      }
    }
    if (input.categoryId !== undefined) fields.push("is_manual = true");
    const result = await pool.query(
      `UPDATE transactions SET ${fields.join(", ")} WHERE id = $1 AND user_id = $2
       RETURNING id, date::text AS date, description, amount::float8 AS amount,
       category_id AS "categoryId", predicted_category_id AS "predictedCategoryId",
       confidence, is_manual AS "isManual", source_file AS "sourceFile"`,
      values,
    );
    if (!result.rowCount) throw new ApiError(404, "Transaction not found");
    response.json(result.rows[0]);
  } catch (error) { next(error); }
});

transactionsRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = uuid.parse(request.params.id);
    const result = await pool.query("DELETE FROM transactions WHERE id = $1 AND user_id = $2", [id, request.user!.id]);
    if (!result.rowCount) throw new ApiError(404, "Transaction not found");
    response.status(204).end();
  } catch (error) { next(error); }
});

transactionsRouter.post("/bulk-categorize", async (request, response, next) => {
  const client = await pool.connect();
  try {
    const input = z.object({ transaction_ids: z.array(uuid).max(500).optional() }).default({}).parse(request.body ?? {});
    if (input.transaction_ids && input.transaction_ids.length === 0) {
      response.json({ updated: 0 });
      return;
    }
    const rows = await pool.query<{ id: string; description: string }>(
      `SELECT id, description FROM transactions WHERE user_id = $1
       AND category_id IS NULL ${input.transaction_ids?.length ? "AND id = ANY($2::uuid[])" : ""}
       ORDER BY date DESC LIMIT 500`,
      input.transaction_ids?.length ? [request.user!.id, input.transaction_ids] : [request.user!.id],
    );
    if (!rows.rowCount) {
      response.json({ updated: 0 });
      return;
    }
    let predictions: Array<{ category: string; confidence: number }>;
    try {
      predictions = await predictDescriptions(rows.rows.map((row) => row.description));
    } catch {
      throw new ApiError(503, "Categorization service is unavailable; try again later");
    }
    if (predictions.length !== rows.rows.length) throw new ApiError(502, "ML service returned a different number of predictions");
    const names = await pool.query<{ id: number; name: string }>("SELECT id, name FROM categories WHERE user_id IS NULL OR user_id = $1", [request.user!.id]);
    const categoryIds = new Map(names.rows.map((category) => [category.name.toLowerCase(), category.id]));
    await client.query("BEGIN");
    for (let index = 0; index < rows.rows.length; index += 1) {
      const prediction = predictions[index];
      const categoryId = categoryIds.get(prediction.category.toLowerCase()) ?? categoryIds.get("other");
      if (!categoryId) throw new ApiError(500, "Default Other category is missing");
      await client.query(
        "UPDATE transactions SET category_id = $1, predicted_category_id = $1, confidence = $2 WHERE id = $3 AND user_id = $4",
        [categoryId, prediction.confidence, rows.rows[index].id, request.user!.id],
      );
    }
    await client.query("COMMIT");
    response.json({ updated: rows.rows.length });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});
