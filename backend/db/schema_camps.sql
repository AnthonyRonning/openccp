-- Camps/Categories Schema Extension
-- Adds support for grouping accounts by content-based analysis

-- Camps are categories like "AI Enthusiast" or "AI Skeptic"
CREATE TABLE camps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(20) DEFAULT '#3b82f6',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add camp_id to keywords (a keyword belongs to one camp)
ALTER TABLE keywords ADD COLUMN camp_id INT REFERENCES camps(id) ON DELETE CASCADE;
ALTER TABLE keywords ADD COLUMN weight FLOAT DEFAULT 1.0;

-- Drop the old type constraint and add new one
ALTER TABLE keywords DROP CONSTRAINT IF EXISTS check_keyword_type;
ALTER TABLE keywords ADD CONSTRAINT check_keyword_type 
    CHECK (type IN ('inclusion', 'exclusion', 'signal'));

-- Account scores per camp (the main analysis result)
CREATE TABLE account_camp_scores (
    account_id BIGINT REFERENCES accounts(id) ON DELETE CASCADE,
    camp_id INT REFERENCES camps(id) ON DELETE CASCADE,
    score FLOAT DEFAULT 0,
    bio_score FLOAT DEFAULT 0,
    tweet_score FLOAT DEFAULT 0,
    match_details JSONB,  -- {"bio_matches": [...], "tweet_matches": [...]}
    analyzed_at TIMESTAMPTZ,
    PRIMARY KEY (account_id, camp_id)
);

CREATE INDEX idx_account_camp_scores_score ON account_camp_scores(camp_id, score DESC);
CREATE INDEX idx_account_camp_scores_account ON account_camp_scores(account_id);

-- Insert example camps for AI analysis
INSERT INTO camps (name, slug, description, color) VALUES
    ('AI Enthusiast', 'ai-enthusiast', 'Accounts that are generally positive about AI, building with AI, or promoting AI adoption', '#22c55e'),
    ('AI Skeptic', 'ai-skeptic', 'Accounts expressing concerns about AI, potential harms, or advocating for restrictions', '#ef4444');

-- Insert example keywords for AI Enthusiast camp
INSERT INTO keywords (term, type, camp_id, weight, case_sensitive) VALUES
    -- Strong positive signals
    ('building with AI', 'signal', 1, 3.0, false),
    ('AI-powered', 'signal', 1, 2.5, false),
    ('LLM', 'signal', 1, 2.0, false),
    ('GPT', 'signal', 1, 1.5, false),
    ('machine learning', 'signal', 1, 2.0, false),
    ('neural network', 'signal', 1, 2.0, false),
    ('deep learning', 'signal', 1, 2.0, false),
    ('AI agent', 'signal', 1, 2.5, false),
    ('AI startup', 'signal', 1, 3.0, false),
    ('fine-tuning', 'signal', 1, 2.0, false),
    ('prompt engineering', 'signal', 1, 2.0, false),
    ('RAG', 'signal', 1, 2.0, true),
    ('vector database', 'signal', 1, 2.0, false),
    ('transformer', 'signal', 1, 1.5, false),
    ('inference', 'signal', 1, 1.5, false),
    ('model training', 'signal', 1, 2.0, false),
    ('open source AI', 'signal', 1, 2.5, false),
    ('AI safety', 'signal', 1, 1.0, false),  -- Could go either way
    ('AGI', 'signal', 1, 1.5, false),
    ('AI revolution', 'signal', 1, 2.0, false);

-- Insert example keywords for AI Skeptic camp
INSERT INTO keywords (term, type, camp_id, weight, case_sensitive) VALUES
    -- Strong skeptic signals
    ('AI slop', 'signal', 2, 3.0, false),
    ('AI art theft', 'signal', 2, 3.0, false),
    ('ban AI', 'signal', 2, 3.0, false),
    ('AI is stealing', 'signal', 2, 3.0, false),
    ('replace humans', 'signal', 2, 2.0, false),
    ('AI bubble', 'signal', 2, 2.5, false),
    ('AI hype', 'signal', 2, 2.0, false),
    ('AI grift', 'signal', 2, 3.0, false),
    ('anti-AI', 'signal', 2, 3.0, false),
    ('AI doomer', 'signal', 2, 2.0, false),
    ('existential risk', 'signal', 2, 1.5, false),
    ('AI alignment', 'signal', 2, 1.0, false),  -- Could go either way
    ('job loss', 'signal', 2, 1.5, false),
    ('automation anxiety', 'signal', 2, 2.0, false),
    ('tech bro', 'signal', 2, 1.5, false),
    ('AI ethics', 'signal', 2, 1.0, false),  -- Could go either way
    ('copyright AI', 'signal', 2, 2.0, false),
    ('scraping data', 'signal', 2, 1.5, false),
    ('consent', 'signal', 2, 1.0, false),
    ('regulation AI', 'signal', 2, 1.5, false);
