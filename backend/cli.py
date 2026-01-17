#!/usr/bin/env python
"""
CLI for OpenCCP scraper and analyzer.

Usage:
    python -m backend.cli scrape anthonyronning
    python -m backend.cli list
    python -m backend.cli show anthonyronning
    python -m backend.cli graph
    python -m backend.cli stats
    
    # Analysis commands
    python -m backend.cli analyze              # Analyze all accounts
    python -m backend.cli analyze anthonyronning  # Analyze specific account
    python -m backend.cli camps                # List all camps
    python -m backend.cli leaderboard ai-enthusiast  # Show camp leaderboard
"""

import sys
import json
from backend.db import SessionLocal
from backend.scraper import ScraperService
from backend.analyzer import AnalyzerService


def cmd_scrape(username: str):
    """Scrape an account and its network."""
    db = SessionLocal()
    try:
        scraper = ScraperService(db)
        account, stats = scraper.scrape_account(username)
        
        print("\n" + "=" * 50)
        print("SCRAPE COMPLETE")
        print("=" * 50)
        
        if account:
            print(f"Account: @{account.username} ({account.name})")
            print(f"  ID: {account.id}")
            print(f"  Followers: {account.followers_count}")
            print(f"  Following: {account.following_count}")
            print(f"  Tweets: {account.tweet_count}")
        
        print(f"\nStats:")
        print(f"  Account scraped: {stats['account_scraped']}")
        print(f"  Tweets added: {stats['tweets_added']}")
        print(f"  Following added: {stats['following_added']}")
        print(f"  Followers added: {stats['followers_added']}")
        print(f"  Connections scraped: {stats['connections_scraped']}")
        
        if stats['errors']:
            print(f"  Errors: {stats['errors']}")
    finally:
        db.close()


def cmd_list(seeds_only: bool = False):
    """List all accounts in the database."""
    db = SessionLocal()
    try:
        scraper = ScraperService(db)
        accounts = scraper.get_all_accounts(seeds_only=seeds_only)
        
        print(f"\n{'SEED ' if seeds_only else ''}ACCOUNTS ({len(accounts)} total)")
        print("=" * 60)
        
        for a in accounts:
            seed_marker = "[SEED] " if a.is_seed else "       "
            print(f"{seed_marker}@{a.username:<20} {a.name or '':<25} followers:{a.followers_count}")
    finally:
        db.close()


def cmd_show(username: str):
    """Show details for an account."""
    db = SessionLocal()
    try:
        scraper = ScraperService(db)
        account = scraper.get_account(username)
        
        if not account:
            print(f"Account @{username} not found in database")
            return
        
        print(f"\n@{account.username}")
        print("=" * 50)
        print(f"Name: {account.name}")
        print(f"ID: {account.id}")
        print(f"Bio: {account.description}")
        print(f"Location: {account.location}")
        print(f"Verified: {account.verified} ({account.verified_type})")
        print(f"Is Seed: {account.is_seed}")
        print(f"\nMetrics:")
        print(f"  Followers: {account.followers_count}")
        print(f"  Following: {account.following_count}")
        print(f"  Tweets: {account.tweet_count}")
        print(f"  Likes: {account.like_count}")
        
        # Tweets
        tweets = scraper.get_account_tweets(account.id)
        print(f"\nTweets in DB ({len(tweets)}):")
        for t in tweets[:5]:
            text_preview = t.text[:60].replace('\n', ' ') + ('...' if len(t.text) > 60 else '')
            print(f"  - {text_preview}")
        
        # Following
        following = scraper.get_account_following(account.id)
        print(f"\nFollowing in DB ({len(following)}):")
        for f in following[:5]:
            print(f"  - @{f.username}")
        
        # Followers
        followers = scraper.get_account_followers(account.id)
        print(f"\nFollowers in DB ({len(followers)}):")
        for f in followers[:5]:
            print(f"  - @{f.username}")
    finally:
        db.close()


def cmd_graph():
    """Output graph data as JSON."""
    db = SessionLocal()
    try:
        scraper = ScraperService(db)
        data = scraper.get_graph_data()
        print(json.dumps(data, indent=2))
    finally:
        db.close()


def cmd_stats():
    """Show database stats."""
    db = SessionLocal()
    try:
        from backend.db.models import Account, Tweet, Follow, Keyword, Camp, AccountCampScore
        
        accounts = db.query(Account).count()
        seeds = db.query(Account).filter(Account.is_seed == True).count()
        tweets = db.query(Tweet).count()
        follows = db.query(Follow).count()
        keywords = db.query(Keyword).count()
        camps = db.query(Camp).count()
        scores = db.query(AccountCampScore).count()
        
        print("\nDATABASE STATS")
        print("=" * 30)
        print(f"Accounts: {accounts} ({seeds} seeds)")
        print(f"Tweets: {tweets}")
        print(f"Follow edges: {follows}")
        print(f"Keywords: {keywords}")
        print(f"Camps: {camps}")
        print(f"Camp scores: {scores}")
    finally:
        db.close()


