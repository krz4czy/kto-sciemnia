import { PROMPTS } from './prompts';
import {
  CATEGORY_MAX,
  type DiscussHostView,
  type GameError,
  type GameState,
  type HostView,
  type LastResult,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MISSING_CLUE,
  type Phase,
  type Player,
  type PlayerView,
  POINTS,
  type PromptCard,
  type Result,
  type RevealHostView,
  type RevealRow,
  SECRET_MAX,
  type ScoreboardEntry,
  type Spice,
  type SubmitHostView,
  type Timings,
  DEFAULT_TIMINGS,
  type VoteHostView,
} from './types';
import { cleanClue, cleanName, foldName, safeEqual } from './validate';
import { phonesNeeded } from '../copy';

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(error: GameError): Result<never> {
  return { ok: false, error };
}

export function createGame(opts?: { spice?: Spice; timings?: Partial<Timings> }): GameState {
  return {
    phase: 'lobby',
    spice: opts?.spice ?? 'mild',
    players: [],
    round: null,
    usedPromptIds: [],
    roundsPlayed: 0,
    lastResult: null,
    phaseDeadline: null,
    timings: { ...DEFAULT_TIMINGS, ...opts?.timings },
  };
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = swap;
  }
  return copy;
}

export function pickPrompt(
  pool: readonly PromptCard[],
  usedIds: readonly string[],
  spice: Spice,
  rng: () => number,
): { prompt: PromptCard; usedIds: string[] } {
  const allowed = pool.filter((card) => (spice === 'spicy' ? true : card.spice === 'mild'));
  if (allowed.length === 0) throw new Error('empty prompt deck');
  let available = allowed.filter((card) => !usedIds.includes(card.id));
  let base = usedIds.slice();
  if (available.length === 0) {
    const last = usedIds[usedIds.length - 1];
    available = allowed.filter((card) => card.id !== last);
    if (available.length === 0) available = allowed.slice();
    base = [];
  }
  const index = Math.min(available.length - 1, Math.floor(rng() * available.length));
  const prompt = available[index] ?? available[0];
  if (!prompt) throw new Error('empty prompt deck');
  return { prompt, usedIds: [...base, prompt.id] };
}

export function setSpice(state: GameState, spice: Spice): Result<GameState> {
  if (state.phase !== 'lobby') return err('spice-locked');
  return ok({ ...state, spice });
}

export function addPlayer(
  state: GameState,
  input: { id: string; token: string; name: string },
): Result<{ state: GameState; playerId: string }> {
  if (state.phase !== 'lobby') return err('locked');
  if (state.players.length >= MAX_PLAYERS) return err('full');
  const name = cleanName(input.name);
  if (!name) return err('bad-name');
  const folded = foldName(name);
  if (state.players.some((player) => foldName(player.name) === folded)) return err('duplicate-name');
  const next = structuredClone(state);
  next.players.push({ id: input.id, token: input.token, name, score: 0, connected: true });
  return ok({ state: next, playerId: input.id });
}

export function reconnect(state: GameState, playerId: string, token: string): Result<GameState> {
  const next = structuredClone(state);
  const player = next.players.find((item) => item.id === playerId);
  if (!player || !safeEqual(player.token, token)) return err('bad-token');
  player.connected = true;
  return ok(next);
}

export function disconnect(state: GameState, playerId: string): GameState {
  const next = structuredClone(state);
  const player = next.players.find((item) => item.id === playerId);
  if (player) player.connected = false;
  return next;
}

export function removePlayer(state: GameState, playerId: string): Result<GameState> {
  if (state.phase !== 'lobby') return err('not-in-phase');
  if (!state.players.some((player) => player.id === playerId)) return err('no-such-player');
  return ok({ ...state, players: state.players.filter((player) => player.id !== playerId) });
}

export function resetMatch(state: GameState): Result<GameState> {
  if (state.phase !== 'lobby') return err('not-in-phase');
  return ok({
    ...state,
    players: state.players.map((player) => ({ ...player, score: 0 })),
    usedPromptIds: [],
    roundsPlayed: 0,
    lastResult: null,
  });
}

export function returnToLobby(state: GameState): Result<GameState> {
  if (state.phase === 'lobby') return ok(state);
  return ok({ ...state, phase: 'lobby', phaseDeadline: null, round: null, lastResult: null });
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return b.every((id) => left.has(id));
}

