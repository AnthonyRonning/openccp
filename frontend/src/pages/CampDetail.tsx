import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { fetchCamp, fetchCampLeaderboard, fetchCampTopTweets, addKeyword, deleteKeyword, deleteCamp } from '../api';

export default function CampDetail() {
  const { id } = useParams<{ id: string }>();
  const campId = parseInt(id!, 10);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [newKeyword, setNewKeyword] = useState('');
  const [newWeight, setNewWeight] = useState('1.0');
  const [newSentiment, setNewSentiment] = useState<'positive' | 'negative' | 'any'>('any');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'tweets'>('leaderboard');

  const { data: camp, isLoading } = useQuery({
    queryKey: ['camp', campId],
    queryFn: () => fetchCamp(campId),
    enabled: !isNaN(campId),
  });

  const { data: leaderboard } = useQuery({
    queryKey: ['leaderboard', campId],
    queryFn: () => fetchCampLeaderboard(campId),
    enabled: !isNaN(campId),
  });

  const { data: topTweets } = useQuery({
    queryKey: ['camp-tweets', campId],
    queryFn: () => fetchCampTopTweets(campId),
    enabled: !isNaN(campId),
  });

  const addKeywordMutation = useMutation({
    mutationFn: (data: { term: string; weight: number; expected_sentiment: 'positive' | 'negative' | 'any' }) => addKeyword(campId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['camp', campId] });
      setNewKeyword('');
      setNewWeight('1.0');
      setNewSentiment('any');
    },
  });

  const deleteKeywordMutation = useMutation({
    mutationFn: (keywordId: number) => deleteKeyword(campId, keywordId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['camp', campId] }),
  });

  const deleteCampMutation = useMutation({
    mutationFn: () => deleteCamp(campId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['camps'] });
      navigate('/camps');
    },
  });

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newKeyword.trim()) {
      addKeywordMutation.mutate({ 
        term: newKeyword.trim(), 
        weight: parseFloat(newWeight) || 1.0,
        expected_sentiment: newSentiment,
      });
    }
  };

  if (isLoading) return <div className="text-gray-400">Loading...</div>;
  if (!camp) return <div className="text-red-400">Camp not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-4 h-12 rounded" style={{ backgroundColor: camp.color }} />
          <div>
            <h1 className="text-3xl font-bold text-white">{camp.name}</h1>
            <p className="text-gray-400 mt-1">{camp.description || 'No description'}</p>
          </div>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
        >
          Delete Camp
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4">
          <p className="text-red-400 mb-3">Delete this camp? All keywords and scores will be removed.</p>
          <div className="flex gap-2">
            <button
              onClick={() => deleteCampMutation.mutate()}
              className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main content with tabs */}
        <div className="md:col-span-2 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'leaderboard' 
                  ? 'text-white border-b-2 border-blue-500' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Top Accounts ({leaderboard?.entries.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('tweets')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'tweets' 
                  ? 'text-white border-b-2 border-blue-500' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Top Tweets ({topTweets?.tweets.length || 0})
            </button>
          </div>

          {/* Leaderboard Tab */}
          {activeTab === 'leaderboard' && (
            <div className="divide-y divide-gray-800">
              {leaderboard?.entries.length === 0 ? (
                <div className="p-4 text-gray-500">No accounts with scores yet. Add keywords and run analysis!</div>
              ) : (
                leaderboard?.entries.map((entry) => (
                  <Link
                    key={entry.account.id}
                    to={`/accounts/${entry.account.username}`}
                    className="flex items-center gap-4 p-4 hover:bg-gray-800/50 transition-colors"
                  >
                    <span className="text-2xl font-bold text-gray-500 w-8">{entry.rank}</span>
                    {entry.account.profile_image_url ? (
                      <img src={entry.account.profile_image_url} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-700" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">
                        {entry.account.name || entry.account.username}
                      </div>
                      <div className="text-sm text-gray-400">
                        @{entry.account.username} · {entry.account.followers_count.toLocaleString()} followers
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold" style={{ color: camp.color }}>
                        {entry.score.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-500">
                        bio: {entry.bio_score.toFixed(1)} / tweets: {entry.tweet_score.toFixed(1)}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}

          {/* Tweets Tab */}
          {activeTab === 'tweets' && (
            <div className="divide-y divide-gray-800">
              {topTweets?.tweets.length === 0 ? (
                <div className="p-4 text-gray-500">No matching tweets found. Run analysis to populate tweet matches!</div>
              ) : (
                topTweets?.tweets.map((tweet) => (
                  <div key={tweet.tweet_id} className="p-4 hover:bg-gray-800/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <Link to={`/accounts/${tweet.username}`}>
                        {tweet.profile_image_url ? (
                          <img src={tweet.profile_image_url} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-700" />
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link to={`/accounts/${tweet.username}`} className="font-medium text-white hover:underline">
                            {tweet.name || tweet.username}
                          </Link>
                          <span className="text-gray-500">@{tweet.username}</span>
                          <span className="text-gray-600">·</span>
                          <span className="text-gray-500 text-sm">{tweet.followers_count.toLocaleString()} followers</span>
                        </div>
                        <p className="text-gray-300 mt-1 whitespace-pre-wrap">{tweet.text}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-xs text-gray-500">❤️ {tweet.like_count}</span>
                          <span className="text-xs text-gray-500">🔁 {tweet.retweet_count}</span>
                          <div className="flex gap-1">
                            {tweet.matched_keywords.map((kw) => (
                              <span 
                                key={kw} 
                                className="px-2 py-0.5 text-xs rounded"
                                style={{ backgroundColor: camp.color + '30', color: camp.color }}
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold" style={{ color: camp.color }}>
                          {tweet.score.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Keywords sidebar */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden h-fit">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold text-white">Keywords ({camp.keywords.length})</h2>
          </div>
          
          <form onSubmit={handleAddKeyword} className="p-4 border-b border-gray-800 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="Add keyword..."
                className="flex-1 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <input
                type="number"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                step="0.5"
                min="0.5"
                max="5"
                className="w-16 px-2 py-2 rounded bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-blue-500"
                title="Weight (higher = stronger signal)"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={newSentiment}
                onChange={(e) => setNewSentiment(e.target.value as 'positive' | 'negative' | 'any')}
                className="flex-1 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="any">Any sentiment</option>
                <option value="positive">Positive sentiment</option>
                <option value="negative">Negative sentiment</option>
              </select>
              <button
                type="submit"
                disabled={!newKeyword.trim() || addKeywordMutation.isPending}
                className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-700"
              >
                Add
              </button>
            </div>
          </form>

          <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
            {camp.keywords.length === 0 ? (
              <p className="text-gray-500 text-sm">No keywords yet. Add some above!</p>
            ) : (
              camp.keywords.map((kw) => (
                <div
                  key={kw.id}
                  className="flex items-center justify-between p-2 rounded bg-gray-800/50 group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-white">{kw.term}</span>
                    {kw.expected_sentiment !== 'any' && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        kw.expected_sentiment === 'positive' 
                          ? 'bg-green-900/50 text-green-400' 
                          : 'bg-red-900/50 text-red-400'
                      }`}>
                        {kw.expected_sentiment === 'positive' ? '+' : '-'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">×{kw.weight}</span>
                    <button
                      onClick={() => deleteKeywordMutation.mutate(kw.id)}
                      className="text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-300 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
