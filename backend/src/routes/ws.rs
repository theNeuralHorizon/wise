// src/routes/ws.rs
// WebSocket handler for real-time split updates.
//
// Design:
// - One broadcast channel per split_id (lazy init in AppState::subscribe)
// - Per-connection: two Tokio tasks (send + receive), coordinated via select!
// - Receive side relays client messages to all other subscribers
//   (enables host to push state to all guests without polling)
// - Graceful shutdown: when either task ends, both are aborted

use axum::{
    extract::{ws::{Message, WebSocket}, Path, State, WebSocketUpgrade},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::sync::Arc;

use crate::state::AppState;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(split_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, split_id, state))
}

async fn handle_socket(socket: WebSocket, split_id: String, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    // Subscribe to this split's broadcast channel
    let mut rx = state.subscribe(&split_id).await;

    tracing::debug!(split_id = %split_id, "WebSocket connected");

    // Send initial connection ack
    let welcome = json!({
        "type": "connected",
        "split_id": split_id,
    })
    .to_string();
    let _ = sender.send(Message::Text(welcome)).await;

    // Task 1: Forward broadcast messages to this client
    let send_split = split_id.clone();
    let mut send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    if sender.send(Message::Text(msg)).await.is_err() {
                        break; // Client disconnected
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!(split_id = %send_split, skipped = n, "WebSocket client lagging");
                    // Continue receiving — skip missed messages
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Task 2: Receive messages from this client, relay to all others
    let recv_split = split_id.clone();
    let state2 = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(result) = receiver.next().await {
            match result {
                Ok(Message::Text(text)) => {
                    // Client sending an event (e.g. assignment change) — fan out
                    state2.broadcast(&recv_split, &text).await;
                }
                Ok(Message::Ping(data)) => {
                    // Axum handles pong automatically, but we log it
                    tracing::trace!(split_id = %recv_split, "WebSocket ping received");
                    let _ = data; // suppress warning
                }
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
    });

    // If either task ends, abort the other and log
    tokio::select! {
        _ = (&mut send_task) => {
            recv_task.abort();
        }
        _ = (&mut recv_task) => {
            send_task.abort();
        }
    }

    tracing::debug!(split_id = %split_id, "WebSocket disconnected");
}
