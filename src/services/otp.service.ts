import { redis } from '../lib/redis';
import { env } from '../env';

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

  // Log OTP to terminal for local development testing immediately
  if (env.NODE_ENV === "development") {
    console.log(`\n========================================`);
    console.log(`🔐 OTP GENERATED FOR: ${email}`);
    console.log(`Purpose: ${purpose}`);
    console.log(`Code: ${code}`);
    console.log(`========================================\n`);
  }

  // Store in Redis — 10 minute expiry
  await redis.setex(key, 600, code);

  const sender = parseFrom(env.EMAIL_FROM);

  const html = `
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
  `;

  const params = new URLSearchParams();
  params.append('apikey', env.ELASTICEMAIL_API_KEY);
  params.append('from', sender.email);
  params.append('fromName', sender.name);
  params.append('to', email);
  params.append('subject', 'Your BuildSpora verification code');
  params.append('bodyHtml', html);
  params.append('isTransactional', 'true');

  const response = await fetch('https://api.elasticemail.com/v2/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();

  if (!data.success) {
    console.error('Elastic Email send error:', data);
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

  if (String(storedCode) !== String(submittedCode)) {
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