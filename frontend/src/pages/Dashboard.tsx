import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchStats, fetchAccounts } from '../api';

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl p-4 bg-card ring-1 ring-foreground/10 shadow-xs">
      <div className="text-3xl font-bold text-foreground">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });

  const { data: seeds } = useQuery({
    queryKey: ['seeds'],
    queryFn: () => fetchAccounts(true),
  });

  if (statsLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Twitter/X account network analysis</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Accounts" value={stats?.accounts || 0} />
        <StatCard label="Seeds" value={stats?.seeds || 0} />
        <StatCard label="Tweets" value={stats?.tweets || 0} />
        <StatCard label="Connections" value={stats?.follows || 0} />
        <StatCard label="Keywords" value={stats?.keywords || 0} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl p-4 ring-1 ring-foreground/10 shadow-xs">
          <h2 className="text-base font-medium text-foreground mb-3">Seed Accounts</h2>
          {seeds?.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No seed accounts yet.{' '}
              <Link to="/scrape" className="text-primary hover:underline">
                Add one
              </Link>
            </p>
          ) : (
            <div className="space-y-2">
              {seeds?.accounts.map((account) => (
                <Link
                  key={account.id}
                  to={`/accounts/${account.username}`}
                  className="flex items-center gap-2.5 p-2 rounded-md bg-secondary/50 hover:bg-secondary transition-colors"
                >
                  {account.profile_image_url && (
                    <img
                      src={account.profile_image_url}
                      alt={account.username}
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {account.name || account.username}
                    </div>
                    <div className="text-xs text-muted-foreground">@{account.username}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {account.followers_count.toLocaleString()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl p-4 ring-1 ring-foreground/10 shadow-xs">
          <h2 className="text-base font-medium text-foreground mb-3">Quick Actions</h2>
          <div className="space-y-2">
            <Link
              to="/scrape"
              className="block h-9 px-2.5 rounded-md bg-primary hover:bg-primary/80 transition-colors text-primary-foreground text-sm font-medium flex items-center justify-center"
            >
              + Scrape New Account
            </Link>
            <Link
              to="/graph"
              className="block h-9 px-2.5 rounded-md bg-secondary hover:bg-secondary/80 transition-colors text-secondary-foreground text-sm font-medium flex items-center justify-center"
            >
              View Network Graph
            </Link>
            <Link
              to="/accounts"
              className="block h-9 px-2.5 rounded-md bg-secondary hover:bg-secondary/80 transition-colors text-secondary-foreground text-sm font-medium flex items-center justify-center"
            >
              Browse All Accounts
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
