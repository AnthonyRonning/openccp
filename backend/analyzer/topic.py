"""
Topic search and side analysis using xAI (Grok) with x_search tool.
"""

import os
import re
import json
from typing import List, Optional

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import x_search


def extract_tweet_ids_from_urls(urls: List[str]) -> List[int]:
    """Extract tweet IDs from X/Twitter URLs."""
    tweet_ids = []
    pattern = r'(?:x\.com|twitter\.com)/\w+/status/(\d+)'
    
    for url in urls:
        match = re.search(pattern, url)
        if match:
            try:
                tweet_ids.append(int(match.group(1)))
            except ValueError:
                continue
    
    return tweet_ids


class TopicService:
    """Service for topic search and side analysis using xAI."""

    def __init__(self):
        api_key = os.getenv("XAI_API_KEY")
        if not api_key:
            raise ValueError("XAI_API_KEY environment variable not set")
        self.client = Client(api_key=api_key)

    def search_topic(self, query: str, limit: int = 10) -> dict:
        """Search for top tweets about a topic and their top replies."""
        
        prompt = f"""Find the top {limit} most popular/viral tweets about: "{query}"

Return the results as JSON with this exact format:
{{
  "tweets": [
    {{
      "url": "https://x.com/username/status/123...",
      "summary": "brief description of the tweet"
    }}
  ]
}}

Focus on tweets with high engagement (likes, retweets, replies). Use x_search to find them."""

        chat = self.client.chat.create(
            model="grok-4-1-fast",
            tools=[x_search()],
        )
        chat.append(user(prompt))
        response = chat.sample()
        
        content = response.content if hasattr(response, 'content') else str(response)
        
        # Parse JSON from response
        json_str = content
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
        
        try:
            result = json.loads(json_str)
        except json.JSONDecodeError:
            result = {"tweets": [], "raw_response": content}
        
        return result

    def get_top_reply(self, tweet_url: str) -> Optional[str]:
        """Get the top reply URL for a tweet."""
        
        prompt = f"""What is the top/most popular reply to this tweet: {tweet_url}

Return ONLY the URL of the top reply in this JSON format:
{{
  "reply_url": "https://x.com/username/status/123..."
}}

If there are no replies or you can't find one, return:
{{
  "reply_url": null
}}"""

        chat = self.client.chat.create(
            model="grok-4-1-fast",
            tools=[x_search()],
        )
        chat.append(user(prompt))
        response = chat.sample()
        
        content = response.content if hasattr(response, 'content') else str(response)
        
        # Parse JSON
        json_str = content
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
        
        try:
            result = json.loads(json_str)
            return result.get("reply_url")
        except json.JSONDecodeError:
            return None

    def analyze_sides(
        self,
        tweets_data: List[dict],
        side_a_name: str,
        side_b_name: str,
        prompt: str,
    ) -> List[dict]:
        """Analyze tweets and classify them into sides.
        
        Args:
            tweets_data: List of {"id": int, "text": str, "is_reply": bool, "parent_id": int|None}
            side_a_name: Name for side A
            side_b_name: Name for side B  
            prompt: User's prompt to help classify
        
        Returns:
            List of {"tweet_id": int, "side": "a"|"b"|"ambiguous", "reason": str}
        """
        
        tweets_text = "\n\n".join([
            f"Tweet ID {t['id']}:\n{t['text']}"
            for t in tweets_data
        ])
        
        analysis_prompt = f"""Classify each of the following tweets into one of two sides based on this criteria:

Side A: "{side_a_name}"
Side B: "{side_b_name}"

Classification guidance from the user:
{prompt}

Here are the tweets to classify:

{tweets_text}

For each tweet, determine which side it belongs to (or "ambiguous" if unclear) and provide a brief reason.

Return JSON in this exact format:
{{
  "classifications": [
    {{
      "tweet_id": 123,
      "side": "a",
      "reason": "This tweet supports X because..."
    }},
    {{
      "tweet_id": 456,
      "side": "b", 
      "reason": "This tweet opposes X because..."
    }},
    {{
      "tweet_id": 789,
      "side": "ambiguous",
      "reason": "This tweet doesn't clearly take a side..."
    }}
  ]
}}"""

        chat = self.client.chat.create(model="grok-4-1-fast")
        chat.append(user(analysis_prompt))
        response = chat.sample()
        
        content = response.content if hasattr(response, 'content') else str(response)
        
        # Parse JSON
        json_str = content
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
        
        try:
            result = json.loads(json_str)
            return result.get("classifications", [])
        except json.JSONDecodeError:
            return []
