import { CREDIT, errorMessage, formatRemaining, peopleLabel, remainingSeconds, rulesLines, votesLabel } from '../copy';
import { hostView } from '../game/logic';
import type { HostView, Spice, Timings } from '../game/types';
import { MIN_PLAYERS } from '../game/types';
import { buildScreenUrl, isLocalHost } from '../game/validate';
import { HostRoom } from '../net/host';
import { button, copyText, h } from './dom';
import { drawQr } from './qr';

export function mountHost(root: HTMLElement): () => void {
  const ui = new HostUI(root);
  return () => ui.destroy();
}

class HostUI {
  private room: HostRoom | null = null;
  private spice: Spice = 'mild';
  private error = '';
  private status = '';
  private built = '';
  private confirmClose = false;
  private opening = false;
  private closed = false;

  constructor(private readonly root: HTMLElement) {
    this.paint();
  }

  destroy(): void {
    this.room?.shutdown();
  }

  private paint(): void {
    if (this.closed) {
      this.renderClosed();
      return;
    }
    if (!this.room?.code) {
      this.renderSetup();
      return;
    }
    const view = hostView(this.room.state);
    const key = `${this.keyFor(view)}:${this.confirmClose ? 'confirm' : 'open'}:${this.error}`;
    if (key !== this.built) {
      this.built = key;
      this.renderRoom(view);
    }
    this.patch(view);
  }

  private keyFor(view: HostView): string {
    const scores = view.scoreboard.map((player) => `${player.id}:${player.connected}:${player.score}:${player.name}`).join(',');
    if (view.phase === 'lobby') return `lobby:${view.spice}:${view.canStart}:${scores}`;
    if (view.phase === 'submit') {
      return `submit:${view.roundNumber}:${view.roster.map((row) => `${row.name}:${row.submitted}:${row.connected}`).join(',')}`;
    }
    if (view.phase === 'discuss') return `discuss:${view.roundNumber}:${view.clues.map((clue) => clue.text).join('|')}`;
    if (view.phase === 'vote') return `vote:${view.roundNumber}:${view.votesIn}:${view.votesExpected}`;
    return `reveal:${view.roundNumber}:${view.caught}:${view.rows.map((row) => `${row.name}:${row.score}:${row.voteCount}`).join(',')}`;
  }

  private renderSetup(): void {
    const mild = button('Łagodny', 'spice-mild', () => {
      this.spice = 'mild';
      this.built = '';
      this.paint();
    }, { class: this.spice === 'mild' ? 'btn is-on' : 'btn btn-ghost', attrs: { 'aria-pressed': String(this.spice === 'mild') } });
    const spicy = button('Pikantny', 'spice-spicy', () => {
      this.spice = 'spicy';
      this.built = '';
      this.paint();
    }, { class: this.spice === 'spicy' ? 'btn is-on' : 'btn btn-ghost', attrs: { 'aria-pressed': String(this.spice === 'spicy') } });
    this.root.replaceChildren(
      h('main', { class: 'shell tv' },
        this.top('Ekran imprezy'),
        h('section', { class: 'panel hero-panel' },
          h('h1', { class: 'logo', text: 'Kto ściemnia' }),
          h('p', { class: 'lead', text: 'Zostaw tę stronę na telewizorze. Telefony dołączą kodem albo QR.' }),
          h('div', { class: 'row' }, mild, spicy),
          h('p', { class: 'fine', text: this.spice === 'spicy'
            ? 'Pikantny: dorosłe żarty z życia po osiemnastce, plus łagodne hasła. Bez obowiązku picia.'
            : 'Łagodny: szkoła, GG, Nasza Klasa, Metin i okoliczne wspomnienia. Bez obowiązku picia.' }),
          button(this.opening ? 'Szukam wolnego kodu…' : 'Otwórz pokój', 'open-room', () => void this.open(), {
            class: 'btn btn-primary btn-xl',
            disabled: this.opening,
          }),
          h('p', { class: 'error', testid: 'error', attrs: { role: 'alert' }, text: this.error }),
          h('p', { class: 'status', testid: 'status', attrs: { 'aria-live': 'polite' }, text: this.status }),
        ),
        rulesPanel(),
        h('footer', { class: 'credit', text: CREDIT }),
      ),
    );
  }

