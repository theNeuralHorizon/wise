use worker::*;

pub fn extract_owner_token(req: &Request) -> Result<String> {
    let auth = req
        .headers()
        .get("Authorization")?
        .ok_or_else(|| Error::RustError("Missing Authorization header".into()))?;

    let token = auth
        .strip_prefix("Bearer ")
        .ok_or_else(|| Error::RustError("Authorization header must be 'Bearer <token>'".into()))?;

    if token.is_empty() {
        return Err(Error::RustError("Empty bearer token".into()));
    }

    Ok(token.to_string())
}

pub async fn verify_owner(db: &D1Database, split_id: &str, owner_token: &str) -> Result<()> {
    let stmt = db
        .prepare("SELECT owner_token, token_created_at FROM splits WHERE id = ?1")
        .bind(&[split_id.into()])?;

    let row: Option<D1Result> = stmt.first(None).await?;

    match row {
        Some(row) => {
            let stored_token: String = row.get("owner_token")?;
            let created_at: String = row.get("token_created_at")?;

            if stored_token != owner_token {
                return Err(Error::RustError("Invalid owner token".into()));
            }

            if !created_at.is_empty() {
                if let Ok(created) = chrono::DateTime::parse_from_rfc3339(&created_at) {
                    let age = chrono::Utc::now() - created.with_timezone(&chrono::Utc);
                    if age.num_days() > 7 {
                        return Err(Error::RustError(
                            "Owner token has expired (7 day limit)".into(),
                        ));
                    }
                }
            }

            Ok(())
        }
        None => Err(Error::RustError(format!(
            "Split '{}' not found",
            split_id
        ))),
    }
}
