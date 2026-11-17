import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound: RequestHandler = (_request, response) => {
  response.status(404).json({ error: "Not found" });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({ error: "Validation failed", details: error.flatten() });
    return;
  }
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
    return;
  }
  if (error && typeof error === "object" && "code" in error && error.code === "23505") {
    response.status(409).json({ error: "A record with those details already exists" });
    return;
  }
  if (error && typeof error === "object" && "code" in error && error.code === "LIMIT_FILE_SIZE") {
    response.status(413).json({ error: "CSV file exceeds the 5 MB limit" });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
};