  private async open(): Promise<void> {
    if (this.opening) return;
    this.opening = true;
    this.error = '';
    this.built = '';
    this.paint();
    const pace = new URLSearchParams(location.search).get('pace');
    const timings: Partial<Timings> | undefined = pace === 'hold'
      ? { submitMs: 90_000, discussMs: 90_000, voteMs: 90_000 }
      : undefined;
    const room = new HostRoom({
      onChange: () => this.paint(),
      onStatus: (text) => {
        this.status = text;
        this.patch(this.room ? hostView(this.room.state) : null);
      },
      onFatal: (message) => {
        this.closed = true;
        this.error = message;
        this.built = '';
        this.paint();
      },
    }, this.spice, timings);
    this.room = room;
    try {
      await room.open();
      this.status = 'Sygnał gotowy. Telefony mogą wchodzić.';
    } catch (error) {
      this.room = null;
      this.error = error === 'timeout'
        ? errorMessage('timeout')
        : 'Nie udało się otworzyć pokoju. Sprawdź sieć i spróbuj jeszcze raz.';
    } finally {
      this.opening = false;
      this.built = '';
      this.paint();
    }
  }

  private renderRoom(view: HostView): void {
    const stage = h('div', { class: 'stage', attrs: { 'data-phase': view.phase } });
    if (view.phase === 'lobby') stage.append(this.lobby(view));
    if (view.phase === 'submit') stage.append(this.submit(view));
    if (view.phase === 'discuss') stage.append(this.discuss(view));
    if (view.phase === 'vote') stage.append(this.vote(view));
    if (view.phase === 'reveal') stage.append(this.reveal(view));
    this.root.replaceChildren(
      h('main', { class: 'shell tv' },
        this.top(view.phase === 'lobby' ? 'Lobby' : `Runda ${view.roundNumber ?? ''}`),
        stage,
        h('p', { class: 'error', testid: 'error', attrs: { role: 'alert' }, text: this.error }),
        h('p', { class: 'status', testid: 'status', attrs: { 'aria-live': 'polite' }, text: this.status }),
        h('footer', { class: 'credit', text: CREDIT }),
      ),
    );
    if (view.phase === 'lobby') {
      const canvas = this.root.querySelector('canvas');
      if (canvas instanceof HTMLCanvasElement && this.room) {
        drawQr(canvas, buildScreenUrl(location.href, 'join', this.room.code));
      }
    }
  }

