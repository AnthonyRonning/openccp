"""
FastAPI application for OpenCCP.
"""

import re
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional, List

from backend.db import get_db, Account, Tweet, Follow, Keyword, Camp, AccountCampScore, Topic
from backend.scraper import ScraperService, XClient
from backend.analyzer import AnalyzerService, SummaryService
from backend.analyzer.topic import TopicService, extract_tweet_ids_from_urls
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
def get_account_tweets(
    username: str,
    sort: str = Query("latest", description="Sort by: 'latest' or 'top' (by views)"),
    db: Session = Depends(get_db),
):
    """Get tweets for an account."""
    account = db.query(Account).filter(Account.username == username).first()
    if not account:
        raise HTTPException(status_code=404, detail=f"Account @{username} not found")
    
    query = db.query(Tweet).filter(Tweet.account_id == account.id)
    if sort == "top":
        query = query.order_by(Tweet.impression_count.desc())
    else:
        query = query.order_by(Tweet.twitter_created_at.desc())
    
    tweets = query.all()
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
        keywords=[schemas.CampKeyword(id=k.id, term=k.term, weight=k.weight, case_sensitive=k.case_sensitive, expected_sentiment=k.expected_sentiment) for k in keywords],
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
            impression_count=t["tweet"].impression_count,
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


# === Topics (Configurable) ===

@app.get("/api/topics", response_model=schemas.TopicList)
def list_topics(
    enabled_only: bool = Query(False, description="Only return enabled topics"),
    db: Session = Depends(get_db),
):
    """List all topics for summary generation."""
    query = db.query(Topic).order_by(Topic.sort_order, Topic.name)
    if enabled_only:
        query = query.filter(Topic.enabled == True)
    topics = query.all()
    return schemas.TopicList(topics=topics, total=len(topics))


@app.post("/api/topics", response_model=schemas.TopicBase)
def create_topic(request: schemas.TopicCreateRequest, db: Session = Depends(get_db)):
    """Create a new topic."""
    existing = db.query(Topic).filter(Topic.name == request.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Topic '{request.name}' already exists")
    
    topic = Topic(
        name=request.name,
        description=request.description,
        enabled=request.enabled,
        sort_order=request.sort_order,
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


@app.get("/api/topics/{topic_id}", response_model=schemas.TopicBase)
def get_topic(topic_id: int, db: Session = Depends(get_db)):
    """Get a topic by ID."""
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail=f"Topic {topic_id} not found")
    return topic


@app.put("/api/topics/{topic_id}", response_model=schemas.TopicBase)
def update_topic(topic_id: int, request: schemas.TopicUpdateRequest, db: Session = Depends(get_db)):
    """Update a topic."""
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail=f"Topic {topic_id} not found")
    
    if request.name is not None:
        # Check for duplicate name
        existing = db.query(Topic).filter(Topic.name == request.name, Topic.id != topic_id).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Topic '{request.name}' already exists")
        topic.name = request.name
    if request.description is not None:
        topic.description = request.description
    if request.enabled is not None:
        topic.enabled = request.enabled
    if request.sort_order is not None:
        topic.sort_order = request.sort_order
    
    db.commit()
    db.refresh(topic)
    return topic


@app.delete("/api/topics/{topic_id}")
def delete_topic(topic_id: int, db: Session = Depends(get_db)):
    """Delete a topic."""
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail=f"Topic {topic_id} not found")
    
    db.delete(topic)
    db.commit()
    return {"deleted": True, "id": topic_id}


# === AI Summary ===

