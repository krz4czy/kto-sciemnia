import { CLUE_MAX, NAME_MAX, NAME_MIN } from './types';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const NAME_RE = /^(?=.{2,16}$)[\p{L}\p{N}]+(?:[ ._-][\p{L}\p{N}]+)*$/u;

export function foldName(name: string): string {
  return name.toLocaleLowerCase('pl');
}

export function cleanName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return null;
  if (!NAME_RE.test(name)) return null;
  return name;
}

export function cleanClue(raw: string): string | null {
  const clue = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (clue.length < 1 || clue.length > CLUE_MAX) return null;
  return clue;
}

export function isRoomCode(code: string): boolean {
  return code.length === 4 && [...code].every((char) => ROOM_ALPHABET.includes(char));
}

export function normalizeRoomInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function roomCodeError(code: string): string | null {
  if (isRoomCode(code)) return null;
  if (/[01OI]/.test(code)) return 'W kodzie nie używamy 0, 1, O ani I — łatwo je pomylić.';
  if (code.length < 4) return 'Kod ma 4 znaki.';
  return 'Taki kod nie pasuje do gry.';
}

export function randomRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += ROOM_ALPHABET[Math.floor(rng() * ROOM_ALPHABET.length)];
  }
  return code;
}

export function hostPeerId(code: string): string {
  return `kto${code.toLowerCase()}`;
}

export function randomId(prefix: string): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let id = prefix;
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return id;
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface Bucket {
  tokens: number;
  updatedAt: number;
}

export function takeToken(
  bucket: Bucket,
  now: number,
  cost = 1,
  capacity = 10,
  refillPerSec = 4,
): { ok: boolean; bucket: Bucket } {
  const elapsed = Math.max(0, now - bucket.updatedAt) / 1000;
  const tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSec);
  if (tokens < cost) return { ok: false, bucket: { tokens, updatedAt: now } };
  return { ok: true, bucket: { tokens: tokens - cost, updatedAt: now } };
}

export function buildScreenUrl(href: string, screen: 'host' | 'join', room?: string): string {
  const url = new URL(href);
  let path = url.pathname.replace(/index\.html$/, '');
  if (!path.endsWith('/')) path += '/';
  url.pathname = path;
  url.search = '';
  url.hash = '';
  url.searchParams.set('screen', screen);
  if (room) url.searchParams.set('room', room);
  return url.toString();
}

export function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
