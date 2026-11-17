import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DataType, newDb } from "pg-mem";
import request from "supertest";

process.env.JWT_SECRET = "test-access-secret-with-more-than-24-characters";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-more-than-24-characters";
const testDb = newDb();
testDb.public.registerFunction({ name: "gen_random_uuid", returns: "uuid", implementation: () => crypto.randomUUID(), impure: true });
testDb.public.registerEquivalentType({ name: "float8", equivalentTo: DataType.float, isValid: (value) => typeof value === "number" });
const pg = testDb.adapters.createPg();

vi.mock("../db/pool", () => ({ pool: new pg.Pool() }));
vi.mock("../services/mlClient", () => ({ predictDescriptions: vi.fn().mockRejectedValue(new Error("offline in integration test")) }));

describe("authentication integration", () => {
  let app: typeof import("../index").app;
  let pool: typeof import("../db/pool").pool;

  beforeAll(async () => {
    ({ app } = await import("../index"));
    ({ pool } = await import("../db/pool"));
    await pool.query(`CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
      password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE refresh_tokens (
      token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE categories (
      id serial PRIMARY KEY, user_id uuid, name text NOT NULL, color text NOT NULL
    )`);
    await pool.query(`CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
      date text NOT NULL, description text NOT NULL, amount numeric(12,2) NOT NULL,
      category_id integer REFERENCES categories(id), predicted_category_id integer REFERENCES categories(id),
      confidence real, is_manual boolean NOT NULL DEFAULT false, source_file text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE uploads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), filename text NOT NULL,
      row_count integer NOT NULL DEFAULT 0, status text NOT NULL, warning text, accepted_rows integer NOT NULL DEFAULT 0,
      skipped_rows integer NOT NULL DEFAULT 0, errors jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query("CREATE TABLE budgets (id serial PRIMARY KEY, user_id uuid, category_id integer, month date, amount numeric)");
    await pool.query("INSERT INTO categories(name, color) VALUES ('Groceries', '#5f8d67'), ('Other', '#89928b')");
  });

  afterAll(async () => { await pool.end(); });

  it("registers, logs in, reads the user, and rotates a mobile refresh bearer once", async () => {
    const registration = await request(app).post("/api/auth/register").send({ email: "Demo@Example.com", password: "correct horse battery" });
    expect(registration.status).toBe(201);
    expect(registration.body.user.email).toBe("demo@example.com");
    expect(registration.body.accessToken).toBeTruthy();
    expect(registration.body.refreshToken).toBeTruthy();
    const cookieHeader = registration.headers["set-cookie"] as string[];
    expect(cookieHeader[0]).toContain("ledgerly_refresh=");
    const originalRefresh = registration.body.refreshToken as string;

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${registration.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(registration.body.user.id);

    const access = `Bearer ${registration.body.accessToken}`;
    const created = await request(app).post("/api/transactions").set("Authorization", access).send({
      date: "2026-11-12", description: "Seattle Coffee Co", amount: -75.5,
    });
    expect(created.status).toBe(201);
    const transactionId = created.body.id as string;
    const listing = await request(app).get("/api/transactions?q=coffee&page=1&limit=10").set("Authorization", access);
    expect(listing.status).toBe(200);
    expect(listing.body.total).toBe(1);
    expect(listing.body.data[0].description).toBe("Seattle Coffee Co");
    const edited = await request(app).patch(`/api/transactions/${transactionId}`).set("Authorization", access).send({ categoryId: 2 });
    expect(edited.status).toBe(200);
    expect(edited.body.isManual).toBe(true);
    expect(edited.body.categoryId).toBe(2);

    const csv = [
      "date,description,amount",
      "2026-11-01,Woolworths Food,-123.45",
      '11/02/2026,"Cafe, Woodstock",-45',
      "not-a-date,Invalid merchant,-3",
    ].join("\n");
    const upload = await request(app).post("/api/uploads").set("Authorization", access)
      .attach("file", Buffer.from(csv), { filename: "transactions.csv", contentType: "text/csv" });
    expect(upload.status).toBe(201);
    expect(upload.body.accepted_rows).toBe(2);
    expect(upload.body.skipped_rows).toBe(1);
    expect(upload.body.warning).toContain("offline in integration test");
    const uploadStatus = await request(app).get(`/api/uploads/${upload.body.id}/status`).set("Authorization", access);
    expect(uploadStatus.status).toBe(200);
    expect(uploadStatus.body.status).toBe("done");
    expect(uploadStatus.body.acceptedRows).toBe(2);
    const categorizationUnavailable = await request(app).post("/api/transactions/bulk-categorize").set("Authorization", access).send({});
    expect(categorizationUnavailable.status).toBe(503);

    const createdCategory = await request(app).post("/api/categories").set("Authorization", access).send({ name: "Home projects", color: "#6655aa" });
    expect(createdCategory.status).toBe(201);
    const categoryId = createdCategory.body.id as number;
    const renamedCategory = await request(app).patch(`/api/categories/${categoryId}`).set("Authorization", access).send({ name: "Home" });
    expect(renamedCategory.status).toBe(200);
    expect(renamedCategory.body.name).toBe("Home");
    await request(app).patch(`/api/transactions/${transactionId}`).set("Authorization", access).send({ categoryId });
    const categoryDelete = await request(app).delete(`/api/categories/${categoryId}`).set("Authorization", access);
    expect(categoryDelete.status).toBe(204);
    const afterDelete = await request(app).get(`/api/transactions?q=coffee`).set("Authorization", access);
    expect(afterDelete.body.data[0].categoryName).toBe("Other");

    const login = await request(app).post("/api/auth/login").send({ email: "demo@example.com", password: "correct horse battery" });
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    const loginCookie = (login.headers["set-cookie"] as string[])[0].split(";")[0];
    const cookieRefresh = await request(app).post("/api/auth/refresh").set("Cookie", loginCookie);
    expect(cookieRefresh.status).toBe(200);
    expect(cookieRefresh.body.refreshToken).toBeTruthy();

    const rotated = await request(app).post("/api/auth/refresh").set("Authorization", `Bearer ${originalRefresh}`);
    expect(rotated.status).toBe(200);
    expect(rotated.body.accessToken).toBeTruthy();
    expect(rotated.body.refreshToken).toBeTruthy();
    expect(rotated.body.refreshToken).not.toBe(originalRefresh);

    const reuse = await request(app).post("/api/auth/refresh").set("Authorization", `Bearer ${originalRefresh}`);
    expect(reuse.status).toBe(401);
    const logout = await request(app).post("/api/auth/logout").set("Authorization", access).send({ refreshToken: rotated.body.refreshToken });
    expect(logout.status).toBe(204);
    const revoked = await request(app).post("/api/auth/refresh").set("Authorization", `Bearer ${rotated.body.refreshToken}`);
    expect(revoked.status).toBe(401);
  }, 20_000);
});
