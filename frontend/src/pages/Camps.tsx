import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchCamps, fetchCampLeaderboard, analyzeAccounts, createCamp } from '../api';
import { useState } from 'react';

function CampCard({ camp }: { camp: { id: number; name: string; description: string | null; color: string } }) {
  const { data: leaderboard } = useQuery({
    queryKey: ['leaderboard', camp.id],
    queryFn: () => fetchCampLeaderboard(camp.id),
  });

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-800" style={{ borderLeftColor: camp.color, borderLeftWidth: 4 }}>
        <h2 className="text-xl font-bold text-white">{camp.name}</h2>
        <p className="text-gray-400 text-sm mt-1">{camp.description || 'No description'}</p>
      </div>
      
      <div className="p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Top Accounts</h3>
        {!leaderboard?.entries.length ? (
          <p className="text-gray-500 text-sm">No accounts analyzed yet</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.entries.slice(0, 5).map((entry) => (
              <Link
                key={entry.account.id}
                to={`/accounts/${entry.account.username}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <span className="text-gray-500 w-5">{entry.rank}.</span>
                {entry.account.profile_image_url ? (
                  <img src={entry.account.profile_image_url} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-700" />
                )}
                <span className="text-white flex-1 truncate">@{entry.account.username}</span>
                <span className="text-sm font-medium" style={{ color: camp.color }}>
                  {entry.score.toFixed(1)}
                </span>
              </Link>
            ))}
          </div>
        )}
        
        <Link
          to={`/camps/${camp.id}`}
          className="block mt-4 text-center text-sm text-blue-400 hover:text-blue-300"
        >
          Manage keywords →
        </Link>
      </div>
    </div>
  );
}

const COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function Camps() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCamp, setNewCamp] = useState({ name: '', description: '', color: COLORS[0] });

  const { data, isLoading } = useQuery({
    queryKey: ['camps'],
    queryFn: fetchCamps,
  });

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeAccounts(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: createCamp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['camps'] });
      setShowCreateForm(false);
      setNewCamp({ name: '', description: '', color: COLORS[0] });
    },
  });

  const handleCreateCamp = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCamp.name) {
      createMutation.mutate(newCamp);
    }
  };

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Camps</h1>
          <p className="text-gray-400 mt-1">
            Create categories to analyze accounts based on keywords
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
          >
            + New Camp
          </button>
          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium transition-colors"
          >
            {analyzeMutation.isPending ? 'Analyzing...' : 'Re-analyze All'}
          </button>
        </div>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreateCamp} className="bg-gray-900 rounded-xl p-6 border border-gray-800 space-y-4">
          <h2 className="text-lg font-semibold text-white">Create New Camp</h2>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={newCamp.name}
              onChange={(e) => setNewCamp({ ...newCamp, name: e.target.value })}
              placeholder="e.g., Republican, Pro-Crypto, Sports Fan"
              className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description (optional)</label>
            <input
              type="text"
              value={newCamp.description}
              onChange={(e) => setNewCamp({ ...newCamp, description: e.target.value })}
              placeholder="What does this camp represent?"
              className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">Color</label>
            <div className="flex gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewCamp({ ...newCamp, color })}
                  className={`w-8 h-8 rounded-full border-2 ${newCamp.color === color ? 'border-white' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!newCamp.name || createMutation.isPending}
              className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-medium"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Camp'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {analyzeMutation.isSuccess && (
        <div className="bg-green-900/30 border border-green-800 rounded-lg p-4">
          <p className="text-green-400">
            Analyzed {analyzeMutation.data.analyzed} accounts, created {analyzeMutation.data.total_scores} scores
          </p>
        </div>
      )}

      {data?.camps.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center">
          <p className="text-gray-400 mb-4">No camps yet. Create your first camp to start categorizing accounts!</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium"
          >
            + Create First Camp
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {data?.camps.map((camp) => (
            <CampCard key={camp.id} camp={camp} />
          ))}
        </div>
      )}
    </div>
  );
}
