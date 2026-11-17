import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { authRouter } from "./routes/auth";
import { analyticsRouter } from "./routes/analytics";
import { categoriesRouter } from "./routes/categories";
import { transactionsRouter } from "./routes/transactions";
import { uploadsRouter } from "./routes/uploads";
import { ApiError } from "./middleware/errors";
import { errorHandler, notFound } from "./middleware/errors";

const app = express();
const appOrigins = new Set([
  process.env.NEXT_PUBLIC_APP_URL,
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  ...(process.env.EXPO_DEV_ORIGINS ?? "").split(",").map((origin) => origin.trim()),
].filter((origin): origin is string => Boolean(origin)));

app.use(cors({
  origin(origin, callback) {
    // Native React Native networking omits Origin; CORS is enforced for browser callers.
    if (!origin || appOrigins.has(origin)) return callback(null, true);
    return callback(new ApiError(403, "Origin is not allowed by CORS"));
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: "draft-7", legacyHeaders: false }));

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });
app.get("/health", (_request, response) => response.status(200).json({ status: "ok", service: "ledgerly-api" }));
app.use("/api/auth", authLimit, authRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/analytics", analyticsRouter);

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, "0.0.0.0", () => console.log(`Ledgerly API listening on ${port}`));
}

export { app };
