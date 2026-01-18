import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTweetFeed, searchAccounts } from '../api';
import type { TweetWithAuthor, Account } from '../api';
import { TweetCard } from '../components/TweetCard';

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

type SortOption = 'latest' | 'views' | 'likes' | 'retweets' | 'replies';
type TimeFilter = 'all' | '1h' | '24h' | '7d';

function getTimeFilterDate(filter: TimeFilter): string | undefined {
  if (filter === 'all') return undefined;
  const now = new Date();
  if (filter === '1h') now.setHours(now.getHours() - 1);
  else if (filter === '24h') now.setHours(now.getHours() - 24);
  else if (filter === '7d') now.setDate(now.getDate() - 7);
  return now.toISOString();
}

function AccountAutocomplete({ 
  value, 
  onChange 
}: { 
  value: string; 
  onChange: (username: string) => void;
}) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<Account[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (inputValue.length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const { accounts } = await searchAccounts(inputValue, 10);
        setSuggestions(accounts);
        setIsOpen(accounts.length > 0);
      } catch {
        setSuggestions([]);
      }
      setIsLoading(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const handleSelect = (username: string) => {
    setInputValue(username);
    onChange(username);
    setIsOpen(false);
  };

  const handleClear = () => {
    setInputValue('');
    onChange('');
    setSuggestions([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex">
        <span className="h-9 px-3 flex items-center rounded-l-md border border-r-0 border-border bg-secondary text-muted-foreground text-sm">
          @
        </span>
        <input
          type="text"
          placeholder="username"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (e.target.value === '') onChange('');
          }}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          className="h-9 w-32 px-3 rounded-r-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {inputValue && (
          <button
            onClick={handleClear}
            className="ml-1 px-2 text-muted-foreground hover:text-foreground"
            title="Clear"
          >
            x
          </button>
        )}
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 max-h-64 overflow-auto rounded-md border border-border bg-card shadow-lg">
          {isLoading ? (
            <div className="p-2 text-sm text-muted-foreground">Searching...</div>
          ) : (
            suggestions.map((account) => (
              <button
                key={account.id}
                onClick={() => handleSelect(account.username)}
                className="w-full px-3 py-2 text-left hover:bg-secondary flex items-center gap-2"
              >
                {account.profile_image_url ? (
                  <img src={account.profile_image_url} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary/20" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {account.name || account.username}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    @{account.username} · {formatNumber(account.followers_count)} followers
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Tweets() {
  const [search, setSearch] = useState('');
  const [selectedUsername, setSelectedUsername] = useState('');
  const [offset, setOffset] = useState(0);
  const [allTweets, setAllTweets] = useState<TweetWithAuthor[]>([]);
  const [sort, setSort] = useState<SortOption>('latest');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [hideReplies, setHideReplies] = useState(false);
  const [minViews, setMinViews] = useState<number | ''>('');
  const limit = 50;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['tweets-feed', search, selectedUsername, offset, sort, timeFilter, hideReplies, minViews],
    queryFn: () => fetchTweetFeed({
      limit,
      offset,
      search: search || undefined,
      username: selectedUsername || undefined,
      sort,
      since: getTimeFilterDate(timeFilter),
      hideReplies,
      minViews: minViews !== '' ? minViews : undefined,
    }),
    refetchInterval: sort === 'latest' ? 10000 : undefined, // Only auto-refresh for latest
  });

  // Reset tweets when filters change
  useEffect(() => {
    setAllTweets([]);
    setOffset(0);
  }, [search, selectedUsername, sort, timeFilter, hideReplies, minViews]);

  // Append new tweets
  useEffect(() => {
    if (data?.tweets) {
      if (offset === 0) {
        setAllTweets(data.tweets);
      } else {
        setAllTweets(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const newTweets = data.tweets.filter(t => !existingIds.has(t.id));
          return [...prev, ...newTweets];
        });
      }
    }
  }, [data, offset]);

  const loadMore = () => {
    if (data?.has_more) {
      setOffset(prev => prev + limit);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Tweet Feed</h1>
        <div className="text-sm text-muted-foreground">
          {data?.total.toLocaleString()} tweets total
        </div>
      </div>

      {/* Filters Row 1: Search, Account, Sort */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search tweets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 px-3 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <AccountAutocomplete
          value={selectedUsername}
          onChange={setSelectedUsername}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="h-9 px-3 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="latest">Latest</option>
          <option value="views">Top Views</option>
          <option value="likes">Top Likes</option>
          <option value="retweets">Top Retweets</option>
          <option value="replies">Most Replies</option>
        </select>
        {isFetching && !isLoading && (
          <span className="text-sm text-muted-foreground">Refreshing...</span>
        )}
      </div>

      {/* Filters Row 2: Time, Hide Replies, Min Views */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-1">
          {(['all', '1h', '24h', '7d'] as TimeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTimeFilter(t)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                timeFilter === t
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border bg-background text-foreground hover:bg-secondary'
              }`}
            >
              {t === 'all' ? 'All time' : t}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={hideReplies}
            onChange={(e) => setHideReplies(e.target.checked)}
            className="rounded border-border"
          />
          Hide replies
        </label>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Min views:</label>
          <input
            type="number"
            placeholder="0"
            value={minViews}
            onChange={(e) => setMinViews(e.target.value ? parseInt(e.target.value) : '')}
            className="h-9 w-24 px-3 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Tweet Feed */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading tweets...</div>
        ) : allTweets.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No tweets found</div>
        ) : (
          <>
            {allTweets.map(tweet => (
              <div key={tweet.id} className="border-b border-border p-3">
                <TweetCard
                  id={tweet.id}
                  text={tweet.text}
                  likeCount={tweet.like_count}
                  retweetCount={tweet.retweet_count}
                  impressionCount={tweet.impression_count}
                  author={{
                    username: tweet.author_username,
                    name: tweet.author_name || undefined,
                    profileImageUrl: tweet.author_profile_image_url || undefined,
                  }}
                />
              </div>
            ))}
            
            {data?.has_more && (
              <div className="p-4 text-center">
                <button
                  onClick={loadMore}
                  disabled={isFetching}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {isFetching ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
