// src/models.rs
// Serde-serializable structs for API request/response bodies.
// Kept flat and explicit — no over-abstraction.

use serde::{Deserialize, Serialize};

// ── REQUEST TYPES ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateSplitRequest {
    pub name: String,
    pub restaurant: Option<String>,
    pub participants: Vec<ParticipantInput>,
}

#[derive(Debug, Deserialize)]
pub struct ParticipantInput {
    pub name: String,
    pub emoji: String,
    pub upi_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AssignItemRequest {
    pub participant_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct GuestPayRequest {
    pub name: String,
    pub amount: i64,
    pub item_ids: Vec<String>,
    pub participant_id: Option<String>,
}

// ── RESPONSE TYPES ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SplitCreated {
    pub split_id: String,
    pub owner_token: String,
    pub token_created_at: String,
    pub guest_token: String,
    pub guest_link: String,
    pub ws_url: String,
}

#[derive(Debug, Serialize)]
pub struct SplitRow {
    pub id: String,
    pub name: String,
    pub restaurant: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub total_amount: i64,
    pub tax: i64,
    pub tip: i64,
    pub guest_token: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ParticipantRow {
    pub id: String,
    pub split_id: String,
    pub name: String,
    pub emoji: String,
    pub upi_id: Option<String>,
    pub is_guest: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct ItemRow {
    pub id: String,
    pub split_id: String,
    pub name: String,
    pub price: i64,
    pub quantity: i64,
    pub emoji: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AssignmentRow {
    pub item_id: String,
    pub participant_id: String,
    pub share_fraction: f64,
}

#[derive(Debug, Serialize)]
pub struct SplitDetail {
    pub split: SplitRow,
    pub participants: Vec<ParticipantRow>,
    pub items: Vec<ItemRow>,
    pub assignments: Vec<AssignmentRow>,
}

#[derive(Debug, Serialize)]
pub struct PersonSummary {
    pub participant_id: String,
    pub participant_name: String,
    pub participant_emoji: String,
    pub upi_id: Option<String>,
    pub subtotal: i64,
    pub tax_share: i64,
    pub tip_share: i64,
    pub total: i64,
    pub item_names: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct SplitSummaryResponse {
    pub split_name: String,
    pub restaurant: Option<String>,
    pub bill_total: i64,
    pub tax: i64,
    pub tip: i64,
    pub guest_link: String,
    pub summaries: Vec<PersonSummary>,
}
