const API_BASE = '/api';

export interface Account {
  id: number;
  username: string;
  name: string | null;
  description: string | null;
  location: string | null;
  profile_image_url: string | null;
  verified: boolean;
  verified_type: string | null;
  followers_count: number;
  following_count: number;
  tweet_count: number;
  like_count: number;
  is_seed: boolean;
}

export interface Tweet {
  id: number;
  account_id: number;
  text: string;
  twitter_created_at: string | null;
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
  impression_count: number;
}

export interface GraphNode {
  id: string;
  username: string;
  name: string | null;
  is_seed: boolean;
  followers_count: number;
  following_count: number;
  profile_image_url: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Stats {
  accounts: number;
  seeds: number;
  tweets: number;
  follows: number;
  keywords: number;
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/stats`);
  return res.json();
}

export async function fetchAccounts(seedsOnly = false): Promise<{ accounts: Account[]; total: number }> {
  const url = seedsOnly ? `${API_BASE}/accounts?seeds_only=true` : `${API_BASE}/accounts`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchAccount(username: string): Promise<Account> {
  const res = await fetch(`${API_BASE}/accounts/${username}`);
  if (!res.ok) throw new Error('Account not found');
  return res.json();
}

export async function fetchAccountTweets(username: string, sort: 'latest' | 'top' = 'latest'): Promise<{ tweets: Tweet[]; total: number }> {
  const res = await fetch(`${API_BASE}/accounts/${username}/tweets?sort=${sort}`);
  return res.json();
}

export async function fetchAccountFollowing(username: string): Promise<{ accounts: Account[]; total: number }> {
  const res = await fetch(`${API_BASE}/accounts/${username}/following`);
  return res.json();
}

export async function fetchAccountFollowers(username: string): Promise<{ accounts: Account[]; total: number }> {
  const res = await fetch(`${API_BASE}/accounts/${username}/followers`);
  return res.json();
}

export async function fetchGraph(): Promise<GraphData> {
  const res = await fetch(`${API_BASE}/graph`);
  return res.json();
}

export async function scrapeAccount(username: string): Promise<{ account: Account | null; stats: any }> {
  const res = await fetch(`${API_BASE}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  return res.json();
}

// Camp types
export interface Camp {
  id: number;
  name: string;
  description: string | null;
  color: string;
}

export interface CampKeyword {
  id: number;
  term: string;
  weight: number;
  case_sensitive: boolean;
  expected_sentiment: 'positive' | 'negative' | 'any';
}

export interface CampDetail extends Camp {
  keywords: CampKeyword[];
}

export interface MatchDetail {
  term: string;
  count: number;
  weight: number;
}

export interface AccountCampScore {
  camp_id: number;
  camp_name: string;
  camp_color: string;
  score: number;
  bio_score: number;
  tweet_score: number;
  bio_matches: MatchDetail[];
  tweet_matches: MatchDetail[];
}

export interface AccountAnalysis {
  account: Account;
  scores: AccountCampScore[];
}

export interface LeaderboardEntry {
  rank: number;
  account: Account;
  score: number;
  bio_score: number;
  tweet_score: number;
}

export interface CampLeaderboard {
  camp: Camp;
  entries: LeaderboardEntry[];
}

export interface CampTweet {
  tweet_id: number;
  text: string;
  username: string;
  name: string | null;
  profile_image_url: string | null;
  followers_count: number;
  score: number;
  matched_keywords: string[];
  like_count: number;
  retweet_count: number;
  impression_count: number;
}

export interface CampTopTweets {
  camp: Camp;
  tweets: CampTweet[];
}

// Camp API calls
export async function fetchCamps(): Promise<{ camps: Camp[]; total: number }> {
  const res = await fetch(`${API_BASE}/camps`);
  return res.json();
}

export async function fetchCamp(id: number): Promise<CampDetail> {
  const res = await fetch(`${API_BASE}/camps/${id}`);
  return res.json();
}

export async function fetchCampLeaderboard(id: number): Promise<CampLeaderboard> {
  const res = await fetch(`${API_BASE}/camps/${id}/leaderboard`);
  return res.json();
}

export async function fetchCampTopTweets(id: number): Promise<CampTopTweets> {
  const res = await fetch(`${API_BASE}/camps/${id}/tweets`);
  return res.json();
}

export async function fetchAccountAnalysis(username: string): Promise<AccountAnalysis> {
  const res = await fetch(`${API_BASE}/accounts/${username}/analysis`);
  return res.json();
}

export async function analyzeAccounts(username?: string): Promise<{ analyzed: number; total_scores: number }> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  return res.json();
}

// Camp CRUD
export async function createCamp(data: { name: string; description?: string; color?: string }): Promise<Camp> {
  const res = await fetch(`${API_BASE}/camps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create camp');
  return res.json();
}

export async function updateCamp(id: number, data: { name?: string; description?: string; color?: string }): Promise<Camp> {
  const res = await fetch(`${API_BASE}/camps/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteCamp(id: number): Promise<void> {
  await fetch(`${API_BASE}/camps/${id}`, { method: 'DELETE' });
}

// Keyword CRUD
export async function addKeyword(campId: number, data: { term: string; weight?: number; case_sensitive?: boolean; expected_sentiment?: 'positive' | 'negative' | 'any' }): Promise<CampKeyword> {
  const res = await fetch(`${API_BASE}/camps/${campId}/keywords`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteKeyword(campId: number, keywordId: number): Promise<void> {
  await fetch(`${API_BASE}/camps/${campId}/keywords/${keywordId}`, { method: 'DELETE' });
}

// Summary types and API
export interface TopicSentiment {
  noticing: boolean;
  comment: string;
  examples: string[];
}

export interface AccountSummary {
  username: string;
  topics: Record<string, TopicSentiment>;
}

// Topic types (configurable)
export interface Topic {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  sort_order: number;
  created_at: string | null;
}

export async function fetchTopics(enabledOnly = false): Promise<{ topics: Topic[]; total: number }> {
  const url = enabledOnly ? `${API_BASE}/topics?enabled_only=true` : `${API_BASE}/topics`;
  const res = await fetch(url);
  return res.json();
}

export async function createTopic(data: { name: string; description?: string; enabled?: boolean; sort_order?: number }): Promise<Topic> {
  const res = await fetch(`${API_BASE}/topics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Failed to create topic');
  }
  return res.json();
}

export async function updateTopic(id: number, data: { name?: string; description?: string; enabled?: boolean; sort_order?: number }): Promise<Topic> {
  const res = await fetch(`${API_BASE}/topics/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteTopic(id: number): Promise<void> {
  await fetch(`${API_BASE}/topics/${id}`, { method: 'DELETE' });
}

export async function generateAccountSummary(
  username: string,
  topics?: string[]
): Promise<AccountSummary> {
  const res = await fetch(`${API_BASE}/accounts/${username}/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topics }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Failed to generate summary');
  }
  return res.json();
}
