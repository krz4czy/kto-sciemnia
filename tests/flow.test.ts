import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  advanceFromDiscuss,
  advanceFromSubmit,
  advanceFromVote,
  beginRound,
  castVote,
  createGame,
  disconnect,
  reconnect,
  removePlayer,
  resetMatch,
  returnToLobby,
  setSpice,
  startRound,
  submitClue,
  tick,
} from '../src/game/logic';
import { MISSING_CLUE, type GameState, type PromptCard } from '../src/game/types';

const prompt: PromptCard = {
  id: 'card-1',
  spice: 'mild',
  category: 'Test',
  secret: 'SEKRET-UNIKALNY-XYZ',
};

function room(names: string[], spice: 'mild' | 'spicy' = 'mild'): GameState {
  let state = createGame({ spice, timings: { submitMs: 5_000, discussMs: 5_000, voteMs: 5_000 } });
  names.forEach((name, index) => {
    const added = addPlayer(state, { id: `p${index}`, token: `token-${index}`, name });
    if (!added.ok) throw new Error(added.error);
    state = added.value.state;
  });
  return state;
}

describe('lobby and rounds', () => {
  it('rejects a short table, duplicate names, a full room and joins after the lock', () => {
    let state = room(['Ala', 'Bartek']);
    expect(startRound(state, { now: 1, rng: () => 0 }).ok).toBe(false);
    const duplicate = addPlayer(state, { id: 'x', token: 'y', name: 'ala' });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error).toBe('duplicate-name');

    const polish = addPlayer(room(['Żaneta']), { id: 'z', token: 'z', name: 'żaneta' });
    expect(polish.ok).toBe(false);

    state = room(['Ala', 'Bartek', 'Celina']);
    const started = startRound(state, { now: 1_000, rng: () => 0 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(addPlayer(started.value, { id: 'n', token: 'n', name: 'Nowy' }).ok).toBe(false);
    expect(setSpice(started.value, 'spicy').ok).toBe(false);
    expect(removePlayer(started.value, 'p0').ok).toBe(false);
  });

  it('drops disconnected lobby players when the round starts and refuses their old token', () => {
    let state = room(['Ala', 'Bartek', 'Celina', 'Darek']);
    state = disconnect(state, 'p3');
    const started = startRound(state, { now: 1_000, rng: () => 0 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.players.map((player) => player.id)).toEqual(['p0', 'p1', 'p2']);
    expect(reconnect(started.value, 'p3', 'token-3').ok).toBe(false);
  });

  it('fills a room of ten and refuses the eleventh', () => {
    const names = Array.from({ length: 10 }, (_, index) => `Osoba${index}`);
    const state = room(names);
    expect(state.players).toHaveLength(10);
    expect(addPlayer(state, { id: 'extra', token: 'extra', name: 'OsobaX' }).ok).toBe(false);
  });

  it('keeps a disconnected participant in the round and lets them rejoin', () => {
    let state = room(['Ala', 'Bartek', 'Celina']);
    const started = beginRound(state, {
      now: 1_000,
      prompt,
      impostorId: 'p1',
      clueOrder: ['p2', 'p0', 'p1'],
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    state = disconnect(started.value, 'p0');
    expect(state.players.find((player) => player.id === 'p0')?.connected).toBe(false);
    expect(state.round?.participantIds).toContain('p0');
    const back = reconnect(state, 'p0', 'token-0');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.players.find((player) => player.id === 'p0')?.connected).toBe(true);
    expect(reconnect(state, 'p0', 'nope').ok).toBe(false);
  });

  it('replaces a clue, shows a placeholder for silence, and moves on a timeout', () => {
    let state = room(['Ala', 'Bartek', 'Celina']);
    const started = beginRound(state, {
      now: 1_000,
      prompt,
      impostorId: 'p0',
      clueOrder: ['p0', 'p1', 'p2'],
    });
    if (!started.ok) throw new Error('start');
    state = started.value;
    expect(tick(state, 5_999)).toBe(state);
    const first = submitClue(state, 'p1', '  pierwsza\nwersja  ');
    if (!first.ok) throw new Error(first.error);
    const second = submitClue(first.value, 'p1', 'ostateczny trop');
    if (!second.ok) throw new Error(second.error);
    expect(second.value.round?.submissions.p1).toBe('ostateczny trop');
    expect(submitClue(second.value, 'p1', '   ').ok).toBe(false);
    const discussed = tick(second.value, 6_000);
    expect(discussed.phase).toBe('discuss');
    expect(discussed.round?.submissions.p0).toBeUndefined();
    const clues = discussed.round?.clueOrder.map((id) => discussed.round?.submissions[id] ?? MISSING_CLUE);
    expect(clues).toEqual([MISSING_CLUE, 'ostateczny trop', MISSING_CLUE]);
  });

  it('auto-advances when every clue is in and when every connected player has voted', () => {
    let state = room(['Ala', 'Bartek', 'Celina']);
    const started = beginRound(state, {
      now: 1_000,
      prompt,
      impostorId: 'p2',
      clueOrder: ['p2', 'p1', 'p0'],
    });
    if (!started.ok) throw new Error('start');
    state = started.value;
    for (const id of ['p0', 'p1', 'p2']) {
      const sent = submitClue(state, id, `trop ${id}`);
      if (!sent.ok) throw new Error(sent.error);
      state = sent.value;
    }
    state = tick(state, 1_100);
    expect(state.phase).toBe('discuss');
    const voting = advanceFromDiscuss(state, 2_000);
    if (!voting.ok) throw new Error(voting.error);
    state = disconnect(voting.value, 'p0');
    const voteA = castVote(state, 'p1', 'p2');
    if (!voteA.ok) throw new Error(voteA.error);
    state = voteA.value;
    expect(tick(state, 2_100).phase).toBe('vote');
    const voteB = castVote(state, 'p2', 'p1');
    if (!voteB.ok) throw new Error(voteB.error);
    state = tick(voteB.value, 2_100);
    expect(state.phase).toBe('reveal');
    expect(state.lastResult?.caught).toBe(false);
    expect(state.players.find((player) => player.id === 'p1')?.score).toBe(1);
    expect(state.players.find((player) => player.id === 'p2')?.score).toBe(3);
    expect(state.players.find((player) => player.id === 'p0')?.score).toBe(0);
  });

  it('rejects a self vote, keeps the latest vote, and aborts without paying points', () => {
    let state = room(['Ala', 'Bartek', 'Celina']);
    const started = beginRound(state, {
      now: 1_000,
      prompt,
      impostorId: 'p0',
      clueOrder: ['p1', 'p0', 'p2'],
    });
    if (!started.ok) throw new Error('start');
    const submitted = advanceFromSubmit(started.value, 2_000);
    if (!submitted.ok) throw new Error(submitted.error);
    const toVote = advanceFromDiscuss(submitted.value, 3_000);
    if (!toVote.ok) throw new Error(toVote.error);
    state = toVote.value;
    expect(castVote(state, 'p0', 'p0').ok).toBe(false);
    const wrong = castVote(state, 'p1', 'p0');
    if (!wrong.ok) throw new Error(wrong.error);
    const changed = castVote(wrong.value, 'p1', 'p2');
    if (!changed.ok) throw new Error(changed.error);
    expect(changed.value.round?.votes.p1).toBe('p2');
    const scores = changed.value.players.map((player) => player.score);
    const aborted = returnToLobby(changed.value);
    expect(aborted.ok).toBe(true);
    if (!aborted.ok) return;
    expect(aborted.value.phase).toBe('lobby');
    expect(aborted.value.round).toBeNull();
    expect(JSON.stringify(aborted.value)).not.toContain(prompt.secret);
    expect(aborted.value.players.map((player) => player.score)).toEqual(scores);
  });

  it('carries scores into the next round and can reset them in the lobby', () => {
    let state = room(['Ala', 'Bartek', 'Celina']);
    const started = beginRound(state, {
      now: 1_000,
      prompt,
      impostorId: 'p0',
      clueOrder: ['p0', 'p1', 'p2'],
    });
    if (!started.ok) throw new Error('start');
    const submitted = advanceFromSubmit(started.value, 1_000);
    if (!submitted.ok) throw new Error(submitted.error);
    const discussed = advanceFromDiscuss(submitted.value, 1_000);
    if (!discussed.ok) throw new Error(discussed.error);
    state = discussed.value;
    const voted = ['p1', 'p2'].reduce((current, id) => {
      const cast = castVote(current, id, 'p0');
      if (!cast.ok) throw new Error(cast.error);
      return cast.value;
    }, state);
    const reveal = advanceFromVote(voted, 2_000);
    if (!reveal.ok) throw new Error(reveal.error);
    expect(reveal.value.players.find((player) => player.id === 'p1')?.score).toBe(2);
    const next = startRound(reveal.value, {
      now: 3_000,
      rng: () => 0.99,
      prompts: [prompt, { ...prompt, id: 'card-2', secret: 'inne hasło' }],
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.value.phase).toBe('submit');
    expect(next.value.round?.number).toBe(2);
    expect(next.value.players.find((player) => player.id === 'p1')?.score).toBe(2);
    expect(next.value.round?.secret).not.toBe(prompt.secret);
    const lobby = returnToLobby(next.value);
    if (!lobby.ok) throw new Error(lobby.error);
    const reset = resetMatch(lobby.value);
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.value.players.every((player) => player.score === 0)).toBe(true);
    expect(reset.value.roundsPlayed).toBe(0);
  });
});
