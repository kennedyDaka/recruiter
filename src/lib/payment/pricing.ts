/**
 * Central pricing configuration for RecruiterMW campaigns.
 *
 * Single source of truth for all pricing logic. Do not hardcode
 * daily rates or duration limits elsewhere — import from here.
 */

export const DAILY_RATE = 15_000 as const;
export const MIN_DAYS = 3 as const;
export const MAX_DAYS = 365 as const;
export const PRESET_DAYS = [3, 7, 14, 30, 60, 90] as const;

/**
 * Calculate the total campaign price for a given number of days.
 */
export function calculateCampaignPrice(numDays: number): number {
  return numDays * DAILY_RATE;
}

/**
 * Format an amount as MWK currency.
 */
export function formatMWK(amount: number): string {
  return new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
  }).format(amount);
}
