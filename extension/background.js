// Background service worker - batches and sends tweets to backend

const API_BASE = 'https://violet-meadow-7392.fly.dev';
const BATCH_SIZE = 50;
const BATCH_INTERVAL_MS = 5000; // Send every 5 seconds

let tweetQueue = [];
let isEnabled = true;
let stats = {
  tweetsCollected: 0,
  tweetsSent: 0,
  lastSentAt: null
};

// Load state from storage
chrome.storage.local.get(['isEnabled', 'stats'], (result) => {
  if (result.isEnabled !== undefined) isEnabled = result.isEnabled;
  if (result.stats) stats = result.stats;
});

// Listen for tweets from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TWEETS_CAPTURED' && isEnabled) {
    const newTweets = message.tweets;
    tweetQueue.push(...newTweets);
    stats.tweetsCollected += newTweets.length;
    saveStats();
    
    console.log(`OpenCCP: Queued ${newTweets.length} tweets (total in queue: ${tweetQueue.length})`);
    
    // Send immediately if queue is large enough
    if (tweetQueue.length >= BATCH_SIZE) {
      sendBatch();
    }
  }
  
  if (message.type === 'GET_STATUS') {
    sendResponse({
      isEnabled,
      stats,
      queueSize: tweetQueue.length
    });
  }
  
  if (message.type === 'TOGGLE_ENABLED') {
    isEnabled = message.enabled;
    chrome.storage.local.set({ isEnabled });
    sendResponse({ isEnabled });
  }
  
  if (message.type === 'RESET_STATS') {
    stats = { tweetsCollected: 0, tweetsSent: 0, lastSentAt: null };
    saveStats();
    sendResponse({ stats });
  }
  
  return true; // Keep channel open for async response
});

// Periodic batch sending
setInterval(() => {
  if (tweetQueue.length > 0 && isEnabled) {
    sendBatch();
  }
}, BATCH_INTERVAL_MS);

async function sendBatch() {
  if (tweetQueue.length === 0) return;
  
  const batch = tweetQueue.splice(0, BATCH_SIZE);
  
  try {
    const response = await fetch(`${API_BASE}/api/crowdsource/tweets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tweets: batch })
    });
    
    if (response.ok) {
      const result = await response.json();
      stats.tweetsSent += result.tweets_added || batch.length;
      stats.lastSentAt = new Date().toISOString();
      saveStats();
      console.log(`OpenCCP: Sent batch of ${batch.length} tweets`, result);
    } else {
      // Put tweets back in queue on failure
      console.error('OpenCCP: Failed to send batch', response.status);
      tweetQueue.unshift(...batch);
    }
  } catch (e) {
    console.error('OpenCCP: Error sending batch', e);
    tweetQueue.unshift(...batch);
  }
}

function saveStats() {
  chrome.storage.local.set({ stats });
}

console.log('OpenCCP Tweet Collector: Background service worker started');
