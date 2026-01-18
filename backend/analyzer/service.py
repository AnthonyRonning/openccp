"""
Analyzer service - scans accounts for keyword matches and assigns camp scores.

Flow:
1. Find tweets/bios containing keywords (text matching)
2. Run sentiment analysis on those matches (Grok LLM)
3. Filter matches based on expected_sentiment
4. Compute final scores
"""

import re
from datetime import datetime
from typing import List, Dict, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert

from backend.db.models import Account, Tweet, Keyword, Camp, AccountCampScore, TweetKeywordMatch


class AnalyzerService:
    """
    Analyzes accounts and tweets for keyword matches.
    Computes camp scores based on bio and tweet content.
    """

    def __init__(self, db: Session):
        self.db = db

    def _find_text_matches(self, text: str, keywords: List[Keyword]) -> List[Tuple[Keyword, int]]:
        """
        Find all keyword matches in text (pure text matching, ignores sentiment).
        Returns list of (keyword, count) tuples.
        
        Uses word boundary matching to avoid false positives like "again" matching "AI".
        """
        if not text:
            return []

        matches = []
        for kw in keywords:
            # Use word boundaries to avoid partial matches
            pattern = r'\b' + re.escape(kw.term) + r'\b'
            flags = 0 if kw.case_sensitive else re.IGNORECASE
            found = re.findall(pattern, text, flags)
            if found:
                matches.append((kw, len(found)))
        return matches

    def _filter_by_sentiment(self, matches: List[Tuple[Keyword, int]], sentiment: str) -> List[Tuple[Keyword, int]]:
        """
        Filter keyword matches by expected_sentiment.
        - 'any' keywords always pass
        - 'positive'/'negative' keywords only pass if sentiment matches
        """
        if not sentiment:
            # No sentiment available - only keep 'any' keywords
            return [(kw, count) for kw, count in matches if kw.expected_sentiment == "any"]
        
        return [
            (kw, count) for kw, count in matches
            if kw.expected_sentiment == "any" or kw.expected_sentiment == sentiment
        ]

    def _compute_score(self, matches: List[Tuple[Keyword, int]]) -> float:
        """Compute weighted score from matches."""
        return sum(kw.weight * count for kw, count in matches)

    def analyze_account(self, account: Account) -> Dict[int, dict]:
        """
        Analyze a single account across all camps.
        
        Flow:
        1. Find text matches in tweets
        2. Filter by expected_sentiment (using saved sentiment)
        3. Compute scores
        
        Returns dict of camp_id -> analysis results.
        """
        camps = self.db.query(Camp).all()
        results = {}
        tweets = self.db.query(Tweet).filter(Tweet.account_id == account.id).all()

        for camp in camps:
            keywords = self.db.query(Keyword).filter(Keyword.camp_id == camp.id).all()
            if not keywords:
                continue

            # --- TWEET ANALYSIS ---
            tweet_score = 0.0
            tweet_matches_agg = {}
            matched_tweet_ids = []
            
            for tweet in tweets:
                text_matches = self._find_text_matches(tweet.text, keywords)
                if not text_matches:
                    continue
                
                matches = self._filter_by_sentiment(text_matches, tweet.sentiment)
                if matches:
                    matched_tweet_ids.append((tweet.id, matches))
                    for kw, count in matches:
                        tweet_score += kw.weight * count
                        if kw.term not in tweet_matches_agg:
                            tweet_matches_agg[kw.term] = {"term": kw.term, "count": 0, "weight": kw.weight, "expected_sentiment": kw.expected_sentiment}
                        tweet_matches_agg[kw.term]["count"] += count

            results[camp.id] = {
                "camp": camp,
                "score": tweet_score,
                "bio_score": 0.0,
                "tweet_score": tweet_score,
                "bio_matches": [],
                "tweet_matches": list(tweet_matches_agg.values()),
                "matched_tweets": matched_tweet_ids,  # [(tweet_id, [(kw, count), ...])]
            }

        return results

    def analyze_and_save(self, account: Account) -> Dict[int, AccountCampScore]:
        """Analyze account and save scores to database."""
        results = self.analyze_account(account)
        saved_scores = {}

        for camp_id, data in results.items():
            # Save account camp score
            stmt = insert(AccountCampScore).values(
                account_id=account.id,
                camp_id=camp_id,
                score=data["score"],
                bio_score=data["bio_score"],
                tweet_score=data["tweet_score"],
                match_details={
                    "bio_matches": data["bio_matches"],
                    "tweet_matches": data["tweet_matches"],
                },
                analyzed_at=datetime.utcnow(),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["account_id", "camp_id"],
                set_={
                    "score": data["score"],
                    "bio_score": data["bio_score"],
                    "tweet_score": data["tweet_score"],
                    "match_details": {
                        "bio_matches": data["bio_matches"],
                        "tweet_matches": data["tweet_matches"],
                    },
                    "analyzed_at": datetime.utcnow(),
                }
            )
            self.db.execute(stmt)
            
            # Save tweet keyword matches
            for tweet_id, matches in data.get("matched_tweets", []):
                for kw, count in matches:
                    stmt = insert(TweetKeywordMatch).values(
                        tweet_id=tweet_id,
                        keyword_id=kw.id,
                    ).on_conflict_do_nothing()
                    self.db.execute(stmt)

        self.db.commit()

        # Fetch saved scores
        for camp_id in results:
            score = self.db.query(AccountCampScore).filter(
                AccountCampScore.account_id == account.id,
                AccountCampScore.camp_id == camp_id,
            ).first()
            if score:
                saved_scores[camp_id] = score

        return saved_scores

    def analyze_all_accounts(self) -> Dict[str, int]:
        """Analyze all accounts in the database.
        
        Flow:
        1. Run sentiment analysis on all tweets/bios with keyword matches (batched)
        2. Compute keyword scores for each account (sentiment now available)
        """
        # Step 1: Run sentiment analysis on anything that needs it
        from backend.analyzer.sentiment import SentimentAnalyzer
        sentiment_analyzer = SentimentAnalyzer(self.db)
        print("Running sentiment analysis on keyword-matching content...")
        sentiment_result = sentiment_analyzer.analyze_all()
        print(f"  Sentiment: {sentiment_result}")
        
        # Step 2: Now compute scores for all accounts
        accounts = self.db.query(Account).all()
        stats = {"analyzed": 0, "total_scores": 0}

        for account in accounts:
            scores = self.analyze_and_save(account)
            stats["analyzed"] += 1
            stats["total_scores"] += len(scores)
            print(f"  Analyzed @{account.username}: {len(scores)} camp scores")

        return stats

    def get_camp_leaderboard(self, camp_id: int, limit: int = 20) -> List[AccountCampScore]:
        """Get top accounts for a camp by score."""
        return (
            self.db.query(AccountCampScore)
            .filter(AccountCampScore.camp_id == camp_id)
            .filter(AccountCampScore.score > 0)
            .order_by(AccountCampScore.score.desc())
            .limit(limit)
            .all()
        )

    def get_camp_top_tweets(self, camp_id: int, limit: int = 20) -> List[dict]:
        """Get top tweets matching keywords in this camp."""
        # Get all keyword IDs for this camp
        keywords = self.db.query(Keyword).filter(Keyword.camp_id == camp_id).all()
        keyword_ids = [k.id for k in keywords]
        keyword_map = {k.id: k for k in keywords}
        
        if not keyword_ids:
            return []
        
        # Get tweets that have matches, with their accounts
        matches = (
            self.db.query(TweetKeywordMatch)
            .filter(TweetKeywordMatch.keyword_id.in_(keyword_ids))
            .all()
        )
        
        # Group by tweet and compute score
        tweet_scores = {}
        for match in matches:
            tweet_id = match.tweet_id
            kw = keyword_map.get(match.keyword_id)
            if not kw:
                continue
            if tweet_id not in tweet_scores:
                tweet_scores[tweet_id] = {"score": 0, "keywords": []}
            tweet_scores[tweet_id]["score"] += kw.weight
            tweet_scores[tweet_id]["keywords"].append(kw.term)
        
        # Sort by score and get top tweets
        sorted_tweets = sorted(tweet_scores.items(), key=lambda x: x[1]["score"], reverse=True)[:limit]
        
        results = []
        for tweet_id, data in sorted_tweets:
            tweet = self.db.query(Tweet).filter(Tweet.id == tweet_id).first()
            if tweet:
                account = self.db.query(Account).filter(Account.id == tweet.account_id).first()
                results.append({
                    "tweet": tweet,
                    "account": account,
                    "score": data["score"],
                    "matched_keywords": list(set(data["keywords"])),
                })
        
        return results

    def get_account_scores(self, account_id: int) -> List[AccountCampScore]:
        """Get all camp scores for an account."""
        return (
            self.db.query(AccountCampScore)
            .filter(AccountCampScore.account_id == account_id)
            .all()
        )

    def get_camps(self) -> List[Camp]:
        """Get all camps."""
        return self.db.query(Camp).all()

    def get_camp(self, camp_id: int) -> Optional[Camp]:
        """Get a camp by ID."""
        return self.db.query(Camp).filter(Camp.id == camp_id).first()

    def get_camp_by_slug(self, slug: str) -> Optional[Camp]:
        """Get a camp by slug."""
        return self.db.query(Camp).filter(Camp.slug == slug).first()

    def create_camp(self, name: str, slug: str, description: str = None, color: str = "#3b82f6") -> Camp:
        """Create a new camp."""
        camp = Camp(name=name, slug=slug, description=description, color=color)
        self.db.add(camp)
        self.db.commit()
        self.db.refresh(camp)
        return camp

    def add_keyword_to_camp(self, camp_id: int, term: str, weight: float = 1.0, case_sensitive: bool = False) -> Keyword:
        """Add a keyword to a camp."""
        keyword = Keyword(
            term=term,
            type="signal",
            camp_id=camp_id,
            weight=weight,
            case_sensitive=case_sensitive,
        )
        self.db.add(keyword)
        self.db.commit()
        self.db.refresh(keyword)
        return keyword

    def get_camp_keywords(self, camp_id: int) -> List[Keyword]:
        """Get all keywords for a camp."""
        return self.db.query(Keyword).filter(Keyword.camp_id == camp_id).all()
