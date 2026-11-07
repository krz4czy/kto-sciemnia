import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function dump(page: Page, label: string): Promise<void> {
  const text = await page.locator('body').innerText().catch(() => '');
  console.log(`\n--- ${label} ---\n${text.slice(0, 1500)}\n`);
}

async function shoot(page: Page, name: string): Promise<void> {
  await mkdir('/opt/cursor/artifacts', { recursive: true });
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: true });
}

test('host plus three phones play a full round, reconnect and close', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  const hostContext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  contexts.push(hostContext);
  const host = await hostContext.newPage();
  host.on('pageerror', (error) => console.log('host error', error.message));

  try {
    await host.goto('/');
    await expect(host.getByTestId('go-host')).toBeVisible();
    await expect(host.getByTestId('go-join')).toBeVisible();
    await shoot(host, 'home_entry');
    await host.goto('/?screen=host&pace=hold');
    await host.getByTestId('spice-mild').click();
    await host.getByTestId('open-room').click();
    await expect(host.getByTestId('room-code')).toHaveAttribute('data-code', /^[A-Z0-9]{4}$/, { timeout: 40_000 });
    const code = await host.getByTestId('room-code').getAttribute('data-code');
    if (!code) throw new Error('brak kodu');
    const joinUrl = await host.getByTestId('join-url').getAttribute('data-url');
    expect(joinUrl).toBe(`http://127.0.0.1:4173/?screen=join&room=${code}`);
    await expect(host.getByTestId('qr')).toBeVisible();
    const qrBox = await host.getByTestId('qr').boundingBox();
    expect(qrBox?.width ?? 0).toBeGreaterThan(120);

    const phones: { name: string; page: Page; context: BrowserContext }[] = [];
    for (const [index, name] of ['Ala', 'Bartek', 'Celina'].entries()) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent: index === 0 ? IPHONE_UA : undefined,
      });
      contexts.push(context);
      const page = await context.newPage();
      page.on('pageerror', (error) => console.log(`${name} error`, error.message));
      await page.goto(`/?screen=join&room=${code}`);
      if (name === 'Celina') {
        await page.getByTestId('nick').fill('Ala');
        await page.getByTestId('join').click();
        await expect(page.getByTestId('error')).toContainText('ksywka', { timeout: 40_000 });
        await page.getByTestId('nick').fill('Celina');
        await page.getByTestId('join').click();
      } else {
        await page.getByTestId('nick').fill(name);
        await page.getByTestId('join').click();
      }
      await expect(page.getByTestId('you-name')).toHaveText(name, { timeout: 40_000 });
      phones.push({ name, page, context });
    }

    await expect(host.getByTestId('player-row')).toHaveCount(3);
    await shoot(host, 'host_lobby');
    await host.getByTestId('start-round').click();

    const roles: { name: string; role: string; page: Page }[] = [];
    for (const phone of phones) {
      const card = phone.page.getByTestId('role-card');
      await expect(card).toBeVisible({ timeout: 20_000 });
      const role = await card.getAttribute('data-role');
      roles.push({ name: phone.name, role: role ?? '', page: phone.page });
    }
    expect(roles.filter((role) => role.role === 'impostor')).toHaveLength(1);
    expect(roles.filter((role) => role.role === 'citizen')).toHaveLength(2);
    const impostor = roles.find((role) => role.role === 'impostor');
    const citizen = roles.find((role) => role.role === 'citizen');
    if (!impostor || !citizen) throw new Error('brak ról');
    const secret = (await citizen.page.getByTestId('secret').innerText()).trim();
    expect(secret.length).toBeGreaterThan(8);
    await expect(impostor.page.getByTestId('secret')).toHaveCount(0);
    await expect(host.locator('body')).not.toContainText(secret);
    await expect(impostor.page.locator('body')).not.toContainText(secret);
    await shoot(citizen.page, 'phone_secret');
    await shoot(impostor.page, 'phone_impostor');

    const late = await browser.newContext({ viewport: { width: 390, height: 844 } });
    contexts.push(late);
    const latePage = await late.newPage();
    await latePage.goto(`/?screen=join&room=${code}`);
    await latePage.getByTestId('nick').fill('Spóźniony');
    await latePage.getByTestId('join').click();
    await expect(latePage.getByTestId('error')).toContainText('Runda już trwa', { timeout: 40_000 });
    await expect(host.getByTestId('player-row')).toHaveCount(3);

    const clues = ['niebieski trop', 'cichy znak', 'puste tlo'];
    for (const [index, phone] of phones.entries()) {
      await phone.page.getByTestId('clue-input').fill(clues[index] ?? 'trop');
      await phone.page.getByTestId('send-clue').click();
      await expect(phone.page.getByTestId('clue-sent').or(phone.page.getByTestId('clue-board'))).toBeVisible({
        timeout: 20_000,
      });
    }
    await expect(host.getByTestId('anon-clue')).toHaveCount(3, { timeout: 20_000 });
    const board = host.getByTestId('clue-board');
    await expect(board).toContainText('niebieski trop');
    await expect(board).toContainText('cichy znak');
    await expect(board).toContainText('puste tlo');
    await expect(board).not.toContainText('Ala');
    await expect(board).not.toContainText('Bartek');
    await expect(board).not.toContainText('Celina');
    await expect(host.locator('body')).not.toContainText(secret);
    await shoot(host, 'host_clues');

    await host.getByTestId('to-vote').click();
    await expect(phones[0]!.page.getByTestId('vote-btn').first()).toBeVisible();
    await shoot(phones[0]!.page, 'phone_vote');
    for (const phone of phones) {
      if (phone.name === impostor.name) await phone.page.getByTestId('vote-btn').first().click();
      else await phone.page.locator(`[data-testid="vote-btn"][data-name="${impostor.name}"]`).click();
    }
    await expect(host.getByTestId('reveal')).toBeVisible({ timeout: 20_000 });
    await expect(host.getByTestId('impostor-name')).toHaveText(impostor.name);
    await expect(host.getByTestId('caught')).toHaveText('Wpadka');
    await expect(host.getByTestId('secret')).toHaveText(secret);
    await shoot(host, 'host_reveal');

    await host.getByTestId('next-round').click();
    await expect(phones[0]!.page.getByTestId('role-card')).toBeVisible({ timeout: 20_000 });
    await expect(host.getByTestId('round-label')).toContainText('2');
    await phones[0]!.page.reload();
    await expect(phones[0]!.page.getByTestId('role-card')).toBeVisible({ timeout: 40_000 });
    await phones[0]!.page.getByTestId('clue-input').fill('trop po powrocie');
    await phones[0]!.page.getByTestId('send-clue').click();
    await expect(phones[0]!.page.getByTestId('clue-sent')).toBeVisible({ timeout: 20_000 });
    await expect(phones[0]!.page.getByTestId('clue-sent')).toHaveText('trop po powrocie');
    await expect(host.locator('body')).not.toContainText('trop po powrocie');
    const ala = host.getByTestId('player-row').filter({ hasText: 'Ala' });
    await expect(ala.getByTestId('conn')).toHaveText('w grze');
    await expect(ala).toContainText('gotowe');

    await host.getByTestId('close-room').click();
    await host.getByTestId('confirm-close').click();
    await expect(host.getByTestId('host-closed')).toBeVisible();
    await expect(phones[1]!.page.getByTestId('bye')).toBeVisible({ timeout: 20_000 });
    await expect(phones[2]!.page.getByTestId('bye')).toContainText('zamknął');

  } catch (error) {
    await dump(host, 'host');
    throw error;
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('a wrong room code fails without joining anything', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('/?screen=join&room=ZZZZ');
    await page.getByTestId('nick').fill('Henio');
    await page.getByTestId('join').click();
    await expect(page.getByTestId('error')).toContainText(/pokoj|sieci|sygnał|kod/i, { timeout: 40_000 });
    await expect(page.getByTestId('you-name')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