@app.post("/api/accounts/{username}/summary", response_model=schemas.SummaryResponse)
def generate_account_summary(
    username: str,
    request: schemas.SummaryRequest,
    db: Session = Depends(get_db),
):
    """Generate an AI summary of an account's positions on various topics.

    Uses xAI's x_search tool to search tweets directly from X - no need
    to have the account scraped in our database first.
    
    If no topics provided in request, uses enabled topics from database.
    """
    try:
        # Get topics from request or database
        topics = request.topics
        if not topics:
            db_topics = db.query(Topic).filter(Topic.enabled == True).order_by(Topic.sort_order).all()
            topics = [t.name for t in db_topics]
        
        if not topics:
            raise HTTPException(status_code=400, detail="No topics available. Add topics first.")
        
        summary_service = SummaryService()
        result = summary_service.generate_summary(
            username=username,
            topics=topics,
        )

        # Parse the result into the expected format
        topics_data = result.get("topics", {})
        
        # Extract all tweet IDs from example URLs
        all_tweet_ids = []
        tweet_id_pattern = re.compile(r'status/(\d+)')
        for sentiment in topics_data.values():
            for url in sentiment.get("examples", []):
                match = tweet_id_pattern.search(url)
                if match:
                    all_tweet_ids.append(int(match.group(1)))
        
        # Fetch tweets from X API and store them
        tweet_map = {}
        if all_tweet_ids:
            try:
                x_client = XClient()
                fetched_tweets = x_client.get_tweets_by_ids(all_tweet_ids)
                scraper = ScraperService(db)
                for tweet_data in fetched_tweets:
                    scraper._upsert_tweet(tweet_data)
                    # Query the tweet back to get the DB model
                    tweet = db.query(Tweet).filter(Tweet.id == tweet_data.id).first()
                    if tweet:
                        tweet_map[tweet.id] = tweet
                db.commit()
            except Exception as e:
                print(f"Warning: Could not fetch tweets: {e}")
        
        parsed_topics = {}
        for topic_name, sentiment in topics_data.items():
            examples = sentiment.get("examples", [])
            # Get tweet objects for this topic's examples
            topic_tweets = []
            for url in examples:
                match = tweet_id_pattern.search(url)
                if match:
                    tweet_id = int(match.group(1))
                    if tweet_id in tweet_map:
                        tweet = tweet_map[tweet_id]
                        topic_tweets.append(schemas.SummaryTweet(
                            id=tweet.id,
                            text=tweet.text,
                            like_count=tweet.like_count,
                            retweet_count=tweet.retweet_count,
                            twitter_created_at=tweet.twitter_created_at,
                        ))
            
            parsed_topics[topic_name] = schemas.TopicSentiment(
                noticing=sentiment.get("noticing", False),
                comment=sentiment.get("comment", ""),
                examples=examples,
                tweets=topic_tweets,
            )

        return schemas.SummaryResponse(username=username, topics=parsed_topics)

    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")


@app.post("/api/accounts/{username}/report")
def generate_account_report(
    username: str,
    request: schemas.ReportRequest,
    db: Session = Depends(get_db),
):
    """Generate a markdown report for an account based on summary and analysis data."""
    try:
        # Get account from DB
        account = db.query(Account).filter(Account.username == username).first()
        if not account:
            raise HTTPException(status_code=404, detail=f"Account @{username} not found")
        
        account_data = {
            "username": account.username,
            "name": account.name,
            "description": account.description,
            "location": account.location,
            "twitter_created_at": str(account.twitter_created_at) if account.twitter_created_at else None,
            "followers_count": account.followers_count,
            "following_count": account.following_count,
            "tweet_count": account.tweet_count,
        }
        
        # Convert summary data to dict format expected by generate_report
        summary_data = {
            "topics": {
                name: {
                    "noticing": topic.noticing,
                    "comment": topic.comment,
                    "tweets": [{"id": t.id, "text": t.text, "like_count": t.like_count, "retweet_count": t.retweet_count} for t in topic.tweets]
                }
                for name, topic in request.summary.topics.items()
            }
        }
        
        # Get analysis data if available
        analysis_data = None
        if request.include_camps:
            analyzer = AnalyzerService(db)
            scores = analyzer.get_account_scores(account.id)
            if scores:
                analysis_data = {
                    "scores": [
                        {"camp_name": s.camp.name, "score": s.score}
                        for s in scores
                    ]
                }
        
        summary_service = SummaryService()
        report = summary_service.generate_report(account_data, summary_data, analysis_data)
        
        return {"report": report}
    
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")


# === Topic Search ===

