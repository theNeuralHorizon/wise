// src/main.rs
// Entry point. Sets up:
// - Tokio multi-threaded runtime (work-stealing, all CPU cores)
// - Structured tracing (JSON in prod, pretty in dev)
// - Database connection pool with WAL mode
// - Tower middleware: CORS, request ID, body size limit, tracing
// - Axum router with all API routes

use axum::{
    extract::DefaultBodyLimit,
    Router,
};
use std::sync::Arc;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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
    // Load .env if present (dev convenience — production uses real env vars)
    dotenvy::dotenv().ok();

    // ── Tracing setup ──────────────────────────────────────────────────────────
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "wise_server=debug,tower_http=info,sqlx=warn".into()),
        )
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();

    // ── Database ───────────────────────────────────────────────────────────────
    let db = Database::new().await?;
    db.migrate().await?;

    // ── AI client ─────────────────────────────────────────────────────────────
    let ai = ai::GeminiClient::new();

    // ── Application state ─────────────────────────────────────────────────────
    let state = Arc::new(AppState::new(db, ai));

    // ── CORS ──────────────────────────────────────────────────────────────────
    let cors = CorsLayer::new()
        .allow_origin(Any) // tighten in production
        .allow_methods(Any)
        .allow_headers(Any);

    // ── Router ────────────────────────────────────────────────────────────────
    // IMPORTANT: In Axum 0.7 + tower-http 0.5, layers must be applied directly
    // to the Router via .layer() — NOT via ServiceBuilder — because ServiceBuilder
    // breaks the ResponseBody Default bound that TraceLayer requires.
    // Layers execute in reverse declaration order (inner-most first).
    let app = Router::new()
        .nest("/api", routes::api_router())
        .layer(cors)                                         // 3rd: outermost
        .layer(TraceLayer::new_for_http())                   // 2nd: per-request spans
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024))     // 1st: 10MB body limit
        .with_state(state);

    // ── Start server ──────────────────────────────────────────────────────────
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("{}:{}", host, port);

    tracing::info!("┌──────────────────────────────────────┐");
    tracing::info!("│  Wise API  →  http://{}  │", addr);
    tracing::info!("│  WebSocket →  ws://{}    │", addr);
    tracing::info!("└──────────────────────────────────────┘");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
