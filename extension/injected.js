// Injected into page context to intercept Twitter API fetch calls

(function() {
  'use strict';

  const originalFetch = window.fetch;

  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    
    const url = args[0]?.url || args[0];
    
    if (typeof url === 'string' && isTweetEndpoint(url)) {
      const clone = response.clone();
      try {
        const data = await clone.json();
        extractAndSendTweets(data);
      } catch (e) {
        // Ignore parse errors (some endpoints return non-JSON)
      }
    }
    
    return response;
  };

  function isTweetEndpoint(url) {
    const tweetEndpoints = [
      '/graphql/',
      '/2/timeline/',
      '/i/api/graphql/',
      'TweetDetail',
      'HomeTimeline',
      'UserTweets',
      'SearchTimeline',
      'ListLatestTweetsTimeline'
    ];
    return tweetEndpoints.some(ep => url.includes(ep));
  }

  function extractAndSendTweets(data) {
    const tweets = [];
    findTweets(data, tweets);
    
    if (tweets.length > 0) {
      // Send to content script via custom event
      window.dispatchEvent(new CustomEvent('__openccp_tweets__', { 
        detail: tweets 
      }));
      console.log('OpenCCP: Found', tweets.length, 'tweets');
    }
  }

  function findTweets(obj, results, depth = 0) {
    if (depth > 20 || !obj || typeof obj !== 'object') return;
    
    // Twitter GraphQL responses have tweet data in "tweet_results" or "result"
    if (obj.__typename === 'Tweet' && obj.rest_id) {
      const tweet = parseTweetObject(obj);
      if (tweet) results.push(tweet);
      return;
    }

    // Recurse into arrays and objects
    if (Array.isArray(obj)) {
      obj.forEach(item => findTweets(item, results, depth + 1));
    } else {
      Object.values(obj).forEach(val => findTweets(val, results, depth + 1));
    }
  }

  function parseTweetObject(tweetObj) {
    try {
      const legacy = tweetObj.legacy;
      if (!legacy) return null;
      
      const userResult = tweetObj.core?.user_results?.result;
      if (!userResult) return null;
      
      const userCore = userResult.core || {};
      const userLegacy = userResult.legacy || {};
      const userPrivacy = userResult.privacy || {};
      
      const username = userCore.screen_name || userLegacy.screen_name;
      const name = userCore.name || userLegacy.name;
      
      if (!username) return null;

      return {
        id: tweetObj.rest_id || legacy.id_str,
        text: legacy.full_text || legacy.text,
        created_at: legacy.created_at,
        conversation_id: legacy.conversation_id_str,
        in_reply_to_status_id: legacy.in_reply_to_status_id_str,
        in_reply_to_user_id: legacy.in_reply_to_user_id_str,
        retweet_count: legacy.retweet_count || 0,
        reply_count: legacy.reply_count || 0,
        like_count: legacy.favorite_count || 0,
        quote_count: legacy.quote_count || 0,
        bookmark_count: legacy.bookmark_count || 0,
        impression_count: tweetObj.views?.count ? parseInt(tweetObj.views.count) : 0,
        author: {
          id: userResult.rest_id || legacy.user_id_str,
          username: username,
          name: name,
          description: userLegacy.description || userResult.profile_bio?.description || '',
          location: userLegacy.location || userResult.location?.location || '',
          url: userLegacy.url || '',
          profile_image_url: userResult.avatar?.image_url || userLegacy.profile_image_url_https || '',
          verified: userResult.verification?.verified || userLegacy.verified || false,
          verified_type: userResult.is_blue_verified ? 'blue' : null,
          followers_count: userLegacy.followers_count || userLegacy.normal_followers_count || 0,
          following_count: userLegacy.friends_count || 0,
          tweet_count: userLegacy.statuses_count || 0,
          like_count: userLegacy.favourites_count || 0,
          listed_count: userLegacy.listed_count || 0,
          created_at: userCore.created_at || userLegacy.created_at || '',
          protected: userPrivacy.protected || userLegacy.protected || false
        },
        entities: legacy.entities
      };
    } catch (e) {
      console.error('OpenCCP: Error parsing tweet', e);
      return null;
    }
  }

  // Also intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._openccp_url = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };
  
  XMLHttpRequest.prototype.send = function(...args) {
    const url = this._openccp_url;
    
    if (typeof url === 'string' && isTweetEndpoint(url)) {
      this.addEventListener('load', function() {
        try {
          const data = JSON.parse(this.responseText);
          extractAndSendTweets(data);
        } catch (e) {
          // Ignore parse errors
        }
      });
    }
    
    return originalXHRSend.apply(this, args);
  };

  console.log('OpenCCP Tweet Collector: Injected script loaded (fetch + XHR)');
})();
