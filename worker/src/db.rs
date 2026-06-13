use worker::*;

use crate::models::*;

pub async fn create_split(db: &D1Database, req: &CreateSplitRequest) -> Result<SplitCreated> {
    let split_id = uuid::Uuid::new_v4().to_string();
    let guest_token: String = {
        let uuid_bytes = uuid::Uuid::new_v4().as_bytes().to_vec();
        let mut extra = Vec::new();
        extra.extend_from_slice(uuid_bytes.as_slice());
        let uuid2 = uuid::Uuid::new_v4();
        extra.extend_from_slice(uuid2.as_bytes());
        extra.truncate(24);
        hex::encode(extra)
    };
    let owner_token: String = {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
        bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
        hex::encode(bytes)
    };
    let created_at = chrono::Utc::now().to_rfc3339();
    let host_name = &req.participants[0].name;
    let restaurant = req.restaurant.as_deref().unwrap_or(&req.name);

    db.prepare("INSERT INTO splits (id, name, restaurant, created_by, created_at, guest_token, owner_token, token_created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
        .bind(&[split_id.clone().into(), req.name.clone().into(), restaurant.into(), host_name.into(), created_at.clone().into(), guest_token.clone().into(), owner_token.clone().into(), created_at.clone().into()])?
        .run()
        .await?;

    for p in &req.participants {
        let pid = uuid::Uuid::new_v4().to_string();
        db.prepare("INSERT INTO participants (id, split_id, name, emoji, upi_id, is_guest) VALUES (?1, ?2, ?3, ?4, ?5, 0)")
            .bind(&[pid.into(), split_id.clone().into(), p.name.clone().into(), p.emoji.clone().into(), p.upi_id.clone().unwrap_or_default().into()])?
            .run()
            .await?;
    }

    let public_url = std::env::var("PUBLIC_URL").unwrap_or_default();
    let frontend_base = if public_url.is_empty() {
        std::env::var("FRONTEND_BASE_URL").unwrap_or_else(|_| "http://localhost:5173".into())
    } else {
        public_url
    };

    let ws_base = std::env::var("WS_BASE_URL").unwrap_or_else(|_| {
        frontend_base
            .replace("https://", "wss://")
            .replace("http://", "ws://")
    });

    Ok(SplitCreated {
        split_id: split_id.clone(),
        owner_token,
        token_created_at: created_at.clone(),
        guest_token: guest_token.clone(),
        guest_link: format!("{}/guest/{}", frontend_base, guest_token),
        ws_url: format!("{}/api/ws/{}", ws_base, split_id),
    })
}

pub async fn get_split_detail(db: &D1Database, split_id: &str) -> Result<SplitDetail> {
    let row = db
        .prepare("SELECT id, name, restaurant, created_by, created_at, total_amount, tax, tip, guest_token FROM splits WHERE id = ?1")
        .bind(&[split_id.into()])?
        .first::<serde_json::Value>(None)
        .await?
        .ok_or_else(|| Error::RustError(format!("Split '{}' not found", split_id)))?;

    let split = SplitRow {
        id: row["id"].as_str().unwrap_or("").to_string(),
        name: row["name"].as_str().unwrap_or("").to_string(),
        restaurant: row["restaurant"].as_str().map(|s| s.to_string()),
        created_by: row["created_by"].as_str().unwrap_or("").to_string(),
        created_at: row["created_at"].as_str().unwrap_or("").to_string(),
        total_amount: row["total_amount"].as_i64().unwrap_or(0),
        tax: row["tax"].as_i64().unwrap_or(0),
        tip: row["tip"].as_i64().unwrap_or(0),
        guest_token: row["guest_token"].as_str().unwrap_or("").to_string(),
    };

    let participants = {
        let results: Vec<serde_json::Value> = db
            .prepare("SELECT id, split_id, name, emoji, upi_id, is_guest FROM participants WHERE split_id = ?1 ORDER BY rowid")
            .bind(&[split_id.into()])?
            .all()
            .await?
            .results()?;

        results
            .into_iter()
            .map(|r| {
                let is_guest = r["is_guest"].as_i64().unwrap_or(0);
                Ok(ParticipantRow {
                    id: r["id"].as_str().unwrap_or("").to_string(),
                    split_id: r["split_id"].as_str().unwrap_or("").to_string(),
                    name: r["name"].as_str().unwrap_or("").to_string(),
                    emoji: r["emoji"].as_str().unwrap_or("").to_string(),
                    upi_id: r["upi_id"].as_str().map(|s| s.to_string()),
                    is_guest: is_guest != 0,
                })
            })
            .collect::<Result<Vec<_>>>()?
    };

    let items = {
        let results: Vec<serde_json::Value> = db
            .prepare("SELECT id, split_id, name, price, quantity, emoji FROM items WHERE split_id = ?1 ORDER BY rowid")
            .bind(&[split_id.into()])?
            .all()
            .await?
            .results()?;

        results
            .into_iter()
            .map(|r| {
                Ok(ItemRow {
                    id: r["id"].as_str().unwrap_or("").to_string(),
                    split_id: r["split_id"].as_str().unwrap_or("").to_string(),
                    name: r["name"].as_str().unwrap_or("").to_string(),
                    price: r["price"].as_i64().unwrap_or(0),
                    quantity: r["quantity"].as_i64().unwrap_or(0),
                    emoji: r["emoji"].as_str().unwrap_or("").to_string(),
                })
            })
            .collect::<Result<Vec<_>>>()?
    };

    let assignments = {
        let results: Vec<serde_json::Value> = db
            .prepare("SELECT ia.item_id, ia.participant_id, ia.share_fraction FROM item_assignments ia JOIN items i ON i.id = ia.item_id WHERE i.split_id = ?1")
            .bind(&[split_id.into()])?
            .all()
            .await?
            .results()?;

        results
            .into_iter()
            .map(|r| {
                Ok(AssignmentRow {
                    item_id: r["item_id"].as_str().unwrap_or("").to_string(),
                    participant_id: r["participant_id"].as_str().unwrap_or("").to_string(),
                    share_fraction: r["share_fraction"].as_f64().unwrap_or(0.0),
                })
            })
            .collect::<Result<Vec<_>>>()?
    };

    Ok(SplitDetail {
        split,
        participants,
        items,
        assignments,
    })
}

pub async fn get_summary(db: &D1Database, split_id: &str) -> Result<SplitSummaryResponse> {
    let row = db
        .prepare("SELECT name, restaurant, total_amount, tax, tip, guest_token FROM splits WHERE id = ?1")
        .bind(&[split_id.into()])?
        .first::<serde_json::Value>(None)
        .await?
        .ok_or_else(|| Error::RustError("Split not found".into()))?;

    let split_name = row["name"].as_str().unwrap_or("").to_string();
    let restaurant = row["restaurant"].as_str().map(|s| s.to_string());
    let total_amount = row["total_amount"].as_i64().unwrap_or(0);
    let tax = row["tax"].as_i64().unwrap_or(0);
    let tip = row["tip"].as_i64().unwrap_or(0);
    let guest_token = row["guest_token"].as_str().unwrap_or("").to_string();

    let total_subtotal: i64 = db
        .prepare("SELECT COALESCE(SUM(CAST(i.price * ia.share_fraction AS INTEGER)), 0) as total FROM items i JOIN item_assignments ia ON ia.item_id = i.id WHERE i.split_id = ?1")
        .bind(&[split_id.into()])?
        .first::<serde_json::Value>(None)
        .await?
        .and_then(|r| r["total"].as_i64())
        .unwrap_or(0);

    let summary_results: Vec<serde_json::Value> = db
        .prepare("SELECT p.id, p.name, p.emoji, p.upi_id, COALESCE(SUM(CAST(i.price * ia.share_fraction AS INTEGER)), 0) as subtotal, GROUP_CONCAT(i.name, ', ') as item_names FROM participants p LEFT JOIN item_assignments ia ON ia.participant_id = p.id LEFT JOIN items i ON i.id = ia.item_id AND i.split_id = ?1 WHERE p.split_id = ?1 GROUP BY p.id, p.name, p.emoji, p.upi_id ORDER BY p.rowid")
        .bind(&[split_id.into(), split_id.into()])?
        .all()
        .await?
        .results()?;

    let mut summaries = Vec::with_capacity(summary_results.len());

    for r in summary_results {
        let subtotal = r["subtotal"].as_i64().unwrap_or(0);
        let item_names_str = r["item_names"].as_str().unwrap_or("");

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
            participant_id: r["id"].as_str().unwrap_or("").to_string(),
            participant_name: r["name"].as_str().unwrap_or("").to_string(),
            participant_emoji: r["emoji"].as_str().unwrap_or("").to_string(),
            upi_id: r["upi_id"].as_str().map(|s| s.to_string()),
            subtotal,
            tax_share,
            tip_share,
            total,
            item_names,
        });
    }

    let frontend_base = std::env::var("PUBLIC_URL")
        .or_else(|_| std::env::var("FRONTEND_BASE_URL"))
        .unwrap_or_else(|_| "http://localhost:5173".into());

    Ok(SplitSummaryResponse {
        split_name,
        restaurant,
        bill_total: total_amount,
        tax,
        tip,
        guest_link: format!("{}/guest/{}", frontend_base, guest_token),
        summaries,
    })
}

