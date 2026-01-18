CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    account_username VARCHAR(255),
    topic_query TEXT,
    content JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_account_username ON reports(account_username);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
