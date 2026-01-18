import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { FileDown, ExternalLink, Save } from 'lucide-react';
import {
  fetchAccount,
  fetchAccountTweets,
  fetchAccountFollowing,
  fetchAccountFollowers,
  fetchAccountAnalysis,
  generateAccountSummary,
  generateAccountReport,
  generateFreeformSummary,
  fetchTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  createReport,
  fetchReports,
} from '../api';
import type { AccountSummary, FreeformResponse, FreeformTweet } from '../api';
import { TweetCard } from '../components/TweetCard';

function AccountCard({ account }: { account: any }) {
  return (
    <Link
      to={`/accounts/${account.username}`}
      className="flex items-center gap-2 p-2 rounded-md bg-secondary/50 hover:bg-secondary transition-colors"
    >
      {account.profile_image_url ? (
        <img src={account.profile_image_url} alt="" className="w-7 h-7 rounded-full" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-muted" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">{account.name}</div>
        <div className="text-xs text-muted-foreground">@{account.username}</div>
      </div>
      {account.followers_count > 0 && (
        <div className="text-xs text-muted-foreground">
          {account.followers_count >= 1000 
            ? `${(account.followers_count / 1000).toFixed(1)}K` 
            : account.followers_count}
        </div>
      )}
    </Link>
  );
}

function TopicsSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');

  const { data: topicsData, isLoading } = useQuery({
    queryKey: ['topics'],
    queryFn: () => fetchTopics(),
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: createTopic,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
      setNewTopicName('');
      setNewTopicDesc('');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateTopic(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['topics'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTopic,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['topics'] }),
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-xl p-6 ring-1 ring-foreground/10 shadow-xs w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground">Configure Topics</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">&times;</button>
        </div>

        {/* Add new topic */}
        <div className="mb-4 p-3 bg-secondary/50 rounded-lg">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="Topic name..."
              value={newTopicName}
              onChange={e => setNewTopicName(e.target.value)}
              className="flex-1 px-3 py-2 bg-secondary border border-border rounded text-foreground text-sm placeholder:text-muted-foreground"
            />
            <button
              onClick={() => newTopicName && createMutation.mutate({ name: newTopicName, description: newTopicDesc || undefined })}
              disabled={!newTopicName || createMutation.isPending}
              className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-muted text-primary-foreground rounded text-sm"
            >
              Add
            </button>
          </div>
          <input
            type="text"
            placeholder="Description (optional)..."
            value={newTopicDesc}
            onChange={e => setNewTopicDesc(e.target.value)}
            className="w-full px-3 py-2 bg-secondary border border-border rounded text-foreground text-sm placeholder:text-muted-foreground"
          />
        </div>

        {/* Topics list */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : (
            topicsData?.topics.map(topic => (
              <div key={topic.id} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                <button
                  onClick={() => toggleMutation.mutate({ id: topic.id, enabled: !topic.enabled })}
                  className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center ${
                    topic.enabled ? 'bg-primary border-primary' : 'border-muted-foreground'
                  }`}
                >
                  {topic.enabled && <span className="text-primary-foreground text-xs">✓</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${topic.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {topic.name}
                  </div>
                  {topic.description && (
                    <div className="text-xs text-muted-foreground truncate">{topic.description}</div>
                  )}
                </div>
                <button
                  onClick={() => deleteMutation.mutate(topic.id)}
                  className="text-destructive hover:text-destructive/80 text-sm px-2"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Only enabled topics will be used when generating summaries.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ username, account }: { username: string; account: { name: string | null; profile_image_url: string | null } }) {
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [savedReportId, setSavedReportId] = useState<number | null>(null);

  const { data: previousReports } = useQuery({
    queryKey: ['reports', 'account_summary', username],
    queryFn: () => fetchReports({ type: 'account_summary', account_username: username, limit: 5 }),
  });

  const mutation = useMutation({
    mutationFn: () => generateAccountSummary(username),
    onSuccess: (data) => {
      setSummary(data);
      setSavedReportId(null);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => createReport({
      type: 'account_summary',
      title: `AI Summary for @${username}`,
      account_username: username,
      content: { topics: summary!.topics },
    }),
    onSuccess: (data) => {
      setSavedReportId(data.id);
      queryClient.invalidateQueries({ queryKey: ['reports', 'account_summary', username] });
    },
  });

  const reportMutation = useMutation({
    mutationFn: () => generateAccountReport(username, summary!),
    onSuccess: (report) => {
      const blob = new Blob([report], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${username}-report.md`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const GearIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  if (!summary) {
    return (
      <div className="bg-card rounded-xl p-4 ring-1 ring-foreground/10 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-foreground">AI Topic Summary</h2>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
            title="Configure topics"
          >
            <GearIcon />
          </button>
        </div>
        {mutation.isPending ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Analyzing tweets and generating summary...</span>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground text-sm mb-4">
              Generate an AI-powered analysis of this account's positions on various topics.
            </p>
            <button
              onClick={() => mutation.mutate()}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            >
              Generate Summary
            </button>
          </>
        )}
        {mutation.isError && (
          <p className="text-destructive text-sm mt-2">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to generate summary'}
          </p>
        )}
        <TopicsSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      </div>
    );
  }

  const topics = Object.entries(summary.topics);

  return (
    <div className="bg-card rounded-xl p-4 ring-1 ring-foreground/10 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">AI Topic Summary</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
            title="Configure topics"
          >
            <GearIcon />
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="text-sm px-3 py-1 bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors flex items-center gap-2"
          >
            {mutation.isPending && (
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            )}
            {mutation.isPending ? 'Regenerating...' : 'Regenerate'}
          </button>
          {savedReportId ? (
            <Link
              to={`/reports/${savedReportId}`}
              className="text-sm px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View
            </Link>
          ) : (
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="text-sm px-3 py-1 bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          )}
          <button
            onClick={() => reportMutation.mutate()}
            disabled={reportMutation.isPending}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
            title="Download report"
          >
            {reportMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {topics.map(([topicName, sentiment]) => (
          <div
            key={topicName}
            className={`p-3 rounded-lg ring-1 ${
              sentiment.noticing
                ? 'ring-green-800/50 bg-green-900/10'
                : 'ring-foreground/10 bg-secondary/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  sentiment.noticing ? 'bg-green-500' : 'bg-muted-foreground'
                }`}
              />
              <span className="text-sm font-medium text-foreground">{topicName}</span>
            </div>
            <p className="text-foreground/80 text-sm">{sentiment.comment}</p>
            {sentiment.tweets && sentiment.tweets.length > 0 && (
              <div className="mt-2 space-y-2">
                {sentiment.tweets.map((tweet) => (
                  <TweetCard
                    key={tweet.id}
                    id={String(tweet.id)}
                    text={tweet.text}
                    likeCount={tweet.like_count}
                    retweetCount={tweet.retweet_count}
                    author={{
                      username,
                      name: account.name || undefined,
                      profileImageUrl: account.profile_image_url || undefined,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {previousReports && previousReports.reports.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h3 className="text-xs font-medium text-muted-foreground mb-2">Previous Summaries</h3>
          <div className="space-y-1">
            {previousReports.reports.map((r) => (
              <Link
                key={r.id}
                to={`/reports/${r.id}`}
                className="block text-sm text-foreground hover:text-primary truncate"
              >
                {r.title || 'Untitled'} <span className="text-muted-foreground text-xs">{r.created_at && new Date(r.created_at).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      
      <TopicsSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

function FreeformCard({ username }: { username: string }) {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<FreeformResponse | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState('');
  
  const { data: previousReports } = useQuery({
    queryKey: ['reports', 'freeform', username],
    queryFn: () => fetchReports({ type: 'freeform', account_username: username, limit: 5 }),
  });
  
  const mutation = useMutation({
    mutationFn: () => generateFreeformSummary(username, prompt),
    onSuccess: (data) => {
      setResult(data);
      setCurrentPrompt(prompt);
    },
  });
  
  const [savedReportId, setSavedReportId] = useState<number | null>(null);
  
  const saveMutation = useMutation({
    mutationFn: () => createReport({
      type: 'freeform',
      title: currentPrompt.slice(0, 100),
      account_username: username,
      content: { report: result!.report, referenced_tweets: result!.referenced_tweets, prompt: currentPrompt },
    }),
    onSuccess: (data) => {
      setSavedReportId(data.id);
      queryClient.invalidateQueries({ queryKey: ['reports', 'freeform', username] });
    },
  });

  const downloadMarkdown = () => {
    if (!result) return;
    const blob = new Blob([result.report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${username}-freeform.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Replace tweet URLs with placeholders and render inline
  const renderReportWithTweets = () => {
    if (!result) return null;
    
    const tweetMap = new Map<string, FreeformTweet>();
    for (const tweet of result.referenced_tweets) {
      tweetMap.set(tweet.id, tweet);
    }
    
    // Split report by tweet URLs and render
    const tweetUrlPattern = /https?:\/\/(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let key = 0;
    
    const reportText = result.report;
    while ((match = tweetUrlPattern.exec(reportText)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(<span key={key++}>{reportText.slice(lastIndex, match.index)}</span>);
      }
      
      const tweetId = match[1];
      const tweet = tweetMap.get(tweetId);
      
      if (tweet) {
        parts.push(
          <div key={key++} className="my-3">
            <TweetCard
              id={tweet.id}
              text={tweet.text}
              likeCount={tweet.like_count}
              retweetCount={tweet.retweet_count}
              impressionCount={tweet.impression_count}
              author={tweet.author_username ? {
                username: tweet.author_username,
                name: tweet.author_name || undefined,
                profileImageUrl: tweet.author_profile_image || undefined,
              } : undefined}
            />
          </div>
        );
      } else {
        // Keep the URL as a link if we couldn't fetch the tweet
        parts.push(
          <a key={key++} href={match[0]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {match[0]}
          </a>
        );
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < reportText.length) {
      parts.push(<span key={key++}>{reportText.slice(lastIndex)}</span>);
    }
    
    return parts;
  };

  return (
    <div className="bg-card rounded-xl p-4 ring-1 ring-foreground/10 shadow-xs">
      <h2 className="text-sm font-medium text-foreground mb-3">Freeform Analysis</h2>
      
      {!result ? (
        <div className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask anything about this account... e.g., 'What are their views on Bitcoin?' or 'Summarize their political positions'"
            rows={3}
            className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground resize-none"
          />
          <button
            onClick={() => mutation.mutate()}
            disabled={!prompt.trim() || mutation.isPending}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {mutation.isPending && (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            )}
            {mutation.isPending ? 'Analyzing...' : 'Analyze'}
          </button>
          {mutation.isError && (
            <p className="text-destructive text-sm">
              {mutation.error instanceof Error ? mutation.error.message : 'Failed to analyze'}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setResult(null)}
              className="text-sm px-3 py-1 bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors"
            >
              New Query
            </button>
            {savedReportId ? (
              <Link
                to={`/reports/${savedReportId}`}
                className="text-sm px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View
              </Link>
            ) : (
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="text-sm px-3 py-1 bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            )}
            <button
              onClick={downloadMarkdown}
              className="text-sm px-3 py-1 bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors flex items-center gap-1"
            >
              <FileDown className="w-3.5 h-3.5" />
              Markdown
            </button>
          </div>
          <div className="prose prose-sm prose-invert max-w-none text-foreground/90 whitespace-pre-wrap">
            {renderReportWithTweets()}
          </div>
        </div>
      )}
      
      {previousReports && previousReports.reports.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h3 className="text-xs font-medium text-muted-foreground mb-2">Previous Reports</h3>
          <div className="space-y-1">
            {previousReports.reports.map((r) => (
              <Link
                key={r.id}
                to={`/reports/${r.id}`}
                className="block text-sm text-foreground hover:text-primary truncate"
              >
                {r.title || 'Untitled'} <span className="text-muted-foreground text-xs">{r.created_at && new Date(r.created_at).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountDetail() {
  const { username } = useParams<{ username: string }>();
  const [tweetSort, setTweetSort] = useState<'latest' | 'top'>('latest');
  const [followingSort, setFollowingSort] = useState<'recent' | 'top'>('recent');
  const [followersSort, setFollowersSort] = useState<'recent' | 'top'>('recent');

  const { data: account, isLoading, error } = useQuery({
    queryKey: ['account', username],
    queryFn: () => fetchAccount(username!),
    enabled: !!username,
  });

  const { data: tweets } = useQuery({
    queryKey: ['account-tweets', username, tweetSort],
    queryFn: () => fetchAccountTweets(username!, tweetSort),
    enabled: !!username,
  });

  const { data: following } = useQuery({
    queryKey: ['account-following', username, followingSort],
    queryFn: () => fetchAccountFollowing(username!, followingSort),
    enabled: !!username,
  });

  const { data: followers } = useQuery({
    queryKey: ['account-followers', username, followersSort],
    queryFn: () => fetchAccountFollowers(username!, followersSort),
    enabled: !!username,
  });

  const { data: analysis } = useQuery({
    queryKey: ['account-analysis', username],
    queryFn: () => fetchAccountAnalysis(username!),
    enabled: !!username,
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  if (error) return <div className="text-destructive">Account not found</div>;
  if (!account) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        {account.profile_image_url ? (
          <img
            src={account.profile_image_url.replace('_normal', '_400x400')}
            alt={account.username}
            className="w-20 h-20 rounded-full"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-muted" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{account.name}</h1>
            {account.is_seed && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-primary text-primary-foreground">SEED</span>
            )}
            {account.verified && <span className="text-primary">✓</span>}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1.5">
            @{account.username}
            <a
              href={`https://x.com/${account.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title="View on X"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          {account.description && (
            <p className="text-sm text-foreground/80 mt-1">{account.description}</p>
          )}
          {account.location && (
            <p className="text-xs text-muted-foreground mt-1">{account.location}</p>
          )}
          {account.twitter_created_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Joined {new Date(account.twitter_created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card rounded-xl p-3 text-center ring-1 ring-foreground/10">
          <div className="text-xl font-bold text-foreground">
            {account.followers_count.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Followers</div>
        </div>
        <div className="bg-card rounded-xl p-3 text-center ring-1 ring-foreground/10">
          <div className="text-xl font-bold text-foreground">
            {account.following_count.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Following</div>
        </div>
        <div className="bg-card rounded-xl p-3 text-center ring-1 ring-foreground/10">
          <div className="text-xl font-bold text-foreground">
            {account.tweet_count.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Tweets</div>
        </div>
        <div className="bg-card rounded-xl p-3 text-center ring-1 ring-foreground/10">
          <div className="text-xl font-bold text-foreground">
            {account.like_count.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Likes</div>
        </div>
      </div>

      {/* Camp Analysis */}
      {analysis?.scores && analysis.scores.length > 0 && (
        <div className="bg-card rounded-xl p-4 ring-1 ring-foreground/10 shadow-xs">
          <h2 className="text-sm font-medium text-foreground mb-3">Camp Analysis</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {analysis.scores.map((score) => (
              <div
                key={score.camp_id}
                className="p-3 rounded-lg ring-1 ring-foreground/10 bg-secondary/30"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{score.camp_name}</span>
                  <span className="text-xl font-bold text-primary">
                    {score.score.toFixed(1)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Bio: {score.bio_score.toFixed(1)} | Tweets: {score.tweet_score.toFixed(1)}
                </div>
                {(score.bio_matches.length > 0 || score.tweet_matches.length > 0) && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <div className="flex flex-wrap gap-1">
                      {score.bio_matches.map((m, i) => (
                        <span key={`bio-${i}`} className="px-1.5 py-0.5 text-xs rounded bg-secondary text-foreground">
                          {m.term} x{m.count}
                        </span>
                      ))}
                      {score.tweet_matches.slice(0, 5).map((m, i) => (
                        <span key={`tweet-${i}`} className="px-1.5 py-0.5 text-xs rounded bg-secondary text-foreground">
                          {m.term} x{m.count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Topic Summary */}
      <SummaryCard username={username!} account={account} />

      {/* Freeform Analysis */}
      <FreeformCard username={username!} />

      {/* Content Grid */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Tweets */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Tweets ({tweets?.total || 0})</h2>
            <div className="flex gap-1 bg-secondary rounded-md p-0.5">
              <button
                onClick={() => setTweetSort('latest')}
                className={`px-2 py-1 text-xs rounded ${
                  tweetSort === 'latest' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Latest
              </button>
              <button
                onClick={() => setTweetSort('top')}
                className={`px-2 py-1 text-xs rounded ${
                  tweetSort === 'top' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Top
              </button>
            </div>
          </div>
          <div className="p-3">
            {tweets?.tweets.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tweets scraped yet</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {tweets?.tweets.map((tweet) => (
                  <TweetCard
                    key={tweet.id}
                    id={String(tweet.id)}
                    text={tweet.text}
                    likeCount={tweet.like_count}
                    retweetCount={tweet.retweet_count}
                    impressionCount={tweet.impression_count}
                    author={{
                      username: account.username,
                      name: account.name || undefined,
                      profileImageUrl: account.profile_image_url || undefined,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Following */}
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 shadow-xs overflow-hidden">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Following ({following?.total || 0} in DB)</h2>
            <div className="flex items-center gap-2">
              <div className="flex text-xs">
                <button
                  onClick={() => setFollowingSort('recent')}
                  className={`px-2 py-1 rounded-l ${followingSort === 'recent' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Recent
                </button>
                <button
                  onClick={() => setFollowingSort('top')}
                  className={`px-2 py-1 rounded-r ${followingSort === 'top' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Top
                </button>
              </div>
            </div>
          </div>
          <div className="p-3">
            {following?.accounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">None in database</p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {following?.accounts.map((a) => (
                  <AccountCard key={a.id} account={a} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Followers */}
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 shadow-xs overflow-hidden">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Followers ({followers?.total || 0} in DB)</h2>
            <div className="flex items-center gap-2">
              <div className="flex text-xs">
                <button
                  onClick={() => setFollowersSort('recent')}
                  className={`px-2 py-1 rounded-l ${followersSort === 'recent' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Recent
                </button>
                <button
                  onClick={() => setFollowersSort('top')}
                  className={`px-2 py-1 rounded-r ${followersSort === 'top' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Top
                </button>
              </div>
            </div>
          </div>
          <div className="p-3">
            {followers?.accounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">None in database</p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {followers?.accounts.map((a) => (
                  <AccountCard key={a.id} account={a} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
