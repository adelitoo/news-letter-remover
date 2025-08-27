// Background service worker for Newsletter Manager
console.log('Newsletter Manager background script loaded');

// Extension installation handler
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Newsletter Manager installed:', details.reason);
  
  if (details.reason === 'install') {
    // First time installation
    console.log('First time installation - setting up defaults');
    
    // Set default settings
    chrome.storage.local.set({
      'settings': {
        'autoDetect': true,
        'bulkOperations': true,
        'showStats': true,
        'version': '1.0.0'
      },
      'stats': {
        'newslettersDetected': 0,
        'unsubscribed': 0,
        'lastScan': null
      }
    });
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  switch (request.action) {
    case 'getStats':
      // Get current stats from storage
      chrome.storage.local.get(['stats'], (result) => {
        sendResponse(result.stats || {});
      });
      return true; // Keep message channel open for async response
      
    case 'updateStats':
      // Update stats in storage
      chrome.storage.local.get(['stats'], (result) => {
        const currentStats = result.stats || {};
        const newStats = { ...currentStats, ...request.data };
        
        chrome.storage.local.set({ 'stats': newStats }, () => {
          sendResponse({ success: true });
        });
      });
      return true;
      
    case 'performUnsubscribe':
      // Handle unsubscribe requests
      handleUnsubscribe(request.data, sendResponse);
      return true;
      
    default:
      console.log('Unknown action:', request.action);
      sendResponse({ error: 'Unknown action' });
  }
});

// Handle unsubscribe logic
function handleUnsubscribe(data, sendResponse) {
  console.log('Processing unsubscribe for:', data);
  
  // For now, just log and return success
  // We'll implement actual unsubscribe logic later
  setTimeout(() => {
    sendResponse({ 
      success: true, 
      message: 'Unsubscribe processed (placeholder)' 
    });
  }, 1000);
}

// Keep service worker alive
chrome.runtime.onConnect.addListener((port) => {
  console.log('Port connected:', port.name);
});