def cmd_analyze(username: str = None):
    """Analyze accounts for camp membership."""
    db = SessionLocal()
    try:
        analyzer = AnalyzerService(db)
        
        if username:
            # Analyze specific account
            scraper = ScraperService(db)
            account = scraper.get_account(username)
            if not account:
                print(f"Account @{username} not found")
                return
            
            print(f"\nAnalyzing @{username}...")
            scores = analyzer.analyze_and_save(account)
            
            print(f"\n@{account.username} - CAMP ANALYSIS")
            print("=" * 50)
            
            for camp_id, score in scores.items():
                camp = analyzer.get_camp(camp_id)
                print(f"\n{camp.name} (score: {score.score:.1f})")
                print(f"  Bio score: {score.bio_score:.1f}")
                print(f"  Tweet score: {score.tweet_score:.1f}")
                
                if score.match_details:
                    if score.match_details.get("bio_matches"):
                        print("  Bio matches:")
                        for m in score.match_details["bio_matches"]:
                            print(f"    - '{m['term']}' x{m['count']} (weight: {m['weight']})")
                    if score.match_details.get("tweet_matches"):
                        print("  Tweet matches:")
                        for m in score.match_details["tweet_matches"][:5]:
                            print(f"    - '{m['term']}' x{m['count']} (weight: {m['weight']})")
        else:
            # Analyze all accounts
            print("\nAnalyzing all accounts...")
            stats = analyzer.analyze_all_accounts()
            print(f"\nDone! Analyzed {stats['analyzed']} accounts, created {stats['total_scores']} camp scores")
    finally:
        db.close()


def cmd_camps():
    """List all camps and their keywords."""
    db = SessionLocal()
    try:
        analyzer = AnalyzerService(db)
        camps = analyzer.get_camps()
        
        print("\nCAMPS")
        print("=" * 50)
        
        for camp in camps:
            keywords = analyzer.get_camp_keywords(camp.id)
            print(f"\n{camp.name} ({camp.slug}) - {camp.color}")
            print(f"  {camp.description or 'No description'}")
            print(f"  Keywords ({len(keywords)}):")
            for kw in keywords[:10]:
                print(f"    - '{kw.term}' (weight: {kw.weight})")
            if len(keywords) > 10:
                print(f"    ... and {len(keywords) - 10} more")
    finally:
        db.close()


def cmd_leaderboard(camp_slug: str):
    """Show top accounts for a camp."""
    db = SessionLocal()
    try:
        analyzer = AnalyzerService(db)
        camp = analyzer.get_camp_by_slug(camp_slug)
        
        if not camp:
            print(f"Camp '{camp_slug}' not found")
            print("Available camps:")
            for c in analyzer.get_camps():
                print(f"  - {c.slug}")
            return
        
        leaderboard = analyzer.get_camp_leaderboard(camp.id, limit=20)
        
        print(f"\n{camp.name.upper()} LEADERBOARD")
        print("=" * 50)
        
        if not leaderboard:
            print("No accounts with scores > 0. Run 'analyze' first!")
            return
        
        for i, score in enumerate(leaderboard, 1):
            account = score.account
            print(f"{i:2}. @{account.username:<20} score: {score.score:>6.1f}  (bio: {score.bio_score:.1f}, tweets: {score.tweet_score:.1f})")
    finally:
        db.close()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "scrape":
        if len(sys.argv) < 3:
            print("Usage: python -m backend.cli scrape <username>")
            sys.exit(1)
        cmd_scrape(sys.argv[2])
    
    elif cmd == "list":
        seeds_only = "--seeds" in sys.argv
        cmd_list(seeds_only=seeds_only)
    
    elif cmd == "show":
        if len(sys.argv) < 3:
            print("Usage: python -m backend.cli show <username>")
            sys.exit(1)
        cmd_show(sys.argv[2])
    
    elif cmd == "graph":
        cmd_graph()
    
    elif cmd == "stats":
        cmd_stats()
    
    elif cmd == "analyze":
        username = sys.argv[2] if len(sys.argv) > 2 else None
        cmd_analyze(username)
    
    elif cmd == "camps":
        cmd_camps()
    
    elif cmd == "leaderboard":
        if len(sys.argv) < 3:
            print("Usage: python -m backend.cli leaderboard <camp-slug>")
            sys.exit(1)
        cmd_leaderboard(sys.argv[2])
    
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
