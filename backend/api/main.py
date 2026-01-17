"""
FastAPI application for OpenCCP.
"""

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional, List

from backend.db import get_db, Account, Tweet, Follow, Keyword, Camp, AccountCampScore
from backend.scraper import ScraperService
from backend.analyzer import AnalyzerService, SummaryService, DEFAULT_TOPICS
from backend.api import schemas


app = FastAPI(
    title="OpenCCP API",
    description="Twitter/X account graph analysis and sentiment tracking",
    version="0.1.0",
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === Health Check ===

@app.get("/health")
def health_check():
    return {"status": "ok"}


# === Stats ===

@app.get("/api/stats", response_model=schemas.StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    """Get database statistics."""
    return schemas.StatsResponse(
        accounts=db.query(Account).count(),
        seeds=db.query(Account).filter(Account.is_seed == True).count(),
        tweets=db.query(Tweet).count(),
        follows=db.query(Follow).count(),
        keywords=db.query(Keyword).count(),
    )


# === Accounts ===

@app.get("/api/accounts", response_model=schemas.AccountList)
def list_accounts(
    seeds_only: bool = Query(False, description="Only return seed accounts"),
    db: Session = Depends(get_db),
):
    """List all accounts."""
    query = db.query(Account)
    if seeds_only:
        query = query.filter(Account.is_seed == True)
    accounts = query.all()
    return schemas.AccountList(accounts=accounts, total=len(accounts))


@app.get("/api/accounts/{username}", response_model=schemas.AccountDetail)
def get_account(username: str, db: Session = Depends(get_db)):
    """Get account details by username."""
    account = db.query(Account).filter(Account.username == username).first()
    if not account:
        raise HTTPException(status_code=404, detail=f"Account @{username} not found")
    return account


@app.get("/api/accounts/{username}/tweets", response_model=schemas.TweetList)
def get_account_tweets(username: str, db: Session = Depends(get_db)):
    """Get tweets for an account."""
    account = db.query(Account).filter(Account.username == username).first()
    if not account:
        raise HTTPException(status_code=404, detail=f"Account @{username} not found")
    
    tweets = db.query(Tweet).filter(Tweet.account_id == account.id).all()
    return schemas.TweetList(tweets=tweets, total=len(tweets))


@app.get("/api/accounts/{username}/following", response_model=schemas.AccountList)
def get_account_following(username: str, db: Session = Depends(get_db)):
    """Get accounts that this user follows."""
    account = db.query(Account).filter(Account.username == username).first()
    if not account:
        raise HTTPException(status_code=404, detail=f"Account @{username} not found")
    
    follows = db.query(Follow).filter(Follow.follower_id == account.id).all()
    following_ids = [f.following_id for f in follows]
    accounts = db.query(Account).filter(Account.id.in_(following_ids)).all() if following_ids else []
    return schemas.AccountList(accounts=accounts, total=len(accounts))


@app.get("/api/accounts/{username}/followers", response_model=schemas.AccountList)
def get_account_followers(username: str, db: Session = Depends(get_db)):
    """Get accounts that follow this user."""
    account = db.query(Account).filter(Account.username == username).first()
    if not account:
        raise HTTPException(status_code=404, detail=f"Account @{username} not found")
    
    follows = db.query(Follow).filter(Follow.following_id == account.id).all()
    follower_ids = [f.follower_id for f in follows]
    accounts = db.query(Account).filter(Account.id.in_(follower_ids)).all() if follower_ids else []
    return schemas.AccountList(accounts=accounts, total=len(accounts))


# === Scraping ===

@app.post("/api/scrape", response_model=schemas.ScrapeResponse)
def scrape_account(request: schemas.ScrapeRequest, db: Session = Depends(get_db)):
    """Scrape a Twitter account and its network."""
    scraper = ScraperService(db)
    
    account, stats = scraper.scrape_account(
        username=request.username,
        include_tweets=request.include_tweets,
        include_following=request.include_following,
        include_followers=request.include_followers,
    )
    
    return schemas.ScrapeResponse(
        account=account,
        stats=schemas.ScrapeStats(**stats),
    )


# === Graph ===

@app.get("/api/graph", response_model=schemas.GraphData)
def get_graph(db: Session = Depends(get_db)):
    """Get graph data for visualization (all nodes and edges)."""
    scraper = ScraperService(db)
    data = scraper.get_graph_data()
    return schemas.GraphData(
        nodes=[schemas.GraphNode(**n) for n in data["nodes"]],
        edges=[schemas.GraphEdge(**e) for e in data["edges"]],
    )


@app.get("/api/graph/{username}", response_model=schemas.GraphData)
def get_account_graph(username: str, db: Session = Depends(get_db)):
    """Get subgraph centered on a specific account."""
    account = db.query(Account).filter(Account.username == username).first()
    if not account:
        raise HTTPException(status_code=404, detail=f"Account @{username} not found")
    
    # Get this account + all directly connected accounts
    following_ids = [f.following_id for f in db.query(Follow).filter(Follow.follower_id == account.id).all()]
    follower_ids = [f.follower_id for f in db.query(Follow).filter(Follow.following_id == account.id).all()]
    
    all_ids = set([account.id] + following_ids + follower_ids)
    accounts = db.query(Account).filter(Account.id.in_(all_ids)).all()
    
    # Get edges only between these accounts
    follows = db.query(Follow).filter(
        Follow.follower_id.in_(all_ids),
        Follow.following_id.in_(all_ids),
    ).all()
    
    nodes = [
        schemas.GraphNode(
            id=str(a.id),
            username=a.username,
            name=a.name,
            is_seed=a.is_seed,
            followers_count=a.followers_count,
            following_count=a.following_count,
            profile_image_url=a.profile_image_url,
        )
        for a in accounts
    ]
    
    edges = [
        schemas.GraphEdge(source=str(f.follower_id), target=str(f.following_id))
        for f in follows
    ]
    
    return schemas.GraphData(nodes=nodes, edges=edges)


# === Keywords ===

@app.get("/api/keywords", response_model=schemas.KeywordList)
def list_keywords(db: Session = Depends(get_db)):
    """List all keywords."""
    keywords = db.query(Keyword).all()
    return schemas.KeywordList(keywords=keywords, total=len(keywords))


@app.post("/api/keywords", response_model=schemas.KeywordBase)
def create_keyword(request: schemas.KeywordCreate, db: Session = Depends(get_db)):
    """Create a new keyword."""
    if request.type not in ("inclusion", "exclusion"):
        raise HTTPException(status_code=400, detail="Type must be 'inclusion' or 'exclusion'")
    
    # Check if exists
    existing = db.query(Keyword).filter(
        Keyword.term == request.term,
        Keyword.type == request.type,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Keyword '{request.term}' ({request.type}) already exists")
    
    keyword = Keyword(
        term=request.term,
        type=request.type,
        case_sensitive=request.case_sensitive,
    )
    db.add(keyword)
    db.commit()
    db.refresh(keyword)
    return keyword


@app.delete("/api/keywords/{keyword_id}")
def delete_keyword(keyword_id: int, db: Session = Depends(get_db)):
    """Delete a keyword."""
    keyword = db.query(Keyword).filter(Keyword.id == keyword_id).first()
    if not keyword:
        raise HTTPException(status_code=404, detail=f"Keyword {keyword_id} not found")
    
    db.delete(keyword)
    db.commit()
    return {"deleted": True, "id": keyword_id}


# === Camps (Categories) ===

@app.get("/api/camps", response_model=schemas.CampList)
def list_camps(db: Session = Depends(get_db)):
    """List all camps."""
    camps = db.query(Camp).all()
    return schemas.CampList(camps=camps, total=len(camps))


@app.post("/api/camps", response_model=schemas.CampBase)
def create_camp(request: schemas.CampCreateRequest, db: Session = Depends(get_db)):
    """Create a new camp."""
    camp = Camp(
        name=request.name,
        description=request.description,
        color=request.color,
    )
    db.add(camp)
    db.commit()
    db.refresh(camp)
    return camp


@app.get("/api/camps/{camp_id}", response_model=schemas.CampDetail)
def get_camp(camp_id: int, db: Session = Depends(get_db)):
    """Get camp details including keywords."""
    camp = db.query(Camp).filter(Camp.id == camp_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail=f"Camp {camp_id} not found")
    
    keywords = db.query(Keyword).filter(Keyword.camp_id == camp.id).all()
    return schemas.CampDetail(
        id=camp.id,
        name=camp.name,
        description=camp.description,
        color=camp.color,
        created_at=camp.created_at,
        keywords=[schemas.CampKeyword(id=k.id, term=k.term, weight=k.weight, case_sensitive=k.case_sensitive) for k in keywords],
    )


@app.get("/api/camps/{camp_id}/leaderboard", response_model=schemas.CampLeaderboard)
def get_camp_leaderboard(camp_id: int, limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    """Get top accounts for a camp by score."""
    analyzer = AnalyzerService(db)
    camp = analyzer.get_camp(camp_id)
    if not camp:
        raise HTTPException(status_code=404, detail=f"Camp {camp_id} not found")
    
    leaderboard = analyzer.get_camp_leaderboard(camp.id, limit=limit)
    entries = [
        schemas.LeaderboardEntry(
            rank=i,
            account=score.account,
            score=score.score,
            bio_score=score.bio_score,
            tweet_score=score.tweet_score,
        )
        for i, score in enumerate(leaderboard, 1)
    ]
    
    return schemas.CampLeaderboard(camp=camp, entries=entries)


@app.get("/api/camps/{camp_id}/tweets", response_model=schemas.CampTopTweets)
def get_camp_top_tweets(camp_id: int, limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    """Get top tweets matching keywords in this camp."""
    analyzer = AnalyzerService(db)
    camp = analyzer.get_camp(camp_id)
    if not camp:
        raise HTTPException(status_code=404, detail=f"Camp {camp_id} not found")
    
    top_tweets = analyzer.get_camp_top_tweets(camp_id, limit=limit)
    tweets = [
        schemas.CampTweet(
            tweet_id=t["tweet"].id,
            text=t["tweet"].text,
            username=t["account"].username,
            name=t["account"].name,
            profile_image_url=t["account"].profile_image_url,
            followers_count=t["account"].followers_count,
            score=t["score"],
            matched_keywords=t["matched_keywords"],
            like_count=t["tweet"].like_count,
            retweet_count=t["tweet"].retweet_count,
        )
        for t in top_tweets
    ]
    
    return schemas.CampTopTweets(camp=camp, tweets=tweets)


@app.put("/api/camps/{camp_id}", response_model=schemas.CampBase)
def update_camp(camp_id: int, request: schemas.CampUpdateRequest, db: Session = Depends(get_db)):
    """Update a camp."""
    camp = db.query(Camp).filter(Camp.id == camp_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail=f"Camp {camp_id} not found")
    
    if request.name is not None:
        camp.name = request.name
    if request.description is not None:
        camp.description = request.description
    if request.color is not None:
        camp.color = request.color
    
    db.commit()
    db.refresh(camp)
    return camp


@app.delete("/api/camps/{camp_id}")
def delete_camp(camp_id: int, db: Session = Depends(get_db)):
    """Delete a camp and all its keywords."""
    camp = db.query(Camp).filter(Camp.id == camp_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail=f"Camp {camp_id} not found")
    
    db.delete(camp)
    db.commit()
    return {"deleted": True, "id": camp_id}


@app.post("/api/camps/{camp_id}/keywords", response_model=schemas.CampKeyword)
def add_keyword_to_camp(camp_id: int, request: schemas.KeywordAddRequest, db: Session = Depends(get_db)):
    """Add a keyword to a camp."""
    camp = db.query(Camp).filter(Camp.id == camp_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail=f"Camp {camp_id} not found")
    
    # Validate expected_sentiment
    if request.expected_sentiment not in ("positive", "negative", "any"):
        raise HTTPException(status_code=400, detail="expected_sentiment must be 'positive', 'negative', or 'any'")
    
    keyword = Keyword(
        term=request.term,
        type="signal",
        camp_id=camp.id,
        weight=request.weight,
        case_sensitive=request.case_sensitive,
        expected_sentiment=request.expected_sentiment,
    )
    db.add(keyword)
    db.commit()
    db.refresh(keyword)
    return schemas.CampKeyword(
        id=keyword.id, 
        term=keyword.term, 
        weight=keyword.weight, 
        case_sensitive=keyword.case_sensitive,
        expected_sentiment=keyword.expected_sentiment,
    )


@app.delete("/api/camps/{camp_id}/keywords/{keyword_id}")
def delete_keyword_from_camp(camp_id: int, keyword_id: int, db: Session = Depends(get_db)):
    """Delete a keyword from a camp."""
    keyword = db.query(Keyword).filter(Keyword.id == keyword_id, Keyword.camp_id == camp_id).first()
    if not keyword:
        raise HTTPException(status_code=404, detail=f"Keyword {keyword_id} not found")
    
    db.delete(keyword)
    db.commit()
    return {"deleted": True, "keyword_id": keyword_id}


# === Analysis ===

@app.post("/api/analyze", response_model=schemas.AnalyzeResponse)
def analyze_accounts(request: schemas.AnalyzeRequest, db: Session = Depends(get_db)):
    """Analyze accounts for camp membership."""
    analyzer = AnalyzerService(db)
    
    if request.username:
        # Analyze specific account
        account = db.query(Account).filter(Account.username == request.username).first()
        if not account:
            raise HTTPException(status_code=404, detail=f"Account @{request.username} not found")
        analyzer.analyze_and_save(account)
        return schemas.AnalyzeResponse(analyzed=1, total_scores=len(analyzer.get_camps()))
    else:
        # Analyze all
        stats = analyzer.analyze_all_accounts()
        return schemas.AnalyzeResponse(**stats)


@app.get("/api/accounts/{username}/analysis", response_model=schemas.AccountAnalysis)
def get_account_analysis(username: str, db: Session = Depends(get_db)):
    """Get camp analysis for an account."""
    account = db.query(Account).filter(Account.username == username).first()
    if not account:
        raise HTTPException(status_code=404, detail=f"Account @{username} not found")
    
    analyzer = AnalyzerService(db)
    scores = analyzer.get_account_scores(account.id)
    
    score_list = []
    for score in scores:
        camp = analyzer.get_camp(score.camp_id)
        bio_matches = score.match_details.get("bio_matches", []) if score.match_details else []
        tweet_matches = score.match_details.get("tweet_matches", []) if score.match_details else []
        
        score_list.append(schemas.AccountCampScoreBase(
            camp_id=camp.id,
            camp_name=camp.name,
            camp_color=camp.color,
            score=score.score,
            bio_score=score.bio_score,
            tweet_score=score.tweet_score,
            bio_matches=[schemas.MatchDetail(**m) for m in bio_matches],
            tweet_matches=[schemas.MatchDetail(**m) for m in tweet_matches],
        ))
    
    return schemas.AccountAnalysis(account=account, scores=score_list)


# === Sentiment Analysis (Grok) ===

@app.get("/api/sentiment/stats", response_model=schemas.SentimentStats)
def get_sentiment_stats(db: Session = Depends(get_db)):
    """Get sentiment analysis statistics."""
    from backend.analyzer.sentiment import SentimentAnalyzer
    analyzer = SentimentAnalyzer(db)
    return analyzer.get_sentiment_stats()


@app.post("/api/sentiment/analyze", response_model=schemas.SentimentAnalyzeResponse)
def analyze_sentiment(request: schemas.SentimentAnalyzeRequest, db: Session = Depends(get_db)):
    """Run sentiment analysis on tweets (uses Grok API)."""
    from backend.analyzer.sentiment import SentimentAnalyzer
    analyzer = SentimentAnalyzer(db)

    if request.camp_id:
        result = analyzer.analyze_camp(request.camp_id, limit=request.limit)
    else:
        result = analyzer.analyze_all(limit=request.limit)

    return schemas.SentimentAnalyzeResponse(
        tweets_found=result.get("tweets_found", 0),
        analyzed=result.get("analyzed", 0),
        saved=result.get("saved", 0),
        camp=result.get("camp"),
    )


@app.get("/api/camps/{camp_id}/tweets/sentiment", response_model=List[schemas.CampTweetWithSentiment])
def get_camp_tweets_with_sentiment(camp_id: int, limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    """Get top tweets for a camp including sentiment data."""
    analyzer = AnalyzerService(db)
    camp = analyzer.get_camp(camp_id)
    if not camp:
        raise HTTPException(status_code=404, detail=f"Camp {camp_id} not found")

    top_tweets = analyzer.get_camp_top_tweets(camp_id, limit=limit)
    tweets = [
        schemas.CampTweetWithSentiment(
            tweet_id=t["tweet"].id,
            text=t["tweet"].text,
            username=t["account"].username,
            name=t["account"].name,
            profile_image_url=t["account"].profile_image_url,
            followers_count=t["account"].followers_count,
            score=t["score"],
            matched_keywords=t["matched_keywords"],
            like_count=t["tweet"].like_count,
            retweet_count=t["tweet"].retweet_count,
            sentiment=t["tweet"].sentiment,
            sentiment_score=t["tweet"].sentiment_score,
        )
        for t in top_tweets
    ]

    return tweets


# === AI Summary ===

@app.get("/api/topics")
def get_default_topics():
    """Get the default list of topics for summary generation."""
    return {"topics": DEFAULT_TOPICS}


@app.post("/api/accounts/{username}/summary", response_model=schemas.SummaryResponse)
def generate_account_summary(
    username: str,
    request: schemas.SummaryRequest,
):
    """Generate an AI summary of an account's positions on various topics.

    Uses xAI's x_search tool to search tweets directly from X - no need
    to have the account scraped in our database first.
    """
    try:
        summary_service = SummaryService()
        result = summary_service.generate_summary(
            username=username,
            topics=request.topics,
        )

        # Parse the result into the expected format
        topics_data = result.get("topics", {})
        parsed_topics = {}
        for topic_name, sentiment in topics_data.items():
            parsed_topics[topic_name] = schemas.TopicSentiment(
                noticing=sentiment.get("noticing", False),
                comment=sentiment.get("comment", ""),
                examples=sentiment.get("examples", []),
            )

        return schemas.SummaryResponse(username=username, topics=parsed_topics)

    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")
