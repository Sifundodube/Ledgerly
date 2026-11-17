import "dotenv/config";
import { migrate } from "./db/migrate";
import { seed } from "./db/seed";
import { pool } from "./db/pool";
import { app } from "./index";

async function start(): Promise<void> {
  await migrate();
  await seed();
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, "0.0.0.0", () => console.log(`Ledgerly API listening on ${port}`));
}

start().catch(async (error: unknown) => {
  console.error("Ledgerly API failed to start", error);
  await pool.end();
  process.exitCode = 1;
});
