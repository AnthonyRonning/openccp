# OpenUniverse

A graph-based Twitter/X account analysis tool for tracking accounts, their networks, and keyword-based sentiment analysis.

## Project Goals

Build a tool that allows users to:

1. **Add seed accounts** - Manually input Twitter handles to track
2. **Expand networks** - Automatically pull followers/following (1 level deep) to discover related accounts
3. **Analyze content** - Track keywords (inclusion and exclusion) across tweets
4. **Visualize relationships** - Graph view of account networks + list view for detailed exploration
5. **Drill down** - Click into any account to see their profile, tweets, and keyword matches

## Features

### MVP (Hackathon - 24 hours)

- [ ] Add Twitter handle as a "seed" account
- [ ] Scrape profile data (bio, metrics, etc.)
- [ ] Fetch recent tweets (configurable cap)
- [ ] Fetch followers/following (configurable cap, 1 level deep)
- [ ] Store all data in PostgreSQL
- [ ] Keyword configuration (inclusion/exclusion terms)
- [ ] Keyword matching against tweets
- [ ] List view of all accounts with labels
- [ ] Account detail view (profile + tweets + keyword matches)
- [ ] Basic graph visualization

### Future

- [ ] Time-series tracking (profile changes, new tweets over time)
- [ ] Remove caps, implement proper rate limiting
- [ ] AI assistant with tool-calling for natural language queries
- [ ] Advanced sentiment analysis
- [ ] Export/reporting features

## Tech Stack

### Backend (Python)

| Component | Technology |
|-----------|------------|
| Runtime | Python 3.12 |
| Package Manager | uv |
| API Framework | FastAPI |
| Database | PostgreSQL 17 |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |
| X API Client | xdk (official X SDK) |
| Environment | python-dotenv |

### Frontend (TypeScript)

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Framework | React 18+ |
| Routing | React Router |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Graph Visualization | TBD (vis.js, react-force-graph, or d3) |

### Infrastructure

| Component | Technology |
|-----------|------------|
| Dev Environment | Nix Flakes |
| Database | PostgreSQL (local via Nix) |
| Process Manager | TBD (honcho, overmind, or similar) |

## Data Model

Schema designed from actual X API responses. Metrics are flattened for easy querying/aggregation. Complex nested data (entities) stored as JSONB with GIN indexes.

### Accounts

Stores both manually added "seed" accounts and auto-discovered accounts from follower/following expansion.

```sql
CREATE TABLE accounts (
    -- Twitter identifiers
    id BIGINT PRIMARY KEY,                    -- Twitter ID (e.g., 1890869592391626752)
    username VARCHAR(255) NOT NULL UNIQUE,    -- Handle without @ (e.g., "anthonyronning")
    
    -- Profile info
    name VARCHAR(255),                        -- Display name
    description TEXT,                         -- Bio
    location VARCHAR(255),
    url TEXT,                                 -- Website URL from profile
    profile_image_url TEXT,
    pinned_tweet_id BIGINT,
    
    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_type VARCHAR(50),                -- 'blue', 'business', 'government', or NULL
    protected BOOLEAN DEFAULT FALSE,
    
    -- Public metrics (flattened for querying)
    followers_count INT DEFAULT 0,
    following_count INT DEFAULT 0,
    tweet_count INT DEFAULT 0,
    listed_count INT DEFAULT 0,
    like_count INT DEFAULT 0,
    media_count INT DEFAULT 0,
    
    -- Entities (JSONB for complex nested data)
    entities JSONB,                           -- {description: {mentions: [...], urls: [...]}}
    
    -- Timestamps
    twitter_created_at TIMESTAMPTZ,           -- When Twitter account was created
    
    -- Our metadata
    is_seed BOOLEAN DEFAULT FALSE,            -- Manually added vs auto-discovered
    scrape_status VARCHAR(20) DEFAULT 'pending',  -- pending, scraped, error
    scraped_at TIMESTAMPTZ,                   -- When we last scraped this account
    created_at TIMESTAMPTZ DEFAULT NOW(),     -- When we added to our DB
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accounts_username ON accounts(username);
CREATE INDEX idx_accounts_is_seed ON accounts(is_seed);
CREATE INDEX idx_accounts_scrape_status ON accounts(scrape_status);
```

### Follows (Graph Edges)

Represents follower/following relationships between accounts.

```sql
CREATE TABLE follows (
    follower_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    following_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
```

### Tweets

Stores tweets for keyword analysis.

