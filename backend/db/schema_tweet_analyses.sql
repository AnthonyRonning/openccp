-- Tweet Analyses: Store side classifications from topic analysis
-- A single tweet can have multiple analyses from different topic searches

CREATE TABLE IF NOT EXISTS tweet_analyses (
    id SERIAL PRIMARY KEY,
    tweet_id BIGINT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    topic_query VARCHAR(500) NOT NULL,
    side_a_name VARCHAR(255) NOT NULL,
    side_b_name VARCHAR(255) NOT NULL,
    side VARCHAR(20) NOT NULL CHECK (side IN ('a', 'b', 'ambiguous')),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tweet_analyses_tweet ON tweet_analyses(tweet_id);
CREATE INDEX IF NOT EXISTS idx_tweet_analyses_topic ON tweet_analyses(topic_query);
CREATE INDEX IF NOT EXISTS idx_tweet_analyses_side ON tweet_analyses(side);
