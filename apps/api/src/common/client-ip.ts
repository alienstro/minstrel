// The API runs behind a Cloudflare Tunnel, then Traefik. Traefik sets x-real-ip to the tunnel
// container, so the user IP comes first from the header that Cloudflare sets. A request that does
// not come through Cloudflare (from the home network or Tailscale) has only x-real-ip, so it still
// gets its own rate limit. Such a device can also send a false cf-connecting-ip. The internet cannot,
// because the server has no open port on it (docs/deploy.md).
export const CLIENT_IP_HEADERS = ['cf-connecting-ip', 'x-real-ip'] as const;

export function clientIpFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  for (const name of CLIENT_IP_HEADERS) {
    const value = headers?.[name];
    if (typeof value === 'string' && value !== '') return value;
  }
  return undefined;
}
