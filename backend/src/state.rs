// src/state.rs
// Shared application state injected into every handler via Axum's State extractor.
// Arc<AppState> is Clone + Send + Sync — safe to share across threads.

use std::{collections::HashMap, sync::Arc};
use tokio::sync::{broadcast, RwLock};

use crate::{ai::GeminiClient, db::Database};

const WS_BROADCAST_CAPACITY: usize = 64;

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub ai: GeminiClient,
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

    pub async fn broadcast(&self, split_id: &str, msg: &str) {
        let channels = self.ws_channels.read().await;
        if let Some(tx) = channels.get(split_id) {
            let _ = tx.send(msg.to_string());
        }
    }

    pub async fn subscribe(&self, split_id: &str) -> broadcast::Receiver<String> {
        {
            let channels = self.ws_channels.read().await;
            if let Some(tx) = channels.get(split_id) {
                return tx.subscribe();
            }
        }
        let mut channels = self.ws_channels.write().await;
        if let Some(tx) = channels.get(split_id) {
            return tx.subscribe();
        }
        let (tx, rx) = broadcast::channel(WS_BROADCAST_CAPACITY);
        channels.insert(split_id.to_string(), tx);
        rx
    }

    pub async fn cleanup_dead_ws_channels(&self) {
        let mut channels = self.ws_channels.write().await;
        let before = channels.len();
        channels.retain(|_split_id, tx| tx.receiver_count() > 0);
        let after = channels.len();
        if before != after {
            tracing::debug!("WS cleanup: removed {} dead channels", before - after);
        }
    }
}
