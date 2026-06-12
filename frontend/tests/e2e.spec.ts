import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8081/api';
const FRONTEND_BASE = process.env.FRONTEND_BASE || 'http://localhost:5173';

test('create split and upload receipt', async ({ request }) => {
  const payload = {
    name: 'E2E Test',
    restaurant: 'E2E Restaurant',
    participants: [
      { name: 'Host', emoji: '😎', upi_id: null }
    ]
  };

  const resp = await request.post(`${API_BASE}/splits`, { data: payload });
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  expect(data.owner_token).toBeTruthy();
  const ownerToken = data.owner_token as string;
  const guestLink = data.guest_link as string;

  const fixtureDir = path.join(__dirname, 'fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const fixturePath = path.join(fixtureDir, 'receipt.png');
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAAWgmWQ0AAAAASUVORK5CYII=';
  fs.writeFileSync(fixturePath, Buffer.from(b64, 'base64'));

  const uploadResp = await request.post(`${API_BASE}/splits/${data.split_id}/receipt?force=true`, {
    multipart: {
      receipt: {
        name: 'receipt.png',
        mimeType: 'image/png',
        buffer: fs.readFileSync(fixturePath)
      }
    },
    headers: {
      'Authorization': `Bearer ${ownerToken}`
    }
  });
  expect(uploadResp.ok()).toBeTruthy();
  const parsed = await uploadResp.json();
  expect(parsed.items && parsed.items.length).toBeGreaterThan(0);
});

test('owner token has created_at timestamp', async ({ request }) => {
  const resp = await request.post(`${API_BASE}/splits`, {
    data: { name: 'Token Test', restaurant: 'Token Resto', participants: [{ name: 'A', emoji: '😎', upi_id: null }] }
  });
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  expect(data.token_created_at).toBeTruthy();
  const createdAt = new Date(data.token_created_at);
  expect(createdAt.getTime()).toBeGreaterThan(0);
});

test('direct URL access to split assign page loads without crash', async ({ page, request }) => {
  const resp = await request.post(`${API_BASE}/splits`, {
    data: { name: 'Nav Test', restaurant: 'Nav Resto', participants: [{ name: 'Host', emoji: '😎', upi_id: null }] }
  });
  const data = await resp.json();
  const splitId = data.split_id as string;

  const gotoResp = await page.goto(`${FRONTEND_BASE}/split/${splitId}/assign`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  expect(gotoResp).toBeTruthy();
  expect(gotoResp!.ok()).toBeTruthy();
});

test('guest link loads guest view in browser', async ({ page, request }) => {
  const resp = await request.post(`${API_BASE}/splits`, {
    data: { name: 'Guest Test', restaurant: 'Guest Resto', participants: [{ name: 'Host', emoji: '😎', upi_id: null }] }
  });
  const data = await resp.json();

  const fixturePath = path.join(__dirname, 'fixtures', 'receipt.png');
  if (!fs.existsSync(fixturePath)) {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAAWgmWQ0AAAAASUVORK5CYII=';
    fs.mkdirSync(path.join(__dirname, 'fixtures'), { recursive: true });
    fs.writeFileSync(fixturePath, Buffer.from(b64, 'base64'));
  }

  await request.post(`${API_BASE}/splits/${data.split_id}/receipt?force=true`, {
    multipart: { receipt: { name: 'receipt.png', mimeType: 'image/png', buffer: fs.readFileSync(fixturePath) } },
    headers: { 'Authorization': `Bearer ${data.owner_token}` }
  });

  let guestOk = false;
  for (let i = 0; i < 20; i++) {
    const g = await request.get(`${API_BASE}/guest/${data.guest_token}`);
    if (g.ok()) {
      const gjson = await g.json();
      if (gjson.items && gjson.items.length > 0) { guestOk = true; break; }
    }
    await new Promise(res => setTimeout(res, 500));
  }
  expect(guestOk).toBeTruthy();

  const guestUrl = `${FRONTEND_BASE}/guest/${data.guest_token}`;
  const gotoResp = await page.goto(guestUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  expect(gotoResp && gotoResp.ok()).toBeTruthy();
});

test('owner token encoded in URL hash fragment loads without crash', async ({ page, request }) => {
  const resp = await request.post(`${API_BASE}/splits`, {
    data: { name: 'Hash Test', restaurant: 'Hash Resto', participants: [{ name: 'Host', emoji: '😎', upi_id: null }] }
  });
  const data = await resp.json();
  const token = data.owner_token as string;
  const splitId = data.split_id as string;

  const gotoResp = await page.goto(`${FRONTEND_BASE}/split/${splitId}/assign#owner=${token}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  expect(gotoResp).toBeTruthy();
  expect(gotoResp!.ok()).toBeTruthy();
});

test('back button navigates to previous page', async ({ page, request }) => {
  const resp = await request.post(`${API_BASE}/splits`, {
    data: { name: 'Back Test', restaurant: 'Back Resto', participants: [{ name: 'Host', emoji: '😎', upi_id: null }] }
  });
  const data = await resp.json();
  const splitId = data.split_id as string;

  await page.goto(`${FRONTEND_BASE}/split/${splitId}/assign`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1000);

  const backBtn = page.locator('.back-btn').first();
  if (await backBtn.isVisible()) {
    await backBtn.click();
    await page.waitForTimeout(500);
    const url = page.url();
    expect(url).not.toContain('/assign');
  }
});
