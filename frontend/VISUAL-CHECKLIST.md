# Visual Test Checklist

Use this checklist to manually verify every UI component after applying the overhaul.

## Global Elements

| Element | Expected Appearance | Dark Mode | Light Mode |
|---------|-------------------|-----------|------------|
| Phone shell | Centered 390×844px frame with rounded corners (desktop); fullscreen (mobile) | `#111118` bg, purple/teal gradient behind | `#FFFFFF` bg, subtle purple gradient |
| Dynamic Island | Black pill at top center, 120×34px | `#000` | `#1A1A2E` |
| Status bar | Time left, battery right, white text | White text on dark bg | Dark text on light bg |
| Theme toggle | ☀️/🌙 button top-right corner, 36px circle | Visible, surface bg | Visible, surface bg |
| Backend badge | Small pill "Live API" or "Demo Mode" with green/grey dot | `--color-surface` bg, `--color-text-2` text | Same structure, light vars |
| Offline banner | Full-width amber bar "📡 Offline — showing cached data" | `--color-warning-dim` bg | Same, lighter vars |
| Toast | Bottom-center pill with blur backdrop, auto-dismiss 2.8s | Dark blur bg | Light blur bg |

## Home Screen (`/`)

| Element | Expected Appearance | Token/Class |
|---------|-------------------|-------------|
| Greeting | "Good morning/afternoon/evening" small text | `--color-text-3`, `--text-sm` |
| Name display | Large bold name + ✌️, tap to edit | `--text-3xl`, `--weight-extrabold` |
| Name edit mode | Input + confirm button inline | `.inline-edit-row`, `.inline-edit-input`, `.inline-edit-confirm` |
| Balance card | Purple gradient card with "You are owed" + ₹ amount | `.balance-card`, green accent amount |
| Quick actions | 2×2 grid of action buttons with icons | `.qa-btn`, `.qa-icon.purple/green/gold/pink` |
| Recent splits | Card list with avatar, name, date, amount | `.card`, `.split-item`, `.split-avatar` |
| Empty state | "No splits yet" centered message | `.empty-state` |
| Nav bar | Bottom 4-tab bar (Home, Splits, Friends, Profile) | `.nav-bar`, `.nav-item`, blur backdrop |

## Create Split (`/split/new`)

| Element | Expected Appearance | Token/Class |
|---------|-------------------|-------------|
| Header | Back button + "New Split Setup" title | `.header-row`, `.back-btn`, `.header-title` |
| Your Info card | Name + UPI ID inputs | `.card`, `.form-group`, `.form-input` |
| Split Info card | Restaurant name input | `.form-group`, `.form-input` |
| Friends card | List of friend rows (name, emoji, UPI, remove) | `.form-row`, `.setup-friend-row`, `.setup-friend-remove` |
| Buttons | "Upload or Scan Receipt" (primary) + "Manual Entry" (secondary) | `.btn-primary`, `.btn-secondary` |

## Receipt Upload (`/split/:id/receipt`)

| Element | Expected Appearance | Token/Class |
|---------|-------------------|-------------|
| Camera view | Dark bg with receipt preview, scan corners, scan line animation | `#scan`, `.camera-view`, `.scan-corner`, `.scan-line` |
| Scan hint | "Position receipt within frame" text | `.scan-hint`, white 50% opacity |
| Action buttons | File, shutter, mock-scan buttons | `.scan-actions`, `.shutter` |

## Processing Screen (`/split/:id/processing`)

| Element | Expected Appearance | Token/Class |
|---------|-------------------|-------------|
| AI ring | Spinning gradient ring with ✨ center | `.ai-ring`, `spin` animation |
| Title | "Reading your receipt" | `.proc-title`, `--text-3xl` |
| Steps | 4-step progress list with icons, spinners, checkmarks | `.proc-steps`, `.proc-step`, `.proc-step-icon` |

## Item Assignment (`/split/:id/assign`)

