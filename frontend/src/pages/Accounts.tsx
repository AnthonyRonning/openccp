import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { fetchAccounts } from '../api';

export default function Accounts() {
  const [seedsOnly, setSeedsOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', seedsOnly],
    queryFn: () => fetchAccounts(seedsOnly),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            {data?.total || 0} accounts in database
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={seedsOnly}
            onChange={(e) => setSeedsOnly(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          Seeds only
        </label>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="grid gap-2">
          {data?.accounts.map((account) => (
            <Link
              key={account.id}
              to={`/accounts/${account.username}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-card ring-1 ring-foreground/10 hover:ring-primary/30 transition-all overflow-hidden"
            >
              {account.profile_image_url ? (
                <img
                  src={account.profile_image_url}
                  alt={account.username}
                  className="w-10 h-10 rounded-full shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  ?
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">
                    {account.name || account.username}
                  </span>
                  {account.is_seed && (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-primary text-primary-foreground shrink-0">
                      SEED
                    </span>
                  )}
                  {account.verified && (
                    <span className="text-primary shrink-0">✓</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">@{account.username}</div>
                {account.description && (
                  <div className="text-xs text-muted-foreground/70 truncate mt-0.5">
                    {account.description}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm text-foreground">{account.followers_count.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">followers</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