```sql
CREATE TABLE tweets (
    -- Twitter identifiers
    id BIGINT PRIMARY KEY,                    -- Twitter ID
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    
    -- Content
    text TEXT NOT NULL,
    lang VARCHAR(10),                         -- Language code (e.g., 'en')
    
    -- Conversation threading
    conversation_id BIGINT,                   -- Root tweet of conversation
    in_reply_to_user_id BIGINT,               -- User being replied to
    
    -- Referenced tweets (JSONB array)
    referenced_tweets JSONB,                  -- [{type: "replied_to"|"quoted"|"retweeted", id: "..."}]
    
    -- Public metrics (flattened for querying)
    retweet_count INT DEFAULT 0,
    reply_count INT DEFAULT 0,
    like_count INT DEFAULT 0,
    quote_count INT DEFAULT 0,
    bookmark_count INT DEFAULT 0,
    impression_count INT DEFAULT 0,
    
    -- Entities (JSONB for mentions, urls, hashtags, etc.)
    entities JSONB,                           -- {mentions: [...], urls: [...], hashtags: [...], annotations: [...]}
    
    -- Timestamps  
    twitter_created_at TIMESTAMPTZ,           -- When tweet was posted
    scraped_at TIMESTAMPTZ DEFAULT NOW()      -- When we fetched it
);

CREATE INDEX idx_tweets_account ON tweets(account_id);
CREATE INDEX idx_tweets_conversation ON tweets(conversation_id);
CREATE INDEX idx_tweets_twitter_created ON tweets(twitter_created_at);
CREATE INDEX idx_tweets_entities ON tweets USING GIN (entities);  -- For JSONB queries
```

### Keywords

User-defined keywords for analysis.

```sql
CREATE TABLE keywords (
    id SERIAL PRIMARY KEY,
    term VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('inclusion', 'exclusion')),
    case_sensitive BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_keywords_term_type ON keywords(term, type);
```

### Account Keyword Matches

Tracks which accounts match which keywords (and how often).

```sql
CREATE TABLE account_keyword_matches (
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    keyword_id INT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    match_count INT DEFAULT 0,                -- Number of tweets containing keyword
    last_checked_at TIMESTAMPTZ,
    PRIMARY KEY (account_id, keyword_id)
);

CREATE INDEX idx_matches_keyword ON account_keyword_matches(keyword_id);
CREATE INDEX idx_matches_count ON account_keyword_matches(match_count DESC);
```

### Tweet Keyword Matches

Tracks which specific tweets matched which keywords (for drill-down).

```sql
CREATE TABLE tweet_keyword_matches (
    tweet_id BIGINT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    keyword_id INT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    PRIMARY KEY (tweet_id, keyword_id)
);

CREATE INDEX idx_tweet_matches_keyword ON tweet_keyword_matches(keyword_id);
```

## Configuration

Configurable caps for development/prototyping (will be removed for production):

```python
# config.py
MAX_TWEETS_PER_ACCOUNT = 3      # Tweets to fetch per account
MAX_FOLLOWERS_TO_FETCH = 3      # Followers to pull (1 level deep)
MAX_FOLLOWING_TO_FETCH = 3      # Following to pull (1 level deep)
```

## API Design

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/accounts` | Add a seed account by username |
| GET | `/api/accounts` | List all accounts (with filters) |
| GET | `/api/accounts/:id` | Get account details |
| POST | `/api/accounts/:id/scrape` | Trigger rescrape of account |

### Keywords

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/keywords` | Add a keyword |
| GET | `/api/keywords` | List all keywords |
| DELETE | `/api/keywords/:id` | Remove a keyword |
| POST | `/api/keywords/analyze` | Run keyword analysis on all accounts |

### Graph

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/graph` | Get nodes and edges for visualization |
| GET | `/api/graph/:id` | Get subgraph centered on an account |

## X API Data Available

### User Fields

- `id`, `username`, `name`
- `description` (bio)
- `location`
- `profile_image_url`
- `url`
- `public_metrics` (followers_count, following_count, tweet_count, listed_count)
- `verified`, `verified_type`
- `created_at`
- `pinned_tweet_id`

### Tweet Fields

- `id`, `text`, `created_at`
- `author_id`
- `public_metrics` (like_count, retweet_count, reply_count, quote_count)
- `entities` (hashtags, mentions, urls, cashtags)
- `context_annotations` (topics X has identified)
- `conversation_id`
- `referenced_tweets` (for retweets, quotes, replies)

## Project Structure

```
openuniverse/
├── flake.nix                 # Nix dev environment
├── flake.lock
├── README.md
├── .env                      # Local secrets (gitignored)
├── .env.example
├── .gitignore
│
├── backend/
│   ├── requirements.txt
│   ├── config.py             # Caps and settings
│   ├── db/
│   │   ├── schema.sql
│   │   └── connection.py
│   ├── scraper/
│   │   ├── client.py         # X API client wrapper
│   │   ├── accounts.py       # Account scraping logic
│   │   ├── tweets.py         # Tweet scraping logic
│   │   └── followers.py      # Follower/following expansion
│   ├── analysis/
│   │   └── keywords.py       # Keyword matching logic
│   ├── api/
│   │   ├── main.py           # FastAPI app
│   │   ├── routes/
│   │   │   ├── accounts.py
│   │   │   ├── keywords.py
│   │   │   └── graph.py
│   │   └── models.py         # Pydantic models
│   └── scripts/
│       └── seed.py           # Dev seeding script
│
├── frontend/
│   ├── package.json
│   ├── bun.lockb
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── components.json       # shadcn config
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/
│   │   │   ├── index.tsx     # Dashboard / list view
│   │   │   ├── account.tsx   # Account detail view
│   │   │   ├── graph.tsx     # Graph visualization
│   │   │   └── keywords.tsx  # Keyword management
│   │   ├── components/
│   │   │   ├── ui/           # shadcn components
│   │   │   ├── AccountCard.tsx
│   │   │   ├── AccountList.tsx
│   │   │   ├── GraphView.tsx
│   │   │   └── KeywordBadge.tsx
│   │   ├── lib/
│   │   │   ├── api.ts        # API client
│   │   │   └── utils.ts
│   │   └── styles/
│   │       └── globals.css
│   └── public/
│
└── hello.py                  # Initial X API test (can remove later)
```

## Getting Started

### Prerequisites

- Nix with flakes enabled
- X Developer account with API access

### Setup

```bash
# Enter dev environment (auto-starts PostgreSQL on port 5433, creates database)
nix develop

