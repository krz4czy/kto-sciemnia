import { POINTS } from './game/types';

export function errorMessage(code: string): string {
  switch (code) {
    case 'locked':
      return 'Runda już trwa. Nowe telefony wejdą dopiero w lobby.';
    case 'full':
      return 'Pokój jest pełny. Maksymalnie 10 osób.';
    case 'duplicate-name':
      return 'Ta ksywka jest już w pokoju. Wybierz inną.';
    case 'bad-name':
      return 'Ksywka: 2–16 znaków, litery, cyfry, spacja, kropka albo myślnik.';
    case 'bad-clue':
      return 'Trop ma mieć od 1 do 80 znaków.';
    case 'not-participant':
      return 'Nie grasz w tej rundzie.';
    case 'not-in-phase':
      return 'Za wcześnie albo za późno na ten ruch.';
    case 'self-vote':
      return 'Nie możesz głosować na siebie.';
    case 'bad-target':
      return 'Nie ma takiej osoby w tej rundzie.';
    case 'need-players':
      return 'Potrzeba co najmniej 3 połączonych telefonów.';
    case 'bad-token':
      return 'Nie ma już tego miejsca w pokoju. Jeśli runda trwa, poczekaj na lobby i dołącz od nowa.';
    case 'no-such-player':
      return 'Nie ma takiej osoby.';
    case 'spice-locked':
      return 'Klimat można zmienić tylko w lobby.';
    case 'bad-prompt':
      return 'To hasło nie pasuje do wybranego klimatu.';
    case 'version':
      return 'Odśwież stronę — telefon i ekran mają inną wersję gry.';
    case 'bad-message':
      return 'Nie rozumiem tej wiadomości.';
    case 'rate':
      return 'Zwolnij na chwilę.';
    case 'no-room':
      return 'Nie ma pokoju z tym kodem. Sprawdź kod i czy ekran dalej działa.';
    case 'timeout':
      return 'Pokój nie odpowiada. Sprawdź kod, Wi-Fi i czy ekran jest włączony.';
    case 'network':
      return 'Serwer sygnałowy nie odpowiada. Spróbuj jeszcze raz za chwilę.';
    case 'dropped':
      return 'Połączenie padło. Możesz spróbować wrócić.';
    case 'unavailable-id':
      return 'Ten kod jest zajęty. Losuję inny.';
    default:
      return 'Coś nie wyszło. Spróbuj jeszcze raz.';
  }
}

export function phonesNeeded(count: number): string {
  if (count <= 0) return 'Można zaczynać.';
  if (count === 1) return 'Potrzeba jeszcze 1 telefon.';
  if (count >= 2 && count <= 4) return `Potrzeba jeszcze ${count} telefony.`;
  return `Potrzeba jeszcze ${count} telefonów.`;
}

export function votesLabel(count: number): string {
  if (count === 1) return '1 głos';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${count} głosy`;
  return `${count} głosów`;
}

export function peopleLabel(count: number): string {
  if (count === 1) return '1 osoba';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${count} osoby`;
  return `${count} osób`;
}

export function formatRemaining(deadline: number | null, now = Date.now()): string {
  if (deadline == null) return '—';
  const total = Math.max(0, Math.ceil((deadline - now) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function remainingSeconds(deadline: number | null, now = Date.now()): number {
  if (deadline == null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function rulesLines(): string[] {
  return [
    'Wszyscy poza jedną osobą dostają to samo hasło. Ściemniacz zna tylko kategorię.',
    'Każdy pisze krótki trop na telefonie. Na ekranie tropy są anonimowe.',
    'Dyskutujecie na głos, potem głosujecie telefonami, kto ściemnia.',
    `Samodzielna większość na ściemniacza: celny głos +${POINTS.voteCaught}, ściemniacz bez punktu.`,
    `Remis albo pudło: ściemniacz +${POINTS.impostorEscaped}, celny głos +${POINTS.voteEscaped}.`,
    'Brak tropu albo głosu nie zatrzymuje rundy.',
    'Nic nie trzeba pić. To zwykła gra.',
  ];
}

export const IMPOSTOR_BRIEF =
  'Nie znasz hasła — tylko kategorię. Napisz krótki trop, jakbyś wiedział, o co chodzi. Nie przyznawaj się.';

export const CITIZEN_BRIEF =
  'Znasz hasło. Napisz trop, który pokaże, że wiesz, ale nie cytuj hasła wprost. Jedna osoba ściemnia.';

export const CREDIT = 'Autor: Patryk Krzakmajster Majchrzak';
