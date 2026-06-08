# Wise — The Splitwise Killer

## Background & Vision

After deep-reading both research documents and auditing all of **pixperk** (Yashaswi Kumar Mishra)'s 119 repos, this is the plan.

**The opportunity is real and urgent:**
- Splitwise added aggressive paywalls (>4-5 expenses locked behind Pro)
- No AI receipt scanning (still fully manual entry)
- No UPI-native settlement
- No real expense intelligence (silos personal vs shared spend)
- Indian users are deeply frustrated (r/IndiaTech, r/developersIndia threads)

**The core thesis from the research:**
> Multimodal LLM vision + UPI deeplinks + Account Aggregator = next-gen "Splitwise + Fold" app

---

## What We Borrow From pixperk's Repos

| Repo | Language | Key Pattern We Steal |
|---|---|---|
| **pastel** | Rust + TypeScript | Binary WebSocket protocol, real-time room state machine, reload-safe client tokens, Rust Axum server |
| **kova** | Rust | WAL discipline, trait-based storage abstraction, SIGKILL-safe operations |
| **plethora** | Go | Dynamo-style storage, consistent hashing |
| **chug** | Go | High-speed ETL pipeline, PostgreSQL → ClickHouse (analytics layer) |
| **nosynK** | Go | Async job queue system (background AI processing) |
| **juzfs** | Rust | GFS-paper implementation → distributed receipt storage |
| **sqlite_mcp_server** | Go | MCP server pattern (AI tool integration) |

---

## Product: **Wise**

> *"Split smart. Settle instantly."*

### Core Differentiators

1. **AI Receipt Scanner** — photograph a bill, items parsed in <2s with Gemini Flash Vision, structured output via Pydantic
2. **Item-level assignment** — tap items, tap friends. No typing ever.
3. **Proportional tax/tip** — mathematically fair distribution (not even-split of extras)
4. **Minimize Cash Flow algorithm** — Splitwise's own algorithm, implemented in Rust, runs as a microservice
5. **UPI deep-links** — one tap to pay exact amount via any UPI app
6. **Guest flow** — no app install needed for diners; share a link → they see their portion → tap to pay UPI
7. **Free forever** — zero paywalls. Revenue via B2B (restaurants, corporate reimbursement)

---

## Tech Stack (Cost-Optimal, Production-Grade)

### Why This Stack

| Layer | Choice | Reason |
|---|---|---|
| **API Gateway / Core** | **Go (Fiber v3)** | Fastest HTTP, minimal memory, pixperk uses Go for all data-path work |
| **Real-time (WebSocket)** | **Rust (Axum + Tokio)** | pixperk's `pastel` proves: p99 <0.5ms, 1000 concurrent WS at 2 vCPU |
| **AI Parse Service** | **Python (FastAPI + Pydantic AI)** | LLM structured output, Gemini Flash vision |
| **Background Jobs** | **Go worker** | Inspired by pixperk's `nosynK` async job queue |
| **Database** | **PostgreSQL (Supabase free tier)** | ACID, row-level security, free |
| **Cache / Pub-Sub** | **Redis (Upstash free tier)** | Balance cache, session, WS fan-out |
| **Analytics** | **ClickHouse Cloud (free tier)** | Inspired by pixperk's `chug` ETL — expense analytics |
| **Object Storage** | **Cloudflare R2** | Receipt images, $0 egress fees |
| **Frontend** | **Next.js 15 (App Router)** | SSR for guest links, React components |
| **Mobile** | **React Native (Expo)** | Shared business logic with web |
| **Deployment** | **Fly.io** | Go/Rust: $0 hobby plan, 3 shared regions |
| **AI Model** | **Gemini 1.5 Flash** | $0.075/1M input tokens (cheapest multimodal) |

**Estimated monthly cost at 10k users: ~$8/month** (vs $200+ AWS equivalent)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                          │
│  Next.js Web         React Native Mobile                 │
│  (Guest view SSR)    (Camera + UPI deeplinks)            │
└────────────────┬────────────────────┬────────────────────┘
                 │                    │
         REST / GraphQL          WebSocket (binary)
                 │                    │
┌────────────────▼────────────────────▼────────────────────┐
│                  GO FIBER API GATEWAY                    │
│  Auth (Supabase JWT)  Rate limiting  Request routing     │
└───┬──────────────┬──────────────┬────────────────────────┘
    │              │              │
    ▼              ▼              ▼
┌───────┐    ┌─────────┐   ┌──────────────┐
│ RUST  │    │  GO     │   │  PYTHON      │
│Axum WS│    │  Core   │   │  AI Service  │
│Server │    │  API    │   │  FastAPI     │
│       │    │         │   │  + Pydantic  │
│ Live  │    │ Groups  │   │  Gemini Flash│
│ splits│    │ Expenses│   │  Vision      │
│ debt  │    │ Balances│   │              │
│ graph │    │ Settle  │   └──────┬───────┘
└───────┘    └────┬────┘         │
                  │              ▼
            ┌─────▼─────────────────────────────┐
            │         PostgreSQL (Supabase)      │
            │  Users, Events, Items, Assignments │
            │  Payments, Balances, SMS records   │
            └─────────────┬─────────────────────┘
                          │
              ┌───────────┴──────────┐
              ▼                      ▼
        ┌───────────┐          ┌──────────┐
        │  Redis    │          │Cloudflare│
        │ (Upstash) │          │    R2    │
        │  Cache    │          │ Receipts │
        │  Pub/Sub  │          └──────────┘
        └───────────┘
