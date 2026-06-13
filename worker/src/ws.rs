use worker::*;

#[durable_object]
pub struct SplitSocket {
    state: State,
    env: Env,
}

impl DurableObject for SplitSocket {
    fn new(state: State, env: Env) -> Self {
        Self { state, env }
    }

    async fn fetch(&self, mut req: Request) -> Result<Response> {
        // POST /broadcast — send message to all connected WebSocket clients
        if req.method() == Method::Post {
            let msg: String = req.text().await?;
            let websockets = self.state.get_websockets();
            for ws in websockets {
                let _ = ws.send_with_str(&msg);
            }
            return Response::ok("broadcast sent");
        }

        // GET with Upgrade — accept WebSocket connection using hibernation API
        let pair = WebSocketPair::new()?;
        let server = pair.server;
        server.accept()?;
        self.state.accept_web_socket(&server);
        Response::from_websocket(server)
    }

    async fn websocket_message(&self, _ws: WebSocket, _message: WebSocketIncomingMessage) -> Result<()> {
        // No-op — we don't process messages from clients
        Ok(())
    }

    async fn websocket_close(&self, _ws: WebSocket, _code: usize, _reason: String, _was_clean: bool) -> Result<()> {
        Ok(())
    }
}
