// src/routes/splits.rs
// Core split management: create, receipt upload, item assignment, summary.

use axum::{
    extract::{Multipart, Path, State},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    models::*,
    state::AppState,
};

// ── CREATE SPLIT ───────────────────────────────────────────────────────────────

pub async fn create_split(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSplitRequest>,
) -> Result<impl IntoResponse> {
    if req.participants.is_empty() {
        return Err(AppError::BadRequest(
            "At least one participant required".to_string(),
        ));
    }

    let split_id = Uuid::new_v4().to_string();
    // Short human-readable token for guest links (8 chars, URL-safe)
    let guest_token = {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        (0..8)
            .map(|_| rng.sample(rand::distributions::Alphanumeric) as char)
            .collect::<String>()
            .to_lowercase()
    };
    let created_at = Utc::now().to_rfc3339();
    let host_name = &req.participants[0].name;

    sqlx::query(
        "INSERT INTO splits (id, name, restaurant, created_by, created_at, guest_token)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&split_id)
    .bind(&req.name)
    .bind(&req.restaurant)
    .bind(host_name)
    .bind(&created_at)
    .bind(&guest_token)
    .execute(&state.db.pool)
    .await?;

    // Insert all participants in a loop (small N, not worth batching)
    for p in &req.participants {
        let pid = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO participants (id, split_id, name, emoji, upi_id, is_guest)
             VALUES (?, ?, ?, ?, ?, 0)",
        )
        .bind(&pid)
        .bind(&split_id)
        .bind(&p.name)
        .bind(&p.emoji)
        .bind(&p.upi_id)
        .execute(&state.db.pool)
        .await?;
    }

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let base_url = std::env::var("BASE_URL").unwrap_or_else(|_| format!("http://localhost:{}", port));
    let ws_url = base_url
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        + &format!("/api/ws/{}", split_id);

    tracing::info!(split_id = %split_id, host = %host_name, "Split created");

    Ok(Json(SplitCreated {
        split_id: split_id.clone(),
        guest_token: guest_token.clone(),
        guest_link: format!("{}/guest/{}", base_url, guest_token),
        ws_url,
    }))
}

// ── UPLOAD RECEIPT ────────────────────────────────────────────────────────────

