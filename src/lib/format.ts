export function formatShares(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4).replace(/\.?0+$/, "");
}

export function pnlClass(value: number | null): string {
  if (value === null) return "text-gray-400";
  return value >= 0 ? "text-emerald-600" : "text-red-600";
}

export function formatSigned(value: number | null, decimals = 2): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(Math.max(0, Math.min(100, decimals)))}`;
}
