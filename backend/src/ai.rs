// src/ai.rs
// Gemini Vision API client.
// Gracefully degrades to mock data when GEMINI_API_KEY is not set.

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};

pub const RECEIPT_PROMPT: &str = r#"You are a precise receipt OCR parser. Extract all line items from this receipt image.

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParsedItem {
    pub name: String,
    pub price: f64,
    pub quantity: i64,
    pub emoji: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedReceipt {
    pub restaurant: Option<String>,
    pub items: Vec<ParsedItem>,
    pub subtotal: f64,
    pub tax: f64,
    pub tip: f64,
    pub total: f64,
    pub confidence: f64,
    pub is_mock: bool,
}

#[derive(Clone)]
pub struct GeminiClient {
    http: reqwest::Client,
    api_key: Option<String>,
    model: String,
}

impl GeminiClient {
    pub fn new() -> Result<Self> {
        let api_key = std::env::var("GEMINI_API_KEY")
            .ok()
            .filter(|k| !k.is_empty());

        let model = std::env::var("GEMINI_MODEL")
            .unwrap_or_else(|_| "gemini-1.5-flash".to_string());

        if api_key.is_none() {
            tracing::warn!("GEMINI_API_KEY not set — using mock receipt data in demo mode");
        } else {
            tracing::info!("Gemini Vision API ready (model={})", model);
        }

        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| anyhow!("Failed to build HTTP client: {}", e))?;

        Ok(Self { http, api_key, model })
    }

    pub async fn parse_receipt(&self, image_bytes: &[u8]) -> Result<ParsedReceipt> {
        tracing::debug!("Attempting to call Python AI microservice at http://localhost:5000/parse");
        match self.call_ai_microservice(image_bytes).await {
            Ok(parsed) => {
                tracing::info!("AI parse succeeded via Python microservice");
                return Ok(parsed);
            }
            Err(e) => {
                tracing::warn!("AI microservice failed/down, falling back to local Rust handler: {:?}", e);
            }
        }

        match &self.api_key {
            None => {
                tracing::debug!("Using mock receipt (no API key)");
                Ok(Self::mock_receipt())
            }
            Some(key) => self.call_gemini(image_bytes, key).await,
        }
    }

    async fn call_ai_microservice(&self, image_bytes: &[u8]) -> Result<ParsedReceipt> {
        let url = std::env::var("AI_SERVICE_URL")
            .unwrap_or_else(|_| "http://localhost:5000/parse".to_string());

        let resp = self
            .http
            .post(&url)
            .body(image_bytes.to_vec())
            .send()
            .await
            .map_err(|e| anyhow!("Microservice network error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Microservice returned status {}: {}", status, body));
        }

        let parsed: ParsedReceipt = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to deserialize microservice response: {}", e))?;

        Ok(parsed)
    }

    async fn call_gemini(&self, image_bytes: &[u8], api_key: &str) -> Result<ParsedReceipt> {
        let b64_image = B64.encode(image_bytes);

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
            self.model, api_key
        );

        let resp = self
            .http
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| anyhow!("Network error calling Gemini: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Gemini API returned {}: {}", status, body));
        }

        let gemini_resp: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Gemini response: {}", e))?;

        let raw_json = gemini_resp["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .ok_or_else(|| anyhow!("Unexpected Gemini response shape: {:?}", gemini_resp))?;

        let mut parsed: ParsedReceipt = serde_json::from_str(raw_json)
            .map_err(|e| anyhow!("Gemini returned invalid JSON: {} — raw: {}", e, raw_json))?;

        parsed.is_mock = false;
        Ok(parsed)
    }

    fn mock_receipt() -> ParsedReceipt {
        ParsedReceipt {
            restaurant: Some("Meal Split".to_string()),
            items: vec![
                ParsedItem { name: "Galbi LA Cut".to_string(),      price: 28.0, quantity: 1, emoji: "🥩".to_string() },
                ParsedItem { name: "Spicy Pork Belly".to_string(),  price: 22.0, quantity: 1, emoji: "🐷".to_string() },
                ParsedItem { name: "Samgyeopsal".to_string(),       price: 24.0, quantity: 1, emoji: "🍖".to_string() },
                ParsedItem { name: "Japchae".to_string(),           price: 16.0, quantity: 1, emoji: "🍜".to_string() },
                ParsedItem { name: "Kimchi Fried Rice".to_string(), price: 14.0, quantity: 1, emoji: "🍚".to_string() },
                ParsedItem { name: "Soju".to_string(),              price: 9.0,  quantity: 2, emoji: "🍶".to_string() },
                ParsedItem { name: "Coke".to_string(),              price: 4.0,  quantity: 1, emoji: "🥤".to_string() },
                ParsedItem { name: "Sprite".to_string(),            price: 4.0,  quantity: 1, emoji: "🥤".to_string() },
                ParsedItem { name: "Sesame Noodles".to_string(),    price: 12.0, quantity: 1, emoji: "🍝".to_string() },
            ],
            subtotal: 133.0,
            tax: 12.53,
            tip: 18.0,
            total: 163.53,
            confidence: 0.98,
            is_mock: true,
        }
    }
}
