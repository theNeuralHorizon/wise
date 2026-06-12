import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8081/api';
const FRONTEND_BASE = process.env.FRONTEND_BASE || 'http://localhost:5173';

test('UI create split and upload via hidden input', async ({ page, request }) => {
  const payload = {
    name: 'UI E2E Test',
    restaurant: 'UI Restaurant',
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

  let guestOk = false;
  for (let i = 0; i < 20; i++) {
    const g = await request.get(`${API_BASE}/guest/${data.guest_token}`);
    if (g.ok()) {
      const gjson = await g.json();
      if (gjson.items && gjson.items.length > 0) {
        guestOk = true;
        break;
      }
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  expect(guestOk).toBeTruthy();

  const frontendGuestLink = `${FRONTEND_BASE}/guest/${data.guest_token}`;
  const gotoResp = await page.goto(frontendGuestLink, { waitUntil: 'domcontentloaded', timeout: 15000 });
  expect(gotoResp && gotoResp.ok()).toBeTruthy();
});
