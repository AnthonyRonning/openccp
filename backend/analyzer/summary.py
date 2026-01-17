"""
AI-powered account summary generation using xAI (Grok) with x_search tool.
"""

import os
import json
from typing import Optional

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import x_search


# Default topics for analysis - can be customized per request
DEFAULT_TOPICS = [
    "Bitcoin",
    "Freedom of speech",
    "Government surveillance",
    "Privacy tools",
    "Open source software",
    "Decentralization",
    "Censorship",
]


def build_prompt(username: str, topics: list[str]) -> str:
    """Build the analysis prompt for xAI."""
    topic_list = "\n".join(f"- {t}" for t in topics)

    return f"""Analyze the Twitter/X account @{username} and determine their sentiment on the following topics:

{topic_list}

For each topic:
1. Set "noticing" to true if they have discussed or shown awareness of this topic, false otherwise
2. Write a brief "comment" describing their position on the topic (be terse but flavorful)
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
        topics: Optional[list[str]] = None,
    ) -> dict:
        """Generate an AI summary for an account by searching their tweets."""

        if topics is None:
            topics = DEFAULT_TOPICS

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