pub async fn upload_receipt(
    State(state): State<Arc<AppState>>,
    Path(split_id): Path<String>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse> {
    // Verify split exists
    let _: (String,) = sqlx::query_as("SELECT id FROM splits WHERE id = ?")
        .bind(&split_id)
        .fetch_one(&state.db.pool)
        .await
        .map_err(|_| AppError::NotFound(format!("Split {} not found", split_id)))?;

    // Extract image bytes from multipart
    let mut image_bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {}", e)))?
    {
        let field_name = field.name().unwrap_or("").to_string();
        if field_name == "receipt" || field_name == "file" || field_name == "image" {
            image_bytes = Some(
                field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("Failed to read field: {}", e)))?
                    .to_vec(),
            );
        }
    }

    let bytes = image_bytes.ok_or_else(|| {
        AppError::BadRequest(
            "Expected multipart field named 'receipt', 'file', or 'image'".to_string(),
        )
    })?;

    // AI parse — runs async, does not block the Tokio thread pool
    // Note: Gemini call is fully async (no blocking spawn needed since reqwest is async)
    let parsed = state
        .ai
        .parse_receipt(&bytes)
        .await
        .map_err(|e| AppError::Ai(e.to_string()))?;

    // Determine the restaurant name to set. If it's a mock parse, we preserve
    // any manually entered restaurant name.
    let mut restaurant_to_set = parsed.restaurant.clone();
    if parsed.is_mock {
        let existing: (Option<String>,) = sqlx::query_as(
            "SELECT restaurant FROM splits WHERE id = ?"
        )
        .bind(&split_id)
        .fetch_one(&state.db.pool)
        .await?;
        if let Some(rest) = existing.0 {
            if !rest.trim().is_empty() {
                restaurant_to_set = Some(rest);
            }
        }
    }

    // Update split with totals
    sqlx::query(
        "UPDATE splits SET restaurant = ?, total_amount = ?, tax = ?, tip = ? WHERE id = ?",
    )
    .bind(&restaurant_to_set)
    .bind(parsed.total)
    .bind(parsed.tax)
    .bind(parsed.tip)
    .bind(&split_id)
    .execute(&state.db.pool)
    .await?;

    // Delete any existing items (re-scan)
    sqlx::query("DELETE FROM items WHERE split_id = ?")
        .bind(&split_id)
        .execute(&state.db.pool)
        .await?;

    // Insert parsed items
    let mut inserted_items = Vec::with_capacity(parsed.items.len());
    for item in &parsed.items {
        let item_id = Uuid::new_v4().to_string();
        let actual_price = item.price * item.quantity as f64;

        sqlx::query(
            "INSERT INTO items (id, split_id, name, price, quantity, emoji) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&item_id)
        .bind(&split_id)
        .bind(&item.name)
        .bind(actual_price)
        .bind(item.quantity)
        .bind(&item.emoji)
        .execute(&state.db.pool)
        .await?;

        inserted_items.push(json!({
            "id": item_id,
            "name": item.name,
            "price": actual_price,
            "unit_price": item.price,
            "quantity": item.quantity,
            "emoji": item.emoji,
        }));
    }

    // Broadcast parse-complete event to all WebSocket subscribers
    let broadcast_msg = json!({
        "type": "receipt_parsed",
        "split_id": split_id,
        "items_count": parsed.items.len(),
        "restaurant": parsed.restaurant,
        "totals": {
            "subtotal": parsed.subtotal,
            "tax": parsed.tax,
            "tip": parsed.tip,
            "total": parsed.total,
        },
        "is_mock": parsed.is_mock,
    })
    .to_string();
    state.broadcast(&split_id, &broadcast_msg).await;

    tracing::info!(
        split_id = %split_id,
        items = parsed.items.len(),
        is_mock = parsed.is_mock,
        "Receipt parsed"
    );

    Ok(Json(json!({
        "status": "ok",
        "items": inserted_items,
        "totals": {
            "subtotal": parsed.subtotal,
            "tax": parsed.tax,
            "tip": parsed.tip,
            "total": parsed.total,
        },
        "restaurant": parsed.restaurant,
        "confidence": parsed.confidence,
        "is_mock": parsed.is_mock,
    })))
}

// ── GET SPLIT DETAIL ──────────────────────────────────────────────────────────

pub async fn get_split(
    State(state): State<Arc<AppState>>,
    Path(split_id): Path<String>,
) -> Result<impl IntoResponse> {
    // Single query for split metadata
    let row = sqlx::query_as::<_, (String, String, Option<String>, String, String, f64, f64, f64, String)>(
        "SELECT id, name, restaurant, created_by, created_at, total_amount, tax, tip, guest_token
         FROM splits WHERE id = ?",
    )
    .bind(&split_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(|_| AppError::NotFound(format!("Split '{}' not found", split_id)))?;

    let split = SplitRow {
        id: row.0, name: row.1, restaurant: row.2, created_by: row.3,
        created_at: row.4, total_amount: row.5, tax: row.6, tip: row.7, guest_token: row.8,
    };

    // Participants
    let participants: Vec<(String, String, String, String, Option<String>, bool)> = sqlx::query_as(
        "SELECT id, split_id, name, emoji, upi_id, is_guest FROM participants WHERE split_id = ? ORDER BY rowid",
    )
    .bind(&split_id)
    .fetch_all(&state.db.pool)
    .await?;

    // Items
    let items: Vec<(String, String, String, f64, i64, String)> = sqlx::query_as(
        "SELECT id, split_id, name, price, quantity, emoji FROM items WHERE split_id = ? ORDER BY rowid",
    )
    .bind(&split_id)
    .fetch_all(&state.db.pool)
    .await?;

    // Assignments (single JOIN — avoids N+1)
    let assignments: Vec<(String, String, f64)> = sqlx::query_as(
        "SELECT ia.item_id, ia.participant_id, ia.share_fraction
         FROM item_assignments ia
         JOIN items i ON i.id = ia.item_id
         WHERE i.split_id = ?",
    )
    .bind(&split_id)
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(SplitDetail {
        split,
        participants: participants
            .into_iter()
            .map(|(id, split_id, name, emoji, upi_id, is_guest)| ParticipantRow {
                id, split_id, name, emoji, upi_id, is_guest,
            })
            .collect(),
        items: items
            .into_iter()
            .map(|(id, split_id, name, price, quantity, emoji)| ItemRow {
                id, split_id, name, price, quantity, emoji,
            })
            .collect(),
        assignments: assignments
            .into_iter()
            .map(|(item_id, participant_id, share_fraction)| AssignmentRow {
                item_id, participant_id, share_fraction,
            })
            .collect(),
    }))
}