@app.post("/api/topic/search", response_model=schemas.TopicSearchResponse)
def search_topic(
    request: schemas.TopicSearchRequest,
    db: Session = Depends(get_db),
):
    """Search for top tweets about a topic and fetch their top replies."""
    try:
        topic_service = TopicService()
        x_client = XClient()
        scraper = ScraperService(db)
        
        # Search for tweets AND their top replies in one Grok call
        search_result = topic_service.search_topic_with_replies(request.query, limit=10)
        print(f"[DEBUG] Grok search_result: {search_result}")
        tweets_data = search_result.get("tweets", [])
        
        if not tweets_data:
            print(f"[DEBUG] No tweets_data found")
            return schemas.TopicSearchResponse(query=request.query, tweets=[])
        
        # Collect all tweet IDs (main tweets + replies)
        all_tweet_urls = []
        reply_map = {}  # main_tweet_id -> reply_url
        
        for t in tweets_data:
            if t.get("url"):
                all_tweet_urls.append(t["url"])
                main_ids = extract_tweet_ids_from_urls([t["url"]])
                if main_ids and t.get("top_reply_url"):
                    reply_map[main_ids[0]] = t["top_reply_url"]
                    all_tweet_urls.append(t["top_reply_url"])
        
        # Extract all tweet IDs and fetch in one batch
        print(f"[DEBUG] all_tweet_urls: {all_tweet_urls}")
        all_tweet_ids = extract_tweet_ids_from_urls(all_tweet_urls)
        print(f"[DEBUG] all_tweet_ids: {all_tweet_ids}")
        if not all_tweet_ids:
            return schemas.TopicSearchResponse(query=request.query, tweets=[])
        
        # Fetch all tweets from X API in one call
        fetched_tweets = x_client.get_tweets_by_ids(all_tweet_ids)
        tweet_by_id = {t.id: t for t in fetched_tweets}
        
        # Collect unique author IDs and fetch them
        author_ids = list(set(t.account_id for t in fetched_tweets))
        for author_id in author_ids:
            if not db.query(Account).filter(Account.id == author_id).first():
                author_data = x_client.get_user_by_id(author_id)
                if author_data:
                    scraper._upsert_account(author_data, is_seed=False)
        db.commit()
        
        # Store all tweets
        for tweet_data in fetched_tweets:
            scraper._upsert_tweet(tweet_data)
        db.commit()
        
        # Build response - only include main tweets (not replies) at top level
        main_tweet_ids = extract_tweet_ids_from_urls([t["url"] for t in tweets_data if t.get("url")])
        results = []
        
        for tweet_id in main_tweet_ids:
            tweet_data = tweet_by_id.get(tweet_id)
            if not tweet_data:
                continue
                
            author = db.query(Account).filter(Account.id == tweet_data.account_id).first()
            
            # Get top reply if we have one
            top_reply = None
            reply_url = reply_map.get(tweet_id)
            if reply_url:
                reply_ids = extract_tweet_ids_from_urls([reply_url])
                if reply_ids:
                    reply_data = tweet_by_id.get(reply_ids[0])
                    if reply_data:
                        reply_author = db.query(Account).filter(Account.id == reply_data.account_id).first()
                        top_reply = schemas.TopicTweetResult(
                            id=str(reply_data.id),
                            text=reply_data.text,
                            like_count=reply_data.like_count,
                            retweet_count=reply_data.retweet_count,
                            impression_count=reply_data.impression_count,
                            author_username=reply_author.username if reply_author else None,
                            author_name=reply_author.name if reply_author else None,
                            author_profile_image=reply_author.profile_image_url if reply_author else None,
                        )
            
            results.append(schemas.TopicTweetResult(
                id=str(tweet_data.id),
                text=tweet_data.text,
                like_count=tweet_data.like_count,
                retweet_count=tweet_data.retweet_count,
                impression_count=tweet_data.impression_count,
                author_username=author.username if author else None,
                author_name=author.name if author else None,
                author_profile_image=author.profile_image_url if author else None,
                top_reply=top_reply,
            ))
        
        return schemas.TopicSearchResponse(query=request.query, tweets=results)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search topic: {str(e)}")


@app.post("/api/topic/analyze", response_model=schemas.TopicAnalyzeResponse)
def analyze_topic_sides(
    request: schemas.TopicAnalyzeRequest,
    db: Session = Depends(get_db),
):
    """Analyze tweets and classify them into two sides."""
    try:
        # Convert string IDs to int for DB query
        tweet_ids_int = [int(tid) for tid in request.tweet_ids]
        
        # Fetch tweets from DB
        tweets = db.query(Tweet).filter(Tweet.id.in_(tweet_ids_int)).all()
        if not tweets:
            raise HTTPException(status_code=404, detail="No tweets found")
        
        # Build tweet data for analysis (keep IDs as strings)
        tweets_data = [
            {"id": str(t.id), "text": t.text}
            for t in tweets
        ]
        
        topic_service = TopicService()
        classifications = topic_service.analyze_sides(
            tweets_data=tweets_data,
            side_a_name=request.side_a_name,
            side_b_name=request.side_b_name,
            prompt=request.prompt,
        )
        
        return schemas.TopicAnalyzeResponse(
            side_a_name=request.side_a_name,
            side_b_name=request.side_b_name,
            classifications=[
                schemas.TweetClassification(
                    tweet_id=str(c["tweet_id"]),
                    side=c["side"],
                    reason=c["reason"],
                )
                for c in classifications
            ],
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze sides: {str(e)}")
