import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { fetchReport } from '../api';
import { TweetCard } from '../components/TweetCard';

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  
  const { data: report, isLoading, error } = useQuery({
    queryKey: ['report', id],
    queryFn: () => fetchReport(Number(id)),
    enabled: !!id,
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  if (error || !report) return <div className="text-destructive">Report not found</div>;

  const renderContent = () => {
    switch (report.type) {
      case 'topic_sides':
        return <TopicSidesReport content={report.content} />;
      case 'account_summary':
        return <AccountSummaryReport content={report.content} />;
      case 'freeform':
        return <FreeformReport content={report.content} />;
      default:
        return <pre className="text-sm">{JSON.stringify(report.content, null, 2)}</pre>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to={report.account_username ? `/accounts/${report.account_username}` : '/topic'} className="p-2 hover:bg-secondary rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {report.title || `${report.type} Report`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {report.created_at && new Date(report.created_at).toLocaleString()}
            {report.account_username && ` • @${report.account_username}`}
            {report.topic_query && ` • ${report.topic_query}`}
          </p>
        </div>
      </div>
      
      <div className="bg-card rounded-xl p-4 ring-1 ring-foreground/10">
        {renderContent()}
      </div>
    </div>
  );
}

function TopicSidesReport({ content }: { content: Record<string, unknown> }) {
  const sideA = (content.side_a || []) as Array<{ id: string; text: string; author_username?: string; reason?: string }>;
  const sideB = (content.side_b || []) as Array<{ id: string; text: string; author_username?: string; reason?: string }>;
  const ambiguous = (content.ambiguous || []) as Array<{ id: string; text: string; author_username?: string; reason?: string }>;
  
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h3 className="font-medium mb-3">{content.side_a_name as string || 'Side A'} ({sideA.length})</h3>
          <div className="space-y-2">
            {sideA.map((t) => (
              <TweetCard key={t.id} id={t.id} text={t.text} reason={t.reason} author={t.author_username ? { username: t.author_username } : undefined} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-medium mb-3">{content.side_b_name as string || 'Side B'} ({sideB.length})</h3>
          <div className="space-y-2">
            {sideB.map((t) => (
              <TweetCard key={t.id} id={t.id} text={t.text} reason={t.reason} author={t.author_username ? { username: t.author_username } : undefined} />
            ))}
          </div>
        </div>
      </div>
      {ambiguous.length > 0 && (
        <div>
          <h3 className="font-medium mb-3 text-muted-foreground">Ambiguous ({ambiguous.length})</h3>
          <div className="space-y-2">
            {ambiguous.map((t) => (
              <TweetCard key={t.id} id={t.id} text={t.text} reason={t.reason} author={t.author_username ? { username: t.author_username } : undefined} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountSummaryReport({ content }: { content: Record<string, unknown> }) {
  const topics = content.topics as Record<string, { noticing: boolean; comment: string; tweets?: Array<{ id: string; text: string }> }>;
  
  return (
    <div className="space-y-4">
      {Object.entries(topics || {}).map(([name, data]) => (
        <div key={name} className="border-b border-border pb-4 last:border-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full ${data.noticing ? 'bg-yellow-500' : 'bg-gray-500'}`} />
            <h3 className="font-medium">{name}</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-2">{data.comment}</p>
          {data.tweets && data.tweets.length > 0 && (
            <div className="space-y-2">
              {data.tweets.map((t) => (
                <TweetCard key={t.id} id={t.id} text={t.text} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function FreeformReport({ content }: { content: Record<string, unknown> }) {
  const report = content.report as string;
  const tweets = (content.referenced_tweets || []) as Array<{ id: string; text: string; author_username?: string; author_name?: string; author_profile_image?: string }>;
  
  const tweetMap = new Map(tweets.map(t => [t.id, t]));
  const tweetUrlPattern = /https?:\/\/(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/g;
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  
  while ((match = tweetUrlPattern.exec(report)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{report.slice(lastIndex, match.index)}</span>);
    }
    
    const tweet = tweetMap.get(match[1]);
    if (tweet) {
      parts.push(
        <div key={key++} className="my-3">
          <TweetCard
            id={tweet.id}
            text={tweet.text}
            author={tweet.author_username ? {
              username: tweet.author_username,
              name: tweet.author_name || undefined,
              profileImageUrl: tweet.author_profile_image || undefined,
            } : undefined}
          />
        </div>
      );
    } else {
      parts.push(
        <a key={key++} href={match[0]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {match[0]}
        </a>
      );
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < report.length) {
    parts.push(<span key={key++}>{report.slice(lastIndex)}</span>);
  }
  
  return (
    <div className="prose prose-sm prose-invert max-w-none text-foreground/90 whitespace-pre-wrap">
      {parts}
    </div>
  );
}
