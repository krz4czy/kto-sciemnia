import Peer, { type DataConnection } from 'peerjs';
import { errorMessage } from '../copy';
import {
  addPlayer,
  advanceFromDiscuss,
  advanceFromSubmit,
  advanceFromVote,
  castVote,
  createGame,
  disconnect,
  playerView,
  reconnect,
  removePlayer,
  resetMatch,
  returnToLobby,
  setSpice,
  startRound,
  submitClue,
  tick,
} from '../game/logic';
import type { GameError, GameState, Result, Spice, Timings } from '../game/types';
import { hostPeerId, randomId, randomRoomCode, takeToken, type Bucket } from '../game/validate';
import { PEER_OPTIONS } from './config';
import { parseClientMessage, payloadTooLarge, type ClientMessage, type ServerMessage } from './protocol';

export interface HostHooks {
  onChange: () => void;
  onStatus: (text: string) => void;
  onFatal: (message: string) => void;
}

export class HostRoom {
  code = '';
  state: GameState;
  signal: 'łączenie' | 'otwarty' | 'problem' = 'łączenie';
  private peer: Peer | null = null;
  private readonly playerConn = new Map<string, DataConnection>();
  private readonly connPlayer = new Map<DataConnection, string>();
  private readonly buckets = new Map<DataConnection, Bucket>();
  private readonly kicks = new Map<string, number>();
  private timer = 0;
  private closing = false;
  private opened = false;

  constructor(
    private readonly hooks: HostHooks,
    spice: Spice,
    timings?: Partial<Timings>,
  ) {
    this.state = createGame({ spice, timings });
  }