  private lobby(view: Extract<HostView, { phase: 'lobby' }>): HTMLElement {
    const code = this.room?.code ?? '';
    const joinUrl = this.room ? buildScreenUrl(location.href, 'join', code) : '';
    const squares = h('div', { class: 'code-row', attrs: { role: 'group', 'aria-label': `Kod pokoju ${code}` } });
    for (const char of code) squares.append(h('span', { class: 'code-char', attrs: { 'aria-hidden': 'true' }, text: char }));
    const players = h('div', { class: 'roster' });
    if (view.scoreboard.length === 0) {
      players.append(h('p', { class: 'fine', text: 'Na razie pusto. Niech ktoś zeskanuje kod.' }));
    }
    for (const player of view.scoreboard) {
      players.append(h('div', { class: 'player-row', testid: 'player-row' },
        h('span', { class: 'player-name', testid: 'player-name', text: player.name }),
        h('span', { class: 'score', text: `${player.score} pkt` }),
        h('span', { class: player.connected ? 'pill ok' : 'pill', testid: 'conn', text: player.connected ? 'w grze' : 'rozłączony' }),
        button('Usuń', 'kick-player', () => this.flash(this.room?.kick(player.id) ?? null), { class: 'btn btn-ghost btn-tiny' }),
      ));
    }
    return h('section', { class: 'lobby-grid' },
      h('div', { class: 'panel code-panel' },
        h('p', { class: 'kicker', text: 'Kod pokoju' }),
        squares,
        h('p', { class: 'sr-only', testid: 'room-code', attrs: { 'data-code': code }, text: code }),
        h('canvas', { testid: 'qr', attrs: { width: '280', height: '280' } }),
        h('p', { class: 'selectable join-url', testid: 'join-url', attrs: { 'data-url': joinUrl }, text: joinUrl }),
        h('div', { class: 'row' },
          button('Kopiuj kod', 'copy-code', () => void this.copy(code), { class: 'btn btn-ghost' }),
          button('Kopiuj link', 'copy-link', () => void this.copy(joinUrl), { class: 'btn btn-ghost' }),
        ),
        isLocalHost(location.hostname)
          ? h('p', { class: 'warn', text: 'QR z localhost działa tylko na tym komputerze. Na imprezie otwórz grę z adresu GitHub Pages.' })
          : h('p', { class: 'fine', text: 'Najpewniej na tym samym Wi-Fi. Serwer tylko umawia połączenie i nie dostaje haseł.' }),
      ),
      h('div', { class: 'panel' },
        h('div', { class: 'row spread' },
          h('h2', { text: peopleLabel(view.connectedCount) }),
          h('span', { class: 'pill', text: view.spice === 'spicy' ? 'Pikantny' : 'Łagodny' }),
        ),
        h('div', { class: 'row' },
          button('Łagodny', 'spice-mild', () => this.flash(this.room?.setSpice('mild') ?? null), {
            class: view.spice === 'mild' ? 'btn is-on' : 'btn btn-ghost',
            attrs: { 'aria-pressed': String(view.spice === 'mild') },
          }),
          button('Pikantny', 'spice-spicy', () => this.flash(this.room?.setSpice('spicy') ?? null), {
            class: view.spice === 'spicy' ? 'btn is-on' : 'btn btn-ghost',
            attrs: { 'aria-pressed': String(view.spice === 'spicy') },
          }),
        ),
        players,
        h('p', { class: 'fine', testid: 'start-hint', text: view.startHint }),
        h('p', { class: 'fine', text: 'Nowe telefony są otwarte tylko w lobby. Rozłączeni odpadają przy starcie.' }),
        button('Start rundy', 'start-round', () => this.flash(this.room?.start() ?? null), {
          class: 'btn btn-primary btn-xl',
          disabled: !view.canStart,
        }),
        h('div', { class: 'row' },
          button('Wyzeruj punkty', 'reset-scores', () => this.flash(this.room?.resetScores() ?? null), { class: 'btn btn-ghost' }),
          this.closeControl(),
        ),
        rulesPanel(),
      ),
    );
  }

  private submit(view: Extract<HostView, { phase: 'submit' }>): HTMLElement {
    const roster = h('div', { class: 'roster' });
    for (const row of view.roster) {
      roster.append(h('div', { class: 'player-row', testid: 'player-row' },
        h('span', { class: 'player-name', testid: 'player-name', text: row.name }),
        h('span', { class: row.submitted ? 'pill ok' : 'pill', text: row.submitted ? 'gotowe' : 'pisze…' }),
        h('span', { class: row.connected ? 'pill ok' : 'pill', testid: 'conn', text: row.connected ? 'w grze' : 'rozłączony' }),
      ));
    }
    return h('section', { class: 'panel' },
      h('p', { class: 'kicker', testid: 'round-label', text: `Runda ${view.roundNumber}` }),
      h('h1', { class: 'category', text: view.category }),
      h('p', { class: 'timer', testid: 'timer', text: formatRemaining(view.deadline) }),
      h('p', { class: 'lead', text: 'Hasło jest tylko na telefonach. Tu widać, kto już wysłał trop.' }),
      roster,
      h('p', { class: 'fine', text: 'Nowe osoby są zablokowane do końca rundy.' }),
      this.lowPlayers(view.connectedInRound),
      h('div', { class: 'row' },
        button('Pokaż tropy', 'show-clues', () => this.flash(this.room?.showClues() ?? null), { class: 'btn btn-primary btn-xl' }),
        this.closeControl(),
      ),
    );
  }

