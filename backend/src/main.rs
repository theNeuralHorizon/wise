// src/main.rs
// Entry point. Sets up:
// - Tokio multi-threaded runtime (work-stealing, all CPU cores)
// - Structured tracing (JSON in prod, pretty in dev)
// - Database connection pool with WAL mode
// - Tower middleware: CORS, request ID, body size limit, tracing
// - Axum router with all API routes

use axum::{
    extract::{ConnectInfo, DefaultBodyLimit, Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::Response,
    Router,
};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

type RateMap = RwLock<HashMap<std::net::IpAddr, (u32, Instant)>>;

async fn rate_limiter(
    State(rate_map): State<Arc<RateMap>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let ip = addr.ip();
    let mut map = rate_map.write().await;
    let now = Instant::now();
    let entry = map.entry(ip).or_insert((0, now));
    if now.duration_since(entry.1) > Duration::from_secs(60) {
        *entry = (0, now);
    }
    entry.0 += 1;
    if entry.0 > 100 {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    drop(map);
    Ok(next.run(request).await)
}

mod ai;
mod db;
mod error;
mod models;
mod routes;
mod state;

use db::Database;
use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "wise_server=debug,tower_http=info,sqlx=warn".into()),
        )
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();

    let db = Database::new().await?;
    db.migrate().await?;

    let ai = ai::GeminiClient::new().map_err(|e| anyhow::anyhow!("Failed to initialize AI client: {}", e))?;

    let state = Arc::new(AppState::new(db, ai));

    // Spawn WS channel cleanup task
    {
        let state_clone = state.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
            loop {
                interval.tick().await;
                state_clone.cleanup_dead_ws_channels().await;
            }
        });
    }

    // CORS: read allowed origins from env, default to localhost:5173
    let allowed_origins: Vec<axum::http::HeaderValue> = std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:5173".to_string())
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let rate_map: Arc<RateMap> = Arc::new(RwLock::new(HashMap::new()));

    let app = Router::new()
        .nest("/api", routes::api_router())
        .layer(cors)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024))
        .layer(middleware::from_fn_with_state(rate_map, rate_limiter))
        .with_state(state);

    let host = std::env::var("HOST").unwrap_or_else(|_| "::".to_string());
    let port = std::env::var("PORT").unwrap_or_else(|_| "8081".to_string());
    let addr = format!("{}:{}", host, port);

    tracing::info!("Wise API listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;

    Ok(())
}
