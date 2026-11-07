import { CITIZEN_BRIEF, CREDIT, IMPOSTOR_BRIEF, errorMessage, formatRemaining, remainingSeconds, votesLabel } from '../copy';
import type { PlayerView } from '../game/types';
import { isRoomCode, normalizeRoomInput, roomCodeError } from '../game/validate';
import { loadSession, PlayerClient, type StoredSession } from '../net/player';
import { button, field, h } from './dom';

export function mountPlayer(root: HTMLElement): () => void {
  const ui = new PlayerUI(root);
  return () => ui.destroy();
}

class PlayerUI {
  private readonly client: PlayerClient;
  private view: PlayerView | null = null;
  private deadline: number | null = null;
  private error = '';
  private status = '';
  private bye: string | null = null;
  private built = '';
  private editing = false;
  private rejoining = false;
  private room: string;
  private nick = '';
  private readonly timer: number;

  constructor(private readonly root: HTMLElement) {
    const params = new URLSearchParams(location.search);
    this.room = normalizeRoomInput(params.get('room') ?? '');
    const stored = loadSession();
    if (stored && !this.room) {
      this.room = stored.room;
      this.nick = stored.name;
    }
    this.client = new PlayerClient({
      onView: (view, deadline) => {
        if (this.view?.phase !== view.phase) this.editing = false;
        this.view = view;
        this.deadline = deadline;
        this.rejoining = false;
        this.status = '';
        this.bye = null;
        this.paint();
      },
      onError: (message) => {
        this.error = message;
        this.rejoining = false;
        this.status = '';
        if (!this.view) this.built = '';
        this.paint();
      },
      onStatus: (text) => {
        this.status = text;
        this.patch();
      },
      onBye: (message) => {
        this.bye = message;
        this.view = null;
        this.built = '';
        this.paint();
      },
    });
    if (stored && this.room === stored.room && isRoomCode(this.room)) {
      this.rejoining = true;
      this.status = 'Wracam do pokoju…';
      this.client.rejoin(stored);
    }
    this.paint();
    this.timer = window.setInterval(() => this.patch(), 250);
  }

  destroy(): void {
    window.clearInterval(this.timer);
    this.client.destroy();
  }

  private paint(): void {
    if (this.bye) {
      this.renderBye();
      return;
    }
    if (this.rejoining && !this.view) {
      this.renderWaiting();
      return;
    }
    if (!this.view) {
      if (this.built !== 'form') {
        this.built = 'form';
        this.renderForm();
      }
      this.patch();
      return;
    }
    const key = this.keyFor(this.view);
    if (key !== this.built) {
      this.built = key;
      this.renderView(this.view);
    }
    this.patch();
  }

  private keyFor(view: PlayerView): string {
    if (view.phase === 'lobby') {
      return `lobby:${view.players.map((player) => `${player.name}:${player.connected}:${player.score}`).join(',')}`;
    }
    if (view.phase === 'waiting') return `waiting:${view.roundNumber}`;
    if (view.phase === 'submit') {
      return `submit:${view.roundNumber}:${view.role}:${view.submitted ? 1 : 0}:${this.editing ? 1 : 0}`;
    }
    if (view.phase === 'discuss') return `discuss:${view.roundNumber}`;
    if (view.phase === 'vote') return `vote:${view.roundNumber}:${view.yourVote ?? ''}`;
    return `reveal:${view.roundNumber}:${view.caught}:${view.yourScore}`;
  }

