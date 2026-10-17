// The API runs behind a Cloudflare Tunnel, then Traefik. Traefik sets x-real-ip to the tunnel
// container, so the user IP comes from the header that Cloudflare sets. The server has no open port
// on the internet, so only Cloudflare can reach Traefik and set this header.
export const CLIENT_IP_HEADER = 'cf-connecting-ip';
