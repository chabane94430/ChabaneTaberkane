import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { requestsRouter } from "./routes/requests";
import { usersRouter } from "./routes/users";
import { reviewsRouter } from "./routes/reviews";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", authRouter);
  app.use("/users", usersRouter);
  app.use("/requests", requestsRouter);
  app.use("/reviews", reviewsRouter);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
