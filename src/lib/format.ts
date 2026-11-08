// Numbers written the way every page writes them. The big screen view and the stats pages share it.

const whole = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });

/** A whole number with a space between thousands, such as `3 420`. */
export const number = (n: number) => whole.format(n);

/** A number with its sign, such as `+84` or `-12`. 0 has no sign. */
export function signed(n: number): string {
    const rounded = Math.round(n);
    if (rounded === 0) return '0';
    return rounded > 0 ? `+${number(rounded)}` : `-${number(-rounded)}`;
}
