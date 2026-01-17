-- Add expected_sentiment to keywords table
-- Values: 'positive', 'negative', 'any' (default)
ALTER TABLE keywords 
ADD COLUMN IF NOT EXISTS expected_sentiment VARCHAR(20) DEFAULT 'any';

-- Update existing keywords to 'any' (will need manual update based on camp intent)
UPDATE keywords SET expected_sentiment = 'any' WHERE expected_sentiment IS NULL;
