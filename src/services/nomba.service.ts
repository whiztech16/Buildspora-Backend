import axios from 'axios';
import { redis } from '../lib/redis';
import { nombaEnv } from '../env';

const BASE = nombaEnv.baseUrl; // e.g. https://api.nomba.com/v1
const PARENT_ACCOUNT_ID = nombaEnv.parentAccountId; // used in accountId header on every call
const SUB_ACCOUNT_ID = nombaEnv.subAccountId;       // scopes virtual account creation to your business
const CLIENT_ID = nombaEnv.clientId;
const PRIVATE_KEY = nombaEnv.privateKey;

async function getToken(): Promise<string> {
  const cacheKey = BASE.includes('sandbox') ? 'nomba_token_sandbox' : 'nomba_token_live';
  const cached = await redis.get<string>(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.post(
      `${BASE}/auth/token/issue`,
      {
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: PRIVATE_KEY,
      },
      {
        headers: {
          accountId: PARENT_ACCOUNT_ID,
          'Content-Type': 'application/json',
        },
      }
    );

    const { access_token, expiresAt } = res.data.data;
    const ttlSeconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000) - 60;
    await redis.setex(cacheKey, Math.max(ttlSeconds, 60), access_token);
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
    accountId: PARENT_ACCOUNT_ID, // parent id again, not sub-account id
  };
}

export async function createVirtualAccount(params: {
  accountRef: string;
  accountName: string;
}) {
  const { accountRef, accountName } = params;

  if (!accountRef || typeof accountRef !== 'string' || accountRef.trim().length === 0) {
    throw new Error('Invalid accountRef');
  }
  if (!accountName || typeof accountName !== 'string' || accountName.trim().length === 0) {
    throw new Error('Invalid accountName');
  }

  // Nomba rejects special characters in accountName (letters, numbers, spaces only).
  // Strips things like apostrophes, hyphens, smart quotes, etc. from real user input.
  const cleanAccountName = accountName.trim().replace(/[^a-zA-Z0-9\s]/g, '');
  if (cleanAccountName.length === 0) {
    throw new Error('Invalid accountName: no valid characters after sanitization');
  }

  const token = await getToken();

  // Confirmed working shape: sub-account ID goes in the URL path, not the body.
  // accountId header stays the PARENT account id.
  try {
    const res = await axios.post(
      `${BASE}/accounts/virtual/${SUB_ACCOUNT_ID}`,
      {
        accountRef: accountRef.trim(),
        accountName: cleanAccountName,
        currency: 'NGN',
      },
      { headers: headers(token) }
    );
    return res.data.data;
  } catch (error: any) {
    console.error('Nomba createVirtualAccount failed:', error.response?.data || error.message);
    throw new Error('Failed to create virtual account');
  }
}

export { getToken, headers };