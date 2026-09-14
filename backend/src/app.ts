import express from "express";
import cors from "cors";
import path from "path";
import { authRouter } from "./routes/auth";
import { requestsRouter } from "./routes/requests";
import { usersRouter } from "./routes/users";
import { reviewsRouter } from "./routes/reviews";
import { messagesRouter } from "./routes/messages";
import { photosRouter } from "./routes/photos";
import { adminRouter } from "./routes/admin";
import { paymentsRouter, requestPaymentsRouter, stripeWebhookRouter } from "./routes/payments";

export function createApp() {
  const app = express();
  app.use(cors());

  // Stripe's webhook signature verification needs the raw request body, so it must be
  // wired up before the global express.json() body parser touches the request.
  app.use("/payments/webhook", stripeWebhookRouter);

  app.use(express.json());
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  app.use("/admin", express.static(path.join(process.cwd(), "public", "admin")));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", authRouter);
  app.use("/users", usersRouter);
  app.use("/requests", requestsRouter);
  app.use("/requests", messagesRouter);
  app.use("/requests", photosRouter);
  app.use("/reviews", reviewsRouter);
  app.use("/admin", adminRouter);
  app.use("/payments", paymentsRouter);
  app.use("/requests", requestPaymentsRouter);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
