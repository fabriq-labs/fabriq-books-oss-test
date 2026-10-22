import { Decimal } from '@prisma/client/runtime/library';

export function toDecimal(value: string | number | Decimal | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0);
  }
  if (value instanceof Decimal) {
    return value;
  }
  return new Decimal(value);
}

/** Money fields use Decimal(19, 4). */
export function money(value: Decimal): Decimal {
  return value.toDecimalPlaces(4);
}
