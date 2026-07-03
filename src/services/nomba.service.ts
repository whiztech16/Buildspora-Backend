import axios from 'axios';
import { redis } from '../lib/redis';
import { nombaEnv } from '../env';

const BASE = nombaEnv.baseUrl; // e.g. https://api.nomba.com/v1
const PARENT_ACCOUNT_ID = nombaEnv.parentAccountId; // used in accountId header on every call
const SUB_ACCOUNT_ID = nombaEnv.subAccountId;       // scopes virtual account creation to your business
const CLIENT_ID = nombaEnv.clientId;
const PRIVATE_KEY = nombaEnv.privateKey;

async function getToken(): Promise<string> {
  const cached = await redis.get<string>('nomba_token');
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
          accountId: PARENT_ACCOUNT_ID, // always the PARENT id, not the sub-account id
          'Content-Type': 'application/json',
        },
      }
    );

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

  const token = await getToken();

  // NOTE: path + how subAccountId is passed (body vs path vs header) is UNCONFIRMED.
  // This is the most likely shape based on Nomba's general REST patterns, but
  // verify against the hackathon's exact endpoint spec before relying on it.
  // Test this exact call in Postman first (see instructions below) before wiring
  // it back into this function.
  try {
    const res = await axios.post(
      `${BASE}/accounts/virtual/sub-account`,
      {
        accountRef: accountRef.trim(),
        accountName: accountName.trim(),
        currency: 'NGN',
        subAccountId: SUB_ACCOUNT_ID, // <-- verify: might instead need to be a header or path param
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