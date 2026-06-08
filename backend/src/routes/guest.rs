// src/routes/guest.rs
// Guest flow: no-account, link-based access to a split.
// Guests see all items, select their own, and pay via UPI deeplink.

use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    models::GuestPayRequest,
    state::AppState,
};

/// Load guest view from token (no auth required)
pub async fn get_guest_view(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse> {
    let row: (String, String, Option<String>, f64, f64, f64) = sqlx::query_as(
        "SELECT id, name, restaurant, total_amount, tax, tip FROM splits WHERE guest_token = ?",
    )
    .bind(&token)
    .fetch_one(&state.db.pool)
    .await
    .map_err(|_| AppError::NotFound("Guest link not found or has expired".to_string()))?;

    let (split_id, name, restaurant, total, tax, tip) = row;

    // Load items
    let items: Vec<(String, String, f64, i64, String)> = sqlx::query_as(
        "SELECT id, name, price, quantity, emoji FROM items WHERE split_id = ? ORDER BY rowid",
    )
    .bind(&split_id)
    .fetch_all(&state.db.pool)
    .await?;

    // Host info (first participant = host)
    let host: Option<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT name, emoji, upi_id FROM participants WHERE split_id = ? ORDER BY rowid LIMIT 1",
    )
    .bind(&split_id)
    .fetch_optional(&state.db.pool)
    .await?;

    let (host_name, host_emoji, host_upi) = host
        .unwrap_or_else(|| ("Host".to_string(), "😊".to_string(), None));

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let base_url = std::env::var("BASE_URL").unwrap_or_else(|_| format!("http://localhost:{}", port));
    let ws_url = base_url
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        + &format!("/api/ws/{}", split_id);

    Ok(Json(json!({
        "split_id": split_id,
        "name": name,
        "restaurant": restaurant,
        "total": total,
        "tax": tax,
        "tip": tip,
        "host": {
            "name": host_name,
            "emoji": host_emoji,
            "upi_id": host_upi,
        },
        "items": items.iter().map(|i| json!({
            "id": i.0, "name": i.1, "price": i.2, "quantity": i.3, "emoji": i.4
        })).collect::<Vec<_>>(),
        "ws_url": ws_url,
    })))
}

/// Guest submits their item selection and initiates payment
pub async fn guest_pay(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
    Json(body): Json<GuestPayRequest>,
) -> Result<impl IntoResponse> {
    if body.amount <= 0.0 {
        return Err(AppError::BadRequest("Amount must be positive".to_string()));
    }

    let (split_id, host_upi): (String, Option<String>) = sqlx::query_as(
        "SELECT s.id, p.upi_id FROM splits s
         LEFT JOIN participants p ON p.split_id = s.id
         WHERE s.guest_token = ?
         ORDER BY p.rowid LIMIT 1",
    )
    .bind(&token)
    .fetch_one(&state.db.pool)
    .await
    .map_err(|_| AppError::NotFound("Guest token not found".to_string()))?;

    // Record payment
    let payment_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO payments (id, split_id, from_participant, to_participant, amount, status, created_at)
         VALUES (?, ?, ?, 'host', ?, 'pending', ?)",
    )
    .bind(&payment_id)
    .bind(&split_id)
    .bind(&body.name)
    .bind(body.amount)
    .bind(&now)
    .execute(&state.db.pool)
    .await?;

    // Notify host via WebSocket
    let event = json!({
        "type": "guest_paying",
        "guest_name": body.name,
        "amount": body.amount,
        "payment_id": payment_id,
        "item_ids": body.item_ids,
    })
    .to_string();
    state.broadcast(&split_id, &event).await;

    // Build UPI deeplink for guest to complete payment
    let upi_id = host_upi.unwrap_or_else(|| "host@upi".to_string());
    let upi_deeplink = format!(
        "upi://pay?pa={}&pn=WiseSplit&am={:.2}&tn=WiseSplit&cu=INR",
        upi_id,
        body.amount
    );

    tracing::info!(
        split_id = %split_id,
        guest = %body.name,
        amount = body.amount,
        "Guest payment initiated"
    );

    Ok(Json(json!({
        "status": "ok",
        "payment_id": payment_id,
        "upi_deeplink": upi_deeplink,
        "upi_id": upi_id,
        "message": format!("Pay ₹{:.2} to {}", body.amount, upi_id),
    })))
}
