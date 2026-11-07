export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const NAME_MIN = 2;
export const NAME_MAX = 16;
export const CLUE_MAX = 80;
export const SECRET_MAX = 140;
export const CATEGORY_MAX = 32;

export const POINTS = {
  voteCaught: 2,
  impostorCaught: 0,
  impostorEscaped: 3,
  voteEscaped: 1,
} as const;

export interface Timings {
  submitMs: number;
  discussMs: number;
  voteMs: number;
}

export const DEFAULT_TIMINGS: Timings = {
  submitMs: 60_000,
  discussMs: 75_000,
  voteMs: 40_000,
};

export type Spice = 'mild' | 'spicy';
export type Phase = 'lobby' | 'submit' | 'discuss' | 'vote' | 'reveal';

export type GameError =
  | 'locked'
  | 'full'
  | 'duplicate-name'
  | 'bad-name'
  | 'bad-clue'
  | 'not-participant'
  | 'not-in-phase'
  | 'self-vote'
  | 'bad-target'
  | 'need-players'
  | 'bad-token'
  | 'no-such-player'
  | 'spice-locked'
  | 'bad-prompt';

export type Result<T> = { ok: true; value: T } | { ok: false; error: GameError };

export interface PromptCard {
  id: string;
  spice: Spice;
  category: string;
  secret: string;
}

export interface Player {
  id: string;
  token: string;
  name: string;
  score: number;
  connected: boolean;
}

export interface Round {
  number: number;
  spice: Spice;
  promptId: string;
  category: string;
  secret: string;
  impostorId: string;
  participantIds: string[];
  submissions: Record<string, string>;
  votes: Record<string, string>;
  clueOrder: string[];
}

export interface LastResult {
  roundNumber: number;
  category: string;
  secret: string;
  impostorId: string;
  caught: boolean;
  clues: Record<string, string>;
  votes: Record<string, string>;
  voteCounts: Record<string, number>;
  deltas: Record<string, number>;
}

export interface GameState {
  phase: Phase;
  spice: Spice;
  players: Player[];
  round: Round | null;
  usedPromptIds: string[];
  roundsPlayed: number;
  lastResult: LastResult | null;
  phaseDeadline: number | null;
  timings: Timings;
}

export interface ScoreboardEntry {
  id: string;
  name: string;
  score: number;
  connected: boolean;
}

export interface AnonymousClue {
  label: string;
  text: string;
}

export interface RevealRow {
  playerId: string;
  name: string;
  label: string;
  clue: string;
  voteCount: number;
  delta: number;
  score: number;
  impostor: boolean;
}

interface ViewBase {
  spice: Spice;
  scoreboard: ScoreboardEntry[];
  roundNumber: number | null;
  joinLocked: boolean;
}

export interface LobbyHostView extends ViewBase {
  phase: 'lobby';
  canStart: boolean;
  startHint: string;
  connectedCount: number;
}

export interface SubmitHostView extends ViewBase {
  phase: 'submit';
  category: string;
  deadline: number | null;
  roster: { name: string; submitted: boolean; connected: boolean }[];
  connectedInRound: number;
}

export interface DiscussHostView extends ViewBase {
  phase: 'discuss';
  category: string;
  deadline: number | null;
  clues: AnonymousClue[];
  connectedInRound: number;
}

export interface VoteHostView extends ViewBase {
  phase: 'vote';
  category: string;
  deadline: number | null;
  clues: AnonymousClue[];
  votesIn: number;
  votesExpected: number;
  connectedInRound: number;
}

export interface RevealHostView extends ViewBase {
  phase: 'reveal';
  category: string;
  secret: string;
  impostorName: string;
  caught: boolean;
  rows: RevealRow[];
  connectedCount: number;
  canNext: boolean;
  nextHint: string;
}

export type HostView =
  | LobbyHostView
  | SubmitHostView
  | DiscussHostView
  | VoteHostView
  | RevealHostView;

export interface PlayerSelf {
  id: string;
  name: string;
  score: number;
}

export interface LobbyPlayerView {
  phase: 'lobby';
  spice: Spice;
  you: PlayerSelf;
  players: { name: string; connected: boolean; score: number }[];
  joinLocked: false;
}

export interface SubmitPlayerView {
  phase: 'submit';
  spice: Spice;
  roundNumber: number;
  category: string;
  role: 'citizen' | 'impostor';
  secret: string | null;
  submitted: boolean;
  yourClue: string | null;
  roster: { name: string; submitted: boolean; connected: boolean }[];
  deadline: number | null;
  you: PlayerSelf;
}

export interface DiscussPlayerView {
  phase: 'discuss';
  spice: Spice;
  roundNumber: number;
  category: string;
  clues: AnonymousClue[];
  deadline: number | null;
  you: PlayerSelf;
}

export interface VotePlayerView {
  phase: 'vote';
  spice: Spice;
  roundNumber: number;
  category: string;
  clues: AnonymousClue[];
  candidates: { id: string; name: string }[];
  yourVote: string | null;
  deadline: number | null;
  you: PlayerSelf;
}

export interface RevealPlayerView {
  phase: 'reveal';
  spice: Spice;
  roundNumber: number;
  category: string;
  secret: string;
  impostorName: string;
  youAreImpostor: boolean;
  caught: boolean;
  yourDelta: number;
  yourScore: number;
  you: PlayerSelf;
  rows: {
    name: string;
    label: string;
    clue: string;
    voteCount: number;
    delta: number;
    score: number;
    impostor: boolean;
    yourVote: boolean;
  }[];
}

export interface WaitingPlayerView {
  phase: 'waiting';
  spice: Spice;
  roundNumber: number;
  you: PlayerSelf;
  message: string;
}

export type PlayerView =
  | LobbyPlayerView
  | SubmitPlayerView
  | DiscussPlayerView
  | VotePlayerView
  | RevealPlayerView
  | WaitingPlayerView;

export const MISSING_CLUE = '— brak tropu —';