  private renderForm(): void {
    const room = h('input', {
      testid: 'room-input',
      attrs: {
        maxlength: '4',
        autocapitalize: 'characters',
        autocomplete: 'off',
        spellcheck: 'false',
        inputmode: 'text',
        enterkeyhint: 'next',
      },
    });
    room.value = this.room;
    const nick = h('input', {
      testid: 'nick',
      attrs: {
        maxlength: '16',
        autocomplete: 'nickname',
        autocapitalize: 'words',
        enterkeyhint: 'done',
      },
    });
    nick.value = this.nick;
    const submit = () => this.submitForm(room.value, nick.value);
    room.addEventListener('input', () => {
      room.value = normalizeRoomInput(room.value);
    });
    nick.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
    const stored = loadSession();
    this.root.replaceChildren(
      h('main', { class: 'shell phone', attrs: { 'data-phase': 'form' } },
        this.top('Telefon'),
        h('section', { class: 'panel' },
          h('h1', { class: 'logo', text: 'Dołącz' }),
          h('p', { class: 'lead', text: 'Wpisz kod z telewizora i ksywkę. Hasła nie lecą w linku.' }),
          field('Kod pokoju', room),
          field('Ksywka', nick),
          button('Dołączam', 'join', submit, { class: 'btn btn-primary btn-xl' }),
          stored && stored.room === this.room
            ? button(`Wróć jako ${stored.name}`, 'resume', () => this.resume(stored), { class: 'btn btn-ghost' })
            : false,
          h('p', { class: 'error', testid: 'error', attrs: { role: 'alert' }, text: this.error }),
          h('p', { class: 'status', testid: 'status', attrs: { 'aria-live': 'polite' }, text: this.status }),
        ),
        h('footer', { class: 'credit', text: CREDIT }),
      ),
    );
    if (!this.room) room.focus();
    else nick.focus();
  }

  private submitForm(roomRaw: string, nickRaw: string): void {
    const room = normalizeRoomInput(roomRaw);
    const problem = roomCodeError(room);
    this.room = room;
    this.nick = nickRaw.trim();
    if (problem) {
      this.error = problem;
      this.patch();
      return;
    }
    if (this.nick.length < 2) {
      this.error = errorMessage('bad-name');
      this.patch();
      return;
    }
    this.error = '';
    this.status = 'Łączenie…';
    this.client.join(room, this.nick);
    this.patch();
  }

  private resume(stored: StoredSession): void {
    this.rejoining = true;
    this.error = '';
    this.built = '';
    this.client.rejoin(stored);
    this.paint();
  }

  private renderWaiting(): void {
    this.root.replaceChildren(
      h('main', { class: 'shell phone', attrs: { 'data-phase': 'rejoin' } },
        this.top('Telefon'),
        h('section', { class: 'panel' },
          h('h1', { class: 'logo', text: 'Wracam' }),
          h('p', { class: 'lead', testid: 'status', text: this.status || 'Wracam do pokoju…' }),
          h('p', { class: 'error', testid: 'error', attrs: { role: 'alert' }, text: this.error }),
        ),
      ),
    );
  }

  private renderBye(): void {
    this.root.replaceChildren(
      h('main', { class: 'shell phone', attrs: { 'data-phase': 'bye' } },
        this.top('Koniec'),
        h('section', { class: 'panel', testid: 'bye' },
          h('h1', { class: 'logo', text: 'Koniec' }),
          h('p', { class: 'lead', text: this.bye ?? '' }),
          button('Dołącz od nowa', 'join-again', () => location.reload(), { class: 'btn btn-primary btn-xl' }),
        ),
        h('footer', { class: 'credit', text: CREDIT }),
      ),
    );
  }

  private renderView(view: PlayerView): void {
    const body = h('div', { class: 'stage' });
    if (view.phase === 'lobby') body.append(this.lobby(view));
    if (view.phase === 'waiting') body.append(this.waiting(view));
    if (view.phase === 'submit') body.append(this.submit(view));
    if (view.phase === 'discuss') body.append(this.discuss(view));
    if (view.phase === 'vote') body.append(this.vote(view));
    if (view.phase === 'reveal') body.append(this.reveal(view));
    this.root.replaceChildren(
      h('main', { class: 'shell phone', attrs: { 'data-phase': view.phase } },
        this.top(view.phase === 'lobby' ? 'W pokoju' : 'Runda'),
        body,
        h('p', { class: 'error', testid: 'error', attrs: { role: 'alert' }, text: this.error }),
        h('p', { class: 'status', testid: 'status', attrs: { 'aria-live': 'polite' }, text: this.status }),
        h('footer', { class: 'credit', text: CREDIT }),
      ),
    );
  }

