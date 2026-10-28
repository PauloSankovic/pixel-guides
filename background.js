"use strict";

// The content script is injected on demand (activeTab) and is idempotent:
// the first run creates the overlay, later runs toggle its visibility.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => {
    // Browser-internal pages and the extension store cannot be scripted.
  });
});
