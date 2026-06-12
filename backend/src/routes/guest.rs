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

fn sanitize_upi_id(upi: &str) -> String {
    upi.chars()
        .filter(|c| c.is_alphanumeric() || *c == '@' || *c == '.' || *c == '-')
        .collect()
}

pub async fn get_guest_view(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse> {
    let row: (String, String, Option<String>, i64, i64, i64) = sqlx::query_as(
        "SELECT id, name, restaurant, total_amount, tax, tip FROM splits WHERE guest_token = ?",
    )
    .bind(&token)
    .fetch_one(&state.db.pool)
    .await
    .map_err(|_| AppError::NotFound("Guest link not found or has expired".to_string()))?;

    let (split_id, name, restaurant, total, tax, tip) = row;

    let items: Vec<(String, String, i64, i64, String)> = sqlx::query_as(
        "SELECT id, name, price, quantity, emoji FROM items WHERE split_id = ? ORDER BY rowid",
    )
    .bind(&split_id)
    .fetch_all(&state.db.pool)
    .await?;

    let host: Option<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT name, emoji, upi_id FROM participants WHERE split_id = ? ORDER BY rowid LIMIT 1",
    )
    .bind(&split_id)
    .fetch_optional(&state.db.pool)
    .await?;

    let (host_name, host_emoji, host_upi) = host
        .unwrap_or_else(|| ("Host".to_string(), "😊".to_string(), None));

    let port = std::env::var("PORT").unwrap_or_else(|_| "8081".to_string());
    let base_url = std::env::var("BASE_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("http://127.0.0.1:{}", port));
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

pub async fn guest_pay(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
    Json(body): Json<GuestPayRequest>,
) -> Result<impl IntoResponse> {
    if body.amount <= 0 {
        return Err(AppError::BadRequest("Amount must be positive".to_string()));
    }

    let (split_id, host_upi, host_participant_id): (String, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT s.id, p_upi.upi_id, p_upi.id
         FROM splits s
         LEFT JOIN participants p_upi ON p_upi.split_id = s.id
         WHERE s.guest_token = ?
         ORDER BY p_upi.rowid LIMIT 1",
    )
    .bind(&token)
    .fetch_one(&state.db.pool)
    .await
    .map_err(|_| AppError::NotFound("Guest token not found".to_string()))?;

    let from_participant_id = if let Some(ref pid) = body.participant_id {
        pid.clone()
    } else {
        let existing: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM participants WHERE split_id = ? AND name = ? LIMIT 1",
        )
        .bind(&split_id)
        .bind(&body.name)
        .fetch_optional(&state.db.pool)
        .await?;

        if let Some((pid,)) = existing {
            pid
        } else {
            let pid = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO participants (id, split_id, name, emoji, upi_id, is_guest)
                 VALUES (?, ?, ?, '👤', NULL, 1)",
            )
            .bind(&pid)
            .bind(&split_id)
            .bind(&body.name)
            .execute(&state.db.pool)
            .await?;
            pid
        }
    };

    let payment_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO payments (id, split_id, from_participant, to_participant, amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    )
    .bind(&payment_id)
    .bind(&split_id)
    .bind(&from_participant_id)
    .bind(host_participant_id.as_deref().unwrap_or("host"))
    .bind(body.amount)
    .bind(&now)
    .execute(&state.db.pool)
    .await?;

    let event = json!({
        "type": "guest_paying",
        "guest_name": body.name,
        "amount": body.amount,
        "payment_id": payment_id,
        "item_ids": body.item_ids,
    })
    .to_string();
    state.broadcast(&split_id, &event).await;

    let raw_upi = host_upi.unwrap_or_else(|| "host@upi".to_string());
    let safe_upi = sanitize_upi_id(&raw_upi);
    let upi_deeplink = format!(
        "upi://pay?pa={}&pn=WiseSplit&am={:.2}&tn=WiseSplit&cu=INR",
        safe_upi,
        body.amount as f64 / 100.0
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
        "upi_id": safe_upi,
        "message": format!("Pay \u{20B9}{:.2} to {}", body.amount as f64 / 100.0, safe_upi),
    })))
}

