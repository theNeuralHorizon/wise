// Integration tests for the Wise API.
// These tests require the backend server to be running on http://127.0.0.1:8081.
// Run: cargo test -- --ignored

use reqwest::Client;

const API_BASE: &str = "http://127.0.0.1:8081/api";

async fn client() -> Client {
    Client::new()
}

async fn create_test_split(client: &Client, name: &str) -> serde_json::Value {
    let resp = client
        .post(format!("{}/splits", API_BASE))
        .json(&serde_json::json!({
            "name": name,
            "restaurant": format!("{} Restaurant", name),
            "participants": [
                { "name": "Host", "emoji": "😎", "upi_id": "host@upi" }
            ]
        }))
        .send()
        .await
        .expect("Failed to send create split request");

    assert!(resp.status().is_success(), "Create split failed: {}", resp.status());
    resp.json().await.expect("Failed to parse create split response")
}

#[tokio::test]
#[ignore]
async fn test_create_and_get_split() {
    let client = client().await;

    let created = create_test_split(&client, "Integration Test").await;
    let split_id = created["split_id"].as_str().unwrap();
    let _owner_token = created["owner_token"].as_str().unwrap();

    // GET split detail
    let resp = client
        .get(format!("{}/splits/{}", API_BASE, split_id))
        .send()
        .await
        .expect("Failed to get split");

    assert!(resp.status().is_success());
    let detail: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(detail["split"]["name"], "Integration Test");
    assert!(detail["participants"].as_array().unwrap().len() >= 1);
}

#[tokio::test]
#[ignore]
async fn test_upload_receipt() {
    let client = client().await;

    let created = create_test_split(&client, "Receipt Test").await;
    let split_id = created["split_id"].as_str().unwrap();
    let owner_token = created["owner_token"].as_str().unwrap();

    // Create a tiny 1x1 PNG
    let png_data = base64_decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAAWgmWQ0AAAAASUVORK5CYII=");

    let form = reqwest::multipart::Form::new()
        .part("receipt", reqwest::multipart::Part::bytes(png_data)
            .file_name("receipt.png")
            .mime_str("image/png")
            .unwrap());

    let resp = client
        .post(format!("{}/splits/{}/receipt?force=true", API_BASE, split_id))
        .header("Authorization", format!("Bearer {}", owner_token))
        .multipart(form)
        .send()
        .await
        .expect("Failed to upload receipt");

    assert!(resp.status().is_success(), "Upload failed: {}", resp.status());
    let parsed: serde_json::Value = resp.json().await.unwrap();
    assert!(parsed["items"].as_array().unwrap().len() > 0);
    assert!(parsed["totals"]["total"].as_f64().unwrap() > 0.0);
}

#[tokio::test]
#[ignore]
async fn test_assign_item_and_summary() {
    let client = client().await;

    let created = create_test_split(&client, "Assign Test").await;
    let split_id = created["split_id"].as_str().unwrap();
    let owner_token = created["owner_token"].as_str().unwrap();

    // Add an item
    let resp = client
        .post(format!("{}/splits/{}/items", API_BASE, split_id))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&serde_json::json!({
            "name": "Burger",
            "price": 50000,
            "quantity": 1,
            "emoji": "🍔"
        }))
        .send()
        .await
        .expect("Failed to add item");

    assert!(resp.status().is_success());
    let item_data: serde_json::Value = resp.json().await.unwrap();
    let item_id = item_data["item_id"].as_str().unwrap();

    // Get split detail to find participant ID
    let detail_resp = client
        .get(format!("{}/splits/{}", API_BASE, split_id))
        .send()
        .await
        .unwrap();
    let detail: serde_json::Value = detail_resp.json().await.unwrap();
    let participant_id = detail["participants"][0]["id"].as_str().unwrap();

    // Assign item
    let assign_resp = client
        .put(format!("{}/splits/{}/items/{}/assign", API_BASE, split_id, item_id))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&serde_json::json!({ "participant_ids": [participant_id] }))
        .send()
        .await
        .expect("Failed to assign item");

    assert!(assign_resp.status().is_success());

    // Get summary
    let summary_resp = client
        .get(format!("{}/splits/{}/summary", API_BASE, split_id))
        .send()
        .await
        .expect("Failed to get summary");

    assert!(summary_resp.status().is_success());
    let summary: serde_json::Value = summary_resp.json().await.unwrap();
    assert!(summary["summaries"].as_array().unwrap().len() >= 1);
    let person_summary = &summary["summaries"][0];
    assert_eq!(person_summary["subtotal"].as_i64().unwrap(), 50000);
}

#[tokio::test]
#[ignore]
async fn test_owner_token_verification() {
    let client = client().await;

    let created = create_test_split(&client, "Token Test").await;
    let split_id = created["split_id"].as_str().unwrap();
    let owner_token = created["owner_token"].as_str().unwrap();

    // Valid token should work
    let resp = client
        .post(format!("{}/splits/{}/receipt?force=true", API_BASE, split_id))
        .header("Authorization", format!("Bearer {}", owner_token))
        .multipart(reqwest::multipart::Form::new())
        .send()
        .await
        .unwrap();

    // May fail (no receipt file) but should be 400, not 401
    assert_ne!(resp.status(), 401, "Valid owner token was rejected");

    // Wrong token should fail
    let resp = client
        .post(format!("{}/splits/{}/receipt?force=true", API_BASE, split_id))
        .header("Authorization", "Bearer wrong-token-here")
        .multipart(reqwest::multipart::Form::new())
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 401, "Wrong token should return 401");
}

#[tokio::test]
#[ignore]
async fn test_guest_view() {
    let client = client().await;

    let created = create_test_split(&client, "Guest Test").await;
    let guest_token = created["guest_token"].as_str().unwrap();

    let resp = client
        .get(format!("{}/guest/{}", API_BASE, guest_token))
        .send()
        .await
        .expect("Failed to get guest view");

    assert!(resp.status().is_success());
    let view: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(view["name"], "Guest Test");
    assert_eq!(view["host"]["name"], "Host");
}

fn base64_decode(s: &str) -> Vec<u8> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(s).unwrap()
}
