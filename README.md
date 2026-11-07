# Kto ściemnia

Imprezowa gra dedukcji po polsku. Jeden ekran na telewizorze albo laptopie, telefony jako kontrolery. Wspólne hasło, jeden ściemniacz, anonimowe tropy, dyskusja i głosowanie.

Autor: **Patryk Krzakmajster Majchrzak**.

Gra jest dla dorosłych znajomych z rocznika około 1998: Gadu-Gadu, Nasza Klasa, Metin2, gimnazjum, studniówka. Klimat pikantny dokłada żarty z życia po osiemnastce. Nic nie trzeba pić. Nie ma mowy nienawiści.

## Jak zagrać

1. Otwórz grę na dużym ekranie i wybierz **Ekran imprezy**.
2. Zostaw kod i QR widoczne.
3. Każdy na telefonie wybiera **Dołączam**, wpisuje kod i ksywkę (albo skanuje QR).
4. Od 3 do 10 osób. Start zamyka nowe wejścia do końca rundy.
5. Wszyscy poza jedną osobą dostają to samo hasło. Ściemniacz zna tylko kategorię i pisze trop na ślepo.
6. Ekran pokazuje tropy bez imion. Dyskusja na głos, potem głos na telefonie.
7. Reveal, punkty, następna runda albo powrót do lobby.

Punkty: celny głos przy samodzielnej większości na ściemniacza daje +2. Remis albo pudło daje ściemniaczowi +3, a celnemu głosowi +1. Brak tropu albo głosu nie zatrzymuje rundy.

Adresy po publikacji na GitHub Pages:

- start: `https://krz4czy.github.io/kto-sciemnia/`
- ekran: `https://krz4czy.github.io/kto-sciemnia/?screen=host`
- telefon: `https://krz4czy.github.io/kto-sciemnia/?screen=join`

QR buduje link z aktualnej ścieżki, więc podkatalog Pages jest w adresie.

## Sieć

To prawdziwy multiplayer, nie lokalna sztuczka w jednej przeglądarce.

- **Sygnalizacja:** publiczny broker PeerJS, WebSocket `wss://0.peerjs.com/peerjs` (host `0.peerjs.com`, port 443, ścieżka `/`, klucz `peerjs`). Zero rejestracji.
- **WebRTC:** kanały danych. Host jest sędzią. Telefon dostaje tylko własną rolę.
- **STUN:** `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`, `stun:stun.cloudflare.com:3478`.
- **TURN:** brak. Na symetrycznym NAT, izolacji gości w Wi-Fi i części sieci komórkowych połączenie może nie powstać. Najpewniej działa na **tej samej sieci Wi-Fi** co ekran.
- Broker i STUN widzą tylko metadane połączenia. Hasła, tropy i głosy idą kanałem między hostem a telefonem i nie są dopisywane do adresu URL.

Odświeżenie telefonu wraca na to samo miejsce (token w `sessionStorage`). Zamknięcie ekranu kończy pokój. Zła ksywka, zły kod, spóźnione wejście, brak tropu i brak głosu są obsłużone w grze.

## Prywatność

Brak kont, reklam i telemetrii. Tekst graczy jest wstawiany jako tekst, nie jako HTML. Wiadomości mają limit długości i prosty limit częstości. Przed reveal ekran nie dostaje hasła, a telefon nie dostaje cudzej roli ani cudzego tropu.

## Lokalnie

```bash
npm install
npm test
npm run dev
```

E2E (prawdziwy PeerJS, cztery osobne konteksty przeglądarki). Adres hosta dostaje `pace=hold`, żeby licznik testu nie przeskakiwał faz sam — w normalnej grze odliczanie idzie 60/75/40 sekund:

```bash
npx playwright install chromium
npm run test:e2e
```

Build statyczny z względną bazą pod Pages: `npm run build` (wynik w `dist/`).

Na `localhost` QR działa tylko na tym komputerze. Telefony na imprezie powinny otwierać opublikowany adres HTTPS.

## Publikacja

Workflow `.github/workflows/pages.yml` odpala testy, buduje `dist` i wgrywa go jako GitHub Pages. Źródło trzeba **raz** ustawić w repozytorium: Settings → Pages → Build and deployment → **GitHub Actions**. Bez tego `actions/configure-pages` kończy się błędem, a `https://krz4czy.github.io/kto-sciemnia/` odpowiada 404.

Token użyty do pusha nie ma uprawnień `pages:write` i `administration:write`, więc włączenia Pages nie da się zrobić z tej sesji (`POST /repos/krz4czy/kto-sciemnia/pages` → 403 `Resource not accessible by integration`).
