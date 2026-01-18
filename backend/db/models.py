from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    BigInteger, Boolean, Integer, Float, String, Text, DateTime, ForeignKey,
    CheckConstraint, UniqueConstraint, Index, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Topic(Base):
    """Configurable topics for account summary analysis."""
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"<Topic '{self.name}'>"


class Camp(Base):
    """A category/camp for grouping accounts by content analysis."""
    __tablename__ = "camps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(20), default="#3b82f6")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    keywords: Mapped[List["Keyword"]] = relationship("Keyword", back_populates="camp", cascade="all, delete-orphan")
    account_scores: Mapped[List["AccountCampScore"]] = relationship("AccountCampScore", back_populates="camp", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Camp '{self.name}'>"


class Account(Base):
    __tablename__ = "accounts"

    # Twitter identifiers
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    # Profile info
    name: Mapped[Optional[str]] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)
    location: Mapped[Optional[str]] = mapped_column(String(255))
    url: Mapped[Optional[str]] = mapped_column(Text)
    profile_image_url: Mapped[Optional[str]] = mapped_column(Text)
    pinned_tweet_id: Mapped[Optional[int]] = mapped_column(BigInteger)

    # Verification
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_type: Mapped[Optional[str]] = mapped_column(String(50))
    protected: Mapped[bool] = mapped_column(Boolean, default=False)

    # Public metrics (flattened)
    followers_count: Mapped[int] = mapped_column(Integer, default=0)
    following_count: Mapped[int] = mapped_column(Integer, default=0)
    tweet_count: Mapped[int] = mapped_column(Integer, default=0)
    listed_count: Mapped[int] = mapped_column(Integer, default=0)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    media_count: Mapped[int] = mapped_column(Integer, default=0)

    # Entities (JSONB)
    entities: Mapped[Optional[dict]] = mapped_column(JSONB)

    # Timestamps
    twitter_created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Our metadata
    is_seed: Mapped[bool] = mapped_column(Boolean, default=False)
    scrape_status: Mapped[str] = mapped_column(String(20), default="pending")
    scraped_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Bio sentiment analysis
    bio_sentiment: Mapped[Optional[str]] = mapped_column(String(20))  # positive, negative, neutral, mixed
    bio_sentiment_score: Mapped[Optional[float]] = mapped_column(Float)  # confidence 0.0-1.0
    bio_sentiment_analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    tweets: Mapped[List["Tweet"]] = relationship("Tweet", back_populates="account", cascade="all, delete-orphan")
    keyword_matches: Mapped[List["AccountKeywordMatch"]] = relationship("AccountKeywordMatch", back_populates="account", cascade="all, delete-orphan")
    camp_scores: Mapped[List["AccountCampScore"]] = relationship("AccountCampScore", back_populates="account", cascade="all, delete-orphan")
    
    # Follower/following relationships
    followers: Mapped[List["Follow"]] = relationship(
        "Follow", foreign_keys="Follow.following_id", back_populates="following_account", cascade="all, delete-orphan"
    )
    following: Mapped[List["Follow"]] = relationship(
        "Follow", foreign_keys="Follow.follower_id", back_populates="follower_account", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Account @{self.username} ({self.id})>"


class Follow(Base):
    __tablename__ = "follows"

    follower_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True)
    following_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True)
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    follower_account: Mapped["Account"] = relationship("Account", foreign_keys=[follower_id], back_populates="following")
    following_account: Mapped["Account"] = relationship("Account", foreign_keys=[following_id], back_populates="followers")

    def __repr__(self) -> str:
        return f"<Follow {self.follower_id} -> {self.following_id}>"