  async open(): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = randomRoomCode();
      try {
        await this.bind(code);
        this.code = code;
        this.opened = true;
        this.signal = 'otwarty';
        this.timer = window.setInterval(() => this.pulse(), 250);
        this.hooks.onChange();
        return;
      } catch (error) {
        if (error !== 'unavailable-id') throw error;
        this.hooks.onStatus(errorMessage('unavailable-id'));
      }
    }
    throw new Error('no-code');
  }

  setSpice(spice: Spice): string | null {
    return this.commit((state) => setSpice(state, spice));
  }

  start(): string | null {
    return this.commit((state) => startRound(state, { now: Date.now(), rng: Math.random }));
  }

  showClues(): string | null {
    return this.commit((state) => advanceFromSubmit(state, Date.now()));
  }

  toVote(): string | null {
    return this.commit((state) => advanceFromDiscuss(state, Date.now()));
  }

  closeVote(): string | null {
    return this.commit((state) => advanceFromVote(state, Date.now()));
  }

  nextRound(): string | null {
    return this.commit((state) => startRound(state, { now: Date.now(), rng: Math.random }));
  }

  toLobby(): string | null {
    return this.commit((state) => returnToLobby(state));
  }

  resetScores(): string | null {
    return this.commit((state) => resetMatch(state));
  }

  kick(playerId: string): string | null {
    return this.commit((state) => removePlayer(state, playerId));
  }

  shutdown(): void {
    if (this.closing) return;
    this.closing = true;
    const now = Date.now();
    for (const conn of this.playerConn.values()) {
      this.send(conn, { t: 'bye', now, message: 'Host zamknął pokój. Gra skończona.' });
    }
    window.clearInterval(this.timer);
    for (const kick of this.kicks.values()) window.clearTimeout(kick);
    window.setTimeout(() => {
      this.peer?.destroy();
      this.peer = null;
    }, 500);
  }

  private commit(mutator: (state: GameState) => Result<GameState>): string | null {
    const result = mutator(this.state);
    if (!result.ok) return errorMessage(result.error);
    this.state = result.value;
    this.afterChange();
    return null;
  }

  private bind(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(hostPeerId(code), PEER_OPTIONS);
      this.peer = peer;
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        if (this.peer === peer) peer.destroy();
        reject('timeout');
      }, 12_000);
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        action();
      };
      peer.on('open', () => {
        this.code = code;
        finish(() => resolve());
      });
      peer.on('error', (error) => {
        if (!this.opened && !settled) {
          peer.destroy();
          finish(() => reject(error.type === 'unavailable-id' ? 'unavailable-id' : error.type));
          return;
        }
        this.signal = 'problem';
        this.hooks.onStatus(errorMessage(error.type));
        if (peer.destroyed && !this.closing) {
          this.hooks.onFatal('Połączenie z serwerem sygnałowym padło. Otwórz pokój ponownie.');
        }
      });
      peer.on('connection', (conn) => this.attach(conn));
      peer.on('disconnected', () => {
        this.hooks.onStatus('Sygnał miga. Zostaję przy tym kodzie…');
        if (!peer.destroyed) {
          try {
            peer.reconnect();
          } catch {
            /* the broker reports a follow-up error if reconnect fails */
          }
        }
      });
      peer.on('close', () => {
        if (!this.closing && this.opened) this.hooks.onFatal('Pokój się zamknął. Otwórz nowy kod.');
      });
    });
  }

  private attach(conn: DataConnection): void {
    conn.on('data', (data) => {
      if (payloadTooLarge(data)) {
        this.reject(conn, 'bad-message');
        return;
      }
      const parsed = parseClientMessage(data);
      if (!parsed.ok) {
        this.reject(conn, parsed.error);
        return;
      }
      this.onMessage(conn, parsed.msg);
    });
    conn.on('close', () => this.onConnClose(conn));
    conn.on('error', () => this.onConnClose(conn));
  }

  private onMessage(conn: DataConnection, msg: ClientMessage): void {
    if (msg.t !== 'ping' && !this.allow(conn)) return;
    if (msg.t === 'ping') {
      this.send(conn, { t: 'pong', now: Date.now() });
      return;
    }
    if (msg.t === 'join') {
      const result = addPlayer(this.state, { id: randomId('p'), token: randomId('k'), name: msg.name });
      if (!result.ok) {
        this.reject(conn, result.error);
        return;
      }
      this.state = result.value.state;
      this.bindConn(conn, result.value.playerId);
      const player = this.state.players.find((item) => item.id === result.value.playerId);
      if (player) this.hello(conn, player.id, player.token);
      this.afterChange();
      return;
    }
    if (msg.t === 'rejoin') {
      const result = reconnect(this.state, msg.playerId, msg.token);
      if (!result.ok) {
        this.reject(conn, result.error);
        return;
      }
      this.state = result.value;
      this.bindConn(conn, msg.playerId);
      const player = this.state.players.find((item) => item.id === msg.playerId);
      if (player) this.hello(conn, player.id, player.token);
      this.afterChange();
      return;
    }
    const playerId = this.connPlayer.get(conn);
    if (!playerId) {
      this.reject(conn, 'bad-message');
      return;
    }
    if (msg.t === 'clue') {
      const result = submitClue(this.state, playerId, msg.text);
      if (!result.ok) {
        this.softError(conn, result.error);
        return;
      }
      this.state = result.value;
      this.afterChange();
      return;
    }
    if (msg.t === 'vote') {
      const result = castVote(this.state, playerId, msg.targetId);
      if (!result.ok) {
        this.softError(conn, result.error);
        return;
      }
      this.state = result.value;
      this.afterChange();
      return;
    }
    if (msg.t === 'leave') {
      if (this.state.phase === 'lobby') {
        const removed = removePlayer(this.state, playerId);
        if (removed.ok) this.state = removed.value;
      } else {
        this.state = disconnect(this.state, playerId);
      }
      this.connPlayer.delete(conn);
      this.playerConn.delete(playerId);
      try {
        conn.close();
      } catch {
        /* already closing */
      }
      this.afterChange();
    }
  }

  private bindConn(conn: DataConnection, playerId: string): void {
    const previous = this.playerConn.get(playerId);
    this.playerConn.set(playerId, conn);
    this.connPlayer.set(conn, playerId);
    this.clearKick(playerId);
    if (previous && previous !== conn) {
      this.connPlayer.delete(previous);
      try {
        previous.close();
      } catch {
        /* replaced socket */
      }
    }
  }

  private onConnClose(conn: DataConnection): void {
    this.buckets.delete(conn);
    const playerId = this.connPlayer.get(conn);
    if (!playerId) return;
    if (this.playerConn.get(playerId) !== conn) return;
    this.playerConn.delete(playerId);
    this.connPlayer.delete(conn);
    this.state = disconnect(this.state, playerId);
    this.afterChange();
  }

  private allow(conn: DataConnection): boolean {
    const now = Date.now();
    const current = this.buckets.get(conn) ?? { tokens: 10, updatedAt: now };
    const result = takeToken(current, now, 1);
    this.buckets.set(conn, result.bucket);
    if (!result.ok) {
      this.softError(conn, 'rate');
      return false;
    }
    return true;
  }

  private hello(conn: DataConnection, playerId: string, token: string): void {
    const view = playerView(this.state, playerId);
    if (!view) return;
    this.send(conn, { t: 'hello', now: Date.now(), playerId, token, view });
  }

  private broadcast(): void {
    const now = Date.now();
    for (const [playerId, conn] of this.playerConn) {
      const view = playerView(this.state, playerId);
      if (!view) continue;
      this.send(conn, { t: 'view', now, view });
    }
  }

  private send(conn: DataConnection, message: ServerMessage): void {
    try {
      conn.send({ v: 1, ...message });
    } catch {
      /* socket already gone */
    }
  }

  private softError(conn: DataConnection, code: GameError | string): void {
    this.send(conn, { t: 'err', now: Date.now(), code, message: errorMessage(code) });
  }

  private reject(conn: DataConnection, code: GameError | string): void {
    this.softError(conn, code);
    window.setTimeout(() => {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
    }, 300);
  }

  private afterChange(): void {
    this.state = tick(this.state, Date.now());
    this.broadcast();
    this.syncKicks();
    this.hooks.onChange();
  }

  private pulse(): void {
    const next = tick(this.state, Date.now());
    const changed = next !== this.state;
    this.state = next;
    if (changed) {
      this.broadcast();
      this.syncKicks();
    }
    this.hooks.onChange();
  }

  private syncKicks(): void {
    for (const id of [...this.kicks.keys()]) {
      if (!this.state.players.some((player) => player.id === id)) this.clearKick(id);
    }
    if (this.state.phase !== 'lobby') return;
    for (const player of this.state.players) {
      if (player.connected) this.clearKick(player.id);
      else this.scheduleKick(player.id);
    }
  }

  private scheduleKick(id: string): void {
    if (this.kicks.has(id)) return;
    const timer = window.setTimeout(() => {
      this.kicks.delete(id);
      if (this.state.phase !== 'lobby') return;
      const player = this.state.players.find((item) => item.id === id);
      if (!player || player.connected) return;
      const removed = removePlayer(this.state, id);
      if (!removed.ok) return;
      this.state = removed.value;
      this.afterChange();
    }, 20_000);
    this.kicks.set(id, timer);
  }

  private clearKick(id: string): void {
    const timer = this.kicks.get(id);
    if (timer == null) return;
    window.clearTimeout(timer);
    this.kicks.delete(id);
  }
}