// ── ASSIGN ITEM ────────────────────────────────────────────────────────────────

pub async fn assign_item(
    State(state): State<Arc<AppState>>,
    Path((split_id, item_id)): Path<(String, String)>,
    Json(req): Json<AssignItemRequest>,
) -> Result<impl IntoResponse> {
    // Verify item belongs to this split
    let _: (String,) =
        sqlx::query_as("SELECT id FROM items WHERE id = ? AND split_id = ?")
            .bind(&item_id)
            .bind(&split_id)
            .fetch_one(&state.db.pool)
            .await
            .map_err(|_| {
                AppError::NotFound(format!("Item '{}' not in split '{}'", item_id, split_id))
            })?;

    // Atomic: delete old + insert new in a transaction
    let mut tx = state.db.pool.begin().await?;

    sqlx::query("DELETE FROM item_assignments WHERE item_id = ?")
        .bind(&item_id)
        .execute(&mut *tx)
        .await?;

    if !req.participant_ids.is_empty() {
        let n = req.participant_ids.len() as f64;
        let share = 1.0 / n; // Equal split by default

        for pid in &req.participant_ids {
            sqlx::query(
                "INSERT INTO item_assignments (item_id, participant_id, share_fraction)
                 VALUES (?, ?, ?)",
            )
            .bind(&item_id)
            .bind(pid)
            .bind(share)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    // Broadcast assignment update
    let msg = json!({
        "type": "item_assigned",
        "split_id": split_id,
        "item_id": item_id,
        "participant_ids": req.participant_ids,
    })
    .to_string();
    state.broadcast(&split_id, &msg).await;

    Ok(Json(json!({ "status": "ok", "item_id": item_id })))
}

// ── GET SUMMARY ────────────────────────────────────────────────────────────────

pub async fn get_summary(
    State(state): State<Arc<AppState>>,
    Path(split_id): Path<String>,
) -> Result<impl IntoResponse> {
    let (split_name, restaurant, total_amount, tax, tip, guest_token): (String, Option<String>, f64, f64, f64, String) =
        sqlx::query_as(
            "SELECT name, restaurant, total_amount, tax, tip, guest_token FROM splits WHERE id = ?",
        )
        .bind(&split_id)
        .fetch_one(&state.db.pool)
        .await
        .map_err(|_| AppError::NotFound("Split not found".to_string()))?;

    // Participants
    let participants: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT id, name, emoji, upi_id FROM participants WHERE split_id = ? ORDER BY rowid",
    )
    .bind(&split_id)
    .fetch_all(&state.db.pool)
    .await?;

    // Total assigned subtotal (for proportional tax/tip calculation)
    let total_subtotal: f64 = sqlx::query_as::<_, (f64,)>(
        "SELECT COALESCE(SUM(i.price * ia.share_fraction), 0.0)
         FROM items i
         JOIN item_assignments ia ON ia.item_id = i.id
         WHERE i.split_id = ?",
    )
    .bind(&split_id)
    .fetch_one(&state.db.pool)
    .await
    .map(|r| r.0)
    .unwrap_or(0.0);

    let mut summaries = Vec::with_capacity(participants.len());

    for (pid, name, emoji, upi_id) in &participants {
        // Per-participant subtotal (single JOIN query)
        let subtotal: f64 = sqlx::query_as::<_, (f64,)>(
            "SELECT COALESCE(SUM(i.price * ia.share_fraction), 0.0)
             FROM items i
             JOIN item_assignments ia ON ia.item_id = i.id AND ia.participant_id = ?
             WHERE i.split_id = ?",
        )
        .bind(pid)
        .bind(&split_id)
        .fetch_one(&state.db.pool)
        .await
        .map(|r| r.0)
        .unwrap_or(0.0);

        // Proportional tax and tip (fair split — not even)
        let fraction = if total_subtotal > 0.0 { subtotal / total_subtotal } else { 0.0 };
        let tax_share = (tax * fraction * 100.0).round() / 100.0;
        let tip_share = (tip * fraction * 100.0).round() / 100.0;
        let total = (subtotal + tax_share + tip_share) * 100.0 / 100.0;

        // Item names for this participant
        let item_names: Vec<String> = sqlx::query_as::<_, (String,)>(
            "SELECT i.name FROM items i
             JOIN item_assignments ia ON ia.item_id = i.id AND ia.participant_id = ?
             WHERE i.split_id = ?",
        )
        .bind(pid)
        .bind(&split_id)
        .fetch_all(&state.db.pool)
        .await
        .map(|rows| rows.into_iter().map(|(n,)| n).collect())
        .unwrap_or_default();

        summaries.push(PersonSummary {
            participant_id: pid.clone(),
            participant_name: name.clone(),
            participant_emoji: emoji.clone(),
            upi_id: upi_id.clone(),
            subtotal: (subtotal * 100.0).round() / 100.0,
            tax_share,
            tip_share,
            total,
            item_names,
        });
    }

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let base_url = std::env::var("BASE_URL").unwrap_or_else(|_| format!("http://localhost:{}", port));

    Ok(Json(SplitSummaryResponse {
        split_name,
        restaurant,
        bill_total: total_amount,
        tax,
        tip,
        guest_link: format!("{}/guest/{}", base_url, guest_token),
        summaries,
    }))
}

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────

pub async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // Ping DB to verify it's healthy
    let db_ok = sqlx::query("SELECT 1")
        .execute(&state.db.pool)
        .await
        .is_ok();

    let status = if db_ok { "ok" } else { "degraded" };
    Json(json!({
        "status": status,
        "service": "wise-server",
        "version": env!("CARGO_PKG_VERSION"),
        "db": if db_ok { "healthy" } else { "unreachable" },
    }))
}

