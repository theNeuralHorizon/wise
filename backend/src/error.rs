// src/error.rs
// Centralized error type that maps cleanly to HTTP responses.
// Using thiserror for ergonomic From impls and Display.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Validation error: {0}")]
    Validation(serde_json::Value),

    #[error("AI service error: {0}")]
    Ai(String),

    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::Database(e) => {
                tracing::error!(error = %e, "database error");
                match e {
                    sqlx::Error::RowNotFound => (
                        StatusCode::NOT_FOUND,
                        "NOT_FOUND",
                        "Record not found".to_string(),
                    ),
                    _ => (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "DATABASE_ERROR",
                        format!("Database error: {}", e),
                    ),
                }
            }
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "NOT_FOUND", msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg.clone()),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, "CONFLICT", msg.clone()),
            AppError::Validation(errors) => {
                return (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(json!({
                        "error": { "code": "VALIDATION_ERROR", "details": errors }
                    })),
                )
                    .into_response();
            }
            AppError::Ai(msg) => (StatusCode::BAD_GATEWAY, "AI_ERROR", msg.clone()),
            AppError::Internal(e) => {
                tracing::error!(error = %e, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Internal server error".to_string(),
                )
            }
        };

        (
            status,
            Json(json!({
                "error": { "code": code, "message": message }
            })),
        )
            .into_response()
    }
}
