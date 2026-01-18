import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchTweetFeed, fetchAccounts } from '../api';
import type { TweetWithAuthor } from '../api';

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

function TweetCard({ tweet }: { tweet: TweetWithAuthor }) {
  const tweetUrl = `https://x.com/${tweet.author_username}/status/${tweet.id}`;
  
  return (
    <div className="border-b border-border p-4 hover:bg-secondary/30 transition-colors">
      <div className="flex gap-3">
        {/* Avatar */}
        <Link to={`/accounts/${tweet.author_username}`} className="flex-shrink-0">
          {tweet.author_profile_image_url ? (
            <img
              src={tweet.author_profile_image_url.replace('_normal', '_bigger')}
              alt={tweet.author_username}
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">
              {tweet.author_username[0].toUpperCase()}
            </div>
          )}
        </Link>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1 text-sm">
            <Link 
              to={`/accounts/${tweet.author_username}`}
              className="font-semibold text-foreground hover:underline truncate"
            >
              {tweet.author_name || tweet.author_username}
            </Link>
            {tweet.author_verified && (
              <svg className="w-4 h-4 text-primary flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
              </svg>
            )}
            <span className="text-muted-foreground">@{tweet.author_username}</span>
            <span className="text-muted-foreground">·</span>
            <a 
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:underline"
            >
              {formatTime(tweet.twitter_created_at)}
            </a>
          </div>
          
          {/* Tweet text */}
          <p className="mt-1 text-foreground whitespace-pre-wrap break-words">{tweet.text}</p>
          
          {/* Metrics */}
          <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
            <span title="Replies">💬 {formatNumber(tweet.reply_count)}</span>
            <span title="Retweets">🔁 {formatNumber(tweet.retweet_count)}</span>
            <span title="Likes">❤️ {formatNumber(tweet.like_count)}</span>
            {tweet.impression_count > 0 && (
              <span title="Views">👁️ {formatNumber(tweet.impression_count)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Tweets() {
  const [search, setSearch] = useState('');
  const [selectedUsername, setSelectedUsername] = useState('');
  const [offset, setOffset] = useState(0);
  const [allTweets, setAllTweets] = useState<TweetWithAuthor[]>([]);
  const limit = 50;

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetchAccounts(),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['tweets-feed', search, selectedUsername, offset],
    queryFn: () => fetchTweetFeed({
      limit,
      offset,
      search: search || undefined,
      username: selectedUsername || undefined,
    }),
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  // Reset tweets when filters change
  useEffect(() => {
    setAllTweets([]);
    setOffset(0);
  }, [search, selectedUsername]);

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

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search tweets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 px-3 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          value={selectedUsername}
          onChange={(e) => setSelectedUsername(e.target.value)}
          className="h-9 px-3 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All accounts</option>
          {accountsData?.accounts.map(account => (
            <option key={account.id} value={account.username}>
              @{account.username}
            </option>
          ))}
        </select>
        {isFetching && !isLoading && (
          <span className="text-sm text-muted-foreground self-center">Refreshing...</span>
        )}
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
              <TweetCard key={tweet.id} tweet={tweet} />
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
