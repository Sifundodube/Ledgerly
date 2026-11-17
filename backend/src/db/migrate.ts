import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./pool";

export async function migrate(): Promise<void> {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const directory = path.join(process.cwd(), "src", "db", "migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const exists = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (exists.rowCount) continue;
    const sql = await readFile(path.join(directory, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

if (require.main === module) {
  migrate().then(() => pool.end()).catch(async (error: unknown) => {
    console.error("Database migration failed", error);
    await pool.end();
    process.exitCode = 1;
  });
}
