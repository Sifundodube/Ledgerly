import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool";

export type PublicUser = { id: string; email: string; createdAt: string };

export function publicUser(row: { id: string; email: string; created_at: Date | string }): PublicUser {
  return { id: row.id, email: row.email, createdAt: new Date(row.created_at).toISOString() };
}

function secret(name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[name];
  if (!value || value.length < 24) throw new Error(`${name} must be set to at least 24 characters`);
  return value;
}

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueAccessToken(user: Pick<PublicUser, "id" | "email">): string {
  return jwt.sign({ email: user.email, typ: "access" }, secret("JWT_SECRET"), {
    subject: user.id,
    expiresIn: "15m",
    issuer: "ledgerly-api",
    audience: "ledgerly-client",
  });
}

export async function issueRefreshToken(user: Pick<PublicUser, "id" | "email">): Promise<string> {
  const token = jwt.sign({ email: user.email, typ: "refresh" }, secret("JWT_REFRESH_SECRET"), {
    subject: user.id,
    jwtid: randomUUID(),
    expiresIn: "7d",
    issuer: "ledgerly-api",
    audience: "ledgerly-client",
  });
  await pool.query(
    "INSERT INTO refresh_tokens(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')",
    [digest(token), user.id],
  );
  return token;
}

export async function rotateRefreshToken(token: string): Promise<{ refreshToken: string; accessToken: string; user: PublicUser } | null> {
  let claims: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, secret("JWT_REFRESH_SECRET"), {
      issuer: "ledgerly-api",
      audience: "ledgerly-client",
    });
    if (typeof decoded === "string" || decoded.typ !== "refresh" || !decoded.sub) return null;
    claims = decoded;
  } catch {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const consumed = await client.query<{ user_id: string }>(
      "DELETE FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > now() RETURNING user_id",
      [digest(token), claims.sub],
    );
    if (!consumed.rowCount) {
      await client.query("ROLLBACK");
      return null;
    }
    const found = await client.query<{ id: string; email: string; created_at: Date }>(
      "SELECT id, email, created_at FROM users WHERE id = $1",
      [claims.sub],
    );
    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return null;
    }
    const row = found.rows[0];
    const user = publicUser(row);
    const refreshToken = jwt.sign({ email: user.email, typ: "refresh" }, secret("JWT_REFRESH_SECRET"), {
      subject: user.id,
      jwtid: randomUUID(),
      expiresIn: "7d",
      issuer: "ledgerly-api",
      audience: "ledgerly-client",
    });
    await client.query(
      "INSERT INTO refresh_tokens(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')",
      [digest(refreshToken), user.id],
    );
    await client.query("COMMIT");
    return { refreshToken, accessToken: issueAccessToken(user), user };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
