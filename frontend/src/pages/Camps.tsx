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
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 shadow-xs overflow-hidden">
      <div className="p-3 border-b border-border" style={{ borderLeftColor: camp.color, borderLeftWidth: 4 }}>
        <h2 className="text-base font-medium text-foreground">{camp.name}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{camp.description || 'No description'}</p>
      </div>

      <div className="p-3">
        <h3 className="text-xs font-medium text-muted-foreground mb-2">Top Accounts</h3>
        {!leaderboard?.entries.length ? (
          <p className="text-xs text-muted-foreground">No accounts analyzed yet</p>
        ) : (
          <div className="space-y-1">
            {leaderboard.entries.slice(0, 5).map((entry) => (
              <Link
                key={entry.account.id}
                to={`/accounts/${entry.account.username}`}
                className="flex items-center gap-2 p-1.5 rounded-md hover:bg-secondary transition-colors"
              >
                <span className="text-xs text-muted-foreground w-4">{entry.rank}.</span>
                {entry.account.profile_image_url ? (
                  <img src={entry.account.profile_image_url} alt="" className="w-5 h-5 rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-muted" />
                )}
                <span className="text-xs text-foreground flex-1 truncate">@{entry.account.username}</span>
                <span className="text-xs font-medium text-primary">
                  {entry.score.toFixed(1)}
                </span>
              </Link>
            ))}
          </div>
        )}

        <Link
          to={`/camps/${camp.id}`}
          className="block mt-3 text-center text-xs text-primary hover:text-primary/80"
        >
          Manage keywords
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

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Camps</h1>
          <p className="text-sm text-muted-foreground">
            Create categories to analyze accounts based on keywords
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="h-8 px-2.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
          >
            + New Camp
          </button>
          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="h-8 px-2.5 rounded-md bg-primary hover:bg-primary/80 disabled:bg-muted text-primary-foreground text-sm font-medium transition-colors"
          >
            {analyzeMutation.isPending ? 'Analyzing...' : 'Re-analyze All'}
          </button>
        </div>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreateCamp} className="bg-card rounded-xl p-4 ring-1 ring-foreground/10 space-y-3">
          <h2 className="text-sm font-medium text-foreground">Create New Camp</h2>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              value={newCamp.name}
              onChange={(e) => setNewCamp({ ...newCamp, name: e.target.value })}
              placeholder="e.g., Republican, Pro-Crypto"
              className="w-full h-9 px-2.5 rounded-md bg-input/30 border border-input text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Description (optional)</label>
            <input
              type="text"
              value={newCamp.description}
              onChange={(e) => setNewCamp({ ...newCamp, description: e.target.value })}
              placeholder="What does this camp represent?"
              className="w-full h-9 px-2.5 rounded-md bg-input/30 border border-input text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Color</label>
            <div className="flex gap-1.5">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewCamp({ ...newCamp, color })}
                  className={`w-6 h-6 rounded-full border-2 ${newCamp.color === color ? 'border-foreground' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-1.5">
            <button
              type="submit"
              disabled={!newCamp.name || createMutation.isPending}
              className="h-8 px-2.5 rounded-md bg-green-600 hover:bg-green-700 disabled:bg-muted text-white text-sm font-medium"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Camp'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="h-8 px-2.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {analyzeMutation.isSuccess && (
        <div className="bg-green-500/10 ring-1 ring-green-500/20 rounded-lg p-3">
          <p className="text-sm text-green-400">
            Analyzed {analyzeMutation.data.analyzed} accounts, created {analyzeMutation.data.total_scores} scores
          </p>
        </div>
      )}

      {data?.camps.length === 0 ? (
        <div className="bg-card rounded-xl p-6 ring-1 ring-foreground/10 text-center">
          <p className="text-sm text-muted-foreground mb-3">No camps yet. Create your first camp!</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="h-8 px-2.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
          >
            + Create First Camp
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data?.camps.map((camp) => (
            <CampCard key={camp.id} camp={camp} />
          ))}
        </div>
      )}
    </div>
  );
}