  private lobby(view: Extract<PlayerView, { phase: 'lobby' }>): HTMLElement {
    const list = h('div', { class: 'roster' });
    for (const player of view.players) {
      list.append(h('div', { class: 'player-row', testid: 'player-row' },
        h('span', { class: 'player-name', text: player.name }),
        h('span', { class: 'score', text: `${player.score} pkt` }),
        h('span', { class: player.connected ? 'pill ok' : 'pill', text: player.connected ? 'w grze' : 'rozłączony' }),
      ));
    }
    return h('section', { class: 'panel' },
      h('p', { class: 'kicker', text: 'Twoja ksywka' }),
      h('h1', { class: 'logo', testid: 'you-name', text: view.you.name }),
      h('p', { class: 'lead', testid: 'lobby-name', text: `${view.you.name} jest w pokoju. Czekaj na start na ekranie.` }),
      list,
      button('Wyjdź', 'leave', () => {
        this.client.leave();
        this.view = null;
        this.built = '';
        this.paint();
      }, { class: 'btn btn-ghost' }),
    );
  }

  private waiting(view: Extract<PlayerView, { phase: 'waiting' }>): HTMLElement {
    return h('section', { class: 'panel' },
      h('h1', { class: 'logo', text: view.you.name }),
      h('p', { class: 'lead', testid: 'waiting-note', text: view.message }),
    );
  }

