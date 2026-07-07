import axios from 'axios';
import { redis } from '../lib/redis';
import { nombaEnv } from '../env';

const BASE = nombaEnv.baseUrl;
const PARENT_ACCOUNT_ID = nombaEnv.parentAccountId;
const SUB_ACCOUNT_ID = nombaEnv.subAccountId;
const CLIENT_ID = nombaEnv.clientId;
const PRIVATE_KEY = nombaEnv.privateKey;

async function getToken(): Promise<string> {
  const cacheKey = 'nomba_token_live';
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
    accountId: PARENT_ACCOUNT_ID,
  };
}

// Fetch an existing virtual account by its accountRef
export async function getVirtualAccountByRef(accountRef: string) {
  const token = await getToken();
  try {
    const res = await axios.get(
      `${BASE}/accounts/virtual/${accountRef}`,
      { headers: headers(token) }
    );
    return res.data.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null; // genuinely doesn't exist yet
    }
    console.error('Nomba getVirtualAccountByRef failed:', error.response?.data || error.message);
    throw new Error('Failed to fetch virtual account');
  }
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

  const cleanAccountName = accountName.trim().replace(/[^a-zA-Z0-9\s]/g, '');
  if (cleanAccountName.length === 0) {
    throw new Error('Invalid accountName: no valid characters after sanitization');
  }

  // Check if Nomba already has an account under this accountRef —
  // avoids the "already exists" error when a previous attempt partially succeeded
  const existing = await getVirtualAccountByRef(accountRef.trim());
  if (existing) {
    return existing;
  }

  const token = await getToken();

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

const V2_BASE = BASE.replace('/v1', '/v2');

// ─── Resolve bank account name (name enquiry) ──────────────
export async function resolveAccount(params: {
  accountNumber: string;
  bankCode: string;
}): Promise<{ accountName: string; accountNumber: string }> {
  const { accountNumber, bankCode } = params;
  const token = await getToken();

  try {
    const res = await axios.post(
      `${BASE}/transfers/bank/lookup`,   // v1 endpoint per Nomba docs
      { accountNumber, bankCode },
      { headers: headers(token) }
    );

    const { code, data, description } = res.data;

    if (code !== '00') {
      throw new Error(description || 'Account lookup failed — check account number and bank code');
    }

    const name = data?.accountName;
    if (!name) throw new Error('Account name not returned by Nomba');

    return { accountName: name, accountNumber: data.accountNumber || accountNumber };
  } catch (error: any) {
    // Re-throw clean message; axios wraps non-2xx errors
    const msg = error.response?.data?.description
      || error.response?.data?.message
      || error.message
      || 'Could not resolve account. Please check the account number and bank.';
    console.error('Nomba resolveAccount failed:', error.response?.data || error.message);
    throw new Error(msg);
  }
}

export async function transferToBank(params: {
  amount: number;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  narration: string;
  merchantTxRef: string;
}) {
  const { amount, accountNumber, accountName, bankCode, narration, merchantTxRef } = params;

  if (!accountNumber || accountNumber.length !== 10) {
    throw new Error('Invalid account number');
  }
  if (!bankCode) {
    throw new Error('Invalid bank code');
  }
  if (amount <= 0) {
    throw new Error('Invalid transfer amount');
  }

  const token = await getToken();

  try {
    const res = await axios.post(
      `${V2_BASE}/transfers/bank`,
      { amount, accountNumber, accountName, bankCode, merchantTxRef, narration },
      { headers: headers(token) }
    );
    return res.data;
  } catch (error: any) {
    console.error('Nomba transferToBank failed:', error.response?.data || error.message);
    throw new Error('Failed to initiate transfer');
  }
}

export { getToken, headers };