import { Link } from 'react-router-dom';
import { scrapeAccount } from '../api';

interface TweetTextProps {
  text: string;
  className?: string;
}

export function TweetText({ text, className = '' }: TweetTextProps) {
  // Parse text and split into parts (text and mentions)
  const parts: { type: 'text' | 'mention'; value: string }[] = [];
  const mentionRegex = /@(\w+)/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    // Add the mention
    parts.push({ type: 'mention', value: match[1] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  const handleMentionClick = async (username: string) => {
    // Fire and forget - scrape in background if not already scraped
    try {
      await scrapeAccount(username);
    } catch (e) {
      // Ignore errors - user will see "not found" if account doesn't exist
    }
  };

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === 'mention' ? (
          <Link
            key={i}
            to={`/accounts/${part.value}`}
            onClick={() => handleMentionClick(part.value)}
            className="text-primary hover:underline"
          >
            @{part.value}
          </Link>
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </span>
  );
}
