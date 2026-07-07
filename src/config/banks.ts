/**
 * Nigerian bank codes sourced from Nomba's official bank list.
 * Nomba docs: https://developer.nomba.com/docs/products/transfers/fetch-bank-codes-and-names
 *
 * Use `bankCode` when calling:
 *  - POST /v1/transfers/bank/lookup  (account name enquiry)
 *  - POST /v2/transfers/bank         (actual transfer)
 */

export interface BankEntry {
  code: string;
  name: string;
}

// Keyed constant for typed usage in controllers
export const NIGERIAN_BANKS = {
  ACCESS_BANK:              { code: "044",    name: "Access Bank" },
  CITIBANK:                 { code: "023",    name: "Citibank Nigeria" },
  ECOBANK:                  { code: "050",    name: "Ecobank Nigeria" },
  FIDELITY_BANK:            { code: "070",    name: "Fidelity Bank" },
  FIRST_BANK:               { code: "011",    name: "First Bank of Nigeria" },
  FCMB:                     { code: "214",    name: "First City Monument Bank (FCMB)" },
  GTBANK:                   { code: "058",    name: "Guaranty Trust Bank" },
  HERITAGE_BANK:            { code: "030",    name: "Heritage Bank" },
  JAIZ_BANK:                { code: "301",    name: "Jaiz Bank" },
  KEYSTONE_BANK:            { code: "082",    name: "Keystone Bank" },
  KUDA_BANK:                { code: "090267", name: "Kuda Bank" },
  MONIEPOINT:               { code: "090405", name: "Moniepoint Microfinance Bank" },
  NOMBA:                    { code: "100002", name: "Nomba" },
  OPAY:                     { code: "999992", name: "OPay Digital Services" },
  PALMPAY:                  { code: "999991", name: "PalmPay" },
  POLARIS_BANK:             { code: "076",    name: "Polaris Bank" },
  PROVIDUS_BANK:            { code: "101",    name: "Providus Bank" },
  STANBIC_IBTC:             { code: "221",    name: "Stanbic IBTC Bank" },
  STANDARD_CHARTERED:       { code: "068",    name: "Standard Chartered Bank" },
  STERLING_BANK:            { code: "232",    name: "Sterling Bank" },
  SUNTRUST_BANK:            { code: "100",    name: "SunTrust Bank" },
  TITAN_TRUST_BANK:         { code: "102",    name: "Titan Trust Bank" },
  UNION_BANK:               { code: "032",    name: "Union Bank of Nigeria" },
  UBA:                      { code: "033",    name: "United Bank for Africa (UBA)" },
  UNITY_BANK:               { code: "215",    name: "Unity Bank" },
  VFD_MFB:                  { code: "090110", name: "VFD Microfinance Bank" },
  WEMA_BANK:                { code: "035",    name: "Wema Bank" },
  ZENITH_BANK:              { code: "057",    name: "Zenith Bank" },
} as const;

export type BankKey = keyof typeof NIGERIAN_BANKS;

/**
 * Flat array — useful for dropdowns and validation loops.
 * Sorted alphabetically by name.
 */
export const BANK_LIST: BankEntry[] = Object.values(NIGERIAN_BANKS).sort((a, b) =>
  a.name.localeCompare(b.name)
);

/**
 * Look up a bank entry by its code.
 * Returns undefined if the code is not in the static list.
 */
export function getBankByCode(code: string): BankEntry | undefined {
  return BANK_LIST.find((b) => b.code === code);
}

/**
 * Look up a bank entry by its display name (case-insensitive, partial match).
 */
export function getBankByName(name: string): BankEntry | undefined {
  const lower = name.toLowerCase();
  return BANK_LIST.find((b) => b.name.toLowerCase().includes(lower));
}

/**
 * Validate that a bank code is known to Nomba.
 * Controllers can use this before calling the Nomba API.
 */
export function isValidBankCode(code: string): boolean {
  return BANK_LIST.some((b) => b.code === code);
}
