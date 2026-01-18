// Popup script - handles UI interactions

const toggle = document.getElementById('toggle');
const statusText = document.getElementById('status-text');
const pulse = document.getElementById('pulse');
const queueStatus = document.getElementById('queue-status');
const collectedEl = document.getElementById('collected');
const sentEl = document.getElementById('sent');
const queueEl = document.getElementById('queue');
const lastSyncEl = document.getElementById('last-sync');
const resetBtn = document.getElementById('reset-btn');

function updateUI(status) {
  const { isEnabled, stats, queueSize } = status;
  
  // Toggle state
  if (isEnabled) {
    toggle.classList.add('active');
    statusText.textContent = 'On';
    statusText.classList.add('active');
    pulse.classList.remove('inactive');
  } else {
    toggle.classList.remove('active');
    statusText.textContent = 'Off';
    statusText.classList.remove('active');
    pulse.classList.add('inactive');
  }
  
  // Stats
  collectedEl.textContent = stats.tweetsCollected.toLocaleString();
  sentEl.textContent = stats.tweetsSent.toLocaleString();
  queueEl.textContent = queueSize.toLocaleString();
  
  // Last sync
  if (stats.lastSentAt) {
    const date = new Date(stats.lastSentAt);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) {
      lastSyncEl.textContent = 'Just now';
    } else if (diffMins < 60) {
      lastSyncEl.textContent = `${diffMins}m ago`;
    } else {
      lastSyncEl.textContent = date.toLocaleTimeString();
    }
  } else {
    lastSyncEl.textContent = 'Never';
  }
  
  // Queue status
  if (!isEnabled) {
    queueStatus.textContent = 'Collection paused';
  } else if (queueSize > 0) {
    queueStatus.textContent = `${queueSize} tweets queued...`;
  } else {
    queueStatus.textContent = 'Waiting for tweets...';
  }
}

// Initial load
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, updateUI);

// Poll for updates
setInterval(() => {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, updateUI);
}, 1000);

// Toggle click
toggle.addEventListener('click', () => {
  const willBeEnabled = !toggle.classList.contains('active');
  chrome.runtime.sendMessage({ type: 'TOGGLE_ENABLED', enabled: willBeEnabled }, updateUI);
});

// Reset stats
resetBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESET_STATS' }, (response) => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, updateUI);
  });
});
