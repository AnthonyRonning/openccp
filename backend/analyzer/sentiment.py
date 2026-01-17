"""
Sentiment analysis using Grok API.
Analyzes tweets that match camp keywords to determine positive/negative sentiment.
"""

import os
import json
from datetime import datetime
from typing import List, Optional
from dataclasses import dataclass
from openai import OpenAI
from sqlalchemy.orm import Session

from backend.db.models import Tweet, TweetKeywordMatch, Keyword, Camp


@dataclass
class SentimentResult:
    tweet_id: int
    sentiment: str  # positive, negative, neutral, mixed
    confidence: float
    reasoning: Optional[str] = None


class SentimentAnalyzer:
    """
    Uses Grok to analyze sentiment of tweets toward specific topics.
    Batches tweets for efficient API usage.
    """

    def __init__(self, db: Session, batch_size: int = 20):
        self.db = db
        self.batch_size = batch_size
        self.client = OpenAI(
            api_key=os.getenv("XAI_API_KEY"),
            base_url="https://api.x.ai/v1",
        )
        self.model = "grok-4-fast-non-reasoning"

    def get_unanalyzed_tweets_for_camp(self, camp_id: int, limit: int = 100) -> List[Tweet]:
        """Get tweets that match camp keywords but haven't been sentiment analyzed."""
        keyword_ids = [
            k.id for k in 
            self.db.query(Keyword).filter(Keyword.camp_id == camp_id).all()
        ]
        
        if not keyword_ids:
            return []
        
        tweet_ids = [
            m.tweet_id for m in 
            self.db.query(TweetKeywordMatch)
            .filter(TweetKeywordMatch.keyword_id.in_(keyword_ids))
            .all()
        ]
        
        if not tweet_ids:
            return []
        
        return (
            self.db.query(Tweet)
            .filter(Tweet.id.in_(tweet_ids))
            .filter(Tweet.sentiment.is_(None))
            .limit(limit)
            .all()
        )

    def get_all_unanalyzed_tweets(self, limit: int = 100) -> List[Tweet]:
        """Get all tweets that contain any keyword term but no sentiment."""
        import re
        
        # Get all unique keyword terms across all camps
        keywords = self.db.query(Keyword).all()
        terms = list(set([k.term for k in keywords]))
        
        if not terms:
            return []
        
        # Get tweets without sentiment
        tweets = (
            self.db.query(Tweet)
            .filter(Tweet.sentiment.is_(None))
            .all()
        )
        
        # Filter to tweets containing at least one keyword (word boundary match)
        matching_tweets = []
        for tweet in tweets:
            for term in terms:
                # Use word boundaries to avoid false positives like "again" matching "AI"
                pattern = r'\b' + re.escape(term) + r'\b'
                if re.search(pattern, tweet.text, re.IGNORECASE):
                    matching_tweets.append(tweet)
                    break
        
        return matching_tweets[:limit]

    def _build_prompt(self, tweets: List[Tweet], camp: Optional[Camp] = None) -> str:
        """Build the analysis prompt for a batch of tweets."""
        topic_context = ""
        if camp:
            keywords = self.db.query(Keyword).filter(Keyword.camp_id == camp.id).all()
            keyword_list = ", ".join([k.term for k in keywords[:20]])
            topic_context = f"""
Topic/Camp: {camp.name}
Description: {camp.description or 'N/A'}
Keywords associated with this camp: {keyword_list}

Analyze each tweet's sentiment TOWARD this topic. For example:
- "I love AI" about AI = positive
- "AI is ruining everything" about AI = negative  
- "AI exists" about AI = neutral
- "I love how AI is destroying art" about AI = mixed (sarcasm/complex)
"""
        else:
            topic_context = """
Analyze each tweet's general sentiment toward AI/technology topics.
"""

        tweets_text = "\n".join([
            f"[{i+1}] (ID:{t.id}) {t.text[:500]}"
            for i, t in enumerate(tweets)
        ])

        return f"""You are analyzing tweets for sentiment toward a specific topic.

{topic_context}

For each tweet, determine:
1. sentiment: "positive", "negative", "neutral", or "mixed"
2. confidence: 0.0 to 1.0 (how confident you are)

Tweets to analyze:
{tweets_text}

Respond with a JSON array of objects. Each object must have:
- "id": the tweet ID (number after "ID:")
- "sentiment": one of "positive", "negative", "neutral", "mixed"
- "confidence": number between 0.0 and 1.0

Example response:
[
  {{"id": 123456, "sentiment": "positive", "confidence": 0.9}},
  {{"id": 789012, "sentiment": "negative", "confidence": 0.85}}
]

Return ONLY the JSON array, no other text."""

    def analyze_batch(self, tweets: List[Tweet], camp: Optional[Camp] = None) -> List[SentimentResult]:
        """Analyze a batch of tweets using Grok."""
        if not tweets:
            return []

        prompt = self._build_prompt(tweets, camp)
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a sentiment analysis expert. Respond only with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=2000,
            )
            
            content = response.choices[0].message.content.strip()
            
            # Try to extract JSON from response
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            
            results_data = json.loads(content)
            
            results = []
            for item in results_data:
                results.append(SentimentResult(
                    tweet_id=item["id"],
                    sentiment=item["sentiment"],
                    confidence=item.get("confidence", 0.8),
                ))
            
            return results
            
        except Exception as e:
            print(f"Error analyzing batch: {e}")
            return []

    def save_results(self, results: List[SentimentResult]) -> int:
        """Save sentiment results to database."""
        saved = 0
        for result in results:
            tweet = self.db.query(Tweet).filter(Tweet.id == result.tweet_id).first()
            if tweet:
                tweet.sentiment = result.sentiment
                tweet.sentiment_score = result.confidence
                tweet.sentiment_analyzed_at = datetime.utcnow()
                saved += 1
        
        self.db.commit()
        return saved

    def analyze_camp(self, camp_id: int, limit: int = 100) -> dict:
        """Analyze all unanalyzed tweets for a specific camp."""
        camp = self.db.query(Camp).filter(Camp.id == camp_id).first()
        if not camp:
            return {"error": "Camp not found"}
        
        tweets = self.get_unanalyzed_tweets_for_camp(camp_id, limit)
        if not tweets:
            return {"analyzed": 0, "message": "No unanalyzed tweets found"}
        
        all_results = []
        for i in range(0, len(tweets), self.batch_size):
            batch = tweets[i:i + self.batch_size]
            print(f"  Analyzing batch {i//self.batch_size + 1} ({len(batch)} tweets)...")
            results = self.analyze_batch(batch, camp)
            all_results.extend(results)
        
        saved = self.save_results(all_results)
        
        return {
            "camp": camp.name,
            "tweets_found": len(tweets),
            "analyzed": len(all_results),
            "saved": saved,
        }

    def analyze_all(self, limit: int = 100) -> dict:
        """Analyze all unanalyzed tweets that have keyword matches."""
        tweets = self.get_all_unanalyzed_tweets(limit)
        if not tweets:
            return {"analyzed": 0, "message": "No unanalyzed tweets found"}
        
        all_results = []
        for i in range(0, len(tweets), self.batch_size):
            batch = tweets[i:i + self.batch_size]
            print(f"  Analyzing batch {i//self.batch_size + 1} ({len(batch)} tweets)...")
            results = self.analyze_batch(batch)
            all_results.extend(results)
        
        saved = self.save_results(all_results)
        
        return {
            "tweets_found": len(tweets),
            "analyzed": len(all_results),
            "saved": saved,
        }

    def get_sentiment_stats(self) -> dict:
        """Get overall sentiment statistics."""
        from sqlalchemy import func
        
        total = self.db.query(Tweet).count()
        analyzed = self.db.query(Tweet).filter(Tweet.sentiment.isnot(None)).count()
        
        sentiment_counts = (
            self.db.query(Tweet.sentiment, func.count(Tweet.id))
            .filter(Tweet.sentiment.isnot(None))
            .group_by(Tweet.sentiment)
            .all()
        )
        
        return {
            "total_tweets": total,
            "analyzed": analyzed,
            "pending": total - analyzed,
            "by_sentiment": {s: c for s, c in sentiment_counts},
        }