// ── MANUAL SPLIT UPDATES ──────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct AddItemRequest {
    pub name: String,
    pub price: f64,
    pub quantity: i64,
    pub emoji: String,
}

pub async fn add_item(
    State(state): State<Arc<AppState>>,
    Path(split_id): Path<String>,
    Json(payload): Json<AddItemRequest>,
) -> Result<impl IntoResponse> {
    let item_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO items (id, split_id, name, price, quantity, emoji)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&item_id)
    .bind(&split_id)
    .bind(&payload.name)
    .bind(payload.price)
    .bind(payload.quantity)
    .bind(&payload.emoji)
    .execute(&state.db.pool)
    .await?;

    // Recalculate split total
    recalculate_split_total(&state.db.pool, &split_id).await?;

    // Broadcast change
    let event = serde_json::json!({
        "type": "item_added",
        "item": {
            "id": item_id,
            "name": payload.name,
            "price": payload.price,
            "quantity": payload.quantity,
            "emoji": payload.emoji,
        }
    })
    .to_string();
    state.broadcast(&split_id, &event).await;

    Ok(Json(serde_json::json!({ "status": "ok", "item_id": item_id })))
}

#[derive(Debug, serde::Deserialize)]
pub struct EditItemRequest {
    pub name: String,
    pub price: f64,
}

