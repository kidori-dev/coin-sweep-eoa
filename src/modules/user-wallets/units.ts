export function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, '0');
  const sign = negative ? '-' : '';
  return decimals === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}