  private discuss(view: Extract<HostView, { phase: 'discuss' }>): HTMLElement {
    return h('section', { class: 'panel' },
      h('p', { class: 'kicker', testid: 'round-label', text: `Runda ${view.roundNumber} · dyskusja` }),
      h('h1', { class: 'category', text: view.category }),
      h('p', { class: 'timer', testid: 'timer', text: formatRemaining(view.deadline) }),
      h('p', { class: 'lead', text: 'Tropy są anonimowe. Mówcie na głos, nie pokazujcie telefonów.' }),
      this.clueBoard(view.clues),
      this.lowPlayers(view.connectedInRound),
      h('div', { class: 'row' },
        button('Do głosowania', 'to-vote', () => this.flash(this.room?.toVote() ?? null), { class: 'btn btn-primary btn-xl' }),
        this.closeControl(),
      ),
    );
  }

  private vote(view: Extract<HostView, { phase: 'vote' }>): HTMLElement {
    return h('section', { class: 'panel' },
      h('p', { class: 'kicker', testid: 'round-label', text: `Runda ${view.roundNumber} · głosy` }),
      h('h1', { class: 'category', text: 'Głosują na telefonach' }),
      h('p', { class: 'timer', testid: 'timer', text: formatRemaining(view.deadline) }),
      h('p', { class: 'lead', testid: 'vote-progress', text: `Głosy: ${view.votesIn}/${view.votesExpected}` }),
      this.clueBoard(view.clues),
      this.lowPlayers(view.connectedInRound),
      h('div', { class: 'row' },
        button('Zakończ głosowanie', 'close-vote', () => this.flash(this.room?.closeVote() ?? null), { class: 'btn btn-primary btn-xl' }),
        this.closeControl(),
      ),
    );
  }

  private reveal(view: Extract<HostView, { phase: 'reveal' }>): HTMLElement {
    const rows = h('div', { class: 'reveal-list' });
    for (const row of view.rows) {
      rows.append(h('article', { class: row.impostor ? 'reveal-row is-impostor' : 'reveal-row', testid: 'reveal-row' },
        h('p', { class: 'kicker', text: `${row.label}${row.impostor ? ' · ściemniacz' : ''}` }),
        h('h2', { text: row.name }),
        h('p', { class: 'clue-text', text: row.clue }),
        h('p', { class: 'fine', text: `${votesLabel(row.voteCount)} na tę osobę · ${row.delta > 0 ? `+${row.delta}` : String(row.delta)} pkt · razem ${row.score}` }),
      ));
    }
    return h('section', { class: 'panel', testid: 'reveal' },
      h('p', { class: 'kicker', testid: 'round-label', text: `Runda ${view.roundNumber}` }),
      h('h1', { class: 'logo', testid: 'caught', text: view.caught ? 'Wpadka' : 'Ściema przeszła' }),
      h('p', { class: 'lead', text: view.caught ? 'Ściemniacz złapany.' : 'Za mało zgodnych głosów, żeby go złapać.' }),
      h('p', { class: 'kicker', text: 'Ściemniał' }),
      h('p', { class: 'impostor-name', testid: 'impostor-name', text: view.impostorName }),
      h('p', { class: 'kicker', text: 'Hasło' }),
      h('p', { class: 'secret', testid: 'secret', text: view.secret }),
      rows,
      h('p', { class: 'fine', testid: 'start-hint', text: view.nextHint }),
      h('div', { class: 'row' },
        button('Następna runda', 'next-round', () => this.flash(this.room?.nextRound() ?? null), {
          class: 'btn btn-primary btn-xl',
          disabled: !view.canNext,
        }),
        button('Wróć do lobby', 'to-lobby', () => this.flash(this.room?.toLobby() ?? null), { class: 'btn btn-ghost' }),
        this.closeControl(),
      ),
    );
  }