export function beginRound(
  state: GameState,
  opts: { now: number; prompt: PromptCard; impostorId: string; clueOrder: string[]; usedIds?: string[] },
): Result<GameState> {
  if (state.phase !== 'lobby' && state.phase !== 'reveal') return err('not-in-phase');
  if (state.spice === 'mild' && opts.prompt.spice !== 'mild') return err('bad-prompt');
  if (opts.prompt.category.length < 1 || opts.prompt.category.length > CATEGORY_MAX) return err('bad-prompt');
  if (opts.prompt.secret.length < 1 || opts.prompt.secret.length > SECRET_MAX) return err('bad-prompt');
  const players = state.players.filter((player) => player.connected);
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) return err('need-players');
  const participantIds = players.map((player) => player.id);
  if (!participantIds.includes(opts.impostorId)) return err('bad-target');
  if (!sameIds(opts.clueOrder, participantIds)) return err('bad-prompt');
  const next = structuredClone(state);
  next.players = players;
  next.roundsPlayed += 1;
  next.phase = 'submit';
  next.phaseDeadline = opts.now + next.timings.submitMs;
  next.lastResult = null;
  if (opts.usedIds) next.usedPromptIds = opts.usedIds.slice();
  next.round = {
    number: next.roundsPlayed,
    spice: next.spice,
    promptId: opts.prompt.id,
    category: opts.prompt.category,
    secret: opts.prompt.secret,
    impostorId: opts.impostorId,
    participantIds,
    submissions: {},
    votes: {},
    clueOrder: opts.clueOrder.slice(),
  };
  return ok(next);
}

export function startRound(
  state: GameState,
  opts: { now: number; rng: () => number; prompts?: readonly PromptCard[] },
): Result<GameState> {
  const connected = state.players.filter((player) => player.connected);
  if (connected.length < MIN_PLAYERS || connected.length > MAX_PLAYERS) return err('need-players');
  if (state.phase !== 'lobby' && state.phase !== 'reveal') return err('not-in-phase');
  const picked = pickPrompt(opts.prompts ?? PROMPTS, state.usedPromptIds, state.spice, opts.rng);
  const impostor = connected[Math.floor(opts.rng() * connected.length)];
  if (!impostor) return err('need-players');
  const clueOrder = shuffle(connected.map((player) => player.id), opts.rng);
  return beginRound(state, {
    now: opts.now,
    prompt: picked.prompt,
    impostorId: impostor.id,
    clueOrder,
    usedIds: picked.usedIds,
  });
}

export function submitClue(state: GameState, playerId: string, raw: string): Result<GameState> {
  if (state.phase !== 'submit' || !state.round) return err('not-in-phase');
  if (!state.round.participantIds.includes(playerId)) return err('not-participant');
  const clue = cleanClue(raw);
  if (!clue) return err('bad-clue');
  const next = structuredClone(state);
  next.round!.submissions[playerId] = clue;
  return ok(next);
}

export function castVote(state: GameState, voterId: string, targetId: string): Result<GameState> {
  if (state.phase !== 'vote' || !state.round) return err('not-in-phase');
  if (!state.round.participantIds.includes(voterId)) return err('not-participant');
  if (voterId === targetId) return err('self-vote');
  if (!state.round.participantIds.includes(targetId)) return err('bad-target');
  const next = structuredClone(state);
  next.round!.votes[voterId] = targetId;
  return ok(next);
}

export interface ScoreOutcome {
  caught: boolean;
  counts: Record<string, number>;
  deltas: Record<string, number>;
}

export function scoreRound(
  participantIds: readonly string[],
  impostorId: string,
  votes: Record<string, string>,
): ScoreOutcome {
  const counts: Record<string, number> = {};
  for (const id of participantIds) counts[id] = 0;
  for (const [voter, target] of Object.entries(votes)) {
    if (!participantIds.includes(voter) || !participantIds.includes(target) || voter === target) continue;
    counts[target] = (counts[target] ?? 0) + 1;
  }
  const impostorVotes = counts[impostorId] ?? 0;
  const caught = participantIds.every((id) => id === impostorId || (counts[id] ?? 0) < impostorVotes);
  const deltas: Record<string, number> = {};
  for (const id of participantIds) {
    if (id === impostorId) {
      deltas[id] = caught ? POINTS.impostorCaught : POINTS.impostorEscaped;
      continue;
    }
    const correct = votes[id] === impostorId;
    deltas[id] = correct ? (caught ? POINTS.voteCaught : POINTS.voteEscaped) : 0;
  }
  return { caught, counts, deltas };
}

function arm(state: GameState, phase: Phase, now: number): number | null {
  if (phase === 'submit') return now + state.timings.submitMs;
  if (phase === 'discuss') return now + state.timings.discussMs;
  if (phase === 'vote') return now + state.timings.voteMs;
  return null;
}

export function advanceFromSubmit(state: GameState, now: number): Result<GameState> {
  if (state.phase !== 'submit' || !state.round) return err('not-in-phase');
  const next = structuredClone(state);
  next.phase = 'discuss';
  next.phaseDeadline = arm(next, 'discuss', now);
  return ok(next);
}

