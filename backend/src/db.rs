// src/db.rs
// Database connection pool + schema migration.
// Using SQLite WAL mode for concurrent reads with single writer — optimal
// for this workload (many reads, infrequent writes).

use anyhow::{Context, Result};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};

#[derive(Clone)]
pub struct Database {
    pub pool: Pool<Sqlite>,
}

impl Database {
    pub async fn new() -> Result<Self> {
        let db_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "sqlite:wise.db?mode=rwc".to_string());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await
            .context("Failed to connect to SQLite database")?;

        Ok(Self { pool })
    }

    pub async fn migrate(&self) -> Result<()> {
        sqlx::query("PRAGMA journal_mode=WAL")
            .execute(&self.pool)
            .await?;
        sqlx::query("PRAGMA foreign_keys=ON")
            .execute(&self.pool)
            .await?;
        sqlx::query("PRAGMA synchronous=NORMAL")
            .execute(&self.pool)
            .await?;

        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY
            )"#,
        )
        .execute(&self.pool)
        .await?;

        let current_version: i64 = sqlx::query_as::<_, (i64,)>(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        )
        .fetch_one(&self.pool)
        .await
        .map(|r| r.0)
        .unwrap_or(0);

        if current_version < 1 {
            sqlx::query(
                r#"CREATE TABLE IF NOT EXISTS splits (
                    id               TEXT PRIMARY KEY,
                    name             TEXT NOT NULL,
                    restaurant       TEXT,
                    created_by       TEXT NOT NULL,
                    created_at       TEXT NOT NULL,
                    total_amount     INTEGER NOT NULL DEFAULT 0,
                    tax              INTEGER NOT NULL DEFAULT 0,
                    tip              INTEGER NOT NULL DEFAULT 0,
                    guest_token      TEXT NOT NULL UNIQUE,
                    owner_token      TEXT NOT NULL,
                    token_created_at TEXT NOT NULL DEFAULT ''
                )"#,
            )
            .execute(&self.pool)
            .await?;

            sqlx::query(
                r#"CREATE TABLE IF NOT EXISTS participants (
                    id        TEXT PRIMARY KEY,
                    split_id  TEXT NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
                    name      TEXT NOT NULL,
                    emoji     TEXT NOT NULL DEFAULT '😊',
                    upi_id    TEXT,
                    is_guest  INTEGER NOT NULL DEFAULT 0
                )"#,
            )
            .execute(&self.pool)
            .await?;

            sqlx::query(
                r#"CREATE TABLE IF NOT EXISTS items (
                    id        TEXT PRIMARY KEY,
                    split_id  TEXT NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
                    name      TEXT NOT NULL,
                    price     INTEGER NOT NULL,
                    quantity  INTEGER NOT NULL DEFAULT 1,
                    emoji     TEXT NOT NULL DEFAULT '🍽️'
                )"#,
            )
            .execute(&self.pool)
            .await?;

            sqlx::query(
                r#"CREATE TABLE IF NOT EXISTS item_assignments (
                    item_id        TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                    participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
                    share_fraction REAL NOT NULL DEFAULT 1.0,
                    PRIMARY KEY (item_id, participant_id)
                )"#,
            )
            .execute(&self.pool)
            .await?;

            sqlx::query(
                r#"CREATE TABLE IF NOT EXISTS payments (
                    id               TEXT PRIMARY KEY,
                    split_id         TEXT NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
                    from_participant TEXT NOT NULL REFERENCES participants(id),
                    to_participant   TEXT NOT NULL,
                    amount           INTEGER NOT NULL,
                    status           TEXT NOT NULL DEFAULT 'pending',
                    created_at       TEXT NOT NULL
                )"#,
            )
            .execute(&self.pool)
            .await?;

            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_participants_split ON participants(split_id)",
            )
            .execute(&self.pool)
            .await?;

            sqlx::query("CREATE INDEX IF NOT EXISTS idx_items_split ON items(split_id)")
                .execute(&self.pool)
                .await?;

            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_assignments_item ON item_assignments(item_id)",
            )
            .execute(&self.pool)
            .await?;

            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_assignments_participant ON item_assignments(participant_id)",
            )
            .execute(&self.pool)
            .await?;

            sqlx::query(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_splits_guest_token ON splits(guest_token)",
            )
            .execute(&self.pool)
            .await?;

            sqlx::query("INSERT OR IGNORE INTO schema_migrations (version) VALUES (1)")
                .execute(&self.pool)
                .await?;

            tracing::info!("✅ Schema migration v1 applied");
        }

        if current_version < 2 {
            let _ = sqlx::query("ALTER TABLE splits ADD COLUMN token_created_at TEXT NOT NULL DEFAULT ''")
                .execute(&self.pool)
                .await;

            let _ = sqlx::query("UPDATE splits SET token_created_at = created_at WHERE token_created_at = ''")
                .execute(&self.pool)
                .await;

            sqlx::query("INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)")
                .execute(&self.pool)
                .await?;

            tracing::info!("✅ Schema migration v2 applied");
        }

        if current_version < 3 {
            let _ = sqlx::query("ALTER TABLE payments ADD COLUMN confirmed_at TEXT")
                .execute(&self.pool)
                .await;

            let _ = sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_payments_split ON payments(split_id)",
            )
            .execute(&self.pool)
            .await;

            let _ = sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)",
            )
            .execute(&self.pool)
            .await;

            sqlx::query("INSERT OR IGNORE INTO schema_migrations (version) VALUES (3)")
                .execute(&self.pool)
                .await?;

            tracing::info!("✅ Schema migration v3 applied");
        }

        tracing::info!("✅ Database schema ready (WAL mode, version={})", current_version.max(3));
        Ok(())
    }
}
