import type { IpFamily } from "@/lib/api/types";

export type DestinationKind = "ipv4" | "ipv6" | "hostname";

export type DestinationValidation =
  | { ok: true; value: string; kind: DestinationKind }
  | { ok: false; message: string };

export interface ValidateOptions {
  family?: IpFamily;
  subject?: string;
  allowUnderscore?: boolean;
}

const MAX_LENGTH = 253;
const SHELL_CHARS = /[;|&$`<>(){}[\]\\"'*!~^%=,]/;
const INTERNAL_SUFFIXES = [
  "localhost",
  "local",
  "internal",
  "localdomain",
  "lan",
  "home",
  "home.arpa",
  "corp",
  "intranet",
  "private",
  "svc",
  "cluster.local"
];

const fail = (message: string): DestinationValidation => ({ ok: false, message });

export function parseIPv4(input: string): number[] | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

export function ipv4BlockReason(octets: number[]): string | null {
  const [a = 0, b = 0, c = 0] = octets;
  if (a === 0) return "0.0.0.0/8 is a reserved range";
  if (a === 10) return "10.0.0.0/8 is a private range";
  if (a === 100 && b >= 64 && b <= 127) return "100.64.0.0/10 is a shared carrier-grade NAT range";
  if (a === 127) return "127.0.0.0/8 is the loopback range";
  if (a === 169 && b === 254) return "169.254.0.0/16 is a link-local range";
  if (a === 172 && b >= 16 && b <= 31) return "172.16.0.0/12 is a private range";
  if (a === 192 && b === 168) return "192.168.0.0/16 is a private range";
  if (a === 192 && b === 0 && c === 0) return "192.0.0.0/24 is a reserved range";
  if (a >= 224 && a <= 239) return "224.0.0.0/4 is a multicast range";
  if (a >= 240) return "240.0.0.0/4 is a reserved range";
  return null;
}

export function parseIPv6(input: string): number[] | null {
  if (!/^[0-9a-fA-F:.]+$/.test(input) || !input.includes(":")) return null;
  const doubleColon = input.indexOf("::");
  if (doubleColon !== input.lastIndexOf("::")) return null;

  let text = input;
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  const lastPart = text.slice(lastColon + 1);
  if (lastPart.includes(".")) {
    const v4 = parseIPv4(lastPart);
    if (!v4) return null;
    tail = [((v4[0] ?? 0) << 8) | (v4[1] ?? 0), ((v4[2] ?? 0) << 8) | (v4[3] ?? 0)];
    text = text.slice(0, lastColon + 1);
    if (text.endsWith(":") && !text.endsWith("::")) text = text.slice(0, -1);
    if (text === "") return null;
  }

  const toGroups = (segment: string): number[] | null => {
    if (segment === "") return [];
    const groups: number[] = [];
    for (const part of segment.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
      groups.push(parseInt(part, 16));
    }
    return groups;
  };

  let groups: number[];
  if (text.includes("::")) {
    const [left = "", right = ""] = text.split("::");
    const head = toGroups(left);
    const rest = toGroups(right);
    if (!head || !rest) return null;
    const missing = 8 - head.length - rest.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...new Array<number>(missing).fill(0), ...rest, ...tail];
  } else {
    const head = toGroups(text);
    if (!head) return null;
    groups = [...head, ...tail];
  }
  return groups.length === 8 ? groups : null;
}

export function ipv6BlockReason(groups: number[]): string | null {
  const g0 = groups[0] ?? 0;
  if (groups.every((g) => g === 0)) return "the unspecified address is not a valid destination";
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return "::1 is the loopback address";
  if ((g0 & 0xffc0) === 0xfe80) return "fe80::/10 is a link-local range";
  if ((g0 & 0xfe00) === 0xfc00) return "fc00::/7 is a private (unique local) range";
  if ((g0 & 0xff00) === 0xff00) return "ff00::/8 is a multicast range";
  const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (mapped) {
    const octets = [(groups[6] ?? 0) >> 8, (groups[6] ?? 0) & 0xff, (groups[7] ?? 0) >> 8, (groups[7] ?? 0) & 0xff];
    const reason = ipv4BlockReason(octets);
    if (reason) return `the embedded IPv4 address is blocked (${reason})`;
  }
  return null;
}

function blockedMessage(subject: string, reason: string): string {
  return `Private, loopback and reserved addresses can't be tested: ${reason}. Enter a public ${subject}.`;
}

function isInternalName(host: string): boolean {
  return INTERNAL_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function validateDestination(raw: string, options: ValidateOptions = {}): DestinationValidation {
  const family = options.family ?? "auto";
  const subject = options.subject ?? "hostname or IP address";
  const input = raw.trim();

  if (input === "") return fail(`Enter a ${subject}.`);
  if (input.length > MAX_LENGTH) return fail("That value is too long. Hostnames can be at most 253 characters.");
  if (/\s/.test(input)) return fail("Spaces aren't allowed. Enter a single hostname or IP address.");
  if (/:\/\//.test(input) || /^[a-z][a-z0-9+.-]*:[^:]/i.test(input) && !/^[0-9a-f:.]+$/i.test(input)) {
    return fail("Enter only a hostname or IP address, not a URL. Remove the scheme (for example https://).");
  }
  if (/[/?#@]/.test(input)) {
    return fail("Enter only a hostname or IP address, without a path, query string or credentials.");
  }
  if (SHELL_CHARS.test(input)) return fail("That value contains characters that aren't allowed in a hostname or IP address.");
  if (/[^\x20-\x7e]/.test(input)) {
    return fail("Only ASCII characters are supported. Use the punycode (xn--) form for international names.");
  }

  if (input.includes(":")) {
    const groups = parseIPv6(input);
    if (!groups) return fail("That doesn't look like a valid IPv6 address.");
    const reason = ipv6BlockReason(groups);
    if (reason) return fail(blockedMessage(subject, reason));
    if (family === "ipv4") return fail("That is an IPv6 address. Choose IPv6 or Auto to test it.");
    return { ok: true, value: input, kind: "ipv6" };
  }

  if (/^[\d.]+$/.test(input)) {
    const octets = parseIPv4(input);
    if (!octets) return fail("That doesn't look like a valid IPv4 address. Use dotted decimal such as 8.8.8.8.");
    const reason = ipv4BlockReason(octets);
    if (reason) return fail(blockedMessage(subject, reason));
    if (family === "ipv6") return fail("That is an IPv4 address. Choose IPv4 or Auto to test it.");
    return { ok: true, value: input, kind: "ipv4" };
  }

  const host = (input.endsWith(".") ? input.slice(0, -1) : input).toLowerCase();
  if (host === "") return fail(`Enter a ${subject}.`);
  const labels = host.split(".");
  if (labels.some((l) => l === "")) return fail("Hostnames can't contain empty labels (two dots in a row).");
  if (labels.some((l) => l.length > 63)) return fail("Each part of a hostname can be at most 63 characters.");
  const labelPattern = options.allowUnderscore
    ? /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$/
    : /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  if (labels.some((l) => !labelPattern.test(l))) {
    return fail("Hostnames may only contain letters, numbers and hyphens, and can't start or end a label with a hyphen.");
  }
  if (/^\d+$/.test(labels[labels.length - 1] ?? "")) {
    return fail("That looks like an incomplete or non-standard IP address. Use dotted decimal such as 8.8.8.8.");
  }
  if (isInternalName(host)) return fail("Internal and local names can't be tested. Enter a public hostname.");
  if (labels.length < 2) return fail("Enter a fully qualified hostname such as example.com.");

  return { ok: true, value: host, kind: "hostname" };
}
