import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../middleware/errors";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);
const monthString = z.string().regex(/^\d{4}-\d{2}$/).refine((value) => {
  const [, month] = value.split("-").map(Number);
  return month >= 1 && month <= 12;
}, "Expected YYYY-MM month");
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, "Invalid date");

analyticsRouter.get("/summary", async (request, response, next) => {
  try {
    const month = monthString.parse(request.query.month ?? new Date().toISOString().slice(0, 7));
    const result = await pool.query<{ income: number; expense: number; net: number; count: number }>(
      `SELECT COALESCE(sum(amount) FILTER (WHERE amount > 0), 0)::float8 AS income,
       COALESCE(sum(abs(amount)) FILTER (WHERE amount < 0), 0)::float8 AS expense,
       COALESCE(sum(amount), 0)::float8 AS net, count(*)::int AS count
       FROM transactions WHERE user_id = $1 AND date >= $2::date AND date < ($2::date + interval '1 month')`,
      [request.user!.id, `${month}-01`],
    );
    response.json({ month, income: result.rows[0].income, expense: result.rows[0].expense, net: result.rows[0].net, transactionCount: result.rows[0].count });
  } catch (error) { next(error); }
});

analyticsRouter.get("/by-category", async (request, response, next) => {
  try {
    const query = z.object({ from: dayString.optional(), to: dayString.optional() }).parse(request.query);
    if (query.from && query.to && query.from > query.to) throw new ApiError(400, "from must be on or before to");
    const where = ["t.user_id = $1"];
    const values: unknown[] = [request.user!.id];
    if (query.from) { values.push(query.from); where.push(`t.date >= $${values.length}::date`); }
    if (query.to) { values.push(query.to); where.push(`t.date <= $${values.length}::date`); }
    const result = await pool.query(
      `SELECT COALESCE(c.name, 'Uncategorized') AS category, COALESCE(c.color, '#a5aea7') AS color,
       COALESCE(sum(abs(t.amount)) FILTER (WHERE t.amount < 0), 0)::float8 AS expense,
       COALESCE(sum(t.amount) FILTER (WHERE t.amount > 0), 0)::float8 AS income,
       COALESCE(sum(abs(t.amount)), 0)::float8 AS total, count(*)::int AS count
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${where.join(" AND ")} GROUP BY c.name, c.color ORDER BY total DESC, category`,
      values,
    );
    response.json(result.rows);
  } catch (error) { next(error); }
});

analyticsRouter.get("/trend", async (request, response, next) => {
  try {
    const months = z.coerce.number().int().min(1).max(24).default(6).parse(request.query.months ?? "6");
    const result = await pool.query(
      `WITH period AS (
         SELECT generate_series(date_trunc('month', current_date) - (($2::int - 1) * interval '1 month'),
           date_trunc('month', current_date), interval '1 month')::date AS month
       ), totals AS (
         SELECT date_trunc('month', date)::date AS month,
           COALESCE(sum(amount) FILTER (WHERE amount > 0), 0)::float8 AS income,
           COALESCE(sum(abs(amount)) FILTER (WHERE amount < 0), 0)::float8 AS expense,
           COALESCE(sum(amount), 0)::float8 AS net, count(*)::int AS count
         FROM transactions WHERE user_id = $1 AND date >= date_trunc('month', current_date) - (($2::int - 1) * interval '1 month')
         GROUP BY 1
       )
       SELECT to_char(period.month, 'YYYY-MM') AS month, COALESCE(totals.income, 0)::float8 AS income,
         COALESCE(totals.expense, 0)::float8 AS expense, COALESCE(totals.net, 0)::float8 AS net,
         COALESCE(totals.count, 0)::int AS "transactionCount"
       FROM period LEFT JOIN totals USING (month) ORDER BY period.month`,
      [request.user!.id, months],
    );
    response.json(result.rows);
  } catch (error) { next(error); }
});

analyticsRouter.get("/forecast", async (request, response, next) => {
  try {
    const category = z.string().min(1).max(80).parse(request.query.category);
    const categoryId = /^\d+$/.test(category) ? Number(category) : null;
    const result = await pool.query<{ month: string; total: number }>(
      `SELECT to_char(date_trunc('month', t.date), 'YYYY-MM') AS month,
       COALESCE(sum(abs(t.amount)) FILTER (WHERE t.amount < 0), 0)::float8 AS total
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1 AND (c.id = $2 OR ($2::int IS NULL AND lower(c.name) = lower($3)))
       AND t.date >= date_trunc('month', current_date) - interval '5 months'
       GROUP BY date_trunc('month', t.date) ORDER BY date_trunc('month', t.date)`,
      [request.user!.id, categoryId, category],
    );
    const data = result.rows;
    const values = new Map(data.map((row) => [row.month, Number(row.total)]));
    const now = new Date();
    const samples = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
      return { x: index, y: values.get(date.toISOString().slice(0, 7)) ?? 0 };
    });
    const meanX = samples.reduce((sum, point) => sum + point.x, 0) / samples.length;
    const meanY = samples.reduce((sum, point) => sum + point.y, 0) / samples.length;
    const denominator = samples.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
    const slope = denominator ? samples.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator : 0;
    const intercept = meanY - slope * meanX;
    const forecast = Array.from({ length: 3 }, (_, index) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index + 1, 1));
      const amount = Math.max(0, intercept + slope * (5 + index + 1));
      return { month: date.toISOString().slice(0, 7), amount: Math.round(amount * 100) / 100 };
    });
    response.json({ category, historical: samples.map((point, index) => ({ month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1)).toISOString().slice(0, 7), amount: point.y })), forecast });
  } catch (error) { next(error); }
});