pub async fn assign_item(
    db: &D1Database,
    _split_id: &str,
    item_id: &str,
    participant_ids: &[String],
) -> Result<()> {
    db.prepare("DELETE FROM item_assignments WHERE item_id = ?1")
        .bind(&[item_id.into()])?
        .run()
        .await?;

    if !participant_ids.is_empty() {
        let n = participant_ids.len() as f64;
        let share = 1.0 / n;
        for pid in participant_ids {
            db.prepare("INSERT INTO item_assignments (item_id, participant_id, share_fraction) VALUES (?1, ?2, ?3)")
                .bind(&[item_id.into(), pid.clone().into(), share.into()])?
                .run()
                .await?;
        }
    }

    Ok(())
}

pub async fn add_item(
    db: &D1Database,
    split_id: &str,
    name: &str,
    price: i64,
    quantity: i64,
    emoji: &str,
) -> Result<String> {
    let item_id = uuid::Uuid::new_v4().to_string();
    db.prepare("INSERT INTO items (id, split_id, name, price, quantity, emoji) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(&[item_id.clone().into(), split_id.into(), name.into(), price.into(), quantity.into(), emoji.into()])?
        .run()
        .await?;

    recalculate_total(db, split_id).await?;
    Ok(item_id)
}

pub async fn edit_item(
    db: &D1Database,
    split_id: &str,
    item_id: &str,
    name: &str,
    price: i64,
) -> Result<()> {
    db.prepare("UPDATE items SET name = ?1, price = ?2 WHERE id = ?3 AND split_id = ?4")
        .bind(&[name.into(), price.into(), item_id.into(), split_id.into()])?
        .run()
        .await?;

    recalculate_total(db, split_id).await?;
    Ok(())
}

pub async fn delete_item(db: &D1Database, split_id: &str, item_id: &str) -> Result<()> {
    db.prepare("DELETE FROM items WHERE id = ?1 AND split_id = ?2")
        .bind(&[item_id.into(), split_id.into()])?
        .run()
        .await?;

    db.prepare("DELETE FROM item_assignments WHERE item_id = ?1")
        .bind(&[item_id.into()])?
        .run()
        .await?;

    recalculate_total(db, split_id).await?;
    Ok(())
}

pub async fn update_split(
    db: &D1Database,
    split_id: &str,
    restaurant: &str,
    name: Option<&str>,
    tax: Option<i64>,
    tip: Option<i64>,
) -> Result<()> {
    let split_name = name.unwrap_or(restaurant);

    if let (Some(tax), Some(tip)) = (tax, tip) {
        db.prepare("UPDATE splits SET restaurant = ?1, name = ?2, tax = ?3, tip = ?4 WHERE id = ?5")
            .bind(&[restaurant.into(), split_name.into(), tax.into(), tip.into(), split_id.into()])?
            .run()
            .await?;
    } else {
        db.prepare("UPDATE splits SET restaurant = ?1, name = ?2 WHERE id = ?3")
            .bind(&[restaurant.into(), split_name.into(), split_id.into()])?
            .run()
            .await?;
    }

    recalculate_total(db, split_id).await?;
    Ok(())
}

async fn recalculate_total(db: &D1Database, split_id: &str) -> Result<()> {
    let subtotal: i64 = db
        .prepare("SELECT COALESCE(SUM(price * quantity), 0) as total FROM items WHERE split_id = ?1")
        .bind(&[split_id.into()])?
        .first::<serde_json::Value>(None)
        .await?
        .and_then(|r| r["total"].as_i64())
        .unwrap_or(0);

    let split_row = db
        .prepare("SELECT tax, tip FROM splits WHERE id = ?1")
        .bind(&[split_id.into()])?
        .first::<serde_json::Value>(None)
        .await?;

    let (tax, tip) = if let Some(r) = split_row {
        let tax = r["tax"].as_i64().unwrap_or(0);
        let tip = r["tip"].as_i64().unwrap_or(0);
        (tax, tip)
    } else {
        (0, 0)
    };

    let total = subtotal + tax + tip;

    db.prepare("UPDATE splits SET total_amount = ?1 WHERE id = ?2")
        .bind(&[total.into(), split_id.into()])?
        .run()
        .await?;

    Ok(())
}

// ── GUEST QUERIES ──────────────────────────────────────────────────────────

pub async fn get_guest_view(db: &D1Database, token: &str) -> Result<serde_json::Value> {
    let row = db
        .prepare("SELECT id, name, restaurant, total_amount, tax, tip FROM splits WHERE guest_token = ?1")
        .bind(&[token.into()])?
        .first::<serde_json::Value>(None)
        .await?
        .ok_or_else(|| Error::RustError("Guest link not found or has expired".into()))?;

    let split_id = row["id"].as_str().unwrap_or("").to_string();
    let name = row["name"].as_str().unwrap_or("").to_string();
    let restaurant = row["restaurant"].as_str().map(|s| s.to_string());
    let total = row["total_amount"].as_i64().unwrap_or(0);
    let tax = row["tax"].as_i64().unwrap_or(0);
    let tip = row["tip"].as_i64().unwrap_or(0);

    let items_results: Vec<serde_json::Value> = db
        .prepare("SELECT id, name, price, quantity, emoji FROM items WHERE split_id = ?1 ORDER BY rowid")
        .bind(&[split_id.clone().into()])?
        .all()
        .await?
        .results()?;

    let items: Vec<serde_json::Value> = items_results
        .into_iter()
        .filter_map(|r| {
            Some(serde_json::json!({
                "id": r["id"].as_str()?,
                "name": r["name"].as_str()?,
                "price": r["price"].as_i64()?,
                "quantity": r["quantity"].as_i64()?,
                "emoji": r["emoji"].as_str()?,
            }))
        })
        .collect();

    let host = db
        .prepare("SELECT name, emoji, upi_id FROM participants WHERE split_id = ?1 ORDER BY rowid LIMIT 1")
        .bind(&[split_id.clone().into()])?
        .first::<serde_json::Value>(None)
        .await?;

    let (host_name, host_emoji, host_upi) = match host {
        Some(r) => {
            let n = r["name"].as_str().unwrap_or("Host").to_string();
            let e = r["emoji"].as_str().unwrap_or("😊").to_string();
            let u = r["upi_id"].as_str().map(|s| s.to_string());
            (n, e, u)
        }
        None => ("Host".into(), "😊".into(), None),
    };

    let ws_base = std::env::var("WS_BASE_URL").unwrap_or_else(|_| {
        std::env::var("PUBLIC_URL")
            .unwrap_or_default()
            .replace("https://", "wss://")
            .replace("http://", "ws://")
    });

    Ok(serde_json::json!({
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
        "items": items,
        "ws_url": format!("{}/api/ws/{}", ws_base, split_id),
    }))
}

pub async fn guest_pay(
    db: &D1Database,
    token: &str,
    body: &GuestPayRequest,
) -> Result<serde_json::Value> {
    if body.amount <= 0 {
        return Err(Error::RustError("Amount must be positive".into()));
    }

    let row = db
        .prepare("SELECT s.id, p_upi.upi_id, p_upi.id as pid FROM splits s LEFT JOIN participants p_upi ON p_upi.split_id = s.id WHERE s.guest_token = ?1 ORDER BY p_upi.rowid LIMIT 1")
        .bind(&[token.into()])?
        .first::<serde_json::Value>(None)
        .await?
        .ok_or_else(|| Error::RustError("Guest token not found".into()))?;

    let split_id = row["id"].as_str().unwrap_or("").to_string();
    let host_upi = row["upi_id"].as_str().map(|s| s.to_string());
    let host_participant_id = row["pid"].as_str().map(|s| s.to_string());

    let from_participant_id = if let Some(ref pid) = body.participant_id {
        pid.clone()
    } else {
        let existing = db
            .prepare("SELECT id FROM participants WHERE split_id = ?1 AND name = ?2 LIMIT 1")
            .bind(&[split_id.clone().into(), body.name.clone().into()])?
            .first::<serde_json::Value>(None)
            .await?;

        match existing {
            Some(r) => r["id"].as_str().unwrap_or("").to_string(),
            None => {
                let pid = uuid::Uuid::new_v4().to_string();
                db.prepare("INSERT INTO participants (id, split_id, name, emoji, upi_id, is_guest) VALUES (?1, ?2, ?3, '👤', NULL, 1)")
                    .bind(&[pid.clone().into(), split_id.clone().into(), body.name.clone().into()])?
                    .run()
                    .await?;
                pid
            }
        }
    };

    let payment_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    db.prepare("INSERT INTO payments (id, split_id, from_participant, to_participant, amount, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)")
        .bind(&[payment_id.clone().into(), split_id.clone().into(), from_participant_id.into(), host_participant_id.unwrap_or_default().into(), body.amount.into(), now.into()])?
        .run()
        .await?;

    let raw_upi = host_upi.unwrap_or_else(|| "host@upi".to_string());
    let safe_upi = sanitize_upi_id(&raw_upi);
    let upi_deeplink = format!(
        "upi://pay?pa={}&pn=WiseSplit&am={:.2}&tn=WiseSplit&cu=INR",
        safe_upi,
        body.amount as f64 / 100.0
    );

    Ok(serde_json::json!({
        "status": "ok",
        "payment_id": payment_id,
        "upi_deeplink": upi_deeplink,
        "upi_id": safe_upi,
    }))
}

pub async fn get_payments(db: &D1Database, split_id: &str) -> Result<serde_json::Value> {
    let results: Vec<serde_json::Value> = db
        .prepare("SELECT p.id, p.split_id, p.from_participant, prt.name, prt.emoji, p.to_participant, p.amount, p.status, p.created_at, p.confirmed_at FROM payments p LEFT JOIN participants prt ON prt.id = p.from_participant WHERE p.split_id = ?1 ORDER BY p.created_at DESC")
        .bind(&[split_id.into()])?
        .all()
        .await?
        .results()?;

    let payments: Vec<serde_json::Value> = results
        .into_iter()
        .map(|p| {
            serde_json::json!({
                "id": p["id"].as_str().unwrap_or_default(),
                "split_id": p["split_id"].as_str().unwrap_or_default(),
                "from_participant": p["from_participant"].as_str().unwrap_or_default(),
                "from_name": p["name"].as_str().unwrap_or("Guest"),
                "from_emoji": p["emoji"].as_str().unwrap_or("👤"),
                "to_participant": p["to_participant"].as_str().unwrap_or_default(),
                "amount": p["amount"].as_i64().unwrap_or(0),
                "status": p["status"].as_str().unwrap_or_default(),
                "created_at": p["created_at"].as_str().unwrap_or_default(),
                "confirmed_at": p["confirmed_at"].as_str().map(|s| s.to_string()),
            })
        })
        .collect();

    Ok(serde_json::json!({ "payments": payments }))
}

pub async fn confirm_payment(
    db: &D1Database,
    split_id: &str,
    payment_id: &str,
    guest_token: &str,
) -> Result<serde_json::Value> {
    let row = db
        .prepare("SELECT guest_token FROM splits WHERE id = ?1")
        .bind(&[split_id.into()])?
        .first::<serde_json::Value>(None)
        .await?
        .ok_or_else(|| Error::RustError(format!("Split '{}' not found", split_id)))?;

    let stored_token = row["guest_token"]
        .as_str()
        .unwrap_or("")
        .to_string();

    if guest_token != stored_token {
        return Err(Error::RustError(
            "Only the payee's guest token can confirm this payment".into(),
        ));
    }

    let now = chrono::Utc::now().to_rfc3339();
    db.prepare("UPDATE payments SET status = 'confirmed', confirmed_at = ?1 WHERE id = ?2 AND split_id = ?3 AND status = 'pending'")
        .bind(&[now.clone().into(), payment_id.into(), split_id.into()])?
        .run()
        .await?;

    Ok(serde_json::json!({
        "status": "confirmed",
        "payment_id": payment_id,
        "confirmed_at": now,
    }))
}

fn sanitize_upi_id(upi: &str) -> String {
    upi.chars()
        .filter(|c| c.is_alphanumeric() || *c == '@' || *c == '.' || *c == '-')
        .collect()
}

pub async fn health(db: &D1Database) -> Result<serde_json::Value> {
    let db_ok = db
        .prepare("SELECT 1")
        .bind(&[])?
        .first::<serde_json::Value>(None)
        .await
        .is_ok();

    let status = if db_ok { "ok" } else { "degraded" };
    Ok(serde_json::json!({
        "status": status,
        "service": "wise-worker",
        "db": if db_ok { "healthy" } else { "unreachable" },
    }))
}
