import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),

  // Database
  DATABASE_URL: z.string().min(1),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Redis
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // Nomba - Account IDs
  NOMBA_ACCOUNT_ID: z.string().min(1),
  NOMBA_SUB_ACCOUNT_ID: z.string().min(1),

  // Nomba - Test Credentials
  NOMBA_TEST_CLIENT_ID: z.string().min(1),
  NOMBA_TEST_PRIVATE_KEY: z.string().min(1),
  NOMBA_TEST_BASE_URL: z.string().url(),

  // Nomba - Live Credentials
  NOMBA_LIVE_CLIENT_ID: z.string().min(1),
  NOMBA_LIVE_PRIVATE_KEY: z.string().min(1),
  NOMBA_LIVE_BASE_URL: z.string().url().optional(),
  //Nomba webhook url
  NOMBA_WEBHOOK_SECRET: z.string().min(1),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  // Encryption
  ENCRYPTION_KEY: z.string().length(64, "Encryption key must be exactly 64 hex characters (32 bytes)"),

  // Frontend
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid/missing environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Resolved Nomba credentials based on environment
export const nombaEnv = {
  baseUrl:
    env.NODE_ENV === "production"
      ? env.NOMBA_LIVE_BASE_URL ?? ""
      : env.NOMBA_TEST_BASE_URL,
  clientId:
    env.NODE_ENV === "production"
      ? env.NOMBA_LIVE_CLIENT_ID
      : env.NOMBA_TEST_CLIENT_ID,
  privateKey:
    env.NODE_ENV === "production"
      ? env.NOMBA_LIVE_PRIVATE_KEY
      : env.NOMBA_TEST_PRIVATE_KEY,
  accountId: env.NOMBA_ACCOUNT_ID,
  subAccountId: env.NOMBA_SUB_ACCOUNT_ID,
};