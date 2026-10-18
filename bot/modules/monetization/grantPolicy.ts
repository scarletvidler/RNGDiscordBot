export type SubscriptionGrantState = {
  skuId: string;
  tokensPerPeriod: number;
  periodStart: string;
  periodEnd: string;
};

/**
 * Calculates only the new tokens owed by a subscription transition.
 * Renewals get the full allowance, early upgrades get the tier difference,
 * and downgrades do not remove tokens already paid for.
 */
export function calculateSubscriptionGrant(
  previous: SubscriptionGrantState | null,
  next: SubscriptionGrantState,
): number {
  if (!previous) return next.tokensPerPeriod;

  const samePeriod = previous.periodStart === next.periodStart;
  const sameSku = previous.skuId === next.skuId;
  if (samePeriod && sameSku) return 0;

  if (samePeriod) {
    return Math.max(next.tokensPerPeriod - previous.tokensPerPeriod, 0);
  }

  const nextStartsBeforePreviousPeriodEnds =
    Date.parse(next.periodStart) < Date.parse(previous.periodEnd);
  if (!sameSku && nextStartsBeforePreviousPeriodEnds) {
    return Math.max(next.tokensPerPeriod - previous.tokensPerPeriod, 0);
  }

  return next.tokensPerPeriod;
}
