import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production"]).default("production"),

  DATABASE_URL: z.string().min(1),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  NOMBA_PARENT_ACCOUNT_ID: z.string().min(1),
  NOMBA_SUB_ACCOUNT_ID: z.string().min(1),

  NOMBA_LIVE_CLIENT_ID: z.string().min(1),
  NOMBA_LIVE_PRIVATE_KEY: z.string().min(1),
  NOMBA_LIVE_BASE_URL: z.string().url(),

  NOMBA_WEBHOOK_SECRET: z.string().min(1),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  ENCRYPTION_KEY: z.string().length(64, "Encryption key must be exactly 64 hex characters (32 bytes)"),

  FRONTEND_URL: z.string().url().default("http://localhost:5173"),

  // Brevo (HTTP email API — replaces SMTP/nodemailer)
  BREVO_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1), // e.g. "BuildSpora <fortuneokpara7@gmail.com>"
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid/missing environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const nombaEnv = {
  baseUrl: env.NOMBA_LIVE_BASE_URL,
  clientId: env.NOMBA_LIVE_CLIENT_ID,
  privateKey: env.NOMBA_LIVE_PRIVATE_KEY,
  parentAccountId: env.NOMBA_PARENT_ACCOUNT_ID,
  subAccountId: env.NOMBA_SUB_ACCOUNT_ID,
};