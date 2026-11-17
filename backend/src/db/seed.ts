import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "./pool";

export const DEFAULT_CATEGORIES = [
  ["Groceries", "#5f8d67"], ["Dining", "#d48a5c"], ["Transport", "#6d8db5"],
  ["Utilities", "#c59c49"], ["Rent", "#8e78a8"], ["Entertainment", "#cf6f77"],
  ["Health", "#579a98"], ["Shopping", "#b87c9f"], ["Income", "#438c70"], ["Other", "#89928b"],
] as const;

export async function seed(): Promise<void> {
  for (const [name, color] of DEFAULT_CATEGORIES) {
    await pool.query("INSERT INTO categories(user_id, name, color) VALUES (NULL, $1, $2) ON CONFLICT DO NOTHING", [name, color]);
  }
  const email = (process.env.DEMO_USER_EMAIL ?? "demo@ledgerly.local").trim().toLowerCase();
  const password = process.env.DEMO_USER_PASSWORD ?? "LedgerlyDemo123!";
  if (password.length < 8) throw new Error("DEMO_USER_PASSWORD must contain at least 8 characters");
  let found = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (!found.rowCount) {
    const hash = await bcrypt.hash(password, 12);
    found = await pool.query<{ id: string }>(
      "INSERT INTO users(email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id",
      [email, hash],
    );
  }
  const userId = found.rows[0].id;
  const hasDemo = await pool.query("SELECT 1 FROM transactions WHERE user_id = $1 AND source_file = 'demo-seed-v1' LIMIT 1", [userId]);
  if (hasDemo.rowCount) return;
  const categories = await pool.query<{ id: number; name: string }>("SELECT id, name FROM categories WHERE user_id IS NULL");
  const categoryIds = new Map(categories.rows.map((row) => [row.name, row.id]));
  const templates: Array<{ name: string; label: string; amount: number }> = [
    { name: "PAYROLL ACME STUDIO", label: "Income", amount: 38500 },
    { name: "Woolworths Food", label: "Groceries", amount: -1680 },
    { name: "Checkers Hyper", label: "Groceries", amount: -920 },
    { name: "Seattle Coffee Co", label: "Dining", amount: -145 },
    { name: "Kota Joe's", label: "Dining", amount: -280 },
    { name: "MyCiTi Travel", label: "Transport", amount: -510 },
    { name: "Shell Service Station", label: "Transport", amount: -840 },
    { name: "City Power", label: "Utilities", amount: -960 },
    { name: "Cape Town Water", label: "Utilities", amount: -390 },
    { name: "Monthly Apartment Rent", label: "Rent", amount: -11900 },
    { name: "Showmax Subscription", label: "Entertainment", amount: -99 },
    { name: "Theatre on the Bay", label: "Entertainment", amount: -440 },
    { name: "Clicks Pharmacy", label: "Health", amount: -325 },
    { name: "Dis-Chem Wellness", label: "Health", amount: -245 },
    { name: "Takealot Online", label: "Shopping", amount: -760 },
    { name: "Mr Price Home", label: "Shopping", amount: -520 },
  ];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let monthIndex = 7; monthIndex >= 0; monthIndex -= 1) {
      const month = new Date();
      month.setDate(1);
      month.setMonth(month.getMonth() - monthIndex);
      const year = month.getFullYear();
      const monthNumber = month.getMonth() + 1;
      const dayFor = (offset: number): string => `${year}-${String(monthNumber).padStart(2, "0")}-${String(Math.min(offset, new Date(year, monthNumber, 0).getDate())).padStart(2, "0")}`;
      for (let index = 0; index < templates.length; index += 1) {
        const template = templates[index];
        const variation = template.amount < 0 ? ((monthIndex + index) % 4) * 13 : 0;
        const amount = template.amount < 0 ? template.amount - variation : template.amount;
        await client.query(
          `INSERT INTO transactions(user_id, date, description, amount, category_id, predicted_category_id, confidence, source_file)
           VALUES ($1, $2, $3, $4, $5, $5, 1, 'demo-seed-v1')`,
          [userId, dayFor([1, 3, 5, 7, 9, 12, 15, 18, 21, 25, 26, 27, 28, 10, 14, 22][index]), template.name, amount, categoryIds.get(template.label)],
        );
      }
    }
    await client.query("COMMIT");
    console.log(`Seeded ${templates.length * 8} demo transactions for ${email}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

if (require.main === module) {
  seed().then(() => pool.end()).catch(async (error: unknown) => {
    console.error("Database seed failed", error);
    await pool.end();
    process.exitCode = 1;
  });
}
