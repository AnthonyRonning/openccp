import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { scrapeAccount } from '../api';

export default function Scrape() {
  const [username, setUsername] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: scrapeAccount,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['seeds'] });
      queryClient.invalidateQueries({ queryKey: ['graph'] });

      if (data.account) {
        navigate(`/accounts/${data.account.username}`);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.replace('@', '').trim();
    if (cleanUsername) {
      mutation.mutate(cleanUsername);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">Scrape Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add a Twitter/X account to track.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Twitter Username
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className="w-full h-9 pl-7 pr-2.5 rounded-md bg-input/30 border border-input text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                disabled={mutation.isPending}
              />
            </div>
            <button
              type="submit"
              disabled={mutation.isPending || !username.trim()}
              className="h-9 px-2.5 rounded-md bg-primary hover:bg-primary/80 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground text-sm font-medium transition-colors"
            >
              {mutation.isPending ? 'Scraping...' : 'Scrape'}
            </button>
          </div>
        </div>
      </form>

      {mutation.isPending && (
        <div className="bg-primary/10 ring-1 ring-primary/20 rounded-lg p-3">
          <div className="flex items-center gap-2.5">
            <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
            <div>
              <p className="text-sm text-primary font-medium">Scraping @{username.replace('@', '')}...</p>
              <p className="text-xs text-primary/60">Fetching profile, tweets, followers</p>
            </div>
          </div>
        </div>
      )}

      {mutation.isError && (
        <div className="bg-destructive/10 ring-1 ring-destructive/20 rounded-lg p-3">
          <p className="text-sm text-destructive">Failed to scrape account. Check the username.</p>
        </div>
      )}

      {mutation.isSuccess && mutation.data && (
        <div className="bg-green-500/10 ring-1 ring-green-500/20 rounded-lg p-3 space-y-2">
          <p className="text-sm text-green-400 font-medium">Scrape complete!</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-card/50 rounded p-2">
              <div className="text-xl font-bold text-foreground">{mutation.data.stats.tweets_added}</div>
              <div className="text-xs text-muted-foreground">Tweets</div>
            </div>
            <div className="bg-card/50 rounded p-2">
              <div className="text-xl font-bold text-foreground">{mutation.data.stats.following_added}</div>
              <div className="text-xs text-muted-foreground">Following</div>
            </div>
            <div className="bg-card/50 rounded p-2">
              <div className="text-xl font-bold text-foreground">{mutation.data.stats.followers_added}</div>
              <div className="text-xs text-muted-foreground">Followers</div>
            </div>
            <div className="bg-card/50 rounded p-2">
              <div className="text-xl font-bold text-foreground">{mutation.data.stats.connections_scraped}</div>
              <div className="text-xs text-muted-foreground">Networks</div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl p-4 ring-1 ring-foreground/10 shadow-xs">
        <h2 className="text-sm font-medium text-foreground mb-2">What gets scraped?</h2>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li className="flex items-start gap-1.5">
            <span className="text-primary">+</span>
            Profile info (name, bio, location, metrics)
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-primary">+</span>
            Recent tweets (up to 5 for prototype)
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-primary">+</span>
            Following accounts (up to 3)
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-primary">+</span>
            Follower accounts (up to 3)
          </li>
        </ul>
      </div>
    </div>
  );
}
