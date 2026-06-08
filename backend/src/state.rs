// src/state.rs
// Shared application state injected into every handler via Axum's State extractor.
// Arc<AppState> is Clone + Send + Sync — safe to share across threads.

use std::{collections::HashMap, sync::Arc};
use tokio::sync::{broadcast, RwLock};

use crate::{ai::GeminiClient, db::Database};

/// Capacity for the per-split WebSocket broadcast channel.
/// 64 messages is generous for UI updates — if a subscriber can't keep up
/// they get a Lagged error and we drop them gracefully.
const WS_BROADCAST_CAPACITY: usize = 64;

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub ai: GeminiClient,
    /// Per-split broadcast channel.
    /// Key = split_id, Value = broadcast::Sender<String> (JSON text frames).
    /// Created lazily on first WebSocket connection, never explicitly deleted
    /// (channel becomes inert when all subscribers disconnect).
    pub ws_channels: Arc<RwLock<HashMap<String, broadcast::Sender<String>>>>,
}

impl AppState {
    pub fn new(db: Database, ai: GeminiClient) -> Self {
        Self {
            db,
            ai,
            ws_channels: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Broadcast a JSON message to all WebSocket subscribers of a split.
    /// Fire-and-forget — we don't care if there are no subscribers.
    pub async fn broadcast(&self, split_id: &str, msg: &str) {
        let channels = self.ws_channels.read().await;
        if let Some(tx) = channels.get(split_id) {
            // send() returns Err if there are no active receivers — that's fine
            let _ = tx.send(msg.to_string());
        }
    }

    /// Get or create a broadcast channel for a split.
    /// Returns a Receiver subscribed from the current moment.
    pub async fn subscribe(&self, split_id: &str) -> broadcast::Receiver<String> {
        // Fast path: channel already exists
        {
            let channels = self.ws_channels.read().await;
            if let Some(tx) = channels.get(split_id) {
                return tx.subscribe();
            }
        }
        // Slow path: create new channel (write lock)
        let mut channels = self.ws_channels.write().await;
        // Double-check after acquiring write lock (another thread may have created it)
        if let Some(tx) = channels.get(split_id) {
            return tx.subscribe();
        }
        let (tx, rx) = broadcast::channel(WS_BROADCAST_CAPACITY);
        channels.insert(split_id.to_string(), tx);
        rx
    }
}