class Tweet(Base):
    __tablename__ = "tweets"

    # Twitter identifiers
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    account_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)

    # Content
    text: Mapped[str] = mapped_column(Text, nullable=False)
    lang: Mapped[Optional[str]] = mapped_column(String(10))

    # Conversation threading
    conversation_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    in_reply_to_user_id: Mapped[Optional[int]] = mapped_column(BigInteger)

    # Referenced tweets (JSONB)
    referenced_tweets: Mapped[Optional[list]] = mapped_column(JSONB)

    # Public metrics (flattened)
    retweet_count: Mapped[int] = mapped_column(Integer, default=0)
    reply_count: Mapped[int] = mapped_column(Integer, default=0)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    quote_count: Mapped[int] = mapped_column(Integer, default=0)
    bookmark_count: Mapped[int] = mapped_column(Integer, default=0)
    impression_count: Mapped[int] = mapped_column(Integer, default=0)

    # Entities (JSONB)
    entities: Mapped[Optional[dict]] = mapped_column(JSONB)

    # Timestamps
    twitter_created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    scraped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Sentiment analysis
    sentiment: Mapped[Optional[str]] = mapped_column(String(20))  # positive, negative, neutral, mixed
    sentiment_score: Mapped[Optional[float]] = mapped_column(Float)  # confidence 0.0-1.0
    sentiment_analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    account: Mapped["Account"] = relationship("Account", back_populates="tweets")
    keyword_matches: Mapped[List["TweetKeywordMatch"]] = relationship("TweetKeywordMatch", back_populates="tweet", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Tweet {self.id} by {self.account_id}>"


class Keyword(Base):
    __tablename__ = "keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    term: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    case_sensitive: Mapped[bool] = mapped_column(Boolean, default=False)
    camp_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("camps.id", ondelete="CASCADE"))
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    expected_sentiment: Mapped[str] = mapped_column(String(20), default="any")  # positive, negative, any
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    camp: Mapped[Optional["Camp"]] = relationship("Camp", back_populates="keywords")
    account_matches: Mapped[List["AccountKeywordMatch"]] = relationship("AccountKeywordMatch", back_populates="keyword", cascade="all, delete-orphan")
    tweet_matches: Mapped[List["TweetKeywordMatch"]] = relationship("TweetKeywordMatch", back_populates="keyword", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Keyword '{self.term}' camp={self.camp_id} weight={self.weight}>"


class AccountKeywordMatch(Base):
    __tablename__ = "account_keyword_matches"

    account_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True)
    keyword_id: Mapped[int] = mapped_column(Integer, ForeignKey("keywords.id", ondelete="CASCADE"), primary_key=True)
    match_count: Mapped[int] = mapped_column(Integer, default=0)
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    account: Mapped["Account"] = relationship("Account", back_populates="keyword_matches")
    keyword: Mapped["Keyword"] = relationship("Keyword", back_populates="account_matches")

    def __repr__(self) -> str:
        return f"<AccountKeywordMatch account={self.account_id} keyword={self.keyword_id} count={self.match_count}>"


class TweetKeywordMatch(Base):
    __tablename__ = "tweet_keyword_matches"

    tweet_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tweets.id", ondelete="CASCADE"), primary_key=True)
    keyword_id: Mapped[int] = mapped_column(Integer, ForeignKey("keywords.id", ondelete="CASCADE"), primary_key=True)

    # Relationships
    tweet: Mapped["Tweet"] = relationship("Tweet", back_populates="keyword_matches")
    keyword: Mapped["Keyword"] = relationship("Keyword", back_populates="tweet_matches")

    def __repr__(self) -> str:
        return f"<TweetKeywordMatch tweet={self.tweet_id} keyword={self.keyword_id}>"


class AccountCampScore(Base):
    """Stores the analysis result - how much an account belongs to a camp."""
    __tablename__ = "account_camp_scores"

    account_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True)
    camp_id: Mapped[int] = mapped_column(Integer, ForeignKey("camps.id", ondelete="CASCADE"), primary_key=True)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    bio_score: Mapped[float] = mapped_column(Float, default=0.0)
    tweet_score: Mapped[float] = mapped_column(Float, default=0.0)
    match_details: Mapped[Optional[dict]] = mapped_column(JSONB)  # {"bio_matches": [...], "tweet_matches": [...]}
    analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    account: Mapped["Account"] = relationship("Account", back_populates="camp_scores")
    camp: Mapped["Camp"] = relationship("Camp", back_populates="account_scores")

    def __repr__(self) -> str:
        return f"<AccountCampScore account={self.account_id} camp={self.camp_id} score={self.score}>"


class TweetAnalysis(Base):
    """Stores side classifications from topic analysis."""
    __tablename__ = "tweet_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tweet_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tweets.id", ondelete="CASCADE"), nullable=False)
    topic_query: Mapped[str] = mapped_column(String(500), nullable=False)
    side_a_name: Mapped[str] = mapped_column(String(255), nullable=False)
    side_b_name: Mapped[str] = mapped_column(String(255), nullable=False)
    side: Mapped[str] = mapped_column(String(20), nullable=False)  # 'a', 'b', or 'ambiguous'
    reason: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tweet: Mapped["Tweet"] = relationship("Tweet", backref="analyses")

    def __repr__(self) -> str:
        return f"<TweetAnalysis tweet={self.tweet_id} side={self.side}>"