```

---

## Database Schema

Inspired by the research doc's schema + pixperk's kova trait-based design:

```sql
-- Core entities
users (id, phone, name, upi_id, avatar_url, created_at)
groups (id, name, host_id, is_ephemeral, created_at)
group_members (group_id, user_id, joined_at)

-- Receipt & splitting
events (id, group_id, name, restaurant, date, total, tax, tip)
receipts (id, event_id, image_url, raw_json, parsed_at)
receipt_items (id, receipt_id, name, amount, quantity)
item_assignments (item_id, user_id, share_fraction)  -- fractions sum to 1.0

-- Balances & settlements
balances (from_user, to_user, amount, updated_at)   -- net ledger
payments (id, from_user, to_user, amount, upi_ref, status, created_at)

-- Guest flow
guest_sessions (token, event_id, phone_hash, expires_at)

-- Analytics (replicated to ClickHouse)
expense_log (user_id, amount, category, ts)
```

---

## The Minimize Cash Flow Service (Rust)

Inspired by pixperk's system-level thinking in `kova` and `juzfs`:

```rust
// Debt simplification algorithm
// Input: balance matrix between n users
// Output: minimum set of transactions
pub fn minimize_cash_flow(balances: &HashMap<UserId, i64>) -> Vec<Transaction> {
    // 1. Compute net for each user
    // 2. Split into creditors/debtors heaps  
    // 3. Greedy matching: max-creditor pays max-debtor
    // Complexity: O(n log n)
}
```

This runs as a Rust Axum endpoint called by the Go API server.

---

## AI Receipt Parse Pipeline

```
Camera photo → R2 upload → Job Queue (nosynK-style) → Python AI Service
    → Gemini Flash Vision → Pydantic structured output → PostgreSQL
    → WebSocket broadcast to all event participants
```

**Pydantic schema:**
```python
class ReceiptItem(BaseModel):
    name: str
    price: float
    quantity: int = 1

class ParsedReceipt(BaseModel):
    restaurant: str | None
    items: list[ReceiptItem]
    subtotal: float
    tax: float
    tip: float
    total: float
    confidence: float  # 0-1, flag low confidence for user review
```

---

## Guest Flow (No App Install)

Inspired by pixperk's `pastel` reload-safe client token system:

1. Host taps "Share" → generates `wise.app/e/{token}` 
2. Guest opens link in browser (no install)
3. SSR (Next.js) renders their assigned items
4. Guest confirms or adjusts
5. "Pay ₹X" button → UPI deeplink: `upi://pay?pa={host_upi}&pn={name}&am={amount}&tn={event}`
6. Also shows QR code fallback

---

## Phased Delivery

### Phase 1 — Core MVP (2 weeks)
- [ ] Go API: user auth (phone OTP), groups, expenses (manual entry)
- [ ] PostgreSQL schema + Supabase setup
- [ ] Balance computation + minimize cash flow algorithm
- [ ] Next.js web: dashboard, group creation, expense entry
- [ ] UPI deeplink generation

### Phase 2 — AI Scanner (1 week)
- [ ] Python FastAPI AI service with Gemini Flash vision
- [ ] Pydantic receipt schema + structured output
- [ ] R2 image upload flow
- [ ] Item assignment UI (tap-to-assign)
- [ ] Proportional tax/tip distribution

### Phase 3 — Real-time (1 week)
- [ ] Rust WebSocket server (pastel architecture)
- [ ] Live balance updates as items are assigned
- [ ] Push notifications when someone settles

### Phase 4 — Guest Flow + Polish (1 week)
- [ ] Guest link generation + SSR rendering
- [ ] QR code generation for UPI amounts
- [ ] Mobile app (React Native / Expo)
- [ ] Analytics dashboard (ClickHouse)

---

## Open Questions

> [!IMPORTANT]
> **Q1: Should we build the mobile app first or web-first?**
> The document research suggests India is mobile-first. But web-first is faster to ship. Recommend web first (with mobile PWA), then React Native.

> [!IMPORTANT]  
> **Q2: Which AI model for receipts?**
> - **Gemini 1.5 Flash** — cheapest multimodal ($0.075/1M tokens), free 1500 RPD
> - **GPT-4o mini** — slightly more accurate, $0.15/1M tokens
> Recommend starting with Gemini Flash (free tier is generous), fallback to GPT-4o if accuracy is poor.

> [!WARNING]
> **Q3: SMS expense reading (NotificationListenerService)?**
> The research doc discusses using Android `NotificationListenerService` to auto-read bank SMS. This is technically feasible but Google Play policy is strict. Should we include this in scope, or skip and use Account Aggregator only?

> [!NOTE]
> **Q4: Start with `c:\wise` as the project root?**
> The wise directory already exists. Should I initialize the full project there?

---

## Verification Plan

### Build Checks
- `go build ./...` — Go API compiles
- `cargo build --workspace` — Rust services compile
- `npm run build` — Next.js builds without errors

### Automated Tests
- Go: `go test ./...` — API handlers, balance computation, debt minimization
- Rust: `cargo test --workspace` — WS protocol, cash flow algorithm
- Python: `pytest` — receipt parse schema validation

### Manual Verification
- Scan a real restaurant receipt photo → verify items parsed correctly
- Create a group with 3 users → split a bill → verify minimize cash flow output
- Open guest link on phone → tap UPI pay → verify deeplink launches UPI app
