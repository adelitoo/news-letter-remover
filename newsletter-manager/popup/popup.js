// Newsletter Manager Popup Script
console.log('Newsletter Manager popup loaded');

// DOM elements
let statusIndicator, statusText;
let detectedCount, unsubscribedCount;
let scanButton, settingsButton;
let newslettersSection, newslettersList;
let selectAllButton, bulkUnsubscribeButton;

// Scanning state
let isScanning = false;

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Popup DOM loaded');
    
    // Get DOM elements
    initializeElements();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load initial data
    await loadStats();
    
    // Check if we're on Gmail
    await checkGmailStatus();
});

function initializeElements() {
    statusIndicator = document.getElementById('statusIndicator');
    statusText = document.getElementById('statusText');
    detectedCount = document.getElementById('detectedCount');
    unsubscribedCount = document.getElementById('unsubscribedCount');
    scanButton = document.getElementById('scanButton');
    settingsButton = document.getElementById('settingsButton');
    newslettersSection = document.getElementById('newslettersSection');
    newslettersList = document.getElementById('newslettersList');
    selectAllButton = document.getElementById('selectAllButton');
    bulkUnsubscribeButton = document.getElementById('bulkUnsubscribeButton');
}

function setupEventListeners() {
    scanButton.addEventListener('click', handleScan);
    settingsButton.addEventListener('click', handleSettings);
    selectAllButton.addEventListener('click', handleSelectAll);
    bulkUnsubscribeButton.addEventListener('click', handleBulkUnsubscribe);
}

async function loadStats() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getStats'
        });
        
        console.log('Loaded stats:', response);
        
        // Update UI with stats
        detectedCount.textContent = response.newslettersDetected || 0;
        unsubscribedCount.textContent = response.unsubscribed || 0;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function checkGmailStatus() {
    try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab.url && (tab.url.includes('mail.google.com') || tab.url.includes('gmail.com'))) {
            setStatus('ready', 'Ready to scan Gmail');
        } else {
            setStatus('error', 'Please open Gmail first');
            scanButton.disabled = true;
        }
        
    } catch (error) {
        console.error('Error checking Gmail status:', error);
        setStatus('error', 'Unable to detect Gmail');
    }
}

function setStatus(type, message) {
    statusText.textContent = message;
    statusIndicator.className = `status-indicator ${type}`;
    
    if (type === 'loading') {
        statusIndicator.classList.add('loading');
    }
}

// Enhanced scan function with full account support
async function handleScan() {
    if (isScanning) return;
    
    isScanning = true;
    setStatus('loading', 'Starting full account scan...');
    scanButton.textContent = 'Scanning...';
    scanButton.disabled = true;
    
    // Add progress display
    const progressDiv = document.createElement('div');
    progressDiv.id = 'scanProgress';
    progressDiv.innerHTML = `
        <div class="progress-bar">
            <div class="progress-fill" style="width: 0%"></div>
        </div>
        <div class="progress-text">Initializing scan...</div>
    `;
    document.querySelector('.actions-section').appendChild(progressDiv);
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'scanAllNewsletters'  // Changed to use full scan
        });
        
        if (response && response.success) {
            // Update stats
            await updateStats({
                newslettersDetected: response.newsletters.length,
                lastScan: new Date().toISOString()
            });
            
            // Display newsletters
            displayNewsletters(response.newsletters);
            
            setStatus('ready', `Found ${response.newsletters.length} newsletters`);
        } else {
            setStatus('error', 'Scan failed');
        }
        
    } catch (error) {
        console.error('Scan error:', error);
        setStatus('error', 'Scan failed - please refresh Gmail');
    } finally {
        isScanning = false;
        scanButton.disabled = false;
        scanButton.textContent = 'Scan for Newsletters';
        document.getElementById('scanProgress')?.remove();
    }
}

// Listen for progress updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateScanProgress') {
        updateScanProgress(request.data);
    }
});

function updateScanProgress(data) {
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    
    if (progressFill && progressText) {
        const percentage = (data.processed / data.total) * 100;
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = data.status;
    }
}

function displayNewsletters(newsletters) {
    if (newsletters.length === 0) {
        newslettersSection.style.display = 'none';
        return;
    }
    
    // Clear existing list
    newslettersList.innerHTML = '';
    
    // Add each newsletter
    newsletters.forEach((newsletter, index) => {
        const item = createNewsletterItem(newsletter, index);
        newslettersList.appendChild(item);
    });
    
    // Show newsletters section
    newslettersSection.style.display = 'block';
}

function createNewsletterItem(newsletter, index) {
    const item = document.createElement('div');
    item.className = 'newsletter-item';
    
    // Add confidence and method indicators
    const confidenceText = newsletter.confidence ? 
        `${Math.round(newsletter.confidence * 100)}% (${newsletter.method})` : '';
    
    item.innerHTML = `
        <input type="checkbox" class="newsletter-checkbox" data-index="${index}">
        <div class="newsletter-info">
            <div class="newsletter-sender">${newsletter.sender}</div>
            <div class="newsletter-subject">${newsletter.subject}</div>
            ${confidenceText ? `<div class="newsletter-confidence">${confidenceText}</div>` : ''}
        </div>
        <div class="newsletter-count">${newsletter.count || 1}</div>
    `;
    
    return item;
}

async function updateStats(newStats) {
    try {
        await chrome.runtime.sendMessage({
            action: 'updateStats',
            data: newStats
        });
        
        // Reload stats to update UI
        await loadStats();
        
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

function handleSettings() {
    console.log('Settings clicked - will implement later');
    // TODO: Open settings page
}

function handleSelectAll() {
    const checkboxes = document.querySelectorAll('.newsletter-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });
    
    selectAllButton.textContent = allChecked ? 'Select All' : 'Deselect All';
}

function handleBulkUnsubscribe() {
    const selectedCheckboxes = document.querySelectorAll('.newsletter-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        alert('Please select newsletters to unsubscribe from');
        return;
    }
    
    console.log(`Unsubscribing from ${selectedCheckboxes.length} newsletters`);
    // TODO: Implement bulk unsubscribe logic
    
    alert(`Will unsubscribe from ${selectedCheckboxes.length} newsletters (coming soon!)`);
}
