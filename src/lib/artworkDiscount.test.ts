import { describe, expect, it } from 'vitest';
import { isValidDiscountInput, MAX_DISCOUNT_PERCENT } from './artworkDiscount';

describe('isValidDiscountInput', () => {
  it('caps at 30 percent', () => {
    expect(MAX_DISCOUNT_PERCENT).toBe(30);
  });

  it.each(['', '  ', '0', '15', '30'])('accepts %j', (raw) => {
    expect(isValidDiscountInput(raw)).toBe(true);
  });

  it.each(['31', '50', '100', '-1', '10.5', 'abc'])('rejects %j', (raw) => {
    expect(isValidDiscountInput(raw)).toBe(false);
  });
});
