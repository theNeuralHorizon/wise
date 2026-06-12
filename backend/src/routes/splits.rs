// src/routes/splits.rs
// Core split management: create, receipt upload, item assignment, summary.

use axum::{
    extract::{Multipart, Path, Query, State},
    http::HeaderMap,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    models::*,
    state::AppState,
};

// ── AUTH HELPER ───────────────────────────────────────────────────────────────

fn extract_owner_token(headers: &HeaderMap) -> Result<String> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".to_string()))?;

    let token = auth
        .strip_prefix("Bearer ")
        .ok_or_else(|| {
            AppError::Unauthorized("Authorization header must be 'Bearer <token>'".to_string())
        })?;

    if token.is_empty() {
        return Err(AppError::Unauthorized("Empty bearer token".to_string()));
    }

    Ok(token.to_string())
}

async fn verify_owner(state: &AppState, split_id: &str, owner_token: &str) -> Result<()> {
    let stored: Option<(String, String)> = sqlx::query_as(
        "SELECT owner_token, token_created_at FROM splits WHERE id = ?",
    )
    .bind(split_id)
    .fetch_optional(&state.db.pool)
    .await?;

    match stored {
        Some((ref token, ref created_at)) if token == owner_token => {
            if !created_at.is_empty() {
                if let Ok(created) = chrono::DateTime::parse_from_rfc3339(created_at) {
                    let age = chrono::Utc::now() - created.with_timezone(&chrono::Utc);
                    if age.num_days() > 7 {
                        return Err(AppError::Unauthorized("Owner token has expired (7 day limit). Please re-enter your token or create a new split.".to_string()));
                    }
                }
            }
            Ok(())
        }
        Some(_) => Err(AppError::Unauthorized("Invalid owner token".to_string())),
        None => Err(AppError::NotFound(format!("Split '{}' not found", split_id))),
    }
}

// ── VALIDATION HELPERS ────────────────────────────────────────────────────────

fn validate_participant_input(p: &ParticipantInput, idx: usize) -> Result<()> {
    let mut errors = serde_json::Map::new();

    if p.name.is_empty() || p.name.len() > 50 {
        errors.insert(
            format!("participants[{}].name", idx),
            json!("Name must be 1-50 characters"),
        );
    }

    let graphemes = unicode_segmentation::UnicodeSegmentation::graphemes(p.emoji.as_str(), true);
    let emoji_count = graphemes.count();
    if emoji_count != 1 {
        errors.insert(
            format!("participants[{}].emoji", idx),
            json!("Emoji must be a single grapheme cluster"),
        );
    }

    if let Some(ref upi) = p.upi_id {
        if upi.len() > 100 {
            errors.insert(
                format!("participants[{}].upi_id", idx),
                json!("UPI ID must be at most 100 characters"),
            );
        }
    }

    if !errors.is_empty() {
        return Err(AppError::Validation(json!(errors)));
    }
    Ok(())
}

fn validate_item_fields(name: &str, price: i64, quantity: i64, emoji: &str) -> Result<()> {
    let mut errors = serde_json::Map::new();

    if name.is_empty() || name.len() > 200 {
        errors.insert("name".to_string(), json!("Name must be 1-200 characters"));
    }

    if price <= 0 {
        errors.insert("price".to_string(), json!("Price must be greater than 0 (in paise)"));
    }

    if quantity < 1 {
        errors.insert("quantity".to_string(), json!("Quantity must be at least 1"));
    }

    let graphemes = unicode_segmentation::UnicodeSegmentation::graphemes(emoji, true);
    if graphemes.count() != 1 {
        errors.insert("emoji".to_string(), json!("Emoji must be a single grapheme cluster"));
    }

    if !errors.is_empty() {
        return Err(AppError::Validation(json!(errors)));
    }
    Ok(())
}

// ── IMAGE VALIDATION ──────────────────────────────────────────────────────────

