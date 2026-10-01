CREATE TABLE IF NOT EXISTS submission_snapshots (
 record_id TEXT PRIMARY KEY REFERENCES records(id),
 data TEXT NOT NULL,
 submitted_by TEXT NOT NULL,
 submitted_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS protect_submission_snapshot
BEFORE UPDATE ON submission_snapshots
BEGIN SELECT RAISE(ABORT, 'Original submissions cannot be modified'); END;
