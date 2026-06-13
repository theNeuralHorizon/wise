use std::collections::HashSet;
use worker::*;

#[durable_object]
pub struct SplitSocket {
    state: State,
    env: Env,
}

#[durable_object]
impl DurableObject for SplitSocket {
    fn new(state: State, env: Env) -> Self {
        Self { state, env }
    }

    async fn fetch(&mut self, mut req: Request) -> Result<Response> {
        // POST /broadcast — send message to all connected WebSocket clients
        if req.method() == Method::Post {
            let msg: String = req.text().await?;
            let websocket_count = self.state.storage().get::<u64>("ws_count").await.unwrap_or(0);

            if websocket_count > 0 {
                // Broadcast to all connected WebSocket clients
                let keys: Vec<String> = self.state.storage().keys(None, None).await?;
                for key in keys {
                    if key.starts_with("ws_") {
                        if let Ok(ws) = self.state.storage().get::<WebSocket>(&key).await {
                            if ws.ready_state() == WebSocketState::Open {
                                let _ = ws.send_with_str(&msg);
                            }
                        }
                    }
                }
            }

            return Response::ok("broadcast sent");
        }

        // GET with Upgrade — accept WebSocket connection
        if let Some(websocket) = req.websocket()? {
            let ws_id = format!("ws_{}", uuid::Uuid::new_v4().to_string());
            let count: u64 = self.state.storage().get("ws_count").await.unwrap_or(0);
            self.state.storage().put(&ws_id, &websocket.clone()).await?;
            self.state.storage().put("ws_count", count + 1).await?;

            // Set up event handlers
            websocket.set_on_message(Some(Closure::new(move |evt: MessageEvent| {
                // No-op — we don't process messages from clients
            }).into_js_value()));

            let state = self.state.clone();
            let ws_id_clone = ws_id.clone();
            websocket.set_on_close(Some(Closure::new(move |_evt: CloseEvent| {
                let state = state.clone();
                let ws_id = ws_id_clone.clone();
                wasm_bindgen_futures::spawn_local(async move {
                    let _ = state.storage().delete(&[ws_id]).await;
                    let count: u64 = state.storage().get("ws_count").await.unwrap_or(0);
                    let _ = state.storage().put("ws_count", count.saturating_sub(1)).await;
                });
            }).into_js_value()));

            websocket.accept()?;
            Response::from_websocket(websocket)
        } else {
            Response::error("Expected WebSocket upgrade", 400)
        }
    }
}
