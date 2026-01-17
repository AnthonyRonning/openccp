import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import {
  fetchAccount,
  fetchAccountTweets,
  fetchAccountFollowing,
  fetchAccountFollowers,
  fetchAccountAnalysis,
  generateAccountSummary,
} from '../api';
import type { AccountSummary } from '../api';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}

function AccountCard({ account }: { account: any }) {
  return (
    <Link
      to={`/accounts/${account.username}`}
      className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors"
    >
      {account.profile_image_url ? (
        <img src={account.profile_image_url} alt="" className="w-8 h-8 rounded-full" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gray-700" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{account.name}</div>
        <div className="text-xs text-gray-400">@{account.username}</div>
      </div>
    </Link>
  );
}

function SummaryCard({ username }: { username: string }) {
  const [summary, setSummary] = useState<AccountSummary | null>(null);

  const mutation = useMutation({
    mutationFn: () => generateAccountSummary(username),
    onSuccess: (data) => setSummary(data),
  });

  if (!summary) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-4">AI Topic Summary</h2>
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
      </div>
    );
  }

  const topics = Object.entries(summary.topics);

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">AI Topic Summary</h2>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="text-sm px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
        >
          {mutation.isPending ? 'Regenerating...' : 'Regenerate'}
        </button>
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
    </div>
  );
}

export default function AccountDetail() {
  const { username } = useParams<{ username: string }>();

  const { data: account, isLoading, error } = useQuery({
    queryKey: ['account', username],
    queryFn: () => fetchAccount(username!),
    enabled: !!username,
  });

  const { data: tweets } = useQuery({
    queryKey: ['account-tweets', username],
    queryFn: () => fetchAccountTweets(username!),
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

  if (isLoading) return <div className="text-gray-400">Loading...</div>;
  if (error) return <div className="text-red-400">Account not found</div>;
  if (!account) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-6">
        {account.profile_image_url ? (
          <img
            src={account.profile_image_url.replace('_normal', '_400x400')}
            alt={account.username}
            className="w-24 h-24 rounded-full"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-gray-700" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{account.name}</h1>
            {account.is_seed && (
              <span className="px-2 py-1 text-xs rounded bg-purple-600 text-white">SEED</span>
            )}
            {account.verified && <span className="text-blue-400 text-xl">✓</span>}
          </div>
          <div className="text-gray-400">@{account.username}</div>
          {account.description && (
            <p className="text-gray-300 mt-2">{account.description}</p>
          )}
          {account.location && (
            <p className="text-gray-500 text-sm mt-1">📍 {account.location}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
          <div className="text-2xl font-bold text-white">
            {account.followers_count.toLocaleString()}
          </div>
          <div className="text-sm text-gray-400">Followers</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
          <div className="text-2xl font-bold text-white">
            {account.following_count.toLocaleString()}
          </div>
          <div className="text-sm text-gray-400">Following</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
          <div className="text-2xl font-bold text-white">
            {account.tweet_count.toLocaleString()}
          </div>
          <div className="text-sm text-gray-400">Tweets</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
          <div className="text-2xl font-bold text-white">
            {account.like_count.toLocaleString()}
          </div>
          <div className="text-sm text-gray-400">Likes</div>
        </div>
      </div>

      {/* Camp Analysis */}
      {analysis?.scores && analysis.scores.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-lg font-semibold text-white mb-4">Camp Analysis</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {analysis.scores.map((score) => (
              <div
                key={score.camp_id}
                className="p-4 rounded-lg border"
                style={{ borderColor: score.camp_color + '40', backgroundColor: score.camp_color + '10' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white">{score.camp_name}</span>
                  <span className="text-2xl font-bold" style={{ color: score.camp_color }}>
                    {score.score.toFixed(1)}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mb-2">
                  Bio: {score.bio_score.toFixed(1)} | Tweets: {score.tweet_score.toFixed(1)}
                </div>
                {(score.bio_matches.length > 0 || score.tweet_matches.length > 0) && (
                  <div className="mt-2 pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-500">Matches:</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {score.bio_matches.map((m, i) => (
                        <span key={`bio-${i}`} className="px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-300">
                          {m.term} ×{m.count}
                        </span>
                      ))}
                      {score.tweet_matches.slice(0, 5).map((m, i) => (
                        <span key={`tweet-${i}`} className="px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-300">
                          {m.term} ×{m.count}
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
      <div className="grid md:grid-cols-3 gap-6">
        {/* Tweets */}
        <Section title={`Tweets (${tweets?.total || 0} in DB)`}>
          {tweets?.tweets.length === 0 ? (
            <p className="text-gray-500 text-sm">No tweets scraped yet</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {tweets?.tweets.map((tweet) => (
                <div key={tweet.id} className="p-3 rounded-lg bg-gray-800/50 text-sm">
                  <p className="text-gray-300">{tweet.text}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>❤️ {tweet.like_count}</span>
                    <span>🔁 {tweet.retweet_count}</span>
                    <span>💬 {tweet.reply_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Following */}
        <Section title={`Following (${following?.total || 0} in DB)`}>
          {following?.accounts.length === 0 ? (
            <p className="text-gray-500 text-sm">None in database</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {following?.accounts.map((a) => (
                <AccountCard key={a.id} account={a} />
              ))}
            </div>
          )}
        </Section>

        {/* Followers */}
        <Section title={`Followers (${followers?.total || 0} in DB)`}>
          {followers?.accounts.length === 0 ? (
            <p className="text-gray-500 text-sm">None in database</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
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
