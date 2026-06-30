import crypto from 'crypto';
import { env } from '../env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Encrypts a text string using AES-256-GCM.
 * Returns a combined string containing the IV, Auth Tag, and Encrypted Payload.
 */
export const encrypt = (text: string): string => {
  if (!text) return text;
  
  // Create a random initialization vector
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Use the 64-char hex key from env and convert to a 32-byte buffer
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error('Invalid encryption key length. Must be 32 bytes (64 hex characters).');
  }

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Decrypts an encrypted text string.
 */
export const decrypt = (encryptedText: string): string => {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;

  const [ivHex, authTagHex, encryptedData] = encryptedText.split(':');
  
  if (!ivHex || !authTagHex || !encryptedData) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};
