import bcrypt from 'bcrypt';
import { redis } from '../lib/redis';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getSupabaseAdmin } from '../services/supabase.service';

const SALT_ROUNDS = 10;
const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 600; // 10 minutes

function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin); // 4-6 digit numeric PIN
}

// ── Set PIN (first time — new users or old users on next transaction) ──
export async function setTransactionPin(
  userId: string,
  pin: string,
  confirmPin: string
): Promise<{ success: boolean; error?: string }> {
  if (!isValidPinFormat(pin)) {
    return { success: false, error: 'PIN must be 4-6 digits.' };
  }

  if (pin !== confirmPin) {
    return { success: false, error: 'PINs do not match.' };
  }

  const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);

  await db
    .update(users)
    .set({ transactionPinHash: pinHash })
    .where(eq(users.id, userId));

  return { success: true };
}

// ── Check if user has a PIN set ──
export async function hasTransactionPin(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ transactionPinHash: users.transactionPinHash })
    .from(users)
    .where(eq(users.id, userId));

  return !!user?.transactionPinHash;
}

// ── Verify PIN before a transaction ──
export async function verifyTransactionPin(
  userId: string,
  submittedPin: string
): Promise<{ valid: boolean; error?: string }> {
  const attemptsKey = `pin:attempts:${userId}`;

  // Check current lockout state BEFORE incrementing
  const currentAttempts = await redis.get(attemptsKey);
  if (currentAttempts !== null && Number(currentAttempts) >= MAX_ATTEMPTS) {
    return {
      valid: false,
      error: 'Too many incorrect attempts. Try again in 10 minutes.',
    };
  }

  const [user] = await db
    .select({ transactionPinHash: users.transactionPinHash })
    .from(users)
    .where(eq(users.id, userId));

  if (!user?.transactionPinHash) {
    return { valid: false, error: 'No transaction PIN set. Please set one first.' };
  }

  const isMatch = await bcrypt.compare(submittedPin, user.transactionPinHash);

  if (!isMatch) {
    // Increment counter only on failure
    const newCount = await redis.incr(attemptsKey);
    if (newCount === 1) await redis.expire(attemptsKey, LOCKOUT_SECONDS);
    const left = MAX_ATTEMPTS - newCount;
    if (left <= 0) {
      return {
        valid: false,
        error: 'Too many incorrect attempts. Try again in 10 minutes.',
      };
    }
    return {
      valid: false,
      error: `Incorrect PIN. ${left} attempt${left !== 1 ? 's' : ''} remaining.`,
    };
  }

  // Success — clear the failed-attempts counter
  await redis.del(attemptsKey);

  return { valid: true };
}


// ── Reset PIN (forgot PIN — re-auth via password, no email) ──
export async function resetTransactionPin(
  userId: string,
  userEmail: string,
  currentPassword: string,
  newPin: string,
  confirmNewPin: string
): Promise<{ success: boolean; error?: string }> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email: userEmail,
    password: currentPassword,
  });

  if (error || !data.user) {
    return { success: false, error: 'Incorrect password.' };
  }

  if (!isValidPinFormat(newPin)) {
    return { success: false, error: 'PIN must be 4-6 digits.' };
  }

  if (newPin !== confirmNewPin) {
    return { success: false, error: 'PINs do not match.' };
  }

  const pinHash = await bcrypt.hash(newPin, SALT_ROUNDS);

  await db
    .update(users)
    .set({ transactionPinHash: pinHash })
    .where(eq(users.id, userId));

  return { success: true };
}