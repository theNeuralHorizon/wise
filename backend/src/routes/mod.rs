// src/routes/mod.rs
// Route registration. All API routes live under /api prefix (mounted in main.rs).

use axum::{
    routing::{get, post, put},
    Router,
};
use std::sync::Arc;

use crate::state::AppState;

pub mod guest;
pub mod splits;
pub mod ws;

pub fn api_router() -> Router<Arc<AppState>> {
    Router::new()
        // Health
        .route("/health", get(splits::health))
        // Split lifecycle
        .route("/splits", post(splits::create_split))
        .route("/splits/:id", get(splits::get_split))
        .route("/splits/:id/receipt", post(splits::upload_receipt))
        .route("/splits/:id/items/:item_id/assign", put(splits::assign_item))
        .route("/splits/:id/summary", get(splits::get_summary))
        .route("/splits/:id/items", post(splits::add_item))
        .route("/splits/:id/items/:item_id", put(splits::edit_item).delete(splits::delete_item))
        .route("/splits/:id/update", put(splits::update_split))
        // Guest (no-auth)
        .route("/guest/:token", get(guest::get_guest_view))
        .route("/guest/:token/pay", post(guest::guest_pay))
        // WebSocket real-time
        .route("/ws/:split_id", get(ws::ws_handler))
}
