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

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    switch (request.action) {
        case 'scanNewsletters':
            handleScanNewsletters(sendResponse);
            return true; // Keep message channel open
            
        case 'checkGmailReady':
            sendResponse({ ready: isGmailReady });
            break;
            
        default:
            console.log('Unknown action:', request.action);
            sendResponse({ error: 'Unknown action' });
    }
});

// Handle newsletter scanning
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

// Main newsletter scanning function
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

// REPLACE the isNewsletter function in gmail-content.js with this improved version:

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