# Edit .env with your X API credentials (auto-created from .env.example)
# At minimum you need X_BEARER_TOKEN

# Initialize database schema
just db-init

# Install all dependencies
just install

# Run backend (terminal 1, after running nix develop)
just backend

# Run frontend (terminal 2, after running nix develop)
just frontend
```

The backend runs at `http://localhost:8000` and frontend at `http://localhost:5173`.

### Available Commands

| Command | Description |
|---------|-------------|
| `just` | List all commands |
| `just db-init` | Initialize database schema |
| `just db-reset` | Drop and recreate all tables |
| `just db` | Connect to database with psql |
| `just install` | Install backend + frontend dependencies |
| `just backend` | Run backend server |
| `just frontend` | Run frontend dev server |
| `just scrape <username>` | Scrape a Twitter account |
| `just analyze` | Analyze all accounts for camp membership |
| `just stats` | Show database statistics |

## Chrome Extension (Crowdsourced Tweet Collection)

The extension captures tweets as you browse Twitter/X and sends them to our database - completely free! No X API costs for tweets.

### Installing the Extension

**Step 1: Download the extension**

1. Go to the [GitHub repository](https://github.com/AnthonyRonning/openuniverse)
2. Click the green **Code** button
3. Click **Download ZIP**
4. Find the downloaded ZIP file (usually in your Downloads folder)
5. Right-click the ZIP and select **Extract All** (Windows) or double-click to unzip (Mac)
6. Remember where you extracted it!

**Step 2: Install in Chrome**

1. Open Google Chrome
2. Type `chrome://extensions` in the address bar and press Enter
3. Look for **Developer mode** in the top-right corner and turn it ON (click the toggle)
4. Click the **Load unpacked** button (top-left area)
5. Navigate to where you extracted the files
6. Select the `extension` folder (not the main folder - the one *inside* called `extension`)
7. Click **Select Folder**

You should see "OpenUniverse Tweet Collector" appear in your extensions list!

**Step 3: Pin the extension (optional but recommended)**

1. Click the puzzle piece icon 🧩 in Chrome's toolbar (top-right)
2. Find "OpenUniverse Tweet Collector" in the list
3. Click the pin icon 📌 next to it

Now you'll see the extension icon in your toolbar!

### Using the Extension

1. **Click the extension icon** in your toolbar to see the popup
2. Make sure the toggle is set to **On** (it's on by default)
3. **Browse Twitter/X normally** - the extension works in the background!
4. Check the popup anytime to see how many tweets you've collected

That's it! Every tweet you see while browsing helps build our database. Thank you for contributing! 💜

### How It Works (Technical Details)

- Intercepts Twitter's internal API calls as you browse
- Extracts tweet data (text, likes, retweets, author info)
- Batches and sends to our backend every 5 seconds
- Automatically deduplicates - seeing the same tweet twice won't create duplicates

### Cost Savings

| Method | Cost per Tweet |
|--------|---------------|
| X API | $0.005 |
| Crowdsourced (you!) | $0.00 |

Profile lookups (when needed for new accounts) still cost $0.01 each via X API.

## Rate Limiting Notes

X API has rate limits that vary by tier:

| Tier | User Lookups | Tweet Reads | Follower Reads |
|------|--------------|-------------|----------------|
| Free | 100/month | Very limited | Very limited |
| Basic ($100/mo) | 10,000/month | 10,000/month | Higher |
| Pro ($5,000/mo) | 1,000,000/month | Full access | Full access |

For prototype/hackathon, we use configurable caps to stay within limits. Production will need proper rate limit handling with backoff and queuing.

## License

TBD
