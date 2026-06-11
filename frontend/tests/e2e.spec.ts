import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = process.env.API_BASE || 'http://localhost:8081/api';

test('create split and upload receipt', async ({ page, request }) => {
  // Create split via backend API
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
  const guestLink = data.guest_link as string;

  // Prepare a tiny fixture image (1x1 PNG)
  const fixtureDir = path.join(__dirname, 'fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const fixturePath = path.join(fixtureDir, 'receipt.png');
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=';
  fs.writeFileSync(fixturePath, Buffer.from(b64, 'base64'));

  // Upload the receipt to the backend API directly (multipart)
  const uploadResp = await request.post(`${API_BASE}/splits/${data.split_id}/receipt`, {
    multipart: {
      receipt: {
        name: 'receipt.png',
        mimeType: 'image/png',
        buffer: fs.readFileSync(fixturePath)
      }
    }
  });
  expect(uploadResp.ok()).toBeTruthy();
  const parsed = await uploadResp.json();
  expect(parsed.items && parsed.items.length).toBeGreaterThan(0);
});