fn validate_image_magic(bytes: &[u8]) -> Result<()> {
    if bytes.len() < 8 {
        return Err(AppError::BadRequest("File too small to be a valid image".to_string()));
    }

    let is_jpeg = bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF;
    let is_png = bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47;

    if !is_jpeg && !is_png {
        return Err(AppError::BadRequest(
            "Invalid image format. Only JPEG and PNG files are accepted.".to_string(),
        ));
    }

    Ok(())
}

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

    for (idx, p) in req.participants.iter().enumerate() {
        validate_participant_input(p, idx)?;
    }

    let split_id = Uuid::new_v4().to_string();

    let guest_token: String = {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        (0..24)
            .map(|_| rng.sample(rand::distributions::Alphanumeric) as char)
            .collect::<String>()
            .to_lowercase()
    };

    let owner_token: String = {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
        hex::encode(bytes)
    };

    let created_at = Utc::now().to_rfc3339();
    let host_name = &req.participants[0].name;

    let mut tx = state.db.pool.begin().await?;

    sqlx::query(
        "INSERT INTO splits (id, name, restaurant, created_by, created_at, guest_token, owner_token, token_created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&split_id)
    .bind(&req.name)
    .bind(&req.restaurant)
    .bind(host_name)
    .bind(&created_at)
    .bind(&guest_token)
    .bind(&owner_token)
    .bind(&created_at)
    .execute(&mut *tx)
    .await?;

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
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let port = std::env::var("PORT").unwrap_or_else(|_| "8081".to_string());
    let api_base_url = std::env::var("BASE_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("http://127.0.0.1:{}", port));
    let frontend_base_url = std::env::var("FRONTEND_BASE_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| api_base_url.clone());
    let ws_url = api_base_url
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        + &format!("/api/ws/{}", split_id);

    tracing::info!(split_id = %split_id, host = %host_name, "Split created");

    Ok(Json(SplitCreated {
        split_id: split_id.clone(),
        owner_token,
        token_created_at: created_at,
        guest_token: guest_token.clone(),
        guest_link: format!("{}/guest/{}", frontend_base_url, guest_token),
        ws_url,
    }))
}

// ── UPLOAD RECEIPT ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ReceiptUploadQuery {
    pub force: Option<bool>,
}

pub async fn upload_receipt(
    State(state): State<Arc<AppState>>,
    Path(split_id): Path<String>,
    Query(query): Query<ReceiptUploadQuery>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<impl IntoResponse> {
    let owner_token = extract_owner_token(&headers)?;
    verify_owner(&state, &split_id, &owner_token).await?;

    let force = query.force.unwrap_or(false);
    if !force {
        let assignment_count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM item_assignments ia JOIN items i ON i.id = ia.item_id WHERE i.split_id = ?",
        )
        .bind(&split_id)
        .fetch_one(&state.db.pool)
        .await?;

        if assignment_count.0 > 0 {
            return Err(AppError::Conflict(format!(
                "This split has {} existing item assignments. Re-uploading the receipt will destroy them. Pass ?force=true to confirm.",
                assignment_count.0
            )));
        }
    }

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

    validate_image_magic(&bytes)?;

    let parsed = state
        .ai
        .parse_receipt(&bytes)
        .await
        .map_err(|e| AppError::Ai(e.to_string()))?;

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

    let total_paise = parsed.total.round() as i64;
    let tax_paise = parsed.tax.round() as i64;
    let tip_paise = parsed.tip.round() as i64;

    sqlx::query(
        "UPDATE splits SET restaurant = ?, total_amount = ?, tax = ?, tip = ? WHERE id = ?",
    )
    .bind(&restaurant_to_set)
    .bind(total_paise)
    .bind(tax_paise)
    .bind(tip_paise)
    .bind(&split_id)
    .execute(&state.db.pool)
    .await?;

    sqlx::query("DELETE FROM items WHERE split_id = ?")
        .bind(&split_id)
        .execute(&state.db.pool)
        .await?;

    let mut inserted_items = Vec::with_capacity(parsed.items.len());
    for item in &parsed.items {
        let item_id = Uuid::new_v4().to_string();
        let actual_price = (item.price * item.quantity as f64).round() as i64;

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
            "unit_price": (item.price * 100.0).round() as i64,
            "quantity": item.quantity,
            "emoji": item.emoji,
        }));
    }

    let broadcast_msg = json!({
        "type": "receipt_parsed",
        "split_id": split_id,
        "items_count": parsed.items.len(),
        "restaurant": parsed.restaurant,
        "totals": {
            "subtotal": total_paise - tax_paise - tip_paise,
            "tax": tax_paise,
            "tip": tip_paise,
            "total": total_paise,
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
            "subtotal": total_paise - tax_paise - tip_paise,
            "tax": tax_paise,
            "tip": tip_paise,
            "total": total_paise,
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
    let row = sqlx::query_as::<_, (String, String, Option<String>, String, String, i64, i64, i64, String)>(
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

    let participants: Vec<(String, String, String, String, Option<String>, bool)> = sqlx::query_as(
        "SELECT id, split_id, name, emoji, upi_id, is_guest FROM participants WHERE split_id = ? ORDER BY rowid",
    )
    .bind(&split_id)
    .fetch_all(&state.db.pool)
    .await?;

    let items: Vec<(String, String, String, i64, i64, String)> = sqlx::query_as(
        "SELECT id, split_id, name, price, quantity, emoji FROM items WHERE split_id = ? ORDER BY rowid",
    )
    .bind(&split_id)
    .fetch_all(&state.db.pool)
    .await?;

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
    headers: HeaderMap,
    Json(req): Json<AssignItemRequest>,
) -> Result<impl IntoResponse> {
    let owner_token = extract_owner_token(&headers)?;
    verify_owner(&state, &split_id, &owner_token).await?;

    let _: (String,) =
        sqlx::query_as("SELECT id FROM items WHERE id = ? AND split_id = ?")
            .bind(&item_id)
            .bind(&split_id)
            .fetch_one(&state.db.pool)
            .await
            .map_err(|_| {
                AppError::NotFound(format!("Item '{}' not in split '{}'", item_id, split_id))
            })?;

    let mut tx = state.db.pool.begin().await?;

    sqlx::query("DELETE FROM item_assignments WHERE item_id = ?")
        .bind(&item_id)
        .execute(&mut *tx)
        .await?;

    if !req.participant_ids.is_empty() {
        let n = req.participant_ids.len() as f64;
        let share = 1.0 / n;

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

// ── GET SUMMARY (single JOIN query, no N+1) ────────────────────────────────────

pub async fn get_summary(
    State(state): State<Arc<AppState>>,
    Path(split_id): Path<String>,
) -> Result<impl IntoResponse> {
    let (split_name, restaurant, total_amount, tax, tip, guest_token): (String, Option<String>, i64, i64, i64, String) =
        sqlx::query_as(
            "SELECT name, restaurant, total_amount, tax, tip, guest_token FROM splits WHERE id = ?",
        )
        .bind(&split_id)
        .fetch_one(&state.db.pool)
        .await
        .map_err(|_| AppError::NotFound("Split not found".to_string()))?;

    let total_subtotal: i64 = sqlx::query_as::<_, (i64,)>(
        "SELECT COALESCE(SUM(CAST(i.price * ia.share_fraction AS INTEGER)), 0)
         FROM items i
         JOIN item_assignments ia ON ia.item_id = i.id
         WHERE i.split_id = ?",
    )
    .bind(&split_id)
    .fetch_one(&state.db.pool)
    .await
    .map(|r| r.0)
    .unwrap_or(0);

    let summary_rows: Vec<(String, String, String, Option<String>, i64, String)> = sqlx::query_as(
        "SELECT p.id, p.name, p.emoji, p.upi_id,
                COALESCE(SUM(CAST(i.price * ia.share_fraction AS INTEGER)), 0) as subtotal,
                GROUP_CONCAT(i.name, ', ') as item_names
         FROM participants p
         LEFT JOIN item_assignments ia ON ia.participant_id = p.id
         LEFT JOIN items i ON i.id = ia.item_id AND i.split_id = ?
         WHERE p.split_id = ?
         GROUP BY p.id, p.name, p.emoji, p.upi_id
         ORDER BY p.rowid",
    )
    .bind(&split_id)
    .bind(&split_id)
    .fetch_all(&state.db.pool)
    .await?;

    let mut summaries = Vec::with_capacity(summary_rows.len());

    for (pid, name, emoji, upi_id, subtotal, item_names_str) in summary_rows {
        let fraction = if total_subtotal > 0 {
            subtotal as f64 / total_subtotal as f64
        } else {
            0.0
        };
        let tax_share = (tax as f64 * fraction).round() as i64;
        let tip_share = (tip as f64 * fraction).round() as i64;
        let total = subtotal + tax_share + tip_share;

        let item_names: Vec<String> = if item_names_str.is_empty() {
            Vec::new()
        } else {
            item_names_str.split(", ").map(|s| s.to_string()).collect()
        };

        summaries.push(PersonSummary {
            participant_id: pid,
            participant_name: name,
            participant_emoji: emoji,
            upi_id,
            subtotal,
            tax_share,
            tip_share,
            total,
            item_names,
        });
    }

    let port = std::env::var("PORT").unwrap_or_else(|_| "8081".to_string());
    let base_url = std::env::var("BASE_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("http://127.0.0.1:{}", port));
    let frontend_base_url = std::env::var("FRONTEND_BASE_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| base_url);

    Ok(Json(SplitSummaryResponse {
        split_name,
        restaurant,
        bill_total: total_amount,
        tax,
        tip,
        guest_link: format!("{}/guest/{}", frontend_base_url, guest_token),
        summaries,
    }))
}

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────

pub async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
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
    pub price: i64,
    pub quantity: i64,
    pub emoji: String,
}

pub async fn add_item(
    State(state): State<Arc<AppState>>,
    Path(split_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<AddItemRequest>,
) -> Result<impl IntoResponse> {
    let owner_token = extract_owner_token(&headers)?;
    verify_owner(&state, &split_id, &owner_token).await?;

    validate_item_fields(&payload.name, payload.price, payload.quantity, &payload.emoji)?;

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

    recalculate_split_total(&state.db.pool, &split_id).await?;

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
    pub price: i64,
}

pub async fn edit_item(
    State(state): State<Arc<AppState>>,
    Path((split_id, item_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(payload): Json<EditItemRequest>,
) -> Result<impl IntoResponse> {
    let owner_token = extract_owner_token(&headers)?;
    verify_owner(&state, &split_id, &owner_token).await?;

    if payload.name.is_empty() || payload.name.len() > 200 {
        return Err(AppError::Validation(json!({"name": "Name must be 1-200 characters"})));
    }
    if payload.price <= 0 {
        return Err(AppError::Validation(json!({"price": "Price must be greater than 0"})));
    }

    sqlx::query(
        "UPDATE items SET name = ?, price = ? WHERE id = ? AND split_id = ?",
    )
    .bind(&payload.name)
    .bind(payload.price)
    .bind(&item_id)
    .bind(&split_id)
    .execute(&state.db.pool)
    .await?;

    recalculate_split_total(&state.db.pool, &split_id).await?;

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
    headers: HeaderMap,
) -> Result<impl IntoResponse> {
    let owner_token = extract_owner_token(&headers)?;
    verify_owner(&state, &split_id, &owner_token).await?;

    sqlx::query("DELETE FROM items WHERE id = ? AND split_id = ?")
        .bind(&item_id)
        .bind(&split_id)
        .execute(&state.db.pool)
        .await?;

    sqlx::query("DELETE FROM item_assignments WHERE item_id = ?")
        .bind(&item_id)
        .execute(&state.db.pool)
        .await?;

    recalculate_split_total(&state.db.pool, &split_id).await?;

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
    pub name: Option<String>,
    pub restaurant: String,
    pub tax: Option<i64>,
    pub tip: Option<i64>,
}

pub async fn update_split(
    State(state): State<Arc<AppState>>,
    Path(split_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateSplitRequest>,
) -> Result<impl IntoResponse> {
    let owner_token = extract_owner_token(&headers)?;
    verify_owner(&state, &split_id, &owner_token).await?;

    let split_name = payload.name.as_deref().unwrap_or(&payload.restaurant);

    if let (Some(tax), Some(tip)) = (payload.tax, payload.tip) {
        sqlx::query(
            "UPDATE splits SET restaurant = ?, name = ?, tax = ?, tip = ? WHERE id = ?",
        )
        .bind(&payload.restaurant)
        .bind(split_name)
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
        .bind(split_name)
        .bind(&split_id)
        .execute(&state.db.pool)
        .await?;
    }

    recalculate_split_total(&state.db.pool, &split_id).await?;

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
    let row: (Option<i64>,) = sqlx::query_as(
        "SELECT SUM(price * quantity) FROM items WHERE split_id = ?"
    )
    .bind(split_id)
    .fetch_one(pool)
    .await?;

    let subtotal = row.0.unwrap_or(0);

    let split_row: (i64, i64) = sqlx::query_as(
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
