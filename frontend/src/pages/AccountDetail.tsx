import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import {
  fetchAccount,
  fetchAccountTweets,
  fetchAccountFollowing,
  fetchAccountFollowers,
  fetchAccountAnalysis,
  generateAccountSummary,
  fetchTopics,
  createTopic,
  updateTopic,
  deleteTopic,
} from '../api';
import type { AccountSummary, Topic } from '../api';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl p-4 ring-1 ring-foreground/10 shadow-xs">
      <h2 className="text-sm font-medium text-foreground mb-3">{title}</h2>
      {children}
    </div>
  );
}

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
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Configure Topics</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>

        {/* Add new topic */}
        <div className="mb-4 p-3 bg-gray-800 rounded-lg">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="Topic name..."
              value={newTopicName}
              onChange={e => setNewTopicName(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
            />
            <button
              onClick={() => newTopicName && createMutation.mutate({ name: newTopicName, description: newTopicDesc || undefined })}
              disabled={!newTopicName || createMutation.isPending}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded text-sm"
            >
              Add
            </button>
          </div>
          <input
            type="text"
            placeholder="Description (optional)..."
            value={newTopicDesc}
            onChange={e => setNewTopicDesc(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
          />
        </div>

        {/* Topics list */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : (
            topicsData?.topics.map(topic => (
              <div key={topic.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                <button
                  onClick={() => toggleMutation.mutate({ id: topic.id, enabled: !topic.enabled })}
                  className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center ${
                    topic.enabled ? 'bg-purple-600 border-purple-600' : 'border-gray-500'
                  }`}
                >
                  {topic.enabled && <span className="text-white text-xs">✓</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${topic.enabled ? 'text-white' : 'text-gray-500'}`}>
                    {topic.name}
                  </div>
                  {topic.description && (
                    <div className="text-xs text-gray-500 truncate">{topic.description}</div>
                  )}
                </div>
                <button
                  onClick={() => deleteMutation.mutate(topic.id)}
                  className="text-red-400 hover:text-red-300 text-sm px-2"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-500">
            Only enabled topics will be used when generating summaries.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ username }: { username: string }) {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const mutation = useMutation({
    mutationFn: () => generateAccountSummary(username),
    onSuccess: (data) => setSummary(data),
  });

  const GearIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  if (!summary) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">AI Topic Summary</h2>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="Configure topics"
          >
            <GearIcon />
          </button>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          Generate an AI-powered analysis of this account's positions on various topics.
        </p>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {mutation.isPending ? 'Generating...' : 'Generate Summary'}
        </button>
        {mutation.isError && (
          <p className="text-red-400 text-sm mt-2">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to generate summary'}
          </p>
        )}
        <TopicsSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      </div>
    );
  }

  const topics = Object.entries(summary.topics);

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">AI Topic Summary</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="Configure topics"
          >
            <GearIcon />
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="text-sm px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          >
            {mutation.isPending ? 'Regenerating...' : 'Regenerate'}
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {topics.map(([topicName, sentiment]) => (
          <div
            key={topicName}
            className={`p-4 rounded-lg border ${
              sentiment.noticing
                ? 'border-green-800/50 bg-green-900/10'
                : 'border-gray-700/50 bg-gray-800/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  sentiment.noticing ? 'bg-green-500' : 'bg-gray-500'
                }`}
              />
              <span className="font-medium text-white">{topicName}</span>
            </div>
            <p className="text-gray-300 text-sm">{sentiment.comment}</p>
            {sentiment.examples.length > 0 && (
              <div className="mt-2 space-y-1">
                {sentiment.examples.map((example, i) => (
                  <p key={i} className="text-xs text-gray-500 italic pl-3 border-l border-gray-700">
                    "{example}"
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <TopicsSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

export default function AccountDetail() {
  const { username } = useParams<{ username: string }>();
  const [tweetSort, setTweetSort] = useState<'latest' | 'top'>('latest');

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
    queryKey: ['account-following', username],
    queryFn: () => fetchAccountFollowing(username!),
    enabled: !!username,
  });

  const { data: followers } = useQuery({
    queryKey: ['account-followers', username],
    queryFn: () => fetchAccountFollowers(username!),
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
          <div className="text-sm text-muted-foreground">@{account.username}</div>
          {account.description && (
            <p className="text-sm text-foreground/80 mt-1">{account.description}</p>
          )}
          {account.location && (
            <p className="text-xs text-muted-foreground mt-1">{account.location}</p>
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
      <SummaryCard username={username!} />

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
                  <div key={tweet.id} className="p-2 rounded-md bg-secondary/50 text-xs">
                    <p className="text-foreground/80">{tweet.text}</p>
                    <div className="flex gap-3 mt-1.5 text-muted-foreground">
                      <span>👁️ {tweet.impression_count.toLocaleString()}</span>
                      <span>{tweet.like_count} likes</span>
                      <span>{tweet.retweet_count} rt</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Following */}
        <Section title={`Following (${following?.total || 0} in DB)`}>
          {following?.accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">None in database</p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {following?.accounts.map((a) => (
                <AccountCard key={a.id} account={a} />
              ))}
            </div>
          )}
        </Section>

        {/* Followers */}
        <Section title={`Followers (${followers?.total || 0} in DB)`}>
          {followers?.accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">None in database</p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {followers?.accounts.map((a) => (
                <AccountCard key={a.id} account={a} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
