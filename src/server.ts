import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./env";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import paymentsRoutes from './routes/payments.routes'
import projectsRoutes from './routes/projects.routes'
import webhooksRoutes from './routes/webhooks.routes'
import milestonesRoutes from "./routes/milestones.routes";
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

const app = express();

// middleware
app.use(helmet());
app.use((req, res, next) => {
  const allowed = [
    "https://buildspora.vercel.app",
    "https://localhost:5173",
     "http://localhost:5173",
    "https://localhost:3000",
     "http://localhost:3000",
  ];
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
});
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// Webhook routes MUST be mounted before express.json() —
// this route needs the raw request body for signature verification,
// and express.json() below would consume/parse it first otherwise.
app.use("/api/webhooks", webhooksRoutes);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/milestones", milestonesRoutes);
// health check
app.get("/health", (req, res) => {
  res.json({ success: true, message: "Server is running." });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found." });
});

// global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
});

export default app;