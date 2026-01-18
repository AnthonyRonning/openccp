import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { searchTopic, analyzeTopicSides } from '../api';
import type { TopicTweetResult, TopicSearchResponse, TopicAnalyzeResponse } from '../api';
import { TweetCard } from '../components/TweetCard';

type SortOption = 'views' | 'likes' | 'comments' | 'ratio';
type View = 'search' | 'results' | 'analyzed';

function TopicTweetCard({ tweet, reason }: { tweet: TopicTweetResult; reason?: string }) {
  return (
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
      reason={reason}
    />
  );
}

export default function Topic() {
  const [view, setView] = useState<View>('search');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TopicSearchResponse | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('views');
  
  // Side picker state
  const [sideAName, setSideAName] = useState('');
  const [sideBName, setSideBName] = useState('');
  const [sidePrompt, setSidePrompt] = useState('');
  
  // Analysis results
  const [analysisResults, setAnalysisResults] = useState<TopicAnalyzeResponse | null>(null);

  const searchMutation = useMutation({
    mutationFn: () => searchTopic(query),
    onSuccess: (data) => {
      setSearchResults(data);
      setView('results');
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: () => {
      if (!searchResults) throw new Error('No search results');
      const allTweetIds = searchResults.tweets.flatMap(t => 
        t.top_reply ? [t.id, t.top_reply.id] : [t.id]
      );
      return analyzeTopicSides(allTweetIds, searchResults.query, sideAName, sideBName, sidePrompt);
    },
    onSuccess: (data) => {
      setAnalysisResults(data);
      setView('analyzed');
    },
  });

  const sortTweets = (tweets: TopicTweetResult[]) => {
    return [...tweets].sort((a, b) => {
      switch (sortBy) {
        case 'views':
          return b.impression_count - a.impression_count;
        case 'likes':
          return b.like_count - a.like_count;
        case 'comments':
          return 0; // We don't have comment count
        case 'ratio':
          const ratioA = a.like_count / (a.impression_count || 1);
          const ratioB = b.like_count / (b.impression_count || 1);
          return ratioB - ratioA;
        default:
          return 0;
      }
    });
  };

  const getClassification = (tweetId: string) => {
    return analysisResults?.classifications.find(c => c.tweet_id === tweetId);
  };

  // Search View
  if (view === 'search') {
    return (
      <div className="max-w-xl mx-auto py-12">
        <h1 className="text-2xl font-bold text-foreground text-center mb-8">Topic Search</h1>
        
        <div className="space-y-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a topic to search..."
            className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          
          <button
            onClick={() => searchMutation.mutate()}
            disabled={!query.trim() || searchMutation.isPending}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {searchMutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Searching tweets and replies...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Go!
              </>
            )}
          </button>
          
          {searchMutation.isPending && (
            <p className="text-xs text-muted-foreground text-center">
              This may take 15-30 seconds while Grok searches for tweets and their top replies.
            </p>
          )}
          
          {searchMutation.isError && (
            <p className="text-destructive text-sm text-center">
              {searchMutation.error instanceof Error ? searchMutation.error.message : 'Search failed'}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Results View (with side picker)
  if (view === 'results' && searchResults) {
    const sortedTweets = sortTweets(searchResults.tweets);
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">
            Top tweets about "{searchResults.query}"
          </h1>
          <button
            onClick={() => setView('search')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            New Search
          </button>
        </div>
        
        {/* Sort options */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort by:</span>
          {(['views', 'likes', 'ratio'] as SortOption[]).map((option) => (
            <button
              key={option}
              onClick={() => setSortBy(option)}
              className={`px-2 py-1 rounded ${
                sortBy === option
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tweet list */}
          <div className="lg:col-span-2 space-y-3">
            {sortedTweets.map((tweet) => (
              <div key={tweet.id}>
                <TopicTweetCard tweet={tweet} />
                {tweet.top_reply && (
                  <div className="ml-8 mt-2 border-l-2 border-border pl-3">
                    <p className="text-xs text-muted-foreground mb-1">Top reply</p>
                    <TopicTweetCard tweet={tweet.top_reply} />
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Side picker */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 bg-card rounded-xl p-4 ring-1 ring-foreground/10">
              <h2 className="text-sm font-medium text-foreground mb-4">Side Picker</h2>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={sideAName}
                    onChange={(e) => setSideAName(e.target.value)}
                    placeholder="Side A name"
                    className="px-3 py-2 bg-secondary border border-border rounded text-sm text-foreground placeholder:text-muted-foreground"
                  />
                  <input
                    type="text"
                    value={sideBName}
                    onChange={(e) => setSideBName(e.target.value)}
                    placeholder="Side B name"
                    className="px-3 py-2 bg-secondary border border-border rounded text-sm text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                
                <textarea
                  value={sidePrompt}
                  onChange={(e) => setSidePrompt(e.target.value)}
                  placeholder="Describe how to determine which side a tweet is on..."
                  rows={4}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded text-sm text-foreground placeholder:text-muted-foreground resize-none"
                />
                
                <button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={!sideAName || !sideBName || !sidePrompt || analyzeMutation.isPending}
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    'Analyze'
                  )}
                </button>
                
                {analyzeMutation.isError && (
                  <p className="text-destructive text-xs">
                    {analyzeMutation.error instanceof Error ? analyzeMutation.error.message : 'Analysis failed'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Analyzed View (two columns)
  if (view === 'analyzed' && searchResults && analysisResults) {
    const sortedTweets = sortTweets(searchResults.tweets);
    
    // Group tweets by side
    const sideATweets: { tweet: TopicTweetResult; classification: ReturnType<typeof getClassification> }[] = [];
    const sideBTweets: { tweet: TopicTweetResult; classification: ReturnType<typeof getClassification> }[] = [];
    const ambiguousTweets: { tweet: TopicTweetResult; classification: ReturnType<typeof getClassification> }[] = [];
    
    for (const tweet of sortedTweets) {
      const classification = getClassification(tweet.id);
      const item = { tweet, classification };
      
      if (classification?.side === 'a') {
        sideATweets.push(item);
      } else if (classification?.side === 'b') {
        sideBTweets.push(item);
      } else {
        ambiguousTweets.push(item);
      }
    }
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">
            Analysis: "{searchResults.query}"
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setView('results')}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Back to Results
            </button>
            <button
              onClick={() => {
                setView('search');
                setSearchResults(null);
                setAnalysisResults(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              New Search
            </button>
          </div>
        </div>
        
        {/* Sort options */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort by:</span>
          {(['views', 'likes', 'ratio'] as SortOption[]).map((option) => (
            <button
              key={option}
              onClick={() => setSortBy(option)}
              className={`px-2 py-1 rounded ${
                sortBy === option
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        
        {/* Side headers */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center py-2 bg-blue-500/20 rounded-lg">
            <span className="font-medium text-blue-400">{analysisResults.side_a_name}</span>
            <span className="text-muted-foreground text-sm ml-2">({sideATweets.length})</span>
          </div>
          <div className="text-center py-2 bg-red-500/20 rounded-lg">
            <span className="font-medium text-red-400">{analysisResults.side_b_name}</span>
            <span className="text-muted-foreground text-sm ml-2">({sideBTweets.length})</span>
          </div>
        </div>
        
        {/* Two column layout */}
        <div className="grid grid-cols-2 gap-4">
          {/* Side A */}
          <div className="space-y-3">
            {sideATweets.map(({ tweet, classification }) => (
              <div key={tweet.id}>
                <TopicTweetCard tweet={tweet} reason={classification?.reason} />
                {tweet.top_reply && (
                  <div className={`mt-2 border-l-2 pl-3 ${
                    getClassification(tweet.top_reply.id)?.side === 'b'
                      ? 'ml-0 border-red-500/50'
                      : 'ml-8 border-border'
                  }`}>
                    <p className="text-xs text-muted-foreground mb-1">Top reply</p>
                    <TopicTweetCard 
                      tweet={tweet.top_reply} 
                      reason={getClassification(tweet.top_reply.id)?.reason} 
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Side B */}
          <div className="space-y-3">
            {sideBTweets.map(({ tweet, classification }) => (
              <div key={tweet.id}>
                <TopicTweetCard tweet={tweet} reason={classification?.reason} />
                {tweet.top_reply && (
                  <div className={`mt-2 border-l-2 pl-3 ${
                    getClassification(tweet.top_reply.id)?.side === 'a'
                      ? 'ml-0 border-blue-500/50'
                      : 'ml-8 border-border'
                  }`}>
                    <p className="text-xs text-muted-foreground mb-1">Top reply</p>
                    <TopicTweetCard 
                      tweet={tweet.top_reply} 
                      reason={getClassification(tweet.top_reply.id)?.reason} 
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Ambiguous tweets */}
        {ambiguousTweets.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Ambiguous ({ambiguousTweets.length})
            </h2>
            <div className="space-y-3">
              {ambiguousTweets.map(({ tweet, classification }) => (
                <TopicTweetCard key={tweet.id} tweet={tweet} reason={classification?.reason} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
