export function resolveLoadError(
  transactionsError: { message: string } | null | undefined,
  portfoliosError: { message: string } | null | undefined,
): string | null {
  return transactionsError?.message ?? portfoliosError?.message ?? null;
}
