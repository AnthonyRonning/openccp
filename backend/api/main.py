"""
FastAPI application for OpenCCP.
"""

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional, List

from backend.db import get_db, Account, Tweet, Follow, Keyword
from backend.scraper import ScraperService
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
