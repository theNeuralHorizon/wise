use wasm_bindgen::JsValue;
use worker::*;

mod ai;
mod auth;
mod db;
mod models;
mod ws;

use models::*;

fn cors_response(req: &Request, resp: Response) -> Result<Response> {
    let headers = Headers::new();
    headers.set("Access-Control-Allow-Origin", "*")?;
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")?;
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")?;
    headers.set("Access-Control-Max-Age", "86400")?;

    if let Some(origin) = req.headers().get("Origin")? {
        if !origin.is_empty() {
            headers.set("Access-Control-Allow-Origin", &origin)?;
        }
    }

    let mut resp = resp;
    for (k, v) in resp.headers().entries() {
        if k.to_lowercase() != "access-control-allow-origin" {
            let _ = headers.set(&k, &v);
        }
    }
    resp = resp.with_headers(headers);
    Ok(resp)
}

fn json_response(req: &Request, value: &serde_json::Value) -> Result<Response> {
    let resp = Response::from_json(value)?;
    cors_response(req, resp)
}

fn error_response(req: &Request, status: u16, message: &str) -> Result<Response> {
    let resp = Response::error(message, status)?;
    cors_response(req, resp)
}

#[event(fetch)]
pub async fn main(mut req: Request, env: Env, _ctx: Context) -> Result<Response> {
    // Handle CORS preflight
    if req.method() == Method::Options {
        let mut resp = Response::ok("")?;
        let headers = Headers::new();
        headers.set("Access-Control-Allow-Origin", "*")?;
        headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")?;
        headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")?;
        headers.set("Access-Control-Max-Age", "86400")?;
        resp = resp.with_headers(headers);
        return Ok(resp);
    }

    let url = req.url()?;
    let path = url.path().to_string();
    let method = req.method().clone();

    let db = env.d1("DB")?;
    let r2 = env.bucket("RECEIPTS")?;

    // ── ROUTING ─────────────────────────────────────────────────────────────

    // GET /api/health
    if path == "/api/health" && method == Method::Get {
        let body = db::health(&db).await?;
        return json_response(&req, &body);
    }

    // POST /api/splits
    if path == "/api/splits" && method == Method::Post {
        let body: CreateSplitRequest = req.json().await?;
        if body.participants.is_empty() {
            return error_response(&req, 400, "At least one participant required");
        }
        return match db::create_split(&db, &body).await {
            Ok(created) => json_response(&req, &serde_json::to_value(created).unwrap()),
            Err(e) => error_response(&req, 500, &e.to_string()),
        };
    }

    // GET /api/splits/:id
    if method == Method::Get && path.starts_with("/api/splits/") {
        let rest = path.trim_start_matches("/api/splits/");
        if !rest.contains('/') && !rest.is_empty() {
            let split_id = rest;
            return match db::get_split_detail(&db, split_id).await {
                Ok(detail) => json_response(&req, &serde_json::to_value(detail).unwrap()),
                Err(e) => error_response(&req, 404, &e.to_string()),
            };
        } else if rest.ends_with("/summary") {
            let split_id = rest.trim_end_matches("/summary");
            return match db::get_summary(&db, split_id).await {
                Ok(summary) => json_response(&req, &serde_json::to_value(summary).unwrap()),
                Err(e) => error_response(&req, 404, &e.to_string()),
            };
        } else if rest.ends_with("/payments") {
            let split_id = rest.trim_end_matches("/payments");
            return match db::get_payments(&db, split_id).await {
                Ok(payments) => json_response(&req, &payments),
                Err(e) => error_response(&req, 500, &e.to_string()),
            };
        } else {
            return error_response(&req, 404, "Not found");
        }
    }

    // POST /api/splits/:id/receipt
    if method == Method::Post && path.contains("/receipt") {
        let split_id = path
            .trim_start_matches("/api/splits/")
            .trim_end_matches("/receipt");
        let owner_token = match auth::extract_owner_token(&req) {
            Ok(t) => t,
            Err(e) => return error_response(&req, 401, &e.to_string()),
        };
        if let Err(e) = auth::verify_owner(&db, split_id, &owner_token).await {
            return error_response(&req, 401, &e.to_string());
        }

        let body = req.text().await?;
        let bytes = body.as_bytes();

        let parsed = match ai::parse_receipt(&env, &r2, split_id, bytes).await {
            Ok(p) => p,
            Err(_) => ai::mock_receipt(),
        };

        let total_paise = parsed.total.round() as i64;
        let tax_paise = parsed.tax.round() as i64;
        let tip_paise = parsed.tip.round() as i64;

        let _ = db
            .prepare("UPDATE splits SET restaurant = ?1, total_amount = ?2, tax = ?3, tip = ?4 WHERE id = ?5")
            .bind(&[parsed.restaurant.clone().into(), total_paise.into(), tax_paise.into(), tip_paise.into(), split_id.into()])?
            .run()
            .await;

        let _ = db.prepare("DELETE FROM items WHERE split_id = ?1")
            .bind(&[split_id.into()])?
            .run()
            .await;

        let mut inserted_items = Vec::new();
        for item in &parsed.items {
            let item_id = uuid::Uuid::new_v4().to_string();
            let actual_price = (item.price * item.quantity as f64).round() as i64;
            let _ = db
                .prepare("INSERT INTO items (id, split_id, name, price, quantity, emoji) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
                .bind(&[item_id.clone().into(), split_id.into(), item.name.clone().into(), actual_price.into(), item.quantity.into(), item.emoji.clone().into()])?
                .run()
                .await;

            inserted_items.push(serde_json::json!({
                "id": item_id,
                "name": item.name,
                "price": actual_price,
                "unit_price": (item.price * 100.0).round() as i64,
                "quantity": item.quantity,
                "emoji": item.emoji,
            }));
        }

        let _ = broadcast_to_split(&env, split_id, &serde_json::json!({
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
        }).to_string()).await;

        return json_response(&req, &serde_json::json!({
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
        }));
    }

    // PUT /api/splits/:id/items/:item_id/assign
    if method == Method::Put && path.contains("/assign") {
        let stripped = path.trim_start_matches("/api/splits/").trim_end_matches("/assign");
        let parts: Vec<&str> = stripped.splitn(2, '/').collect();
        if parts.len() != 2 {
            return error_response(&req, 400, "Invalid path");
        }
        let (split_id, item_id) = (parts[0], parts[1]);
        let owner_token = match auth::extract_owner_token(&req) {
            Ok(t) => t,
            Err(e) => return error_response(&req, 401, &e.to_string()),
        };
        if let Err(e) = auth::verify_owner(&db, split_id, &owner_token).await {
            return error_response(&req, 401, &e.to_string());
        }
        let body: AssignItemRequest = req.json().await?;
        if let Err(e) = db::assign_item(&db, split_id, item_id, &body.participant_ids).await {
            return error_response(&req, 500, &e.to_string());
        }
        let _ = broadcast_to_split(&env, split_id, &serde_json::json!({
            "type": "item_assigned",
            "split_id": split_id,
            "item_id": item_id,
            "participant_ids": body.participant_ids,
        }).to_string()).await;
        return json_response(&req, &serde_json::json!({ "status": "ok", "item_id": item_id }));
    }

    // POST /api/splits/:id/items
    if method == Method::Post && path.starts_with("/api/splits/") && path.ends_with("/items") {
        let split_id = path.trim_start_matches("/api/splits/").trim_end_matches("/items");
        let owner_token = match auth::extract_owner_token(&req) {
            Ok(t) => t,
            Err(e) => return error_response(&req, 401, &e.to_string()),
        };
        if let Err(e) = auth::verify_owner(&db, split_id, &owner_token).await {
            return error_response(&req, 401, &e.to_string());
        }
        let body: AddItemRequest = req.json().await?;
        return match db::add_item(&db, split_id, &body.name, body.price, body.quantity, &body.emoji).await {
            Ok(item_id) => {
                let _ = broadcast_to_split(&env, split_id, &serde_json::json!({
                    "type": "item_added",
                    "item": { "id": item_id.clone(), "name": body.name, "price": body.price, "quantity": body.quantity, "emoji": body.emoji },
                }).to_string()).await;
                json_response(&req, &serde_json::json!({ "status": "ok", "item_id": item_id }))
            }
            Err(e) => error_response(&req, 500, &e.to_string()),
        };
    }

    // PUT /api/splits/:id/items/:item_id
    if method == Method::Put && path.starts_with("/api/splits/") && path.contains("/items/") {
        let stripped = path.trim_start_matches("/api/splits/");
        let parts: Vec<&str> = stripped.splitn(2, "/items/").collect();
        if parts.len() != 2 {
            return error_response(&req, 400, "Invalid path");
        }
        let (split_id, item_id) = (parts[0], parts[1]);
        let owner_token = match auth::extract_owner_token(&req) {
            Ok(t) => t,
            Err(e) => return error_response(&req, 401, &e.to_string()),
        };
        if let Err(e) = auth::verify_owner(&db, split_id, &owner_token).await {
            return error_response(&req, 401, &e.to_string());
        }
        let body: EditItemRequest = req.json().await?;
        if let Err(e) = db::edit_item(&db, split_id, item_id, &body.name, body.price).await {
            return error_response(&req, 500, &e.to_string());
        }
        let _ = broadcast_to_split(&env, split_id, &serde_json::json!({
            "type": "item_edited", "item_id": item_id, "name": body.name, "price": body.price,
        }).to_string()).await;
        return json_response(&req, &serde_json::json!({ "status": "ok" }));
    }

    // DELETE /api/splits/:id/items/:item_id
    if method == Method::Delete && path.starts_with("/api/splits/") && path.contains("/items/") {
        let stripped = path.trim_start_matches("/api/splits/");
        let parts: Vec<&str> = stripped.splitn(2, "/items/").collect();
        if parts.len() != 2 {
            return error_response(&req, 400, "Invalid path");
        }
        let (split_id, item_id) = (parts[0], parts[1]);
        let owner_token = match auth::extract_owner_token(&req) {
            Ok(t) => t,
            Err(e) => return error_response(&req, 401, &e.to_string()),
        };
        if let Err(e) = auth::verify_owner(&db, split_id, &owner_token).await {
            return error_response(&req, 401, &e.to_string());
        }
        if let Err(e) = db::delete_item(&db, split_id, item_id).await {
            return error_response(&req, 500, &e.to_string());
        }
        let _ = broadcast_to_split(&env, split_id, &serde_json::json!({
            "type": "item_deleted", "item_id": item_id,
        }).to_string()).await;
        return json_response(&req, &serde_json::json!({ "status": "ok" }));
    }

    // PUT /api/splits/:id/update
    if method == Method::Put && path.ends_with("/update") {
        let split_id = path.trim_start_matches("/api/splits/").trim_end_matches("/update");
        let owner_token = match auth::extract_owner_token(&req) {
            Ok(t) => t,
            Err(e) => return error_response(&req, 401, &e.to_string()),
        };
        if let Err(e) = auth::verify_owner(&db, split_id, &owner_token).await {
            return error_response(&req, 401, &e.to_string());
        }
        let body: UpdateSplitRequest = req.json().await?;
        if let Err(e) = db::update_split(&db, split_id, &body.restaurant, body.name.as_deref(), body.tax, body.tip).await {
            return error_response(&req, 500, &e.to_string());
        }
        let _ = broadcast_to_split(&env, split_id, &serde_json::json!({
            "type": "split_updated", "restaurant": body.restaurant,
        }).to_string()).await;
        return json_response(&req, &serde_json::json!({ "status": "ok" }));
    }

    // POST /api/splits/:id/payments/:payment_id/confirm
    if method == Method::Post && path.contains("/payments/") && path.ends_with("/confirm") {
        let without_confirm = path.trim_end_matches("/confirm");
        let stripped = without_confirm.trim_start_matches("/api/splits/");
        let parts: Vec<&str> = stripped.splitn(2, "/payments/").collect();
        if parts.len() != 2 {
            return error_response(&req, 400, "Invalid path");
        }
        let (split_id, payment_id) = (parts[0], parts[1]);
        let guest_token = match auth::extract_owner_token(&req) {
            Ok(t) => t,
            Err(e) => return error_response(&req, 401, &e.to_string()),
        };
        return match db::confirm_payment(&db, split_id, payment_id, &guest_token).await {
            Ok(result) => {
                let _ = broadcast_to_split(&env, split_id, &serde_json::json!({
                    "type": "payment_confirmed", "payment_id": payment_id, "split_id": split_id,
                }).to_string()).await;
                json_response(&req, &result)
            }
            Err(e) => error_response(&req, 400, &e.to_string()),
        };
    }

    // GET /api/guest/:token
    if method == Method::Get && path.starts_with("/api/guest/") && !path.ends_with("/pay") {
        let token = path.trim_start_matches("/api/guest/").trim_end_matches('/');
        return match db::get_guest_view(&db, token).await {
            Ok(view) => json_response(&req, &view),
            Err(e) => error_response(&req, 404, &e.to_string()),
        };
    }

    // POST /api/guest/:token/pay
    if method == Method::Post && path.starts_with("/api/guest/") && path.ends_with("/pay") {
        let token = path.trim_start_matches("/api/guest/").trim_end_matches("/pay");
        let body: GuestPayRequest = req.json().await?;
        return match db::guest_pay(&db, token, &body).await {
            Ok(result) => json_response(&req, &result),
            Err(e) => error_response(&req, 400, &e.to_string()),
        };
    }

    // GET /api/ws/:split_id — WebSocket
    if method == Method::Get && path.starts_with("/api/ws/") {
        let split_id = path.trim_start_matches("/api/ws/");
        let namespace = env.durable_object("SPLIT_SOCKET")?;
        let do_id = namespace.id_from_name(split_id)?;
        let stub = do_id.get_stub()?;
        return stub.fetch_with_request(req).await;
    }

    error_response(&req, 404, "Not found")
}

async fn broadcast_to_split(env: &Env, split_id: &str, msg: &str) -> Result<()> {
    let namespace = env.durable_object("SPLIT_SOCKET")?;
    let do_id = namespace.id_from_name(split_id)?;
    let stub = do_id.get_stub()?;

    let headers = Headers::new();
    headers.set("Content-Type", "text/plain")?;

    let req = Request::new_with_init(
        &format!("https://internal/broadcast/{}", split_id),
        RequestInit::new()
            .with_method(Method::Post)
            .with_headers(headers)
            .with_body(Some(JsValue::from_str(msg))),
    )?;

    let _ = stub.fetch_with_request(req).await;
    Ok(())
}