pub async fn edit_item(
    State(state): State<Arc<AppState>>,
    Path((split_id, item_id)): Path<(String, String)>,
    Json(payload): Json<EditItemRequest>,
) -> Result<impl IntoResponse> {
    sqlx::query(
        "UPDATE items SET name = ?, price = ? WHERE id = ? AND split_id = ?",
    )
    .bind(&payload.name)
    .bind(payload.price)
    .bind(&item_id)
    .bind(&split_id)
    .execute(&state.db.pool)
    .await?;

    // Recalculate split total
    recalculate_split_total(&state.db.pool, &split_id).await?;

    // Broadcast change
    let event = serde_json::json!({
        "type": "item_edited",
        "item_id": item_id,
        "name": payload.name,
        "price": payload.price,
    })
    .to_string();
    state.broadcast(&split_id, &event).await;

    Ok(Json(serde_json::json!({ "status": "ok" })))
}

pub async fn delete_item(
    State(state): State<Arc<AppState>>,
    Path((split_id, item_id)): Path<(String, String)>,
) -> Result<impl IntoResponse> {
    sqlx::query("DELETE FROM items WHERE id = ? AND split_id = ?")
        .bind(&item_id)
        .bind(&split_id)
        .execute(&state.db.pool)
        .await?;

    // Delete assignments for this item
    sqlx::query("DELETE FROM item_assignments WHERE item_id = ?")
        .bind(&item_id)
        .execute(&state.db.pool)
        .await?;

    // Recalculate split total
    recalculate_split_total(&state.db.pool, &split_id).await?;

    // Broadcast change
    let event = serde_json::json!({
        "type": "item_deleted",
        "item_id": item_id,
    })
    .to_string();
    state.broadcast(&split_id, &event).await;

    Ok(Json(serde_json::json!({ "status": "ok" })))
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateSplitRequest {
    pub restaurant: String,
    pub tax: Option<f64>,
    pub tip: Option<f64>,
}

pub async fn update_split(
    State(state): State<Arc<AppState>>,
    Path(split_id): Path<String>,
    Json(payload): Json<UpdateSplitRequest>,
) -> Result<impl IntoResponse> {
    if let (Some(tax), Some(tip)) = (payload.tax, payload.tip) {
        sqlx::query(
            "UPDATE splits SET restaurant = ?, name = ?, tax = ?, tip = ? WHERE id = ?",
        )
        .bind(&payload.restaurant)
        .bind(&payload.restaurant)
        .bind(tax)
        .bind(tip)
        .bind(&split_id)
        .execute(&state.db.pool)
        .await?;
    } else {
        sqlx::query(
            "UPDATE splits SET restaurant = ?, name = ? WHERE id = ?",
        )
        .bind(&payload.restaurant)
        .bind(&payload.restaurant)
        .bind(&split_id)
        .execute(&state.db.pool)
        .await?;
    }

    // Recalculate split total
    recalculate_split_total(&state.db.pool, &split_id).await?;

    // Broadcast change
    let event = serde_json::json!({
        "type": "split_updated",
        "restaurant": payload.restaurant,
        "tax": payload.tax,
        "tip": payload.tip,
    })
    .to_string();
    state.broadcast(&split_id, &event).await;

    Ok(Json(serde_json::json!({ "status": "ok" })))
}

async fn recalculate_split_total(pool: &sqlx::Pool<sqlx::Sqlite>, split_id: &str) -> Result<()> {
    // Sum prices
    let row: (Option<f64>,) = sqlx::query_as(
        "SELECT SUM(price * quantity) FROM items WHERE split_id = ?"
    )
    .bind(split_id)
    .fetch_one(pool)
    .await?;

    let subtotal = row.0.unwrap_or(0.0);

    // Get current tax/tip from splits table
    let split_row: (f64, f64) = sqlx::query_as(
        "SELECT tax, tip FROM splits WHERE id = ?"
    )
    .bind(split_id)
    .fetch_one(pool)
    .await?;

    let (tax, tip) = split_row;
    let total = subtotal + tax + tip;

    sqlx::query(
        "UPDATE splits SET total_amount = ? WHERE id = ?"
    )
    .bind(total)
    .bind(split_id)
    .execute(pool)
    .await?;

    Ok(())
}
