use base64::{engine::general_purpose::STANDARD as B64, Engine};
use wasm_bindgen::JsValue;
use worker::*;

use crate::models::*;

const RECEIPT_PROMPT: &str = r#"You are a precise receipt OCR parser. Extract all line items from this receipt image.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "restaurant": string or null,
  "items": [{"name": string, "price": number, "quantity": integer, "emoji": string}],
  "subtotal": number,
  "tax": number,
  "tip": number,
  "total": number,
  "confidence": number
}

Rules:
- price = unit price (not multiplied by quantity)
- quantity = number of that item ordered
- emoji = single relevant food emoji for the item
- confidence = 0.0 to 1.0 (how confident you are in the parse)
- All amounts in the currency shown (do not convert)
- If tax/tip not shown, use 0"#;

pub async fn parse_receipt(
    env: &Env,
    r2: Option<&Bucket>,
    split_id: &str,
    image_bytes: &[u8],
) -> Result<ParsedReceipt> {
    // Try the Python AI service first (for local dev)
    if let Ok(ai_url) = std::env::var("AI_SERVICE_URL") {
        if !ai_url.is_empty() {
            let headers = Headers::new();
            headers.set("Content-Type", "application/octet-stream")?;
            let body = JsValue::from(image_bytes.to_vec());
            let req = Request::new_with_init(
                &ai_url,
                RequestInit::new()
                    .with_method(Method::Post)
                    .with_headers(headers)
                    .with_body(Some(body)),
            )?;
            if let Ok(mut resp) = Fetch::Request(req).send().await {
                if resp.status_code() == 200 {
                    if let Ok(parsed) = resp.json::<ParsedReceipt>().await {
                        return Ok(parsed);
                    }
                }
            }
        }
    }

    // Direct Gemini API call
    let api_key = env.secret("GEMINI_API_KEY")?;
    let b64_image = B64.encode(image_bytes);
    let model = std::env::var("GEMINI_MODEL").unwrap_or_else(|_| "gemini-1.5-flash".into());

    let payload = serde_json::json!({
        "contents": [{
            "parts": [
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": b64_image
                    }
                },
                { "text": RECEIPT_PROMPT }
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "topP": 0.95,
            "responseMimeType": "application/json"
        }
    });

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );

    let headers = Headers::new();
    headers.set("Content-Type", "application/json")?;

    let req = Request::new_with_init(
        &url,
        RequestInit::new()
            .with_method(Method::Post)
            .with_headers(headers)
            .with_body(Some(JsValue::from_str(&payload.to_string()))),
    )?;

    let resp = Fetch::Request(req).send().await?;
    let mut resp = resp;
    let gemini_resp: serde_json::Value = resp.json().await?;

    let raw_json = gemini_resp["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| Error::RustError(format!("Unexpected Gemini response: {:?}", gemini_resp)))?;

    let mut parsed: ParsedReceipt =
        serde_json::from_str(raw_json).map_err(|e| Error::RustError(format!("Gemini invalid JSON: {}", e)))?;

    parsed.is_mock = false;

    // Upload image to R2 for reference (if R2 is configured)
    if let Some(bucket) = r2 {
        let r2_key = format!("receipts/{}/{}", split_id, chrono::Utc::now().timestamp());
        let _ = bucket.put(&r2_key, image_bytes.to_vec()).execute().await;
    }

    Ok(parsed)
}

pub fn mock_receipt() -> ParsedReceipt {
    ParsedReceipt {
        restaurant: Some("Meal Split".into()),
        items: vec![
            ParsedItem { name: "Pepperoni Pizza".into(), price: 12.0, quantity: 1, emoji: "🍕".into() },
            ParsedItem { name: "Garlic Bread".into(), price: 6.0, quantity: 1, emoji: "🍞".into() },
            ParsedItem { name: "Caesar Salad".into(), price: 8.0, quantity: 1, emoji: "🥗".into() },
            ParsedItem { name: "Cola".into(), price: 3.0, quantity: 2, emoji: "🥤".into() },
        ],
        subtotal: 32.0,
        tax: 2.56,
        tip: 4.80,
        total: 39.36,
        confidence: 0.95,
        is_mock: true,
    }
}
