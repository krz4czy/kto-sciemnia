import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  advanceFromDiscuss,
  advanceFromSubmit,
  advanceFromVote,
  beginRound,
  castVote,
  createGame,
  hostView,
  playerView,
  submitClue,
  viewsForPlayers,
} from '../src/game/logic';
import type { PromptCard } from '../src/game/types';
import { parsePlayerView } from '../src/net/protocol';

const prompt: PromptCard = {
  id: 'card-1',
  spice: 'mild',
  category: 'Testowa',
  secret: 'SEKRET-UNIKALNY-XYZ',
};

function started() {
  let state = createGame();
  for (const [index, name] of ['Ala', 'Bartek', 'Celina'].entries()) {
    const added = addPlayer(state, { id: `p${index}`, token: `TOKENSPECIAL${index}`, name });
    if (!added.ok) throw new Error(added.error);
    state = added.value.state;
  }
  const round = beginRound(state, {
    now: 5_000,
    prompt,
    impostorId: 'p1',
    clueOrder: ['p2', 'p0', 'p1'],
  });
  if (!round.ok) throw new Error(round.error);
  return round.value;
}

describe('secret views', () => {
  it('does not give the secret or the impostor identity away before the reveal', () => {
    let state = started();
    const impostor = playerView(state, 'p1');
    const citizen = playerView(state, 'p0');
    const host = hostView(state);
    expect(impostor?.phase).toBe('submit');
    expect(citizen?.phase).toBe('submit');
    if (impostor?.phase !== 'submit' || citizen?.phase !== 'submit' || host.phase !== 'submit') return;
    expect(impostor.role).toBe('impostor');
    expect(impostor.secret).toBeNull();
    expect(citizen.role).toBe('citizen');
    expect(citizen.secret).toBe(prompt.secret);
    expect(JSON.stringify(impostor)).not.toContain(prompt.secret);
    expect(JSON.stringify(host)).not.toContain(prompt.secret);
    expect(JSON.stringify(citizen)).not.toContain('p1');
    expect(host.roster.map((row) => row.name)).toEqual(['Ala', 'Bartek', 'Celina']);

    const clue = submitClue(state, 'p0', 'UNIKALNY-TROP-77');
    if (!clue.ok) throw new Error(clue.error);
    state = clue.value;
    expect(JSON.stringify(hostView(state))).not.toContain('UNIKALNY-TROP-77');
    expect(JSON.stringify(playerView(state, 'p1'))).not.toContain('UNIKALNY-TROP-77');

    const packets = viewsForPlayers(state);
    const imp = packets.find((packet) => packet.playerId === 'p1');
    const cit = packets.find((packet) => packet.playerId === 'p0');
    expect(JSON.stringify(imp?.view)).not.toContain(prompt.secret);
    expect(JSON.stringify(cit?.view)).toContain(prompt.secret);
    expect(imp?.view).not.toEqual(cit?.view);
    for (const packet of packets) expect(JSON.stringify(packet.view)).not.toContain('TOKENSPECIAL');
  });

  it('publishes anonymous clues before the reveal and the secret only after it', () => {
    let state = started();
    for (const [id, text] of [['p0', 'cichy znak'], ['p1', 'ogólna mgła'], ['p2', 'puste tło']] as const) {
      const sent = submitClue(state, id, text);
      if (!sent.ok) throw new Error(sent.error);
      state = sent.value;
    }
    const discussed = advanceFromSubmit(state, 6_000);
    if (!discussed.ok) throw new Error(discussed.error);
    state = discussed.value;
    const host = hostView(state);
    const phone = playerView(state, 'p0');
    expect(host.phase).toBe('discuss');
    expect(phone?.phase).toBe('discuss');
    if (host.phase !== 'discuss' || phone?.phase !== 'discuss') return;
    expect(host.clues.map((clue) => clue.text)).toEqual(['puste tło', 'cichy znak', 'ogólna mgła']);
    expect(JSON.stringify(host.clues)).not.toContain('Ala');
    expect(JSON.stringify(host)).not.toContain(prompt.secret);
    expect(JSON.stringify(phone)).not.toContain(prompt.secret);
    expect(phone.clues).toEqual(host.clues);

    const voting = advanceFromDiscuss(state, 7_000);
    if (!voting.ok) throw new Error(voting.error);
    const voteHost = hostView(voting.value);
    expect(voteHost.phase).toBe('vote');
    if (voteHost.phase !== 'vote') return;
    expect(voteHost).not.toHaveProperty('votes');
    expect(JSON.stringify(voteHost)).not.toContain(prompt.secret);
    const voter = playerView(voting.value, 'p0');
    expect(voter?.phase).toBe('vote');
    if (voter?.phase !== 'vote') return;
    expect(voter.candidates.map((candidate) => candidate.name)).toEqual(['Bartek', 'Celina']);
    expect(voter.candidates.every((candidate) => !('impostor' in candidate))).toBe(true);
  });

  it('round-trips every phone view through the network parser', () => {
    const fresh = started();
    const discussed = advanceFromSubmit(fresh, 8_000);
    if (!discussed.ok) throw new Error(discussed.error);
    const voting = advanceFromDiscuss(discussed.value, 9_000);
    if (!voting.ok) throw new Error(voting.error);
    let voted = voting.value;
    for (const [voter, target] of [['p0', 'p1'], ['p1', 'p0'], ['p2', 'p1']] as const) {
      const cast = castVote(voted, voter, target);
      if (!cast.ok) throw new Error(cast.error);
      voted = cast.value;
    }
    const reveal = advanceFromVote(voted, 10_000);
    if (!reveal.ok) throw new Error(reveal.error);
    for (const snapshot of [fresh, discussed.value, voting.value, reveal.value]) {
      for (const player of snapshot.players) {
        const view = playerView(snapshot, player.id);
        expect(parsePlayerView(JSON.parse(JSON.stringify(view)))).toEqual(view);
      }
    }
  });
});
