import { BrevoClient } from '@getbrevo/brevo';
import { redis } from '../lib/redis';
import { env } from '../env';

const brevo = new BrevoClient({ apiKey: env.BREVO_API_KEY });

// Parse "Name <email@domain>" format into { name, email }
function parseFrom(from: string): { name: string; email: string } {
  const match = from.match(/^(.*)<(.+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: 'BuildSpora', email: from.trim() };
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function createAndSendOtp(
  userId: string,
  email: string,
  purpose: string
): Promise<void> {
  const code = generateCode();
  const key = `otp:${purpose}:${userId}`;

  // Store in Redis — 10 minute expiry
  await redis.setex(key, 600, code);

  const sender = parseFrom(env.EMAIL_FROM);

  try {
    await brevo.transactionalEmails.sendTransacEmail({
      sender,
      to: [{ email }],
      subject: 'Your BuildSpora verification code',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #16A34A;">BuildSpora</h2>
          <p>Your verification code is:</p>
          <h1 style="font-size: 48px; letter-spacing: 12px; color: #111827; 
                     text-align: center; background: #F9FAFB; 
                     padding: 20px; border-radius: 8px;">
            ${code}
          </h1>
          <p style="color: #6B7280;">
            This code expires in 10 minutes.
          </p>
          <p style="color: #6B7280;">
            If you did not request this, ignore this email.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Brevo send error:', err);
    throw new Error('Failed to send verification code.');
  }
}

export async function verifyOtp(
  userId: string,
  purpose: string,
  submittedCode: string
): Promise<{ valid: boolean; error?: string }> {
  const key = `otp:${purpose}:${userId}`;
  const attemptsKey = `otp:attempts:${userId}:${purpose}`;

  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, 600);

  if (attempts > 3) {
    return { 
      valid: false, 
      error: 'Too many attempts. Request a new code.' 
    };
  }

  const storedCode = await redis.get<string>(key);

  if (!storedCode) {
    return { 
      valid: false, 
      error: 'Code expired. Request a new one.' 
    };
  }

  if (storedCode !== submittedCode) {
    const left = 3 - attempts;
    return { 
      valid: false, 
      error: `Invalid code. ${left} attempt${left !== 1 ? 's' : ''} remaining.` 
    };
  }

  await redis.del(key);
  await redis.del(attemptsKey);

  return { valid: true };
}