  private clueBoard(clues: { label: string; text: string }[]): HTMLElement {
    const board = h('div', { class: 'clue-board', testid: 'clue-board' });
    for (const clue of clues) {
      board.append(h('article', { class: 'clue-card', testid: 'anon-clue' },
        h('p', { class: 'kicker', text: clue.label }),
        h('p', { class: 'clue-text', text: clue.text }),
      ));
    }
    return board;
  }

  private lowPlayers(count: number): HTMLElement | false {
    if (count >= MIN_PLAYERS) return false;
    return h('div', { class: 'warn-box' },
      h('p', { class: 'warn', text: 'Zostało za mało połączonych osób, żeby sensownie grać dalej.' }),
      button('Przerwij rundę', 'abort-round', () => this.flash(this.room?.toLobby() ?? null), { class: 'btn btn-ghost' }),
    );
  }

  private closeControl(): HTMLElement {
    if (!this.confirmClose) {
      return button('Zamknij pokój', 'close-room', () => {
        this.confirmClose = true;
        this.built = '';
        this.paint();
      }, { class: 'btn btn-ghost' });
    }
    return button('Na pewno zamknąć?', 'confirm-close', () => this.finish(), { class: 'btn btn-danger' });
  }

  private finish(): void {
    this.room?.shutdown();
    this.closed = true;
    this.built = '';
    this.paint();
  }

  private renderClosed(): void {
    this.root.replaceChildren(
      h('main', { class: 'shell tv' },
        this.top('Koniec'),
        h('section', { class: 'panel', testid: 'host-closed' },
          h('h1', { class: 'logo', text: 'Pokój zamknięty' }),
          h('p', { class: 'lead', text: this.error || 'Host zamknął grę. Telefony dostaną komunikat.' }),
          button('Nowy pokój', 'reopen', () => location.reload(), { class: 'btn btn-primary btn-xl' }),
        ),
        h('footer', { class: 'credit', text: CREDIT }),
      ),
    );
  }

  private top(kicker: string): HTMLElement {
    return h('header', { class: 'topbar' },
      h('div', {},
        h('p', { class: 'kicker', text: kicker }),
        h('p', { class: 'brand', text: 'Kto ściemnia' }),
      ),
      h('p', { class: 'pill', text: this.room?.signal === 'otwarty' ? 'Sygnał gotowy' : 'Sygnał…' }),
    );
  }

  private patch(view: HostView | null): void {
    const timer = this.root.querySelector('[data-testid="timer"]');
    if (timer && view && 'deadline' in view) {
      timer.textContent = formatRemaining(view.deadline);
      timer.classList.toggle('urgent', remainingSeconds(view.deadline) <= 10);
    }
    const error = this.root.querySelector('[data-testid="error"]');
    if (error) error.textContent = this.error;
    const status = this.root.querySelector('[data-testid="status"]');
    if (status) status.textContent = this.status;
    if (view?.phase === 'vote') {
      const progress = this.root.querySelector('[data-testid="vote-progress"]');
      if (progress) progress.textContent = `Głosy: ${view.votesIn}/${view.votesExpected}`;
    }
  }

  private flash(message: string | null): void {
    this.error = message ?? '';
    const error = this.root.querySelector('[data-testid="error"]');
    if (error) error.textContent = this.error;
  }

  private async copy(value: string): Promise<void> {
    const ok = await copyText(value);
    this.status = ok ? 'Skopiowane.' : 'Nie udało się skopiować. Przepisz ręcznie.';
    const status = this.root.querySelector('[data-testid="status"]');
    if (status) status.textContent = this.status;
  }
}

function rulesPanel(): HTMLElement {
  const list = h('ol');
  for (const line of rulesLines()) list.append(h('li', { text: line }));
  const details = h('details', { class: 'rules' });
  details.append(h('summary', { text: 'Zasady i punkty' }), list);
  return details;
}
