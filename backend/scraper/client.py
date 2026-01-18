"""
X API client wrapper using xdk.
Handles authentication and provides typed responses.
Includes rate limit handling with exponential backoff.
"""

import os
import time
from typing import Optional, List, Dict, Any, Callable, TypeVar
from dataclasses import dataclass
from datetime import datetime
from xdk import Client
from dotenv import load_dotenv

load_dotenv()

T = TypeVar('T')


class RateLimitError(Exception):
    """Raised when rate limit is hit."""
    def __init__(self, message: str, retry_after: Optional[int] = None):
        super().__init__(message)
        self.retry_after = retry_after


import random
from requests.exceptions import HTTPError


def is_rate_limit_error(e: Exception) -> bool:
    """Check if an exception is a rate limit error."""
    error_str = str(e).lower()
    # Check for 429 status code or rate limit message
    if isinstance(e, HTTPError) and hasattr(e, 'response') and e.response is not None:
        return e.response.status_code == 429
    return (
        "429" in error_str or 
        "rate limit" in error_str or
        "too many requests" in error_str
    )


def with_retry(
    func: Callable[[], T],
    max_retries: int = 5,
    base_delay: float = 2.0,
    max_delay: float = 120.0,
    jitter: bool = True,
) -> T:
    """
    Execute a function with exponential backoff on rate limit errors.
    
    Follows X API best practices from docs:
    - Exponential backoff starting at 2s, doubling each retry
    - Max delay of 2 minutes before giving up
    - Random jitter to prevent thundering herd
    
    Args:
        func: The function to execute
        max_retries: Maximum number of retry attempts (default 5)
        base_delay: Initial delay in seconds (default 2.0)
        max_delay: Maximum delay between retries (default 120s)
        jitter: Add random jitter to delays (default True)
    
    Returns:
        The function result
    
    Raises:
        The last exception if all retries fail
    """
    last_exception = None
    delay = base_delay
    
    for attempt in range(max_retries + 1):
        try:
            return func()
        except Exception as e:
            last_exception = e
            
            if not is_rate_limit_error(e) or attempt >= max_retries:
                raise
            
            # Calculate wait time with exponential backoff
            wait_time = min(delay, max_delay)
            
            # Add jitter (0-25% of wait time)
            if jitter:
                wait_time += wait_time * random.uniform(0, 0.25)
            
            print(f"  Rate limited! Waiting {wait_time:.1f}s before retry {attempt + 1}/{max_retries}...")
            time.sleep(wait_time)
            delay *= 2
    
    raise last_exception


@dataclass
class UserData:
    """Parsed user data from X API."""
    id: int
    username: str
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    url: Optional[str] = None
    profile_image_url: Optional[str] = None
    pinned_tweet_id: Optional[int] = None
    verified: bool = False
    verified_type: Optional[str] = None
    protected: bool = False
    followers_count: int = 0
    following_count: int = 0
    tweet_count: int = 0
    listed_count: int = 0
    like_count: int = 0
    media_count: int = 0
    entities: Optional[Dict] = None
    twitter_created_at: Optional[datetime] = None


@dataclass
class TweetData:
    """Parsed tweet data from X API."""
    id: int
    account_id: int
    text: str
    lang: Optional[str] = None
    conversation_id: Optional[int] = None
    in_reply_to_user_id: Optional[int] = None
    referenced_tweets: Optional[List[Dict]] = None
    retweet_count: int = 0
    reply_count: int = 0
    like_count: int = 0
    quote_count: int = 0
    bookmark_count: int = 0
    impression_count: int = 0
    entities: Optional[Dict] = None
    twitter_created_at: Optional[datetime] = None


