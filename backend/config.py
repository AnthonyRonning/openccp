import os
from dotenv import load_dotenv

load_dotenv()

# X API credentials
X_BEARER_TOKEN = os.getenv("X_BEARER_TOKEN")

# Database
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://openccp_user:openccp_pass@localhost:5433/openccp"
)

# Scraping caps (for development/prototyping)
MAX_TWEETS_PER_ACCOUNT = int(os.getenv("MAX_TWEETS_PER_ACCOUNT", "25"))
MAX_FOLLOWERS_TO_FETCH = int(os.getenv("MAX_FOLLOWERS_TO_FETCH", "50"))
MAX_FOLLOWING_TO_FETCH = int(os.getenv("MAX_FOLLOWING_TO_FETCH", "50"))
