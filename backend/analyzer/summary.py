"""
AI-powered account summary generation using xAI (Grok) with x_search tool.
"""

import os
import json
from typing import Optional, List

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import x_search


def build_prompt(username: str, topics: List[str]) -> str:
    """Build the analysis prompt for xAI."""
    topic_list = "\n".join(f"- {t}" for t in topics)

    return f"""Analyze the Twitter/X account @{username} and determine their sentiment on the following topics:

{topic_list}

For each topic:
1. Set "noticing" to true if they have discussed or shown awareness of this topic, false otherwise
2. Write a brief "comment" describing their position on the topic (be terse and concrete, max one sentence)
3. Include "examples" with URLs to specific tweets that demonstrate their position (up to 3 per topic)

If you cannot find evidence of their position on a topic, set noticing to false and explain in the comment that no relevant tweets were found.

Use the x_search tool to find relevant tweets from this user.

Respond with valid JSON in this exact format:
{{
  "topics": {{
    "Topic Name": {{
      "noticing": true/false,
      "comment": "brief description",
      "examples": ["https://x.com/...", "https://x.com/..."]
    }}
  }}
}}"""


class SummaryService:
    """Service for generating AI summaries of accounts using xAI with x_search."""

    def __init__(self):
        api_key = os.getenv("XAI_API_KEY")
        if not api_key:
            raise ValueError("XAI_API_KEY environment variable not set")

        self.client = Client(api_key=api_key)

    def generate_summary(
        self,
        username: str,
        topics: List[str],
    ) -> dict:
        """Generate an AI summary for an account by searching their tweets."""
        if not topics:
            raise ValueError("Topics list cannot be empty")

        prompt = build_prompt(username, topics)

        chat = self.client.chat.create(
            model="grok-4-1-fast",
            tools=[
                x_search(allowed_x_handles=[username]),
            ],
        )

        chat.append(user(prompt))

        # Get the response
        response = chat.sample()

        # Extract the content
        content = response.content if hasattr(response, 'content') else str(response)

        # Try to parse JSON from the response
        # The response might have markdown code blocks, so we need to extract JSON
        json_str = content
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()

        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            # If JSON parsing fails, return a structured error response
            return {
                "topics": {
                    topic: {
                        "noticing": False,
                        "comment": "Failed to parse AI response",
                        "examples": [],
                    }
                    for topic in topics
                },
                "raw_response": content,
            }

    def generate_report(self, account_data: dict, summary_data: dict, analysis_data: dict) -> str:
        """Generate a markdown report summarizing an account."""
        # Build context for the AI
        context_parts = []
        
        # Account info
        context_parts.append(f"Account: @{account_data['username']}")
        if account_data.get('name'):
            context_parts.append(f"Name: {account_data['name']}")
        if account_data.get('description'):
            context_parts.append(f"Bio: {account_data['description']}")
        if account_data.get('location'):
            context_parts.append(f"Location: {account_data['location']}")
        if account_data.get('twitter_created_at'):
            context_parts.append(f"Joined: {account_data['twitter_created_at']}")
        context_parts.append(f"Followers: {account_data.get('followers_count', 0):,}")
        context_parts.append(f"Following: {account_data.get('following_count', 0):,}")
        context_parts.append(f"Tweets: {account_data.get('tweet_count', 0):,}")
        
        # Topic summaries
        context_parts.append("\n## Topic Analysis")
        for topic_name, sentiment in summary_data.get('topics', {}).items():
            context_parts.append(f"\n### {topic_name}")
            context_parts.append(f"Active: {'Yes' if sentiment.get('noticing') else 'No'}")
            context_parts.append(f"Analysis: {sentiment.get('comment', 'N/A')}")
            if sentiment.get('tweets'):
                context_parts.append("Example tweets:")
                for tweet in sentiment['tweets']:
                    context_parts.append(f"- \"{tweet['text'][:200]}...\" (❤️ {tweet.get('like_count', 0)}, 🔁 {tweet.get('retweet_count', 0)})")
        
        # Camp analysis if available
        if analysis_data and analysis_data.get('scores'):
            context_parts.append("\n## Camp Scores")
            for score in analysis_data['scores']:
                context_parts.append(f"- {score['camp_name']}: {score['score']:.1f}")
        
        context = "\n".join(context_parts)
        
        prompt = f"""Based on the following data about a Twitter/X account, write a concise 3-paragraph markdown report summarizing this person's online presence and positions.

{context}

Write in third person. Be concrete and specific, citing example tweets where relevant. Include tweet URLs in the format https://x.com/{account_data['username']}/status/[tweet_id] when referencing specific tweets.

Format as markdown with a title header. Keep it factual and analytical."""

        chat = self.client.chat.create(
            model="grok-4-1-fast",
            tools=[
                x_search(allowed_x_handles=[account_data['username']]),
            ],
        )
        chat.append(user(prompt))
        response = chat.sample()
        
        return response.content if hasattr(response, 'content') else str(response)
