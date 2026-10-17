import { BlockList, isIPv4, isIPv6 } from 'node:net';

// Spec §7.3. Addresses that an outbound call must never reach. The check runs on the resolved IP.
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC 1918
  ['100.64.0.0', 10], // CGNAT, Tailscale
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // RFC 1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // RFC 1918
  ['198.18.0.0', 15], // benchmark networks
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved and broadcast
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64, which can embed a private IPv4 address
  ['2002::', 16], // 6to4, which can embed a private IPv4 address
  ['fc00::', 7], // unique local, includes the AWS metadata address fd00:ec2::254
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

export function isBlockedAddress(ip: string): boolean {
  if (isIPv4(ip)) return blocked.check(ip, 'ipv4');
  if (!isIPv6(ip)) return true; // Fail closed on anything that is not an IP address.
  const mapped = mappedIPv4(ip);
  if (mapped) return blocked.check(mapped, 'ipv4');
  return blocked.check(ip, 'ipv6');
}

// Gives the IPv4 address inside an IPv4-mapped IPv6 address (::ffff:a.b.c.d or ::ffff:XXXX:XXXX).
function mappedIPv4(ip: string): string | undefined {
  const groups = expandIPv6(ip);
  if (!groups.slice(0, 5).every((g) => g === 0) || groups[5] !== 0xffff)
    return undefined;
  const [hi, lo] = [groups[6]!, groups[7]!];
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
}

function expandIPv6(ip: string): number[] {
  let text = ip.toLowerCase().split('%')[0]!;
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted[1]!.split('.').map(Number) as [
      number,
      number,
      number,
      number,
    ];
    text =
      text.slice(0, -dotted[1]!.length) +
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split('::') as [string, string | undefined];
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const fill =
    tail === undefined ? [] : Array(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map((g) => parseInt(g, 16));
}
