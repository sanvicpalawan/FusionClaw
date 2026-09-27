/**
 * Currency helpers for FusionClaw.
 * Default primary = PHP (Philippines Peso), secondary = USD.
 * Agency admins can override via the Settings table.
 */

export const DEFAULT_CURRENCY = "PHP";
export const SECONDARY_CURRENCY = "USD";

/** Map ISO code → locale tag used by Intl.NumberFormat */
const LOCALE_MAP: Record<string, string> = {
  PHP: "en-PH",
  USD: "en-US",
  EUR: "de-DE",
  AUD: "en-AU",
  GBP: "en-GB",
  CNY: "zh-CN",
  JPY: "ja-JP",
  CAD: "en-CA",
  CHF: "de-CH",
  SGD: "en-SG",
  HKD: "en-HK",
  THB: "th-TH",
  MYR: "ms-MY",
  IDR: "id-ID",
  INR: "en-IN",
};

/**
 * Format a numeric value as currency.
 * @param value    number | string (decimal string from DB)
 * @param currency optional override (defaults to PHP)
 * @param opts     maximumFractionDigits defaults to 2
 */
export function fmtCurrency(
  value: number | string,
  currency = DEFAULT_CURRENCY,
  maximumFractionDigits = 2
): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  const locale = LOCALE_MAP[currency] ?? "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits,
  }).format(n || 0);
}

/** Format with secondary currency (USD) — useful for quotes/invoices dual display */
export function fmtSecondary(value: number | string): string {
  return fmtCurrency(value, SECONDARY_CURRENCY, 2);
}

/** Quick PHP formatter (alias, primary) */
export function fmtPHP(value: number | string): string {
  return fmtCurrency(value, DEFAULT_CURRENCY, 2);
}

/** Quick USD formatter */
export function fmtUSD(value: number | string): string {
  return fmtCurrency(value, "USD", 2);
}
