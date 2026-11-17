import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db/pool";
import { ApiError } from "../middleware/errors";
import { requireAuth } from "../middleware/auth";
import { issueAccessToken, issueRefreshToken, publicUser, rotateRefreshToken } from "../auth/tokens";

export const authRouter = Router();
const credentials = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});
const cookieName = "ledgerly_refresh";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function deliverRefresh(response: import("express").Response, token: string): void {
  response.cookie(cookieName, token, cookieOptions);
}

authRouter.post("/register", async (request, response, next) => {
  try {
    const { email, password } = credentials.parse(request.body);
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query<{ id: string; email: string; created_at: Date }>(
      "INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hash],
    );
    const user = publicUser(result.rows[0]);
    const accessToken = issueAccessToken(user);
    const refreshToken = await issueRefreshToken(user);
    deliverRefresh(response, refreshToken);
    response.status(201).json({ accessToken, refreshToken, user });
  } catch (error) { next(error); }
});

authRouter.post("/login", async (request, response, next) => {
  try {
    const { email, password } = credentials.parse(request.body);
    const result = await pool.query<{ id: string; email: string; created_at: Date; password_hash: string }>(
      "SELECT id, email, created_at, password_hash FROM users WHERE email = $1",
      [email],
    );
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) throw new ApiError(401, "Email or password is incorrect");
    const user = publicUser(row);
    const accessToken = issueAccessToken(user);
    const refreshToken = await issueRefreshToken(user);
    deliverRefresh(response, refreshToken);
    response.json({ accessToken, refreshToken, user });
  } catch (error) { next(error); }
});

authRouter.post("/refresh", async (request, response, next) => {
  try {
    const bearer = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const cookie = request.cookies?.[cookieName] as string | undefined;
    const result = await rotateRefreshToken(bearer ?? cookie ?? "");
    if (!result) throw new ApiError(401, "Refresh token is invalid, expired, or already used");
    deliverRefresh(response, result.refreshToken);
    response.json(result);
  } catch (error) { next(error); }
});

authRouter.get("/me", requireAuth, async (request, response, next) => {
  try {
    const result = await pool.query<{ id: string; email: string; created_at: Date }>(
      "SELECT id, email, created_at FROM users WHERE id = $1",
      [request.user!.id],
    );
    if (!result.rowCount) throw new ApiError(404, "User account not found");
    response.json({ user: publicUser(result.rows[0]) });
  } catch (error) { next(error); }
});

authRouter.post("/logout", requireAuth, async (request, response, next) => {
  try {
    const bearer = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const cookie = request.cookies?.[cookieName] as string | undefined;
    const token = request.body?.refreshToken ?? cookie ?? bearer;
    if (token) {
      const { createHash } = await import("node:crypto");
      await pool.query("DELETE FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2", [
        createHash("sha256").update(token).digest("hex"), request.user!.id,
      ]);
    }
    response.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
    response.status(204).end();
  } catch (error) { next(error); }
});