| Element | Expected Appearance | Token/Class |
|---------|-------------------|-------------|
| Header | Back + "Assign Items" + Done button | `.items-title-row`, `.btn-done` |
| Restaurant | Editable restaurant name | `.items-rest`, `.edit-row` |
| Participant list | Horizontal scrollable avatar chips | `.pax-row`, `.pax-chip`, `.pax-ava.selected` |
| Tabs | All Items / Yours / Unassigned pill tabs | `.tabs`, `.tab.active/inactive` |
| Recovery bar | "⚠️ Owner token not found" + input + Restore | `.recovery-bar`, `.recovery-input`, `.recovery-btn` |
| Add item bar | Name + Price + Add button | `.add-item-bar`, `.add-item-row`, `.add-item-btn` |
| Item rows | Checkbox + name + qty + price + edit/delete buttons | `.item-row`, `.item-check.checked`, `.item-action-btn.edit/delete` |
| Footer | Subtotal + bill total + "Confirm & Share Split" button | `.items-footer`, `.btn-primary` |

## Split Summary (`/split/:id/summary`)

| Element | Expected Appearance | Token/Class |
|---------|-------------------|-------------|
| Header | Back + "Split Summary" + Save | `.header-row`, `.header-save-btn` |
| Hero | Restaurant icon + name + "Today · N people" | `.summary-hero`, `.summary-icon` |
| Share card | Link + WhatsApp/Copy/QR buttons | `.share-card`, `.share-btn-row` |
| Payments list | Payment items with emoji, name, time, amount, confirm | `.payments-section`, `.payment-item`, `.payment-confirm-btn` |
| Person cards | Per-person breakdown (food, tax, tip, total) + UPI/QR buttons | `.person-card`, `.pay-btn.upi/link/paid` |
| Settlement section | "Minimize Transactions" + transaction list | `.settle-section`, `.settle-txn`, `.settle-txn-pay` |
| Total card | Subtotal, tax, tip, bill total with edit buttons | `.summary-total-card`, `.stc-label-edit`, `.stc-edit-btn` |
| QR modal | Bottom sheet with QR canvas, UPI ID, Open UPI button | `.modal-sheet`, `.qr-canvas-wrap`, `.qr-pay-btn` |

## Guest View (`/guest/:token`)

| Element | Expected Appearance | Token/Class |
|---------|-------------------|-------------|
| Hero | "Guest View · No app needed" badge + title | `.guest-badge`, `.guest-title` |
| Host note | Info card about host | `.guest-host-note` |
| Item list | Checkable items with prices | `.guest-item`, `.guest-item-sel.on` |
| Footer | Total + "Pay Host" button | `.guest-footer`, `.guest-total-amount` |
| Payment screen | Amount + UPI method + Pay Now button | `.pay-hero`, `.pay-amount-big`, `.pay-method.selected` |
| Success overlay | Confetti + "Paid! 🎉" + back button | `.pay-success-overlay.show`, `.pay-success-icon` |

## History Screen (`/history`)

| Element | Expected Appearance | Token/Class |
|---------|-------------------|-------------|
| Header | Back + "All Splits" + count | `.history-header`, `.history-title` |
| Split list | Card with avatar, name, date, amount | `.card-padded`, `.split-item` |
| Empty state | 🍽️ icon + "No splits yet" | `.history-empty` |

## Responsive Behavior

| Breakpoint | Expected Behavior |
|------------|-------------------|
| > 440px (desktop) | Phone frame visible (390×844px, border-radius 52px, shadow) |
| ≤ 440px (mobile) | Full screen, no frame, no island, full-width footers |
| All sizes | Touch targets ≥ 44px, no horizontal overflow |

## Animations

| Animation | Trigger | Expected |
|-----------|---------|----------|
| Screen transition | Route change | 300ms slide + fade |
| Button press | Tap | scale(0.96) or scale(0.93) |
| Scan line | Receipt upload | 2s ease-in-out loop |
| AI ring spin | Processing | 2s linear infinite |
| Toast appear | Any action | 200ms slide up + fade in |
| Confetti | Guest payment | 1.5–3.5s fall with rotation |
| Modal sheet | Open | Slide up from bottom |

## Accessibility

| Check | Expected |
|-------|----------|
| Focus outlines | 2px solid `--color-primary` on all buttons, inputs, links |
| ARIA labels | All icon-only buttons have `aria-label` |
| Keyboard nav | All interactive elements focusable with Tab |
| Color contrast | Text primary ≥ 7:1, secondary ≥ 4.5:1 on both themes |
| Touch targets | All buttons/inputs ≥ 44px height |
