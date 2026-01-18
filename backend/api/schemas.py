"""
Pydantic schemas for API request/response models.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict


# === Account Schemas ===

class AccountBase(BaseModel):
    id: int
    username: str
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    url: Optional[str] = None
    profile_image_url: Optional[str] = None
    verified: bool = False
    verified_type: Optional[str] = None
    followers_count: int = 0
    following_count: int = 0
    tweet_count: int = 0
    like_count: int = 0
    is_seed: bool = False

    model_config = ConfigDict(from_attributes=True)


class AccountDetail(AccountBase):
    pinned_tweet_id: Optional[int] = None
    protected: bool = False
    listed_count: int = 0
    media_count: int = 0
    entities: Optional[Dict] = None
    twitter_created_at: Optional[datetime] = None
    scrape_status: str = "pending"
    scraped_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AccountList(BaseModel):
    accounts: List[AccountBase]
    total: int


# === Tweet Schemas ===

class TweetBase(BaseModel):
    id: int
    account_id: int
    text: str
    lang: Optional[str] = None
    twitter_created_at: Optional[datetime] = None
    retweet_count: int = 0
    reply_count: int = 0
    like_count: int = 0
    quote_count: int = 0
    impression_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class TweetDetail(TweetBase):
    conversation_id: Optional[int] = None
    in_reply_to_user_id: Optional[int] = None
    referenced_tweets: Optional[List[Dict]] = None
    bookmark_count: int = 0
    entities: Optional[Dict] = None
    scraped_at: Optional[datetime] = None


class TweetList(BaseModel):
    tweets: List[TweetBase]
    total: int


class TweetWithAuthor(BaseModel):
    id: str  # String to avoid JS precision loss
    account_id: int
    text: str
    twitter_created_at: Optional[datetime] = None
    retweet_count: int = 0
    reply_count: int = 0
    like_count: int = 0
    quote_count: int = 0
    impression_count: int = 0
    # Author info
    author_username: str
    author_name: Optional[str] = None
    author_profile_image_url: Optional[str] = None
    author_verified: bool = False

    model_config = ConfigDict(from_attributes=True)


class TweetFeedResponse(BaseModel):
    tweets: List[TweetWithAuthor]
    total: int
    has_more: bool


# === Graph Schemas ===

class GraphNode(BaseModel):
    id: str
    username: str
    name: Optional[str] = None
    is_seed: bool = False
    followers_count: int = 0
    following_count: int = 0
    profile_image_url: Optional[str] = None


class GraphEdge(BaseModel):
    source: str
    target: str


class GraphData(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


# === Stats Schemas ===

class StatsResponse(BaseModel):
    accounts: int
    seeds: int
    tweets: int
    follows: int
    keywords: int


# === Scrape Schemas ===

class ScrapeRequest(BaseModel):
    username: str
    include_following: bool = True
    include_followers: bool = True


class ScrapeStats(BaseModel):
    account_scraped: bool
    following_added: int
    followers_added: int
    errors: List[str]


class ScrapeResponse(BaseModel):
    account: Optional[AccountBase] = None
    stats: ScrapeStats


# === Keyword Schemas ===

class KeywordBase(BaseModel):
    id: int
    term: str
    type: str  # 'inclusion' or 'exclusion'
    case_sensitive: bool = False
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class KeywordCreate(BaseModel):
    term: str
    type: str  # 'inclusion' or 'exclusion'
    case_sensitive: bool = False


class KeywordList(BaseModel):
    keywords: List[KeywordBase]
    total: int


# === Camp Schemas ===

class CampBase(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    color: str = "#3b82f6"
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CampKeyword(BaseModel):
    id: int
    term: str
    weight: float = 1.0
    case_sensitive: bool = False
    expected_sentiment: str = "any"  # positive, negative, any

    model_config = ConfigDict(from_attributes=True)


class CampDetail(CampBase):
    keywords: List[CampKeyword] = []


class CampList(BaseModel):
    camps: List[CampBase]
    total: int


class KeywordAddRequest(BaseModel):
    term: str
    weight: float = 1.0
    case_sensitive: bool = False
    expected_sentiment: str = "any"  # positive, negative, any


class KeywordUpdateRequest(BaseModel):
    term: Optional[str] = None
    weight: Optional[float] = None
    case_sensitive: Optional[bool] = None


class CampCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#3b82f6"


class CampUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


# === Analysis Schemas ===

class MatchDetail(BaseModel):
    term: str
    count: int
    weight: float


class AccountCampScoreBase(BaseModel):
    camp_id: int
    camp_name: str
    camp_color: str
    score: float
    bio_score: float
    tweet_score: float
    bio_matches: List[MatchDetail] = []
    tweet_matches: List[MatchDetail] = []


class AccountAnalysis(BaseModel):
    account: AccountBase
    scores: List[AccountCampScoreBase]


class LeaderboardEntry(BaseModel):
    rank: int
    account: AccountBase
    score: float
    bio_score: float
    tweet_score: float


class CampLeaderboard(BaseModel):
    camp: CampBase
    entries: List[LeaderboardEntry]


class CampTweet(BaseModel):
    tweet_id: int
    text: str
    username: str
    name: Optional[str] = None
    profile_image_url: Optional[str] = None
    followers_count: int = 0
    score: float
    matched_keywords: List[str]
    like_count: int = 0
    retweet_count: int = 0
    impression_count: int = 0


class CampTopTweets(BaseModel):
    camp: CampBase
    tweets: List[CampTweet]


class AnalyzeRequest(BaseModel):
    username: Optional[str] = None  # None = analyze all


class AnalyzeResponse(BaseModel):
    analyzed: int
    total_scores: int


# === Sentiment Schemas ===

class SentimentStats(BaseModel):
    total_tweets: int
    analyzed: int
    pending: int
    by_sentiment: Dict[str, int]


class SentimentAnalyzeRequest(BaseModel):
    camp_id: Optional[int] = None  # None = analyze all matched tweets
    limit: int = 100


class SentimentAnalyzeResponse(BaseModel):
    tweets_found: int
    analyzed: int
    saved: int
    camp: Optional[str] = None


class TweetWithSentiment(BaseModel):
    id: int
    text: str
    username: str
    name: Optional[str] = None
    profile_image_url: Optional[str] = None
    sentiment: Optional[str] = None
    sentiment_score: Optional[float] = None
    matched_keywords: List[str] = []
    like_count: int = 0
    retweet_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class CampTweetWithSentiment(CampTweet):
    sentiment: Optional[str] = None
    sentiment_score: Optional[float] = None


# === Summary Schemas ===

class SummaryTweet(BaseModel):
    id: int
    text: str
    like_count: int = 0
    retweet_count: int = 0
    twitter_created_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


class TopicSentiment(BaseModel):
    noticing: bool
    comment: str
    examples: List[str] = []  # Original URLs for reference
    tweets: List[SummaryTweet] = []  # Fetched tweet data


class SummaryRequest(BaseModel):
    topics: Optional[List[str]] = None  # None = use default topics


class SummaryResponse(BaseModel):
    username: str
    topics: Dict[str, TopicSentiment]


class ReportRequest(BaseModel):
    summary: SummaryResponse
    include_camps: bool = True


class FreeformRequest(BaseModel):
    prompt: str


# === Topic Schemas (Configurable) ===

class TopicBase(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    enabled: bool = True
    sort_order: int = 0
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TopicList(BaseModel):
    topics: List[TopicBase]
    total: int


class TopicCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    enabled: bool = True
    sort_order: int = 0


class TopicUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    sort_order: Optional[int] = None


# === Topic Search Schemas ===

class TopicSearchRequest(BaseModel):
    query: str


class TopicTweetResult(BaseModel):
    id: str  # String to avoid JS number precision issues
    text: str
    like_count: int = 0
    retweet_count: int = 0
    impression_count: int = 0
    author_username: Optional[str] = None
    author_name: Optional[str] = None
    author_profile_image: Optional[str] = None
    top_reply: Optional['TopicTweetResult'] = None


class TopicSearchResponse(BaseModel):
    query: str
    tweets: List[TopicTweetResult]


class TopicAnalyzeRequest(BaseModel):
    tweet_ids: List[str]
    topic_query: str  # The original search query
    side_a_name: str
    side_b_name: str
    prompt: str


class TweetClassification(BaseModel):
    tweet_id: str
    side: str  # "a", "b", or "ambiguous"
    reason: str


class TopicAnalyzeResponse(BaseModel):
    side_a_name: str
    side_b_name: str
    classifications: List[TweetClassification]


# === Crowdsource Schemas ===

class CrowdsourceAuthor(BaseModel):
    id: str
    username: str
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    url: Optional[str] = None
    profile_image_url: Optional[str] = None
    verified: bool = False
    verified_type: Optional[str] = None
    followers_count: int = 0
    following_count: int = 0
    tweet_count: int = 0
    like_count: int = 0
    listed_count: int = 0
    created_at: Optional[str] = None
    protected: bool = False


class CrowdsourceTweet(BaseModel):
    id: str
    text: str
    created_at: Optional[str] = None
    conversation_id: Optional[str] = None
    in_reply_to_status_id: Optional[str] = None
    in_reply_to_user_id: Optional[str] = None
    retweet_count: int = 0
    reply_count: int = 0
    like_count: int = 0
    quote_count: int = 0
    bookmark_count: int = 0
    impression_count: int = 0
    author: CrowdsourceAuthor
    entities: Optional[Dict] = None


class CrowdsourceRequest(BaseModel):
    tweets: List[CrowdsourceTweet]


class CrowdsourceResponse(BaseModel):
    tweets_added: int
    tweets_updated: int
    accounts_added: int
    accounts_updated: int


# === Report Schemas ===

class ReportBase(BaseModel):
    id: int
    type: str
    title: Optional[str] = None
    account_username: Optional[str] = None
    topic_query: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ReportFull(ReportBase):
    content: Dict


class ReportCreateRequest(BaseModel):
    type: str
    title: Optional[str] = None
    account_username: Optional[str] = None
    topic_query: Optional[str] = None
    content: Dict


class ReportListResponse(BaseModel):
    reports: List[ReportBase]
    total: int
