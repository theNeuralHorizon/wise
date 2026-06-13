-- Wise D1 Schema
-- Identical to the SQLite schema, adapted for D1 (no foreign key enforcement at DB level).

CREATE TABLE IF NOT EXISTS splits (
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
);

CREATE TABLE IF NOT EXISTS participants (
    id        TEXT PRIMARY KEY,
    split_id  TEXT NOT NULL,
    name      TEXT NOT NULL,
    emoji     TEXT NOT NULL DEFAULT '😊',
    upi_id    TEXT,
    is_guest  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
    id        TEXT PRIMARY KEY,
    split_id  TEXT NOT NULL,
    name      TEXT NOT NULL,
    price     INTEGER NOT NULL,
    quantity  INTEGER NOT NULL DEFAULT 1,
    emoji     TEXT NOT NULL DEFAULT '🍽️'
);

CREATE TABLE IF NOT EXISTS item_assignments (
    item_id        TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    share_fraction REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY (item_id, participant_id)
);

CREATE TABLE IF NOT EXISTS payments (
    id               TEXT PRIMARY KEY,
    split_id         TEXT NOT NULL,
    from_participant TEXT NOT NULL,
    to_participant   TEXT NOT NULL,
    amount           INTEGER NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',
    created_at       TEXT NOT NULL,
    confirmed_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_participants_split ON participants(split_id);
CREATE INDEX IF NOT EXISTS idx_items_split ON items(split_id);
CREATE INDEX IF NOT EXISTS idx_assignments_item ON item_assignments(item_id);
CREATE INDEX IF NOT EXISTS idx_assignments_participant ON item_assignments(participant_id);
CREATE INDEX IF NOT EXISTS idx_payments_split ON payments(split_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
