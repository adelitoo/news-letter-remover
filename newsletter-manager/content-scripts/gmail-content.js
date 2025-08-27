// Gmail Content Script for Newsletter Detection
console.log('Newsletter Manager content script loaded on:', window.location.href);

// Global variables
let isGmailReady = false;
let emailData = [];

// Initialize when page loads
function initialize() {
    console.log('Initializing Newsletter Manager content script');
    
    // Wait for Gmail to fully load
    waitForGmail().then(() => {
        console.log('Gmail is ready!');
        isGmailReady = true;
    }).catch(error => {
        console.error('Error waiting for Gmail:', error);
    });
}

// Wait for Gmail interface to load
async function waitForGmail() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 50; // 10 seconds max
        
        const checkGmail = () => {
            attempts++;
            
            // Check for Gmail-specific elements
            const gmailElements = [
                '[role="main"]', // Main Gmail content
                '[data-thread-id]', // Email threads
                '.zA', // Email list items (Gmail class)
                '[role="navigation"]' // Gmail navigation
            ];
            
            const foundElements = gmailElements.filter(selector => 
                document.querySelector(selector) !== null
            );
            
            console.log(`Gmail check attempt ${attempts}: found ${foundElements.length}/4 elements`);
            
            if (foundElements.length >= 2) {
                // Gmail is ready
                resolve();
            } else if (attempts >= maxAttempts) {
                reject(new Error('Gmail did not load in time'));
            } else {
                setTimeout(checkGmail, 200);
            }
        };
        
        checkGmail();
    });
}

class OllamaNewsletterClassifier {
    constructor() {
        this.ollamaUrl = 'http://localhost:11434';
        this.model = 'qwen2.5:7b-instruct-q4_0';
        this.fallbackOnly = false; // Flag to skip Ollama if it's not working
    }
    