export function advanceFromDiscuss(state: GameState, now: number): Result<GameState> {
  if (state.phase !== 'discuss' || !state.round) return err('not-in-phase');
  const next = structuredClone(state);
  next.phase = 'vote';
  next.phaseDeadline = arm(next, 'vote', now);
  return ok(next);
}

export function advanceFromVote(state: GameState, _now: number): Result<GameState> {
  if (state.phase !== 'vote' || !state.round) return err('not-in-phase');
  const round = state.round;
  const outcome = scoreRound(round.participantIds, round.impostorId, round.votes);
  const clues: Record<string, string> = {};
  for (const id of round.participantIds) clues[id] = round.submissions[id] ?? MISSING_CLUE;
  const lastResult: LastResult = {
    roundNumber: round.number,
    category: round.category,
    secret: round.secret,
    impostorId: round.impostorId,
    caught: outcome.caught,
    clues,
    votes: { ...round.votes },
    voteCounts: outcome.counts,
    deltas: outcome.deltas,
  };
  const next = structuredClone(state);
  next.phase = 'reveal';
  next.phaseDeadline = null;
  next.lastResult = lastResult;
  next.players = next.players.map((player) => ({
    ...player,
    score: player.score + (outcome.deltas[player.id] ?? 0),
  }));
  return ok(next);
}

function allSubmitted(state: GameState): boolean {
  const round = state.round;
  if (!round) return false;
  return round.participantIds.every((id) => id in round.submissions);
}

function allConnectedVoted(state: GameState): boolean {
  const round = state.round;
  if (!round) return false;
  const connected = round.participantIds.filter((id) => state.players.find((player) => player.id === id)?.connected);
  if (connected.length === 0) return false;
  return connected.every((id) => id in round.votes);
}

export function tick(state: GameState, now: number): GameState {
  if (state.phase === 'submit' && state.round) {
    const due = state.phaseDeadline != null && now >= state.phaseDeadline;
    if (allSubmitted(state) || due) {
      const stepped = advanceFromSubmit(state, now);
      return stepped.ok ? stepped.value : state;
    }
  }
  if (state.phase === 'discuss' && state.phaseDeadline != null && now >= state.phaseDeadline) {
    const stepped = advanceFromDiscuss(state, now);
    return stepped.ok ? stepped.value : state;
  }
  if (state.phase === 'vote' && state.round) {
    const due = state.phaseDeadline != null && now >= state.phaseDeadline;
    if (allConnectedVoted(state) || due) {
      const stepped = advanceFromVote(state, now);
      return stepped.ok ? stepped.value : state;
    }
  }
  return state;
}

function board(state: GameState): ScoreboardEntry[] {
  return state.players.map((player) => ({
    id: player.id,
    name: player.name,
    score: player.score,
    connected: player.connected,
  }));
}

function cluesOf(round: NonNullable<GameState['round']>) {
  return round.clueOrder.map((id, index) => ({
    label: `Trop ${index + 1}`,
    text: round.submissions[id] ?? MISSING_CLUE,
  }));
}

function findPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((player) => player.id === id);
}

function connectedInRound(state: GameState): number {
  const round = state.round;
  if (!round) return 0;
  return round.participantIds.filter((id) => findPlayer(state, id)?.connected).length;
}

function base(state: GameState) {
  return {
    spice: state.spice,
    scoreboard: board(state),
    roundNumber: state.round?.number ?? null,
    joinLocked: state.phase !== 'lobby',
  };
}

export function hostView(state: GameState): HostView {
  const connectedCount = state.players.filter((player) => player.connected).length;
  if (state.phase === 'lobby' || !state.round) {
    return {
      ...base(state),
      phase: 'lobby',
      roundNumber: null,
      joinLocked: false,
      canStart: connectedCount >= MIN_PLAYERS && connectedCount <= MAX_PLAYERS,
      startHint:
        connectedCount >= MIN_PLAYERS ? 'Można zaczynać.' : phonesNeeded(MIN_PLAYERS - connectedCount),
      connectedCount,
    };
  }
  const round = state.round;
  if (state.phase === 'submit') {
    const view: SubmitHostView = {
      ...base(state),
      phase: 'submit',
      category: round.category,
      deadline: state.phaseDeadline,
      connectedInRound: connectedInRound(state),
      roster: round.participantIds.map((id) => {
        const player = findPlayer(state, id);
        return {
          name: player?.name ?? '?',
          submitted: id in round.submissions,
          connected: player?.connected ?? false,
        };
      }),
    };
    return view;
  }
  if (state.phase === 'discuss') {
    const view: DiscussHostView = {
      ...base(state),
      phase: 'discuss',
      category: round.category,
      deadline: state.phaseDeadline,
      clues: cluesOf(round),
      connectedInRound: connectedInRound(state),
    };
    return view;
  }
  if (state.phase === 'vote') {
    const alive = round.participantIds.filter((id) => findPlayer(state, id)?.connected);
    const view: VoteHostView = {
      ...base(state),
      phase: 'vote',
      category: round.category,
      deadline: state.phaseDeadline,
      clues: cluesOf(round),
      votesIn: alive.filter((id) => id in round.votes).length,
      votesExpected: alive.length,
      connectedInRound: connectedInRound(state),
    };
    return view;
  }
  const result = state.lastResult;
  const rows: RevealRow[] = round.clueOrder.map((id, index) => {
    const player = findPlayer(state, id);
    return {
      playerId: id,
      name: player?.name ?? '?',
      label: `Trop ${index + 1}`,
      clue: result?.clues[id] ?? round.submissions[id] ?? MISSING_CLUE,
      voteCount: result?.voteCounts[id] ?? 0,
      delta: result?.deltas[id] ?? 0,
      score: player?.score ?? 0,
      impostor: id === round.impostorId,
    };
  });
  const impostor = findPlayer(state, round.impostorId);
  const reveal: RevealHostView = {
    ...base(state),
    phase: 'reveal',
    category: round.category,
    secret: round.secret,
    impostorName: impostor?.name ?? '?',
    caught: result?.caught ?? false,
    rows,
    connectedCount,
    canNext: connectedCount >= MIN_PLAYERS,
    nextHint:
      connectedCount >= MIN_PLAYERS
        ? 'Nowe hasło, nowy ściemniacz.'
        : phonesNeeded(MIN_PLAYERS - connectedCount),
  };
  return reveal;
}

