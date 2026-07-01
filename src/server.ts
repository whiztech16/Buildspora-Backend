import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./env";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";

const app = express();

// middleware
app.use(helmet());
app.use(cors({
  origin: ["http://localhost:5173", "https://buildspora.vercel.app"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

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