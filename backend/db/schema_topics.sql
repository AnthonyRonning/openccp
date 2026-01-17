-- Topics table for configurable summary analysis
CREATE TABLE IF NOT EXISTS topics (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    enabled BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed with default topics
INSERT INTO topics (name, description, sort_order) VALUES
    ('Bitcoin', 'Cryptocurrency and digital money', 1),
    ('Freedom of speech', 'Free expression and censorship resistance', 2),
    ('Government surveillance', 'Privacy from government monitoring', 3),
    ('Privacy tools', 'Tools for protecting personal privacy', 4),
    ('Open source software', 'FOSS and open development', 5),
    ('Decentralization', 'Distributed systems and anti-centralization', 6),
    ('Censorship', 'Content moderation and speech restrictions', 7)
ON CONFLICT (name) DO NOTHING;
