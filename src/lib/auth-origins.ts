export function buildTrustedOrigins(appUrl: string, mobileOrigins?: string | null): string[] {
  const origins = [appUrl, ...(mobileOrigins ?? "").split(",")];
  return [...new Set(origins.map((origin) => origin.trim()).filter(Boolean))];
}
