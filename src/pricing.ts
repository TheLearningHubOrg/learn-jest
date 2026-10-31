// Pure functions: the easiest code to test, and the best place to start with matchers.
import type { CartLine, User } from './types.js';

const PLAN_DISCOUNT: Record<User['plan'], number> = {
  free: 0,
  pro: 0.1,
  enterprise: 0.25,
};

export function subtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => {
    if (line.quantity < 0 || !Number.isInteger(line.quantity)) {
      throw new RangeError(`Invalid quantity for ${line.sku}: ${line.quantity}`);
    }
    return sum + line.unitPrice * line.quantity;
  }, 0);
}

/** Returns the total in cents after the plan discount, rounded to the nearest cent. */
export function totalFor(user: Pick<User, 'plan'>, lines: CartLine[]): number {
  const gross = subtotal(lines);
  return Math.round(gross * (1 - PLAN_DISCOUNT[user.plan]));
}

export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
