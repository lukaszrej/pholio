function applyPolishFormat(formatted: string): string {
  const dotIdx = formatted.indexOf(".");
  if (dotIdx === -1) return formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const int = formatted.slice(0, dotIdx).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${int},${formatted.slice(dotIdx + 1)}`;
}

export function formatNum(value: number, decimals = 2): string {
  return applyPolishFormat(value.toFixed(decimals));
}

export function formatShares(n: number | null): string {
  if (n == null || isNaN(n)) return "—";
  if (Number.isInteger(n)) return applyPolishFormat(String(n));
  return applyPolishFormat(n.toFixed(4).replace(/\.?0+$/, ""));
}

export function pnlClass(value: number | null): string {
  if (value === null) return "text-dim";
  return value >= 0 ? "text-gain" : "text-loss";
}

export function formatSigned(value: number | null, decimals = 2, showPositiveSign = true): string {
  if (value === null) return "—";
  const sign = value >= 0 ? (showPositiveSign ? "+" : "") : "-";
  return `${sign}${formatNum(Math.abs(value), decimals)}`;
}