class XClient:
    """Wrapper around xdk Client with parsing helpers."""

    # Fields to request from X API
    USER_FIELDS = [
        "created_at",
        "description",
        "entities",
        "id",
        "location",
        "name",
        "pinned_tweet_id",
        "profile_image_url",
        "protected",
        "public_metrics",
        "url",
        "username",
        "verified",
        "verified_type",
    ]

    TWEET_FIELDS = [
        "author_id",
        "conversation_id",
        "created_at",
        "entities",
        "id",
        "in_reply_to_user_id",
        "lang",
        "public_metrics",
        "referenced_tweets",
        "text",
    ]

    def __init__(self, bearer_token: Optional[str] = None):
        self.bearer_token = bearer_token or os.getenv("X_BEARER_TOKEN")
        if not self.bearer_token:
            raise ValueError("X_BEARER_TOKEN is required")
        self.client = Client(bearer_token=self.bearer_token)

    def _parse_datetime(self, dt_str: Optional[str]) -> Optional[datetime]:
        """Parse X API datetime string."""
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None

    def _parse_user(self, data: Dict[str, Any]) -> UserData:
        """Parse raw user data into UserData."""
        metrics = data.get("public_metrics", {})
        return UserData(
            id=int(data["id"]),
            username=data["username"],
            name=data.get("name"),
            description=data.get("description"),
            location=data.get("location"),
            url=data.get("url"),
            profile_image_url=data.get("profile_image_url"),
            pinned_tweet_id=int(data["pinned_tweet_id"]) if data.get("pinned_tweet_id") else None,
            verified=data.get("verified", False),
            verified_type=data.get("verified_type"),
            protected=data.get("protected", False),
            followers_count=metrics.get("followers_count", 0),
            following_count=metrics.get("following_count", 0),
            tweet_count=metrics.get("tweet_count", 0),
            listed_count=metrics.get("listed_count", 0),
            like_count=metrics.get("like_count", 0),
            media_count=metrics.get("media_count", 0),
            entities=data.get("entities"),
            twitter_created_at=self._parse_datetime(data.get("created_at")),
        )

    def _parse_tweet(self, data: Dict[str, Any]) -> TweetData:
        """Parse raw tweet data into TweetData."""
        metrics = data.get("public_metrics", {})
        return TweetData(
            id=int(data["id"]),
            account_id=int(data["author_id"]),
            text=data["text"],
            lang=data.get("lang"),
            conversation_id=int(data["conversation_id"]) if data.get("conversation_id") else None,
            in_reply_to_user_id=int(data["in_reply_to_user_id"]) if data.get("in_reply_to_user_id") else None,
            referenced_tweets=data.get("referenced_tweets"),
            retweet_count=metrics.get("retweet_count", 0),
            reply_count=metrics.get("reply_count", 0),
            like_count=metrics.get("like_count", 0),
            quote_count=metrics.get("quote_count", 0),
            bookmark_count=metrics.get("bookmark_count", 0),
            impression_count=metrics.get("impression_count", 0),
            entities=data.get("entities"),
            twitter_created_at=self._parse_datetime(data.get("created_at")),
        )

    def get_user_by_username(self, username: str) -> Optional[UserData]:
        """Fetch a user by username with automatic rate limit handling."""
        def _fetch():
            response = self.client.users.get_by_username(
                username=username,
                user_fields=self.USER_FIELDS,
            )
            if response and response.data:
                return self._parse_user(response.data)
            return None
        
        try:
            return with_retry(_fetch)
        except Exception as e:
            print(f"Error fetching user @{username}: {e}")
            return None

    def get_user_by_id(self, user_id: int) -> Optional[UserData]:
        """Fetch a user by ID with automatic rate limit handling."""
        def _fetch():
            response = self.client.users.get_by_id(
                id=str(user_id),
                user_fields=self.USER_FIELDS,
            )
            if response and response.data:
                return self._parse_user(response.data)
            return None
        
        try:
            return with_retry(_fetch)
        except Exception as e:
            print(f"Error fetching user {user_id}: {e}")
            return None

    def get_tweets_by_ids(self, tweet_ids: List[int]) -> List[TweetData]:
        """Fetch tweets by their IDs with automatic rate limit handling."""
        if not tweet_ids:
            return []
        
        def _fetch():
            tweets = []
            response = self.client.posts.get_by_ids(
                ids=[str(tid) for tid in tweet_ids],
                tweet_fields=self.TWEET_FIELDS,
            )
            if response and response.data:
                for tweet_data in response.data:
                    tweets.append(self._parse_tweet(tweet_data))
            return tweets
        
        try:
            return with_retry(_fetch)
        except Exception as e:
            print(f"Error fetching tweets by IDs: {e}")
            return []

    def get_user_tweets(self, user_id: int, max_results: int = 25) -> List[TweetData]:
        """Fetch recent tweets for a user with automatic rate limit handling and pagination."""
        def _fetch():
            tweets = []
            # X API: min 5, max 100 per page
            per_page = max(5, min(max_results, 100))
            response = self.client.users.get_posts(
                id=str(user_id),
                max_results=per_page,
                tweet_fields=self.TWEET_FIELDS,
            )
            # Paginate until we have enough results
            for page in response:
                page_data = getattr(page, 'data', None)
                if page_data:
                    for tweet_data in page_data:
                        tweets.append(self._parse_tweet(tweet_data))
                        if len(tweets) >= max_results:
                            return tweets
            return tweets
        
        try:
            return with_retry(_fetch)
        except Exception as e:
            # Only log if it's not a "no data" error (user has no tweets)
            if "has no attribute 'data'" not in str(e):
                print(f"Error fetching tweets for user {user_id}: {e}")
            return []

    def get_following(self, user_id: int, max_results: int = 50) -> List[UserData]:
        """Fetch accounts that user is following with automatic rate limit handling and pagination."""
        def _fetch():
            users = []
            # X API: min 1, max 1000 per page
            per_page = max(1, min(max_results, 1000))
            response = self.client.users.get_following(
                id=str(user_id),
                max_results=per_page,
                user_fields=self.USER_FIELDS,
            )
            # Paginate until we have enough results
            for page in response:
                page_data = getattr(page, 'data', None)
                if page_data:
                    for user_data in page_data:
                        users.append(self._parse_user(user_data))
                        if len(users) >= max_results:
                            return users
            return users
        
        try:
            return with_retry(_fetch)
        except Exception as e:
            if "has no attribute 'data'" not in str(e):
                print(f"Error fetching following for user {user_id}: {e}")
            return []

    def get_followers(self, user_id: int, max_results: int = 50) -> List[UserData]:
        """Fetch accounts that follow user with automatic rate limit handling and pagination."""
        def _fetch():
            users = []
            # X API: min 1, max 1000 per page
            per_page = max(1, min(max_results, 1000))
            response = self.client.users.get_followers(
                id=str(user_id),
                max_results=per_page,
                user_fields=self.USER_FIELDS,
            )
            # Paginate until we have enough results
            for page in response:
                page_data = getattr(page, 'data', None)
                if page_data:
                    for user_data in page_data:
                        users.append(self._parse_user(user_data))
                        if len(users) >= max_results:
                            return users
            return users
        
        try:
            return with_retry(_fetch)
        except Exception as e:
            if "has no attribute 'data'" not in str(e):
                print(f"Error fetching followers for user {user_id}: {e}")
            return []
