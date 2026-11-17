import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../middleware/errors";

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

categoriesRouter.get("/", async (request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, color, user_id AS "userId" FROM categories
       WHERE user_id IS NULL OR user_id = $1 ORDER BY user_id NULLS FIRST, name`,
      [request.user!.id],
    );
    response.json(result.rows);
  } catch (error) { next(error); }
});

const categoryInput = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#748078"),
});

categoriesRouter.post("/", async (request, response, next) => {
  try {
    const input = categoryInput.parse(request.body);
    const result = await pool.query(
      `INSERT INTO categories(user_id, name, color) VALUES ($1, $2, $3)
       RETURNING id, name, color, user_id AS "userId"`,
      [request.user!.id, input.name, input.color],
    );
    response.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

categoriesRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const input = categoryInput.partial().parse(request.body);
    if (!Object.keys(input).length) throw new ApiError(400, "Provide a category name or color to update");
    const fields: string[] = [];
    const values: unknown[] = [id, request.user!.id];
    for (const key of ["name", "color"] as const) {
      if (input[key] !== undefined) {
        values.push(input[key]);
        fields.push(`${key} = $${values.length}`);
      }
    }
    const result = await pool.query(
      `UPDATE categories SET ${fields.join(", ")} WHERE id = $1 AND user_id = $2
       RETURNING id, name, color, user_id AS "userId"`,
      values,
    );
    if (!result.rowCount) throw new ApiError(404, "Category not found or cannot be edited");
    response.json(result.rows[0]);
  } catch (error) { next(error); }
});

categoriesRouter.delete("/:id", async (request, response, next) => {
  const client = await pool.connect();
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    await client.query("BEGIN");
    const category = await client.query<{ name: string; user_id: string | null }>(
      "SELECT name, user_id FROM categories WHERE id = $1 AND (user_id = $2 OR user_id IS NULL) FOR UPDATE",
      [id, request.user!.id],
    );
    if (!category.rowCount) throw new ApiError(404, "Category not found or cannot be deleted");
    if (category.rows[0].name.toLowerCase() === "other") throw new ApiError(400, "The Other category cannot be deleted");
    if (category.rows[0].user_id !== request.user!.id) throw new ApiError(403, "Global categories cannot be deleted");
    const other = await client.query<{ id: number }>("SELECT id FROM categories WHERE user_id IS NULL AND lower(name) = 'other'");
    if (!other.rowCount) throw new ApiError(500, "Default Other category is missing");
    await client.query("UPDATE transactions SET category_id = $1 WHERE category_id = $2 AND user_id = $3", [other.rows[0].id, id, request.user!.id]);
    await client.query("UPDATE transactions SET predicted_category_id = $1 WHERE predicted_category_id = $2 AND user_id = $3", [other.rows[0].id, id, request.user!.id]);
    await client.query("DELETE FROM budgets WHERE category_id = $1 AND user_id = $2", [id, request.user!.id]);
    await client.query("DELETE FROM categories WHERE id = $1", [id]);
    await client.query("COMMIT");
    response.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});