pub async fn get_payments(
    State(state): State<Arc<AppState>>,
    Path(split_id): Path<String>,
) -> Result<impl IntoResponse> {
    type PaymentRow = (String, String, String, Option<String>, Option<String>, String, i64, String, String, Option<String>);
    let payments: Vec<PaymentRow> =
        sqlx::query_as(
            "SELECT p.id, p.split_id, p.from_participant, prt.name, prt.emoji,
                    p.to_participant, p.amount, p.status, p.created_at, p.confirmed_at
             FROM payments p
             LEFT JOIN participants prt ON prt.id = p.from_participant
             WHERE p.split_id = ?
             ORDER BY p.created_at DESC",
        )
        .bind(&split_id)
        .fetch_all(&state.db.pool)
        .await?;

    let result: Vec<serde_json::Value> = payments
        .into_iter()
        .map(|p| {
            json!({
                "id": p.0,
                "split_id": p.1,
                "from_participant": p.2,
                "from_name": p.3.unwrap_or_else(|| "Guest".to_string()),
                "from_emoji": p.4.unwrap_or_else(|| "👤".to_string()),
                "to_participant": p.5,
                "amount": p.6,
                "status": p.7,
                "created_at": p.8,
                "confirmed_at": p.9,
            })
        })
        .collect();

    Ok(Json(json!({ "payments": result })))
}

pub async fn confirm_payment(
    State(state): State<Arc<AppState>>,
    Path((split_id, payment_id)): Path<(String, String)>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".to_string()))?;

    let token = auth
        .strip_prefix("Bearer ")
        .ok_or_else(|| AppError::Unauthorized("Authorization header must be 'Bearer <token>'".to_string()))?;

    if token.is_empty() {
        return Err(AppError::Unauthorized("Empty bearer token".to_string()));
    }

    let guest_token: Option<String> = sqlx::query_as(
        "SELECT guest_token FROM splits WHERE id = ?",
    )
    .bind(&split_id)
    .fetch_optional(&state.db.pool)
    .await?
    .map(|r: (String,)| r.0);

    let guest_token = guest_token
        .ok_or_else(|| AppError::NotFound(format!("Split '{}' not found", split_id)))?;

    if token != guest_token {
        return Err(AppError::Unauthorized(
            "Only the payee's guest token can confirm this payment".to_string(),
        ));
    }

    let now = Utc::now().to_rfc3339();

    let result = sqlx::query(
        "UPDATE payments SET status = 'confirmed', confirmed_at = ? WHERE id = ? AND split_id = ? AND status = 'pending'",
    )
    .bind(&now)
    .bind(&payment_id)
    .bind(&split_id)
    .execute(&state.db.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "Payment not found or already confirmed".to_string(),
        ));
    }

    let event = json!({
        "type": "payment_confirmed",
        "payment_id": payment_id,
        "split_id": split_id,
        "confirmed_at": now,
    })
    .to_string();
    state.broadcast(&split_id, &event).await;

    tracing::info!(
        split_id = %split_id,
        payment_id = %payment_id,
        "Payment confirmed"
    );

    Ok(Json(json!({
        "status": "confirmed",
        "payment_id": payment_id,
        "confirmed_at": now,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_upi_id_valid() {
        assert_eq!(sanitize_upi_id("user@okhdfcbank"), "user@okhdfcbank");
        assert_eq!(sanitize_upi_id("123-abc@ybl"), "123-abc@ybl");
        assert_eq!(sanitize_upi_id("test.name@paytm"), "test.name@paytm");
    }

    #[test]
    fn test_sanitize_upi_id_strips_dangerous_chars() {
        assert_eq!(sanitize_upi_id("user@ok<script>"), "user@okscript");
        assert_eq!(sanitize_upi_id("user@ok\nhdfc"), "user@okhdfc");
        assert_eq!(sanitize_upi_id("user name@bank"), "username@bank");
        assert_eq!(sanitize_upi_id("user@bank;DROP TABLE"), "user@bankDROPTABLE");
    }

    #[test]
    fn test_sanitize_upi_id_empty() {
        assert_eq!(sanitize_upi_id(""), "");
    }

    #[test]
    fn test_sanitize_upi_id_only_special() {
        assert_eq!(sanitize_upi_id("<>&'\""), "");
    }

    #[test]
    fn test_sanitize_upi_id_preserves_dots_hyphens() {
        assert_eq!(sanitize_upi_id("first.last-name@bank"), "first.last-name@bank");
    }
}
