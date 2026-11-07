import Peer, { type DataConnection } from 'peerjs';
import type { PlayerView } from '../game/types';
import { hostPeerId, isRoomCode } from '../game/validate';
import { PEER_OPTIONS } from './config';
import { parseServerMessage, payloadTooLarge } from './protocol';

const STORAGE_KEY = 'kto-sciemnia-player';

export interface StoredSession {
  room: string;
  playerId: string;
  token: string;
  name: string;
}

export function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredSession>;
    if (!data.room || !data.playerId || !data.token || !data.name) return null;
    if (!isRoomCode(data.room)) return null;
    return { room: data.room, playerId: data.playerId, token: data.token, name: data.name };
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export interface PlayerHooks {
  onView: (view: PlayerView, deadline: number | null) => void;
  onError: (message: string, code: string) => void;
  onStatus: (text: string) => void;
  onBye: (message: string) => void;
}

const STOP_CODES = new Set(['bad-token', 'locked', 'duplicate-name', 'full', 'bad-name', 'version']);

export class PlayerClient {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private generation = 0;
  private welcomed = false;
  private stopped = false;
  private attempt = 0;
  private retrying = false;
  private room = '';
  private name = '';
  private playerId = '';
  private token = '';
  private mode: 'join' | 'rejoin' = 'join';
  private pingTimer = 0;
  private lastPong = 0;
  private connectTimer = 0;

  constructor(private readonly hooks: PlayerHooks) {}

  join(room: string, name: string): void {
    this.room = room;
    this.name = name;
    this.mode = 'join';
    this.welcomed = false;
    this.stopped = false;
    this.attempt = 0;
    this.playerId = '';
    this.token = '';
    this.connect();
  }

  rejoin(session: StoredSession): void {
    this.room = session.room;
    this.name = session.name;
    this.playerId = session.playerId;
    this.token = session.token;
    this.mode = 'rejoin';
    this.welcomed = true;
    this.stopped = false;
    this.attempt = 0;
    this.connect();
  }

  sendClue(text: string): void {
    this.send({ t: 'clue', text });
  }

  sendVote(targetId: string): void {
    this.send({ t: 'vote', targetId });
  }

  leave(): void {
    this.send({ t: 'leave' });
    this.stopped = true;
    clearSession();
    this.cleanup();
  }

  destroy(): void {
    this.stopped = true;
    this.cleanup();
  }

  private connect(): void {
    const gen = ++this.generation;
    this.cleanup();
    this.hooks.onStatus(this.mode === 'rejoin' ? 'Wracam do pokoju…' : 'Łączenie…');
    const peer = new Peer(PEER_OPTIONS);
    this.peer = peer;
    peer.on('open', () => {
      if (gen !== this.generation) return;
      const conn = peer.connect(hostPeerId(this.room), { reliable: true, serialization: 'json' });
      this.conn = conn;
      this.connectTimer = window.setTimeout(() => {
        if (gen !== this.generation || this.welcomed) return;
        this.fail('timeout');
      }, 12_000);
      conn.on('open', () => {
        if (gen !== this.generation) return;
        if (this.mode === 'join') this.send({ t: 'join', name: this.name });
        else this.send({ t: 'rejoin', playerId: this.playerId, token: this.token });
      });
      conn.on('data', (data) => this.onData(data, gen));
      conn.on('close', () => this.onClose(gen));
      conn.on('error', () => this.onClose(gen));
    });
    peer.on('error', (error) => {
      if (gen !== this.generation || this.stopped) return;
      if (!this.welcomed) {
        this.fail(error.type === 'peer-unavailable' ? 'no-room' : error.type === 'network' ? 'network' : 'network');
        return;
      }
      this.onClose(gen);
    });
  }