  private submit(view: Extract<PlayerView, { phase: 'submit' }>): HTMLElement {
    const ready = view.roster.filter((row) => row.submitted).length;
    const card = h('section', {
      class: view.role === 'impostor' ? 'secret-card is-impostor' : 'secret-card',
      testid: 'role-card',
      attrs: { 'data-role': view.role },
    },
      h('p', { class: 'kicker', text: view.role === 'impostor' ? 'Ściemniasz' : 'Znasz hasło' }),
      h('h1', { class: 'category', text: view.category }),
    );
    if (view.role === 'impostor') {
      card.append(h('p', { class: 'lead', text: IMPOSTOR_BRIEF }));
    } else if (view.secret) {
      card.append(h('p', { class: 'secret', testid: 'secret', text: view.secret }));
      card.append(h('p', { class: 'fine', text: CITIZEN_BRIEF }));
    }
    const block = h('section', { class: 'panel' },
      h('p', { class: 'kicker', testid: 'round-label', text: `Runda ${view.roundNumber}` }),
      h('p', { class: 'timer', testid: 'timer', text: formatRemaining(this.deadline) }),
      card,
      h('p', { class: 'fine', testid: 'ready-count', text: `Gotowe: ${ready}/${view.roster.length}` }),
    );
    if (!view.submitted || this.editing) {
      const input = h('input', {
        testid: 'clue-input',
        attrs: { maxlength: '80', enterkeyhint: 'send', autocomplete: 'off' },
      });
      input.value = view.yourClue ?? '';
      input.placeholder = 'Krótki trop, max 80 znaków';
      const send = () => {
        this.editing = false;
        this.client.sendClue(input.value);
      };
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          send();
        }
      });
      block.append(field('Twój trop', input), button('Wysyłam trop', 'send-clue', send, { class: 'btn btn-primary btn-xl' }));
    } else {
      block.append(
        h('p', { class: 'kicker', text: 'Poszło' }),
        h('p', { class: 'secret', testid: 'clue-sent', text: view.yourClue ?? '' }),
        button('Popraw trop', 'edit-clue', () => {
          this.editing = true;
          this.built = '';
          this.paint();
        }, { class: 'btn btn-ghost' }),
      );
    }
    block.append(h('p', { class: 'fine', text: 'Nie pokazuj telefonu. Hasło zostaje u ciebie.' }));
    return block;
  }

  private discuss(view: Extract<PlayerView, { phase: 'discuss' }>): HTMLElement {
    return h('section', { class: 'panel' },
      h('p', { class: 'kicker', testid: 'round-label', text: `Runda ${view.roundNumber}` }),
      h('h1', { class: 'category', text: view.category }),
      h('p', { class: 'timer', testid: 'timer', text: formatRemaining(this.deadline) }),
      h('p', { class: 'lead', text: 'Dyskutujcie na głos. Nie pokazuj telefonu — hasła tu i tak nie ma.' }),
      this.clues(view.clues),
    );
  }

  private vote(view: Extract<PlayerView, { phase: 'vote' }>): HTMLElement {
    const list = h('div', { class: 'vote-list' });
    for (const candidate of view.candidates) {
      const picked = view.yourVote === candidate.id;
      list.append(button(candidate.name, 'vote-btn', () => this.client.sendVote(candidate.id), {
        class: picked ? 'btn vote-btn is-picked' : 'btn vote-btn',
        attrs: { 'data-name': candidate.name },
      }));
    }
    return h('section', { class: 'panel' },
      h('p', { class: 'kicker', testid: 'round-label', text: `Runda ${view.roundNumber}` }),
      h('h1', { class: 'logo', text: 'Kto ściemnia?' }),
      h('p', { class: 'timer', testid: 'timer', text: formatRemaining(this.deadline) }),
      h('p', { class: 'lead', text: view.yourVote ? 'Głos zapisany. Możesz go zmienić, dopóki trwa czas.' : 'Wybierz osobę. Nie głosujesz na siebie.' }),
      list,
      this.clues(view.clues),
    );
  }

  private reveal(view: Extract<PlayerView, { phase: 'reveal' }>): HTMLElement {
    const rows = h('div', { class: 'reveal-list' });
    for (const row of view.rows) {
      rows.append(h('article', { class: row.impostor ? 'reveal-row is-impostor' : 'reveal-row' },
        h('p', { class: 'kicker', text: `${row.label}${row.yourVote ? ' · twój głos' : ''}` }),
        h('h2', { text: row.name }),
        h('p', { class: 'clue-text', text: row.clue }),
        h('p', { class: 'fine', text: `${votesLabel(row.voteCount)} na tę osobę · ${row.delta > 0 ? `+${row.delta}` : String(row.delta)} pkt` }),
      ));
    }
    const delta = view.yourDelta > 0 ? `+${view.yourDelta}` : String(view.yourDelta);
    return h('section', { class: 'panel', testid: 'reveal' },
      h('p', { class: 'kicker', text: view.youAreImpostor ? 'To byłeś ty' : 'Wynik' }),
      h('h1', { class: 'logo', testid: 'caught', text: view.caught ? 'Wpadka' : 'Ściema przeszła' }),
      h('p', { class: 'lead', testid: 'your-delta', text: `${delta} dla ciebie. Masz ${view.yourScore} pkt.` }),
      h('p', { class: 'kicker', text: 'Ściemniał' }),
      h('p', { class: 'impostor-name', testid: 'impostor-name', text: view.impostorName }),
      h('p', { class: 'kicker', text: 'Hasło' }),
      h('p', { class: 'secret', testid: 'secret', text: view.secret }),
      rows,
    );
  }

  private clues(clues: { label: string; text: string }[]): HTMLElement {
    const board = h('div', { class: 'clue-board', testid: 'clue-board' });
    for (const clue of clues) {
      board.append(h('article', { class: 'clue-card', testid: 'anon-clue' },
        h('p', { class: 'kicker', text: clue.label }),
        h('p', { class: 'clue-text', text: clue.text }),
      ));
    }
    return board;
  }

  private top(kicker: string): HTMLElement {
    return h('header', { class: 'topbar' },
      h('div', {},
        h('p', { class: 'kicker', text: kicker }),
        h('p', { class: 'brand', text: 'Kto ściemnia' }),
      ),
    );
  }

  private patch(): void {
    const timer = this.root.querySelector('[data-testid="timer"]');
    if (timer) {
      timer.textContent = formatRemaining(this.deadline);
      timer.classList.toggle('urgent', remainingSeconds(this.deadline) <= 10);
    }
    const error = this.root.querySelector('[data-testid="error"]');
    if (error) error.textContent = this.error;
    const status = this.root.querySelector('[data-testid="status"]');
    if (status && !this.rejoining) status.textContent = this.status;
    if (this.view?.phase === 'submit') {
      const ready = this.view.roster.filter((row) => row.submitted).length;
      const node = this.root.querySelector('[data-testid="ready-count"]');
      if (node) node.textContent = `Gotowe: ${ready}/${this.view.roster.length}`;
    }
  }
}
