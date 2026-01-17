"""
Analyzer service - scans accounts for keyword matches and assigns camp scores.
"""

import re
from datetime import datetime
from typing import List, Dict, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert

from backend.db.models import Account, Tweet, Keyword, Camp, AccountCampScore


class AnalyzerService:
    """
    Analyzes accounts and tweets for keyword matches.
    Computes camp scores based on bio and tweet content.
    """

    def __init__(self, db: Session):
        self.db = db

    def _find_matches(self, text: str, keywords: List[Keyword]) -> List[Tuple[Keyword, int]]:
        """
        Find all keyword matches in text.
        Returns list of (keyword, count) tuples.
        """
        if not text:
            return []

        matches = []
        for kw in keywords:
            pattern = re.escape(kw.term)
            flags = 0 if kw.case_sensitive else re.IGNORECASE
            found = re.findall(pattern, text, flags)
            if found:
                matches.append((kw, len(found)))
        return matches

    def _compute_score(self, matches: List[Tuple[Keyword, int]]) -> float:
        """Compute weighted score from matches."""
        return sum(kw.weight * count for kw, count in matches)

    def analyze_account(self, account: Account) -> Dict[int, dict]:
        """
        Analyze a single account across all camps.
        Returns dict of camp_id -> analysis results.
        """
        # Get all camps with their keywords
        camps = self.db.query(Camp).all()
        results = {}

        # Get account's tweets
        tweets = self.db.query(Tweet).filter(Tweet.account_id == account.id).all()
        all_tweet_text = " ".join(t.text for t in tweets)

        for camp in camps:
            keywords = self.db.query(Keyword).filter(Keyword.camp_id == camp.id).all()
            if not keywords:
                continue

            # Analyze bio
            bio_matches = self._find_matches(account.description or "", keywords)
            bio_score = self._compute_score(bio_matches) * 2  # Bio gets 2x weight

            # Analyze tweets
            tweet_matches = self._find_matches(all_tweet_text, keywords)
            tweet_score = self._compute_score(tweet_matches)

            total_score = bio_score + tweet_score

            results[camp.id] = {
                "camp": camp,
                "score": total_score,
                "bio_score": bio_score,
                "tweet_score": tweet_score,
                "bio_matches": [
                    {"term": kw.term, "count": count, "weight": kw.weight}
                    for kw, count in bio_matches
                ],
                "tweet_matches": [
                    {"term": kw.term, "count": count, "weight": kw.weight}
                    for kw, count in tweet_matches
                ],
            }

        return results

    def analyze_and_save(self, account: Account) -> Dict[int, AccountCampScore]:
        """Analyze account and save scores to database."""
        results = self.analyze_account(account)
        saved_scores = {}

        for camp_id, data in results.items():
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
        """Analyze all accounts in the database."""
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