export function playerView(state: GameState, playerId: string): PlayerView | null {
  const player = findPlayer(state, playerId);
  if (!player) return null;
  const you = { id: player.id, name: player.name, score: player.score };
  if (state.phase === 'lobby' || !state.round) {
    return {
      phase: 'lobby',
      spice: state.spice,
      you,
      players: state.players.map((item) => ({
        name: item.name,
        connected: item.connected,
        score: item.score,
      })),
      joinLocked: false,
    };
  }
  const round = state.round;
  if (!round.participantIds.includes(playerId)) {
    return {
      phase: 'waiting',
      spice: state.spice,
      roundNumber: round.number,
      you,
      message: 'Ta runda wystartowała bez ciebie. Zostajesz w pokoju i wrócisz do gry w lobby.',
    };
  }
  if (state.phase === 'submit') {
    const impostor = playerId === round.impostorId;
    return {
      phase: 'submit',
      spice: state.spice,
      roundNumber: round.number,
      category: round.category,
      role: impostor ? 'impostor' : 'citizen',
      secret: impostor ? null : round.secret,
      submitted: playerId in round.submissions,
      yourClue: round.submissions[playerId] ?? null,
      roster: round.participantIds.map((id) => {
        const item = findPlayer(state, id);
        return {
          name: item?.name ?? '?',
          submitted: id in round.submissions,
          connected: item?.connected ?? false,
        };
      }),
      deadline: state.phaseDeadline,
      you,
    };
  }
  if (state.phase === 'discuss') {
    return {
      phase: 'discuss',
      spice: state.spice,
      roundNumber: round.number,
      category: round.category,
      clues: cluesOf(round),
      deadline: state.phaseDeadline,
      you,
    };
  }
  if (state.phase === 'vote') {
    return {
      phase: 'vote',
      spice: state.spice,
      roundNumber: round.number,
      category: round.category,
      clues: cluesOf(round),
      candidates: round.participantIds
        .filter((id) => id !== playerId)
        .map((id) => ({ id, name: findPlayer(state, id)?.name ?? '?' })),
      yourVote: round.votes[playerId] ?? null,
      deadline: state.phaseDeadline,
      you,
    };
  }
  const result = state.lastResult;
  return {
    phase: 'reveal',
    spice: state.spice,
    roundNumber: round.number,
    category: round.category,
    secret: round.secret,
    impostorName: findPlayer(state, round.impostorId)?.name ?? '?',
    youAreImpostor: playerId === round.impostorId,
    caught: result?.caught ?? false,
    yourDelta: result?.deltas[playerId] ?? 0,
    yourScore: player.score,
    you,
    rows: round.clueOrder.map((id, index) => ({
      name: findPlayer(state, id)?.name ?? '?',
      label: `Trop ${index + 1}`,
      clue: result?.clues[id] ?? MISSING_CLUE,
      voteCount: result?.voteCounts[id] ?? 0,
      delta: result?.deltas[id] ?? 0,
      score: findPlayer(state, id)?.score ?? 0,
      impostor: id === round.impostorId,
      yourVote: result?.votes[playerId] === id,
    })),
  };
}

export function viewsForPlayers(state: GameState): { playerId: string; view: PlayerView }[] {
  return state.players.flatMap((player) => {
    const view = playerView(state, player.id);
    return view ? [{ playerId: player.id, view }] : [];
  });
}
