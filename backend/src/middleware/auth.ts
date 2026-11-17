import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "./errors";

export const requireAuth: RequestHandler = (request, _response, next) => {
  const header = request.get("authorization");
  if (!header?.startsWith("Bearer ")) return next(new ApiError(401, "Authentication required"));
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 24) return next(new Error("JWT_SECRET must be set to at least 24 characters"));
  try {
    const claims = jwt.verify(header.slice(7), secret, {
      issuer: "ledgerly-api",
      audience: "ledgerly-client",
    });
    if (typeof claims === "string" || claims.typ !== "access" || !claims.sub || typeof claims.email !== "string") {
      throw new Error("Invalid token claims");
    }
    request.user = { id: claims.sub, email: claims.email };
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired access token"));
  }
};
