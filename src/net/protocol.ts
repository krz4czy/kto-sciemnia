import type { PlayerView, Spice } from '../game/types';
import { APP_VERSION } from './config';

export type ClientMessage =
  | { t: 'join'; name: string }
  | { t: 'rejoin'; playerId: string; token: string }
  | { t: 'clue'; text: string }
  | { t: 'vote'; targetId: string }
  | { t: 'leave' }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'hello'; now: number; playerId: string; token: string; view: PlayerView }
  | { t: 'view'; now: number; view: PlayerView }
  | { t: 'err'; now: number; code: string; message: string }
  | { t: 'pong'; now: number }
  | { t: 'bye'; now: number; message: string };

export type ParseResult<T> = { ok: true; msg: T } | { ok: false; error: 'version' | 'bad-message' };

function isRec(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number, min = 1): string | null {
  if (typeof value !== 'string') return null;
  if (value.length < min || value.length > max) return null;
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;
  return value;
}

function integer(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function flag(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function spiceOf(value: unknown): Spice | null {
  return value === 'mild' || value === 'spicy' ? value : null;
}

function idOf(value: unknown): string | null {
  const id = text(value, 40);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

function versionOk(input: Record<string, unknown>): boolean {
  return input.v === APP_VERSION;
}

export function parseClientMessage(data: unknown): ParseResult<ClientMessage> {
  if (!isRec(data)) return { ok: false, error: 'bad-message' };
  if (!versionOk(data)) return { ok: false, error: 'version' };
  switch (data.t) {
    case 'ping':
      return { ok: true, msg: { t: 'ping' } };
    case 'leave':
      return { ok: true, msg: { t: 'leave' } };
    case 'join': {
      const name = text(data.name, 40);
      if (!name) return { ok: false, error: 'bad-message' };
      return { ok: true, msg: { t: 'join', name } };
    }
    case 'rejoin': {
      const playerId = idOf(data.playerId);
      const token = text(data.token, 80);
      if (!playerId || !token) return { ok: false, error: 'bad-message' };
      return { ok: true, msg: { t: 'rejoin', playerId, token } };
    }
    case 'clue': {
      const clue = text(data.text, 200);
      if (!clue) return { ok: false, error: 'bad-message' };
      return { ok: true, msg: { t: 'clue', text: clue } };
    }
    case 'vote': {
      const targetId = idOf(data.targetId);
      if (!targetId) return { ok: false, error: 'bad-message' };
      return { ok: true, msg: { t: 'vote', targetId } };
    }
    default:
      return { ok: false, error: 'bad-message' };
  }
}

function person(value: unknown): { name: string; connected: boolean; score: number } | null {
  if (!isRec(value)) return null;
  const name = text(value.name, 16);
  const connected = flag(value.connected);
  const score = integer(value.score, 0, 100_000);
  if (!name || connected == null || score == null) return null;
  return { name, connected, score };
}

function youOf(value: unknown): { id: string; name: string; score: number } | null {
  if (!isRec(value)) return null;
  const id = idOf(value.id);
  const name = text(value.name, 16);
  const score = integer(value.score, 0, 100_000);
  if (!id || !name || score == null) return null;
  return { id, name, score };
}

function clueOf(value: unknown): { label: string; text: string } | null {
  if (!isRec(value)) return null;
  const label = text(value.label, 20);
  const clue = text(value.text, 80);
  if (!label || !clue) return null;
  return { label, text: clue };
}

function list<T>(value: unknown, map: (item: unknown) => T | null, max = 10): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const items: T[] = [];
  for (const item of value) {
    const parsed = map(item);
    if (!parsed) return null;
    items.push(parsed);
  }
  return items;
}

export function parsePlayerView(input: unknown): PlayerView | null {
  if (!isRec(input)) return null;
  const spice = spiceOf(input.spice);
  if (!spice) return null;
  if (input.phase === 'lobby') {
    const you = youOf(input.you);
    const players = list(input.players, person);
    if (!you || !players || input.joinLocked !== false) return null;
    return { phase: 'lobby', spice, you, players, joinLocked: false };
  }
  if (input.phase === 'waiting') {
    const you = youOf(input.you);
    const roundNumber = integer(input.roundNumber, 1, 999);
    const message = text(input.message, 240);
    if (!you || roundNumber == null || !message) return null;
    return { phase: 'waiting', spice, you, roundNumber, message };
  }
  if (input.phase === 'submit') {
    const you = youOf(input.you);
    const roundNumber = integer(input.roundNumber, 1, 999);
    const category = text(input.category, 32);
    const role = input.role === 'citizen' || input.role === 'impostor' ? input.role : null;
    const submitted = flag(input.submitted);
    const deadline = input.deadline === null ? null : integer(input.deadline, 0, 10_000_000_000_000);
    const roster = list(
      input.roster,
      (item) => {
        if (!isRec(item)) return null;
        const name = text(item.name, 16);
        const done = flag(item.submitted);
        const connected = flag(item.connected);
        if (!name || done == null || connected == null) return null;
        return { name, submitted: done, connected };
      },
    );
    const secret = input.secret === null ? null : text(input.secret, 140);
    const yourClue = input.yourClue === null ? null : text(input.yourClue, 80);
    if (!you || roundNumber == null || !category || !role || submitted == null || deadline === undefined || !roster) {
      return null;
    }
    if (secret === undefined || yourClue === undefined) return null;
    if (role === 'impostor' && secret !== null) return null;
    if (role === 'citizen' && secret == null) return null;
    return {
      phase: 'submit',
      spice,
      you,
      roundNumber,
      category,
      role,
      secret,
      submitted,
      yourClue,
      roster,
      deadline,
    };
  }
  if (input.phase === 'discuss') {
    const you = youOf(input.you);
    const roundNumber = integer(input.roundNumber, 1, 999);
    const category = text(input.category, 32);
    const clues = list(input.clues, clueOf);
    const deadline = input.deadline === null ? null : integer(input.deadline, 0, 10_000_000_000_000);
    if (!you || roundNumber == null || !category || !clues || deadline === undefined) return null;
    return { phase: 'discuss', spice, you, roundNumber, category, clues, deadline };
  }
  if (input.phase === 'vote') {
    const you = youOf(input.you);
    const roundNumber = integer(input.roundNumber, 1, 999);
    const category = text(input.category, 32);
    const clues = list(input.clues, clueOf);
    const deadline = input.deadline === null ? null : integer(input.deadline, 0, 10_000_000_000_000);
    const yourVote = input.yourVote === null ? null : idOf(input.yourVote);
    const candidates = list(input.candidates, (item) => {
      if (!isRec(item)) return null;
      const id = idOf(item.id);
      const name = text(item.name, 16);
      if (!id || !name) return null;
      return { id, name };
    });
    if (!you || roundNumber == null || !category || !clues || deadline === undefined || yourVote === undefined || !candidates) {
      return null;
    }
    return { phase: 'vote', spice, you, roundNumber, category, clues, deadline, yourVote, candidates };
  }
  if (input.phase === 'reveal') {
    const you = youOf(input.you);
    const youScore = integer(input.yourScore, 0, 100_000);
    const yourDelta = integer(input.yourDelta, -50, 50);
    const roundNumber = integer(input.roundNumber, 1, 999);
    const category = text(input.category, 32);
    const secret = text(input.secret, 140);
    const impostorName = text(input.impostorName, 16);
    const caught = flag(input.caught);
    const youAreImpostor = flag(input.youAreImpostor);
    const rows = list(input.rows, (item) => {
      if (!isRec(item)) return null;
      const name = text(item.name, 16);
      const label = text(item.label, 20);
      const clue = text(item.text ?? item.clue, 80);
      const voteCount = integer(item.voteCount, 0, 10);
      const delta = integer(item.delta, -50, 50);
      const score = integer(item.score, 0, 100_000);
      const impostor = flag(item.impostor);
      const yourVote = flag(item.yourVote);
      if (!name || !label || !clue || voteCount == null || delta == null || score == null || impostor == null || yourVote == null) {
        return null;
      }
      return { name, label, clue, voteCount, delta, score, impostor, yourVote };
    });
    if (
      !you ||
      youScore == null ||
      yourDelta == null ||
      roundNumber == null ||
      !category ||
      !secret ||
      !impostorName ||
      caught == null ||
      youAreImpostor == null ||
      !rows
    ) {
      return null;
    }
    return {
      phase: 'reveal',
      spice,
      roundNumber,
      category,
      secret,
      impostorName,
      youAreImpostor,
      caught,
      yourDelta,
      yourScore: youScore,
      you,
      rows,
    };
  }
  return null;
}

export function parseServerMessage(data: unknown): ParseResult<ServerMessage> {
  if (!isRec(data)) return { ok: false, error: 'bad-message' };
  if (!versionOk(data)) return { ok: false, error: 'version' };
  const now = integer(data.now, 0, 10_000_000_000_000);
  if (now == null) return { ok: false, error: 'bad-message' };
  switch (data.t) {
    case 'pong':
      return { ok: true, msg: { t: 'pong', now } };
    case 'bye': {
      const message = text(data.message, 240);
      if (!message) return { ok: false, error: 'bad-message' };
      return { ok: true, msg: { t: 'bye', now, message } };
    }
    case 'err': {
      const code = text(data.code, 40);
      const message = text(data.message, 240);
      if (!code || !message) return { ok: false, error: 'bad-message' };
      return { ok: true, msg: { t: 'err', now, code, message } };
    }
    case 'view': {
      const view = parsePlayerView(data.view);
      if (!view) return { ok: false, error: 'bad-message' };
      return { ok: true, msg: { t: 'view', now, view } };
    }
    case 'hello': {
      const view = parsePlayerView(data.view);
      const playerId = idOf(data.playerId);
      const token = text(data.token, 80);
      if (!view || !playerId || !token) return { ok: false, error: 'bad-message' };
      return { ok: true, msg: { t: 'hello', now, view, playerId, token } };
    }
    default:
      return { ok: false, error: 'bad-message' };
  }
}

export function payloadTooLarge(data: unknown): boolean {
  try {
    const encoded = typeof data === 'string' ? data : JSON.stringify(data);
    return encoded.length > 8_000;
  } catch {
    return true;
  }
}