  private onData(data: unknown, gen: number): void {
    if (gen !== this.generation) return;
    this.lastPong = Date.now();
    if (payloadTooLarge(data)) {
      this.hooks.onError('Wiadomość od hosta była za duża.', 'bad-message');
      return;
    }
    const parsed = parseServerMessage(data);
    if (!parsed.ok) {
      if (!this.welcomed) this.fail(parsed.error);
      else this.hooks.onError('Nie rozumiem stanu gry. Odśwież telefon.', parsed.error);
      return;
    }
    const msg = parsed.msg;
    if (msg.t === 'pong') return;
    if (msg.t === 'bye') {
      this.stopped = true;
      clearSession();
      this.cleanup();
      this.hooks.onBye(msg.message);
      return;
    }
    if (msg.t === 'err') {
      if (!this.welcomed || STOP_CODES.has(msg.code)) {
        if (STOP_CODES.has(msg.code)) clearSession();
        this.fail(msg.code, msg.message);
        return;
      }
      this.hooks.onError(msg.message, msg.code);
      return;
    }
    if (msg.t === 'hello') {
      window.clearTimeout(this.connectTimer);
      this.welcomed = true;
      this.attempt = 0;
      this.playerId = msg.playerId;
      this.token = msg.token;
      this.mode = 'rejoin';
      saveSession({ room: this.room, playerId: msg.playerId, token: msg.token, name: msg.view.you.name });
      this.startPing(gen);
      this.hooks.onView(msg.view, localDeadline(msg.view, msg.now));
      return;
    }
    this.hooks.onView(msg.view, localDeadline(msg.view, msg.now));
  }

  private onClose(gen: number): void {
    if (gen !== this.generation || this.stopped || this.retrying) return;
    window.clearTimeout(this.connectTimer);
    if (!this.welcomed) return;
    this.attempt += 1;
    if (this.attempt > 6) {
      this.hooks.onError('Połączenie padło. Możesz spróbować wrócić.', 'dropped');
      return;
    }
    this.retrying = true;
    this.hooks.onStatus('Chwila, łączę ponownie…');
    window.setTimeout(() => {
      this.retrying = false;
      if (gen !== this.generation || this.stopped) return;
      this.mode = 'rejoin';
      this.connect();
    }, Math.min(5000, 400 * this.attempt));
  }

  private fail(code: string, message?: string): void {
    this.stopped = true;
    this.cleanup();
    this.hooks.onError(message || fallback(code), code);
  }

  private startPing(gen: number): void {
    window.clearInterval(this.pingTimer);
    this.lastPong = Date.now();
    this.pingTimer = window.setInterval(() => {
      if (gen !== this.generation || this.stopped) return;
      if (Date.now() - this.lastPong > 12_000) {
        this.conn?.close();
        return;
      }
      this.send({ t: 'ping' });
    }, 4000);
  }

  private send(message: { t: string; [key: string]: unknown }): void {
    try {
      this.conn?.send({ v: 1, ...message });
    } catch {
      /* socket already gone */
    }
  }

  private cleanup(): void {
    window.clearTimeout(this.connectTimer);
    window.clearInterval(this.pingTimer);
    try {
      this.conn?.close();
    } catch {
      /* ignore */
    }
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.conn = null;
    this.peer = null;
  }
}

function localDeadline(view: PlayerView, hostNow: number): number | null {
  const deadline = 'deadline' in view ? view.deadline : null;
  if (deadline == null) return null;
  return Date.now() + (deadline - hostNow);
}

function fallback(code: string): string {
  if (code === 'timeout') return 'Pokój nie odpowiada. Sprawdź kod, Wi-Fi i czy ekran jest włączony.';
  if (code === 'no-room') return 'Nie ma pokoju z tym kodem. Sprawdź kod i czy ekran dalej działa.';
  if (code === 'network') return 'Serwer sygnałowy nie odpowiada. Spróbuj jeszcze raz za chwilę.';
  if (code === 'version') return 'Odśwież stronę — telefon i ekran mają inną wersję gry.';
  return 'Połączenie nie wyszło. Spróbuj jeszcze raz.';
}
