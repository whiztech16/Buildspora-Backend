import axios from 'axios';
import { redis } from '../lib/redis';
import { nombaEnv } from '../env';

const BASE = nombaEnv.baseUrl;
const PARENT_ID = nombaEnv.accountId;
const CLIENT_ID = nombaEnv.clientId;
const PRIVATE_KEY = nombaEnv.privateKey;

async function getToken(): Promise<string> {
  const cached = await redis.get<string>('nomba_token');
  if (cached) return cached;

  try {
    const res = await axios.post(`${BASE}/auth/token/issue`, {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: PRIVATE_KEY,
    }, {
      headers: { accountId: PARENT_ID, 'Content-Type': 'application/json' }
    });

    const { access_token, expiresAt } = res.data.data;
    const ttlSeconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000) - 60;
    await redis.setex('nomba_token', Math.max(ttlSeconds, 60), access_token);
    return access_token;
  } catch (error: any) {
    console.error('Nomba auth failed:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with Nomba');
  }
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    accountId: PARENT_ID,
  };
}

export async function createVirtualAccount(params: {
  accountRef: string;
  accountName: string;
}) {
  const { accountRef, accountName } = params;

  // Basic validation — accountRef becomes part of a real financial record on Nomba's side
  if (!accountRef || typeof accountRef !== 'string' || accountRef.trim().length === 0) {
    throw new Error('Invalid accountRef');
  }
  if (!accountName || typeof accountName !== 'string' || accountName.trim().length === 0) {
    throw new Error('Invalid accountName');
  }

  const token = await getToken();

  try {
    const res = await axios.post(
      `${BASE}/accounts/virtual`,
      {
        accountRef: accountRef.trim(),
        accountName: accountName.trim(),
        currency: 'NGN',
      },
      { headers: headers(token) }
    );
    return res.data.data; // { bankAccountNumber, bankName, bankAccountName, accountRef }
  } catch (error: any) {
    // Log full detail server-side only — never let Nomba's raw error reach the client
    console.error('Nomba createVirtualAccount failed:', error.response?.data || error.message);
    throw new Error('Failed to create virtual account');
  }
}

export { getToken, headers };