    async classifyEmail(emailData) {
        // Skip Ollama if it failed before
        if (this.fallbackOnly) {
            return this.fallbackClassification(emailData);
        }
        
        try {
            // Test if Ollama is accessible with a simple request
            const testResponse = await this.testOllamaConnection();
            if (!testResponse) {
                console.log('Ollama not accessible, using fallback');
                this.fallbackOnly = true;
                return this.fallbackClassification(emailData);
            }
            
            const prompt = this.buildClassificationPrompt(emailData);
            
            const response = await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors', // Explicitly set CORS mode
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.1,
                        num_predict: 50  // Reduced for faster response
                    }
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const result = await response.json();
            return this.parseClassification(result.response);
            
        } catch (error) {
            console.error('Ollama classification failed:', error.message);
            // Set fallback flag and use rule-based classification
            this.fallbackOnly = true;
            return this.fallbackClassification(emailData);
        }
    }
    
    async testOllamaConnection() {
        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`, {
                method: 'GET',
                mode: 'cors',
                signal: AbortSignal.timeout(2000) // 2 second timeout
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
    
    buildClassificationPrompt(emailData) {
        return `Classify this email as NEWSLETTER or TRANSACTIONAL:

Email:
From: ${emailData.sender}
Subject: ${emailData.subject}

Answer with one word only:`;
    }
    
    parseClassification(response) {
        const cleaned = response.trim().toLowerCase();
        
        if (cleaned.includes('newsletter')) {
            return { isNewsletter: true, confidence: 0.9, method: 'ollama' };
        } else if (cleaned.includes('transactional')) {
            return { isNewsletter: false, confidence: 0.9, method: 'ollama' };
        } else {
            return { isNewsletter: false, confidence: 0.3, method: 'ollama_unclear' };
        }
    }
    
    fallbackClassification(emailData) {
        return {
            isNewsletter: this.ruleBasedClassification(emailData),
            confidence: 0.7,
            method: 'rules'
        };
    }

    ruleBasedClassification(emailData) {
        const { sender, subject, snippet } = emailData;
        const content = (subject + ' ' + snippet).toLowerCase();
        const senderLower = sender.toLowerCase();
        
        // EXCLUDE transactional emails
        const transactionalExclusions = [
            /security|sicurezza|avviso.*sicurezza/i.test(content),
            /password|reset|login/i.test(content),
            /payment.*failed|payment.*processed|carta.*aggiunta/i.test(content),
            /invoice|receipt|billing/i.test(content),
            /project.*shut.*down|application.*added|terms.*service/i.test(content),
            /appointment.*reminder|messaggio.*nuovo/i.test(content)
        ];
        
        if (transactionalExclusions.some(test => test)) {
            return false;
        }
        
        // POSITIVE newsletter indicators
        const strongNewsletterSignals = [
            senderLower.includes('newsletter'),
            senderLower.startsWith('news@'),
            /newsletter/i.test(content),
            /weekly.*digest|daily.*update|monthly.*roundup/i.test(content),
            /prezzo.*sceso|price.*drop|deal.*alert/i.test(content),
            /new.*jobs.*posted|job.*matching.*profile/i.test(content)
        ];
        
        const mediumSignals = [
            senderLower.includes('no-reply') || senderLower.includes('noreply'),
            /update|updates|aggiornamenti/i.test(content)
        ];
        
        if (strongNewsletterSignals.some(signal => signal)) {
            return true;
        }
        
        const mediumCount = mediumSignals.filter(signal => signal).length;
        return mediumCount >= 2;
    }
}

// Utility function for delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Enhanced Gmail search function
async function executeGmailSearch(query) {
    console.log(`Executing search for: ${query}`);
    
    // Try to find the search box without triggering a full page reload
    const searchBox = document.querySelector('input[name="q"]') || 
                     document.querySelector('[role="search"] input') ||
                     document.querySelector('input[aria-label*="Search"]');
    
    if (!searchBox) {
        console.error('Search box not found');
        return false;
    }
    
    try {
        // Clear existing search
        searchBox.value = '';
        searchBox.focus();
        
        // Set the search query
        searchBox.value = query;
        
        // Try different ways to trigger search without page reload
        
        // Method 1: Try dispatching input and change events
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
        searchBox.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Method 2: Try pressing Enter
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
        });
        searchBox.dispatchEvent(enterEvent);
        
        // Wait longer for search to complete
        await sleep(2000);
        
        return true;
        
    } catch (error) {
        console.error('Search execution failed:', error);
        return false;
    }
}


async function waitForSearchResults() {
    return new Promise((resolve) => {
        let attempts = 0;
        const checkResults = () => {
            attempts++;
            const emailElements = document.querySelectorAll('.zA');
            
            if (emailElements.length > 0 || attempts > 30) {
                resolve();
            } else {
                setTimeout(checkResults, 200);
            }
        };
        checkResults();
    });
}

async function processSearchResults() {
    const emailElements = findEmailElements();
    const emails = [];
    
    for (const element of emailElements) {
        const emailData = extractEmailData(element);
        if (emailData) {
            // Add thread ID for deduplication
            emailData.threadId = element.getAttribute('data-thread-id') || 
                               element.getAttribute('id') || 
                               `${emailData.sender}_${emailData.subject}`;
            emails.push(emailData);
        }
    }
    
    return emails;
}

// Enhanced scanning strategy using Gmail search
async function scanAllNewsletters() {
    const newsletters = new Map();
    
    // Search strategies for finding newsletters
    const searchQueries = [
        'from:noreply',
        'from:no-reply', 
        'from:newsletter',
        'from:marketing',
        'from:updates',
        'unsubscribe',
        'in:promotions',
        'category:promotions'
    ];
    
    for (const query of searchQueries) {
        console.log(`Searching for: ${query}`);
        
        // Execute search in Gmail
        await executeGmailSearch(query);
        await sleep(1000);
        
        // Process all results from this search
        const emails = await processSearchResults();
        
        // Add to our collection (Map prevents duplicates)
        emails.forEach(email => {
            newsletters.set(email.threadId, email);
        });
        
        console.log(`Found ${emails.length} emails for query: ${query}`);
    }
    
    return Array.from(newsletters.values());
}

async function scanAllWithProgress() {
    const classifier = new OllamaNewsletterClassifier();
    const newsletters = [];
    let processed = 0;
    
    // Update popup with progress
    const updateProgress = (current, total, found, status) => {
        try {
            chrome.runtime.sendMessage({
                action: 'updateScanProgress',
                data: {
                    processed: current,
                    total: total,
                    newsletters: found,
                    status: status
                }
            });
        } catch (error) {
            console.error('Progress update failed:', error);
        }
    };
    
    // Instead of searching, scan visible emails more thoroughly
    console.log('Starting comprehensive scan of visible emails...');
    updateProgress(0, 100, 0, 'Analyzing visible emails...');
    
    const emailElements = findEmailElements();
    console.log(`Found ${emailElements.length} email elements`);
    
    const batchSize = 5; // Smaller batches
    
    for (let i = 0; i < emailElements.length; i += batchSize) {
        const batch = emailElements.slice(i, i + batchSize);
        
        // Process batch
        for (const element of batch) {
            const emailData = extractEmailData(element);
            if (emailData) {
                const classification = await classifier.classifyEmail(emailData);
                
                if (classification.isNewsletter) {
                    newsletters.push({
                        ...emailData,
                        ...classification
                    });
                }
                
                processed++;
                updateProgress(processed, emailElements.length, newsletters.length, 
                    `Processed ${processed}/${emailElements.length} emails`);
            }
        }
        
        // Brief pause between batches
        await sleep(200);
    }
    
    updateProgress(processed, processed, newsletters.length, 
        `Complete: Found ${newsletters.length} newsletters`);
    
    return newsletters;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    switch (request.action) {
        case 'scanNewsletters':
            handleScanNewsletters(sendResponse);
            return true; // Keep message channel open
            
        case 'scanAllNewsletters':
            handleScanAllNewsletters(sendResponse);
            return true; // Keep message channel open
            
        case 'checkGmailReady':
            sendResponse({ ready: isGmailReady });
            break;
            
        default:
            console.log('Unknown action:', request.action);
            sendResponse({ error: 'Unknown action' });
    }
});

// Handle full newsletter scanning
async function handleScanAllNewsletters(sendResponse) {
    console.log('Starting full account newsletter scan...');
    
    if (!isGmailReady) {
        sendResponse({
            success: false,
            error: 'Gmail not ready'
        });
        return;
    }
    
    try {
        // Use the enhanced scanning with progress
        const newsletters = await scanAllWithProgress();
        
        console.log(`Found ${newsletters.length} newsletters total:`, newsletters);
        
        sendResponse({
            success: true,
            newsletters: newsletters,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error scanning all newsletters:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Handle newsletter scanning (current view only)
async function handleScanNewsletters(sendResponse) {
    console.log('Starting newsletter scan...');
    
    if (!isGmailReady) {
        sendResponse({
            success: false,
            error: 'Gmail not ready'
        });
        return;
    }
    
    try {
        // Get emails from current Gmail view
        const newsletters = await scanForNewsletters();
        
        console.log(`Found ${newsletters.length} newsletters:`, newsletters);
        
        sendResponse({
            success: true,
            newsletters: newsletters,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error scanning newsletters:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Main newsletter scanning function (current view)
async function scanForNewsletters() {
    const newsletters = [];
    const senderCounts = {};
    
    // Find email elements in current Gmail view
    const emailElements = findEmailElements();
    console.log(`Found ${emailElements.length} email elements to analyze`);
    
    for (const emailElement of emailElements) {
        const emailData = extractEmailData(emailElement);
        
        if (emailData && isNewsletter(emailData)) {
            const sender = emailData.sender;
            
            // Count emails from same sender
            if (senderCounts[sender]) {
                senderCounts[sender].count++;
            } else {
                senderCounts[sender] = {
                    sender: sender,
                    subject: emailData.subject,
                    count: 1,
                    unsubscribeLink: emailData.unsubscribeLink
                };
            }
        }
    }
    
    // Convert to array
    return Object.values(senderCounts);
}

// Find email elements in Gmail DOM
function findEmailElements() {
    const emailElements = [];
    
    // Different selectors for different Gmail views
    const emailSelectors = [
        '.zA', // Email list items
        '[data-thread-id]', // Thread elements
        '[role="listitem"]', // List items
        '.aDP', // Email content rows
        'tr.zA' // Table rows in email list
    ];
    
    for (const selector of emailSelectors) {
        const elements = document.querySelectorAll(selector);
        console.log(`Selector "${selector}" found ${elements.length} elements`);
        
        elements.forEach(element => {
            // Avoid duplicates
            if (!emailElements.includes(element)) {
                emailElements.push(element);
            }
        });
    }
    
    return emailElements.slice(0, 50); // Limit to first 50 for performance
}

// Extract email data from DOM element
function extractEmailData(element) {
    try {
        // Get sender information
        const senderElement = element.querySelector('[email]') || 
                            element.querySelector('.yW span') ||
                            element.querySelector('[title*="@"]') ||
                            element.querySelector('.go span');
        
        // Get subject
        const subjectElement = element.querySelector('.bog') ||
                             element.querySelector('[data-thread-id] span') ||
                             element.querySelector('.y6 span');
        
        // Get snippet/content preview
        const snippetElement = element.querySelector('.y2') ||
                             element.querySelector('.bog + span');
        
        const sender = senderElement ? 
            (senderElement.getAttribute('email') || 
             senderElement.getAttribute('title') || 
             senderElement.textContent.trim()) : 
            'Unknown Sender';
            
        const subject = subjectElement ? 
            subjectElement.textContent.trim() : 
            'No Subject';
            
        const snippet = snippetElement ? 
            snippetElement.textContent.trim() : 
            '';
        
        // Look for unsubscribe links (we'll enhance this later)
        const unsubscribeLink = findUnsubscribeLink(element);
        
        if (sender && sender !== 'Unknown Sender') {
            return {
                sender,
                subject,
                snippet,
                unsubscribeLink
            };
        }
        
    } catch (error) {
        console.error('Error extracting email data:', error);
    }
    
    return null;
}

// Check if email is likely a newsletter (fallback for when Ollama fails)
function isNewsletter(emailData) {
    const { sender, subject, snippet } = emailData;
    const content = (subject + ' ' + snippet).toLowerCase();
    const senderLower = sender.toLowerCase();
    
    // EXCLUDE transactional emails (these should NOT be newsletters)
    const transactionalExclusions = [
        // Security & Account
        /security|sicurezza|avviso.*sicurezza/i.test(content),
        /password|reset|login|sign.*in/i.test(content),
        /account.*suspended|account.*locked/i.test(content),
        
        // Financial transactions
        /payment.*failed|payment.*processed|carta.*aggiunta/i.test(content),
        /invoice|receipt|billing|subscription.*cancel/i.test(content),
        /abbonamento.*annull/i.test(content),
        
        // System notifications
        /project.*shut.*down|application.*added|terms.*service/i.test(content),
        /appointment.*reminder|messaggio.*nuovo/i.test(content),
        
        // Personal messages
        /ha.*un.*nuovo.*messaggio/i.test(content)
    ];
    
    // If it matches any exclusion, it's NOT a newsletter
    if (transactionalExclusions.some(test => test)) {
        return false;
    }
    
    // POSITIVE newsletter indicators (much more specific)
    const strongNewsletterSignals = [
        // Explicit newsletter indicators
        senderLower.includes('newsletter'),
        senderLower.startsWith('news@'),
        /newsletter/i.test(content),
        
        // Content marketing patterns
        /weekly.*digest|daily.*update|monthly.*roundup/i.test(content),
        /roadmap|personalized.*content/i.test(content),
        
        // Marketing campaigns
        /prezzo.*sceso|price.*drop|deal.*alert/i.test(content),
        /new.*jobs.*posted|job.*matching.*profile/i.test(content),
        /trial.*started|prova.*iniziata/i.test(content)
    ];
    
    // Medium confidence indicators (need multiple)
    const mediumSignals = [
        senderLower.includes('no-reply') || senderLower.includes('noreply'),
        /update|updates|aggiornamenti/i.test(content),
        /welcome/i.test(content) && senderLower.includes('medium'),
        /rinnovo.*abbonamento/i.test(content)
    ];
    
    // High confidence: any strong signal
    if (strongNewsletterSignals.some(signal => signal)) {
        return true;
    }
    
    // Medium confidence: multiple medium signals
    const mediumCount = mediumSignals.filter(signal => signal).length;
    return mediumCount >= 2;
}

// Find unsubscribe links (basic implementation)
function findUnsubscribeLink(element) {
    // This is a placeholder - we'll enhance this later
    const links = element.querySelectorAll('a[href]');
    
    for (const link of links) {
        const href = link.getAttribute('href');
        const text = link.textContent.toLowerCase();
        
        if (text.includes('unsubscribe') || href.includes('unsubscribe')) {
            return href;
        }
    }
    
    return null;
}

// Initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Also initialize on navigation changes (Gmail is a SPA)
let lastUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('Gmail navigation detected, reinitializing...');
        setTimeout(initialize, 1000); // Wait for new content to load
    }
}, 1000);
