import { CREDIT, rulesLines } from '../copy';
import { buildScreenUrl } from '../game/validate';
import { button, h } from './dom';

export function mountHome(root: HTMLElement): () => void {
  const steps = h('ol', { class: 'steps' });
  for (const line of [
    'Jedna osoba zostawia „Ekran imprezy” na telewizorze albo laptopie.',
    'Reszta skanuje QR albo wpisuje kod i ksywkę na telefonie.',
    'Wszyscy dostają tajne hasło — poza jedną osobą, która musi ściemniać.',
    'Tropy, dyskusja na głos, głosowanie telefonami, reveal i punkty.',
  ]) {
    steps.append(h('li', { text: line }));
  }
  const rules = h('ul', { class: 'fine' });
  for (const line of rulesLines()) rules.append(h('li', { text: line }));

  root.replaceChildren(
    h('main', { class: 'shell home' },
      h('p', { class: 'kicker', text: 'Impreza · 3–10 telefonów' }),
      h('h1', { class: 'logo', text: 'Kto ściemnia' }),
      h('p', { class: 'lead', text: 'Jeden duży ekran, reszta gra telefonami. Wspólne hasło, jeden ściemniacz, zero kont.' }),
      h('div', { class: 'choices' },
        button('', 'go-host', () => {
          location.assign(buildScreenUrl(location.href, 'host'));
        }, { class: 'choice' }),
        button('', 'go-join', () => {
          location.assign(buildScreenUrl(location.href, 'join'));
        }, { class: 'choice choice-join' }),
      ),
      h('section', { class: 'panel' },
        h('h2', { text: 'Jak grać' }),
        steps,
      ),
      h('section', { class: 'panel' },
        h('h2', { text: 'Punkty' }),
        rules,
      ),
      h('footer', { class: 'credit', text: CREDIT }),
    ),
  );

  const hostChoice = root.querySelector('[data-testid="go-host"]');
  const joinChoice = root.querySelector('[data-testid="go-join"]');
  hostChoice?.append(
    h('span', { class: 'choice-kicker', text: 'Telewizor albo laptop' }),
    h('span', { class: 'choice-title', text: 'Ekran imprezy' }),
    h('span', { class: 'choice-copy', text: 'Tu powstaje kod i QR. Zostaw to na dużym ekranie.' }),
  );
  joinChoice?.append(
    h('span', { class: 'choice-kicker', text: 'Telefon' }),
    h('span', { class: 'choice-title', text: 'Dołączam' }),
    h('span', { class: 'choice-copy', text: 'Wpisz kod z ekranu albo otwórz link z QR.' }),
  );

  return () => root.replaceChildren();
}
