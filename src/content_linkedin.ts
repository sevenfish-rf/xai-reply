// Content script for XAi Reply (LinkedIn)
// Adds template buttons to the "Add a note" connection modal and post comment areas

import { DEFAULT_LINKEDIN_TEMPLATES, DEFAULT_LINKEDIN_POST_TEMPLATES, ReplyTemplate, GenerateReplyRequest, OPENROUTER_MODELS } from './types';

interface LinkedInTemplate {
    id: string;
    name: string;
    message?: string; // legacy field
    prompt?: string;  // aligned with popup definitions
    icon?: string;
}

// Note: Connection templates are now loaded from storage

class XAiReplyLinkedIn {
    private templates: LinkedInTemplate[] = [];
    private postReplyTemplates: ReplyTemplate[] = DEFAULT_LINKEDIN_POST_TEMPLATES;
    private observer: MutationObserver | null = null;
    private injectedModals = new WeakSet<HTMLTextAreaElement>();
    private injectedCommentAreas = new WeakSet<HTMLElement>();
    private currentRecipientName: string | null = null;
    private lastUrl: string = location.href;
    private providerConfig: any = null;
    private cachedModels: any[] = [];

    constructor() {
        this.init();
    }

    private async init() {
        // Check if chrome APIs are available
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.runtime) {
            console.error('XAi Reply LinkedIn: Chrome extension APIs not available');
            return;
        }

        try {
            // Load LinkedIn-specific settings, provider config, and fetched models from storage
            const [syncRes, localRes] = await Promise.all([
                chrome.storage.sync.get(['linkedinSettings', 'linkedinTemplates', 'providerConfig']),
                chrome.storage.local.get(['fetchedModels'])
            ]);

            if (syncRes.linkedinTemplates && Array.isArray(syncRes.linkedinTemplates)) {
                this.templates = syncRes.linkedinTemplates;
            }
            // Load LinkedIn post reply templates from settings
            if (syncRes.linkedinSettings?.templates && Array.isArray(syncRes.linkedinSettings.templates)) {
                this.postReplyTemplates = syncRes.linkedinSettings.templates;
            }

            this.providerConfig = syncRes.providerConfig || null;
            this.cachedModels = localRes.fetchedModels || [];
        } catch (error) {
            console.error('XAi Reply LinkedIn: Failed to load templates from storage:', error);
            // Continue with default templates if storage fails
        }

        this.captureRecipientNameOnClicks();
        this.monitorUrlChanges();
        this.setupFocusListener(); // Add focus-based detection like X/Twitter
        this.startObserving();
        // Initial scan – in case modal or comment areas are already present when the script loads.
        this.scanNode(document.body);
    }

    /**
     * Set up focus listener to detect when user clicks in comment areas
     */
    private setupFocusListener() {
        document.addEventListener('focus', (event) => {
            const target = event.target as HTMLElement;

            // Check if this is a LinkedIn comment input area
            if (this.isLinkedInCommentArea(target)) {
                this.injectPostReplyButtons(target);
            }
        }, true); // Use capture phase to catch events early
    }

    /**
     * Check if the focused element is a LinkedIn comment input area
     */
    private isLinkedInCommentArea(element: HTMLElement): boolean {
        if (!element) return false;

        // Check if it's contenteditable (LinkedIn's rich text editor)
        if (element.isContentEditable) {
            // Check various indicators that this is a LinkedIn comment area
            const isCommentArea = (
                // Has aria-label related to comments
                element.getAttribute('aria-label')?.toLowerCase().includes('comment') ||
                // Has placeholder about adding comment
                element.getAttribute('placeholder')?.toLowerCase().includes('comment') ||
                // Is inside a comment-related container
                element.closest('[class*="comment"]') !== null ||
                // Has LinkedIn's specific classes
                element.classList.contains('tiptap') ||
                element.classList.contains('ProseMirror') ||
                // Quill editor classes (for post detail pages)
                element.classList.contains('ql-editor') ||
                element.hasAttribute('data-test-ql-editor-contenteditable') ||
                element.hasAttribute('data-placeholder') ||
                // Check parent elements for comment indicators
                element.closest('[aria-label*="Add a comment"]') !== null ||
                element.closest('[aria-label*="comment"]') !== null ||
                // Check for Quill editor container
                element.closest('.comments-comment-box__form') !== null ||
                // Check for text editor for creating content
                (element.getAttribute('aria-label')?.toLowerCase().includes('creating content') ?? false)
            );

            return isCommentArea;
        }

        // Check if it's a textarea in a comment context
        if (element instanceof HTMLTextAreaElement) {
            const isTextareaComment = (
                element.placeholder?.toLowerCase().includes('comment') ||
                element.closest('[class*="comment"]') !== null
            );
            return isTextareaComment;
        }

        return false;
    }

    /**
     * Use a MutationObserver to detect new modals being added.
     */
    private startObserving() {
        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.scanNode(node as HTMLElement);
                        }
                    });
                }
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Recursively scan the provided node (and its descendants) for textareas and comment boxes.
     */
    private scanNode(root: HTMLElement) {
        // Look for connection modal textarea
        const textareas = root.querySelectorAll<HTMLTextAreaElement>('textarea#custom-message');
        textareas.forEach((ta) => this.injectButtons(ta));

        // Also handle the case where the root itself is the textarea.
        if (root instanceof HTMLTextAreaElement && root.id === 'custom-message') {
            this.injectButtons(root);
        }

        // Look for post comment areas
        this.scanForCommentAreas(root);
    }

    /**
     * Scan for LinkedIn post comment areas where we should inject reply buttons
     */
    private scanForCommentAreas(root: HTMLElement) {
        // LinkedIn comment selectors based on the provided HTML structure
        const commentSelectors = [
            // Target the main comment editor container based on your provided HTML
            '[aria-label="Text editor for creating comment"]',
            // Alternative selectors for different LinkedIn versions
            '.comments-comment-box__form',
            '.comments-comment-box-comment__text-editor',
            '[data-test-id="comments-comment-texteditor"]',
            '.comments-comment-box textarea',
            '.comments-comment-box [contenteditable="true"]',
            'form[data-test-id="comment-form"]',
            '.comment-form',
            '[aria-label*="Add a comment"]',
            '[placeholder*="Add a comment"]',
            // New selectors based on the provided HTML structure
            '[data-testid="ui-core-tiptap-text-editor-wrapper"]',
            '.tiptap.ProseMirror[contenteditable="true"]',
            // Post detail page comment editor (Quill editor) - more specific selectors
            '.ql-editor[contenteditable="true"]',
            '.ql-editor[data-test-ql-editor-contenteditable="true"]',
            '.comments-comment-box__form .ql-editor',
            '.editor-content .ql-editor',
            '.ql-container .ql-editor',
            '[aria-label="Text editor for creating content"]',
            '[data-placeholder="Add a comment…"][contenteditable="true"]'
        ];

        for (const selector of commentSelectors) {
            const elements = root.querySelectorAll(selector);
            elements.forEach((element) => {
                if (element instanceof HTMLElement) {
                    this.injectPostReplyButtons(element);
                }
            });
        }

        // Also check if the root itself matches any of these selectors
        for (const selector of commentSelectors) {
            if (root.matches && root.matches(selector)) {
                this.injectPostReplyButtons(root);
                break;
            }
        }
    }

    /**
     * Injects template buttons adjacent to the textarea inside the modal.
     */
    private injectButtons(textArea: HTMLTextAreaElement) {
        // Prevent duplicate injection for the same modal/textarea.
        if (this.injectedModals.has(textArea)) {
            return;
        }

        // The modal structure may change – attempt to insert after the textarea or within a suitable container.
        const container = document.createElement('div');
        container.className = 'reply-bot-container';
        container.innerHTML = '<div class="reply-bot-buttons"></div>';

        const buttonsDiv = container.querySelector('.reply-bot-buttons') as HTMLElement;
        this.templates.forEach((template) => {
            const button = this.createTemplateButton(template, textArea);
            buttonsDiv.appendChild(button);
        });

        // Prefer inserting right after the textarea for simple layout.
        if (textArea.parentElement) {
            textArea.parentElement.appendChild(container);
        } else {
            // Fallback: insert before modal action bar if available.
            const modal = textArea.closest('div[role="dialog"]');
            const actionBar = modal?.querySelector('.artdeco-modal__actionbar');
            actionBar?.parentElement?.insertBefore(container, actionBar);
        }

        this.injectedModals.add(textArea);
    }

    /**
     * Creates an individual template button.
     */
    private createTemplateButton(template: LinkedInTemplate, textArea: HTMLTextAreaElement): HTMLButtonElement {
        const button = document.createElement('button');
        button.className = 'reply-bot-button';
        button.textContent = `${template.icon || ''} ${template.name}`.trim();
        button.title = `Insert ${template.name}`;

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const msg = template.message ?? template.prompt ?? '';
            this.insertMessage(msg, textArea);
        });

        return button;
    }

    /**
     * Inserts the chosen message into the textarea, firing input events so that LinkedIn UI updates.
     */
    private insertMessage(message: string, textArea: HTMLTextAreaElement) {
        textArea.focus();
        const safeMessage = message || '';
        let personalizedMessage: string;
        if (this.currentRecipientName) {
            personalizedMessage = safeMessage.replace(/\{name\}/gi, this.currentRecipientName);
        } else {
            // Remove placeholder and any adjoining punctuation/extra spaces.
            personalizedMessage = safeMessage
                .replace(/\s*[,;:\-]?\s*\{name\}\s*/gi, ' ') // remove placeholder and neighbor punctuation
                .replace(/\s{2,}/g, ' ') // collapse double spaces
                .trim();
        }

        textArea.value = personalizedMessage;

        // Dispatch an input event so React/Svelte/etc. knows the value changed.
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        textArea.dispatchEvent(inputEvent);

        // Also dispatch change event for good measure.
        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        textArea.dispatchEvent(changeEvent);
    }

    /**
     * Global click listener to capture the recipient's name when user presses Connect/Message.
     */
    private captureRecipientNameOnClicks() {
        document.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            if (!(target instanceof HTMLElement)) return;

            // Traverse up to button element
            const button = target.closest('button');
            if (!button) return;

            const label = (button.getAttribute('aria-label') || '').toLowerCase();

            // Patterns we expect:
            // "invite {name} to connect", "connect with {name}", or "message {name}"
            const connectMatch = label.match(/invite\s+(.+?)\s+to\s+connect/);
            const connectMatch2 = label.match(/connect\s+(?:with\s+)?(.+)/);
            const messageMatch = label.match(/message\s+(.+)/);

            let rawName: string | undefined;
            if (connectMatch && connectMatch[1]) rawName = connectMatch[1];
            else if (connectMatch2 && connectMatch2[1]) rawName = connectMatch2[1];
            else if (messageMatch && messageMatch[1]) rawName = messageMatch[1];

            // Fallback: grab name from profile header (h1) if available
            if (!rawName) {
                const header = document.querySelector('h1.inline.t-24, h1.text-heading-xlarge');
                if (header && header.textContent) {
                    rawName = header.textContent.trim();
                }
            }

            if (rawName) {
                // Extract first word as first name, remove non-alphabetic chars, capitalize.
                const firstWord = rawName.trim().split(/\s+/)[0] || '';
                const cleaned = firstWord.replace(/[^a-zA-Z'’\-]/g, '');
                if (cleaned.length > 0) {
                    this.currentRecipientName = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
                } else {
                    this.currentRecipientName = null;
                }
            }
        }, true); // capture phase to ensure we run before modal logic
    }

    /**
     * Clears cached recipient name when navigating to a new URL (SPA behavior).
     */
    private monitorUrlChanges() {
        const checkUrl = () => {
            if (location.href !== this.lastUrl) {
                this.lastUrl = location.href;
                this.currentRecipientName = null;
            }
        };
        // Observe history API changes via popstate
        window.addEventListener('popstate', checkUrl);
        // Periodic fallback (some SPA frameworks use pushState without events we can catch)
        setInterval(checkUrl, 1000);
    }

    /**
     * Injects post reply buttons for LinkedIn comment areas
     */
    private injectPostReplyButtons(commentElement: HTMLElement) {
        // Prevent duplicate injection
        if (this.injectedCommentAreas.has(commentElement)) {
            return;
        }

        // Find the appropriate container to insert buttons ABOVE the comment area
        let insertionTarget: HTMLElement | null = null;

        // Strategy: Find a parent container that we can insert buttons above
        // We want to avoid inserting inside the comment editor itself

        // Strategy: Find the ENTIRE comment section container, not just the input area
        // Based on the HTML you provided, we need to find the parent of the comment input area

        // Start from the focused element and walk up to find the full comment section
        let current = commentElement;
        while (current && current !== document.body) {
            // Look for the parent container that contains both the comment input and other comment elements
            // This should be a div that contains the comment input area but is not the input itself
            const parent = current.parentElement;
            if (parent) {
                // Check if this parent contains comment-related elements and is a good insertion target
                const hasCommentStructure =
                    parent.querySelector('[aria-label*="comment"]') ||
                    parent.querySelector('[data-testid*="comment"]') ||
                    parent.classList.toString().includes('comment') ||
                    parent.querySelector('.reply-bot-container'); // Already has our buttons

                // Make sure it's not too small (avoid text spans) and not the input itself
                if (hasCommentStructure &&
                    parent.offsetHeight > 30 &&
                    !parent.isContentEditable &&
                    parent.tagName === 'DIV') {

                    // Walk up one more level to get outside the immediate comment area
                    const grandParent = parent.parentElement;
                    if (grandParent && grandParent.offsetHeight > parent.offsetHeight) {
                        insertionTarget = parent;
                        break;
                    }
                }
            }
            current = current.parentElement as HTMLElement;
        }

        // Fallback: if we didn't find a good target, find the nearest block-level container
        if (!insertionTarget) {
            current = commentElement;
            let depth = 0;
            while (current && current !== document.body && depth < 8) {
                if (current.tagName === 'DIV' &&
                    current.offsetHeight > 50 &&
                    !current.isContentEditable) {
                    insertionTarget = current;
                    break;
                }
                current = current.parentElement as HTMLElement;
                depth++;
            }
        }

        if (!insertionTarget) {
            console.error('XAiReplyLinkedIn: Could not find suitable insertion target');
            return;
        }

        // The input element is the one that was focused (commentElement)
        const inputElement = commentElement;

        // Check if we've already added buttons near this area (more thorough check)
        let existingButtons = insertionTarget.parentElement?.querySelector('.reply-bot-container.linkedin-post-replies');
        if (!existingButtons) {
            // Also check if buttons exist as a sibling or in nearby area
            existingButtons = insertionTarget.querySelector('.reply-bot-container.linkedin-post-replies');
        }
        if (!existingButtons && insertionTarget.parentElement) {
            // Check siblings
            const siblings = insertionTarget.parentElement.children;
            for (let i = 0; i < siblings.length; i++) {
                if (siblings[i].classList.contains('reply-bot-container')) {
                    existingButtons = siblings[i] as HTMLElement;
                    break;
                }
            }
        }

        if (existingButtons) {
            this.injectedCommentAreas.add(commentElement);
            return;
        }

        // Create the button container card just like in X/Twitter
        const container = this.createButtonContainer(inputElement);

        // Insert the button container ABOVE the insertion target
        let inserted = false;

        if (insertionTarget.parentElement) {
            // Insert above the comment section
            insertionTarget.parentElement.insertBefore(container, insertionTarget);
            inserted = true;
        } else {
            // Fallback: try to insert at the top of the insertion target
            insertionTarget.insertBefore(container, insertionTarget.firstChild);
            inserted = true;
        }

        if (inserted) {
            this.injectedCommentAreas.add(commentElement);
        }
    }

    /**
     * Creates a button container for LinkedIn comments with tabs and model dropdown matching the X design
     */
    private createButtonContainer(inputElement: HTMLElement): HTMLElement {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'reply-bot-container';
        buttonContainer.innerHTML = `
            <div class="reply-bot-header">
                <span class="reply-bot-title">✨ XAi Reply</span>
                <button class="reply-bot-close-btn" title="Hide assistant">×</button>
            </div>
            
            <div class="reply-bot-prompt-section">
                <input type="text" class="reply-bot-custom-input" placeholder="Instruct AI (e.g. 'make it witty', 'reply in Spanish')..." />
                <button class="reply-bot-custom-go" title="Generate with custom instructions">Go</button>
            </div>

            <div class="reply-bot-options-row">
                <div class="reply-bot-option-group">
                    <span class="reply-bot-option-label">Length:</span>
                    <div class="reply-bot-option-pills">
                        <button class="reply-bot-option-pill active" data-length="short">Short</button>
                        <button class="reply-bot-option-pill" data-length="medium">Medium</button>
                        <button class="reply-bot-option-pill" data-length="long">Long</button>
                    </div>
                </div>

                <div class="reply-bot-option-group">
                    <span class="reply-bot-option-label">Lang:</span>
                    <select class="reply-bot-option-select reply-bot-lang-select">
                        <option value="auto" selected>Auto</option>
                        <option value="English">EN</option>
                        <option value="Indonesian">ID</option>
                        <option value="Japanese">JP</option>
                        <option value="Spanish">ES</option>
                        <option value="Chinese">ZH</option>
                    </select>
                </div>

                <div class="reply-bot-option-group" style="flex: 1; min-width: 80px;">
                    <span class="reply-bot-option-label">Model:</span>
                    <select class="reply-bot-option-select reply-bot-model-select" style="width: 100%;">
                    </select>
                </div>
            </div>

            <div class="reply-bot-templates-section">
                <div class="reply-bot-templates-tabs">
                    <button class="reply-bot-templates-tab active" data-category="positive" type="button">✨ Positive</button>
                    <button class="reply-bot-templates-tab" data-category="brainy" type="button">💡 Brainy</button>
                    <button class="reply-bot-templates-tab" data-category="spiced" type="button">🔥 Spiced</button>
                </div>
                <div class="reply-bot-templates-grid"></div>
            </div>
            
            <div class="reply-bot-footer">
                <button class="reply-bot-draft-btn" style="display: none;" title="Save generated response as draft">💾 Save Draft</button>
                <div class="reply-bot-usage" style="display: none;"></div>
            </div>
        `;

        // Close button action
        const closeBtn = buttonContainer.querySelector('.reply-bot-close-btn') as HTMLButtonElement;
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            buttonContainer.style.display = 'none';
        });

        // Toggle active length pill
        const lengthPills = buttonContainer.querySelectorAll('.reply-bot-option-pill');
        lengthPills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                lengthPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            });
        });

        // Populate and handle inline model selector
        const modelSelect = buttonContainer.querySelector('.reply-bot-model-select') as HTMLSelectElement;
        const currentModel = this.providerConfig?.model || '';
        let modelsToShow: any[] = [];
        if (this.providerConfig?.mode === 'openrouter') {
            modelsToShow = OPENROUTER_MODELS;
        } else {
            modelsToShow = this.cachedModels;
        }

        if (modelsToShow.length === 0) {
            const opt = document.createElement('option');
            opt.value = currentModel;
            opt.textContent = currentModel || '(Fetch Models in settings)';
            modelSelect.appendChild(opt);
        } else {
            modelsToShow.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name || m.id;
                modelSelect.appendChild(opt);
            });
        }

        if (currentModel) {
            modelSelect.value = currentModel;
        }

        modelSelect.addEventListener('change', async () => {
            const selectedModel = modelSelect.value;
            if (this.providerConfig) {
                this.providerConfig.model = selectedModel;
                await chrome.storage.sync.set({ providerConfig: this.providerConfig });
            }
        });

        // Custom prompt generation
        const customInput = buttonContainer.querySelector('.reply-bot-custom-input') as HTMLInputElement;
        const customGo = buttonContainer.querySelector('.reply-bot-custom-go') as HTMLButtonElement;

        const triggerCustomGen = async (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            const instruction = customInput.value.trim();
            if (!instruction) return;

            const customTemplate: ReplyTemplate = {
                id: 'custom_prompt',
                name: 'Custom',
                prompt: 'Follow the custom user instruction to reply.'
            };

            await this.generatePostReplyWithCustom(customGo, customTemplate, inputElement, instruction);
        };

        customGo.addEventListener('click', triggerCustomGen);
        customInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                triggerCustomGen(e);
            }
        });

        // Handle template category tabs and rendering
        const templatesGrid = buttonContainer.querySelector('.reply-bot-templates-grid') as HTMLElement;
        const categoryTabs = buttonContainer.querySelectorAll('.reply-bot-templates-tab');

        const descriptionsMap: Record<string, string> = {
            'agree': 'Validate and build on post',
            'professional': 'Formal and value-driven comment',
            'congrats': 'Celebrate wins & milestones',
            'encourage': 'Motivate and show positive support',
            'question': 'Engage with supportive questions',
            'insight': 'Deep professional analysis',
            'expertise': 'Share relevant skills/knowledge',
            'response': 'Standard thoughtful reaction',
            'funny': 'Clever, clean workplace humor',
            'disagree': 'Constructive alternate perspective'
        };

        const renderCategoryTemplates = (category: string) => {
            templatesGrid.innerHTML = '';

            // Map categories to list of template IDs
            let allowedIds: string[] = [];
            if (category === 'positive') {
                allowedIds = ['agree', 'professional', 'congrats', 'encourage'];
            } else if (category === 'brainy') {
                allowedIds = ['question', 'insight', 'expertise', 'response'];
            } else {
                allowedIds = ['funny', 'disagree'];
            }

            const filtered = this.postReplyTemplates.filter(t => allowedIds.includes(t.id));

            filtered.forEach(template => {
                const card = document.createElement('button');
                card.className = 'reply-bot-template-card';
                card.type = 'button';
                card.title = `Generate ${template.name} reply`;

                const desc = descriptionsMap[template.id] || 'Generate themed AI response';

                card.innerHTML = `
                    <span class="card-icon">${template.icon || '💬'}</span>
                    <div class="card-text-wrapper">
                        <span class="card-title">${template.name}</span>
                        <span class="card-description">${desc}</span>
                    </div>
                `;

                card.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await this.generatePostReply(e, template, inputElement);
                });

                templatesGrid.appendChild(card);
            });
        };

        // Initialize positive tab template list
        renderCategoryTemplates('positive');

        categoryTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                categoryTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const category = tab.getAttribute('data-category') || 'positive';
                renderCategoryTemplates(category);
            });
        });

        return buttonContainer;
    }

    /**
     * Find the comment input element near the button that was clicked
     */
    private findNearbyInputElement(button: HTMLButtonElement, originalInputElement: HTMLElement): HTMLElement | null {
        // Strategy 1: Check if the original input element is still valid and nearby
        if (originalInputElement.isConnected && this.isLinkedInCommentArea(originalInputElement)) {
            // Check if they're in the same general area (same post)
            const buttonContainer = button.closest('[role="listitem"], .feed-shared-update-v2, .occludable-update');
            const inputContainer = originalInputElement.closest('[role="listitem"], .feed-shared-update-v2, .occludable-update');
            
            if (buttonContainer && inputContainer && buttonContainer === inputContainer) {
                return originalInputElement;
            }
        }

        // Strategy 2: Look for input elements in the same post container as the button
        const postContainer = button.closest('[role="listitem"], .feed-shared-update-v2, .occludable-update, .comments-comment-box__form');
        if (postContainer) {
            
            const inputSelectors = [
                '.ql-editor[contenteditable="true"]',
                '.ql-editor[data-test-ql-editor-contenteditable="true"]',
                '[aria-label="Text editor for creating content"]',
                '[data-placeholder="Add a comment…"][contenteditable="true"]',
                '.tiptap.ProseMirror[contenteditable="true"]',
                '[aria-label="Text editor for creating comment"]',
                '[contenteditable="true"][aria-label*="comment" i]'
            ];

            for (const selector of inputSelectors) {
                const candidate = postContainer.querySelector<HTMLElement>(selector);
                if (candidate && this.isLinkedInCommentArea(candidate)) {
                    return candidate;
                }
            }
        }

        // Strategy 3: Look for input elements near the button (siblings/nearby elements)
        let current = button.parentElement;
        let depth = 0;
        while (current && depth < 5) {
            const inputSelectors = [
                '.ql-editor[contenteditable="true"]',
                '.ql-editor[data-test-ql-editor-contenteditable="true"]',
                '[aria-label="Text editor for creating content"]',
                '[data-placeholder="Add a comment…"][contenteditable="true"]',
                '.tiptap.ProseMirror[contenteditable="true"]',
                '[contenteditable="true"][aria-label*="comment" i]'
            ];

            for (const selector of inputSelectors) {
                const candidate = current.querySelector<HTMLElement>(selector);
                if (candidate && this.isLinkedInCommentArea(candidate)) {
                    return candidate;
                }
            }
            current = current.parentElement;
            depth++;
        }

        return null;
    }

    /**
     * Generates AI-powered post reply similar to X implementation
     */
    private async generatePostReply(event: MouseEvent, template: ReplyTemplate, originalInputElement: HTMLElement) {
        const button = event.currentTarget as HTMLButtonElement;
        await this.generatePostReplyInternal(button, template, originalInputElement);
    }

    private async generatePostReplyWithCustom(button: HTMLButtonElement, template: ReplyTemplate, originalInputElement: HTMLElement, customInstruction: string) {
        await this.generatePostReplyInternal(button, template, originalInputElement, customInstruction);
    }

    private async generatePostReplyInternal(button: HTMLButtonElement, template: ReplyTemplate, originalInputElement: HTMLElement, customInstruction?: string) {
        const originalText = button.textContent;

        // Check if chrome APIs are available before proceeding
        if (typeof chrome === 'undefined' || !chrome.runtime) {
            alert('Extension error: Please refresh the page and try again.');
            return;
        }

        const buttonContainer = button.closest('.reply-bot-container');

        try {
            // Show loading state
            button.textContent = '⏳ Generating...';
            button.disabled = true;

            // Find the actual input element near our button
            const inputElement = this.findNearbyInputElement(button, originalInputElement);
            if (!inputElement) {
                throw new Error('Could not find the comment input area. Please click directly in the comment box and try again.');
            }

            // Get selected length option from DOM
            const activeLengthPill = buttonContainer?.querySelector('.reply-bot-option-pill.active');
            const length = (activeLengthPill?.getAttribute('data-length') || 'short') as 'short' | 'medium' | 'long';

            // Get selected language option from DOM
            const activeLangSelect = buttonContainer?.querySelector('.reply-bot-lang-select') as HTMLSelectElement;
            const targetLanguage = activeLangSelect?.value || 'auto';

            // Get the post content and container context
            const postContext = this.getLinkedInPostContext(inputElement);

            if (!postContext.content) {
                throw new Error('Could not find post content to reply to. Try clicking directly in the comment box first.');
            }

            const postContent = postContext.content;

            console.log('XAi Reply LinkedIn: Generating reply for post:', postContent.substring(0, 100) + '...');

            // Send request to background script
            const request: GenerateReplyRequest = {
                tweetContent: postContent,
                template,
                platform: 'linkedin',
                customInstruction,
                length,
                targetLanguage
            };

            const response = await this.sendMessageWithRetry({
                action: 'generateReply',
                data: request
            });

            if (!response) {
                throw new Error('No response from extension. Please refresh the page and try again.');
            }

            if (response.error) {
                throw new Error(response.error);
            }

            if (!response.reply || response.reply.trim() === '') {
                throw new Error('Generated reply is empty. Please try again.');
            }

            console.log('XAi Reply LinkedIn: Generated reply:', response.reply);

            // Insert the generated reply with post context for accurate input finding
            await this.insertPostReply(response.reply, inputElement, postContext.container);

            // Display token usage if available
            const usageDiv = buttonContainer?.querySelector('.reply-bot-usage') as HTMLElement;
            if (usageDiv && response.usage) {
                const u = response.usage;
                let text = `Tokens: In ${u.promptTokens} | Out ${u.completionTokens}`;
                if (u.reasoningTokens !== undefined) {
                    text += ` (Reasoning: ${u.reasoningTokens})`;
                }
                text += ` | Total: ${u.totalTokens}`;
                usageDiv.textContent = text;
                usageDiv.style.display = 'block';
            } else if (usageDiv) {
                usageDiv.style.display = 'none';
            }

            // Setup Save Draft button action and display it
            const draftBtn = buttonContainer?.querySelector('.reply-bot-draft-btn') as HTMLButtonElement;
            if (draftBtn) {
                draftBtn.style.display = 'inline-flex';
                draftBtn.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    draftBtn.disabled = true;
                    draftBtn.textContent = 'Saving...';

                    try {
                        const localRes = await chrome.storage.local.get(['drafts']);
                        const draftsList = localRes.drafts || [];

                        // Try to find author name/handle
                        const authorEl = postContext.container?.querySelector('.update-components-actor__title, .feed-shared-actor__title');
                        const authorName = authorEl?.textContent?.trim() || 'LinkedIn User';

                        const newDraft = {
                            id: Math.random().toString(36).substring(2, 9),
                            platform: 'linkedin',
                            tweetContent: postContent.length > 150 ? postContent.substring(0, 150) + '...' : postContent,
                            replyContent: response.reply,
                            timestamp: Date.now(),
                            handle: authorName,
                            postUrl: window.location.href
                        };

                        draftsList.unshift(newDraft);
                        await chrome.storage.local.set({ drafts: draftsList });

                        draftBtn.textContent = '✅ Saved';
                        setTimeout(() => {
                            draftBtn.style.display = 'none';
                            draftBtn.disabled = false;
                            draftBtn.textContent = '💾 Save Draft';
                        }, 1500);
                    } catch (err) {
                        console.error('Failed to save draft:', err);
                        draftBtn.textContent = '❌ Failed';
                        draftBtn.disabled = false;
                    }
                };
            }

            // Reset button
            button.textContent = originalText;
            button.disabled = false;

        } catch (error) {
            console.error('Error generating LinkedIn post reply:', error);

            let errorMessage = 'Failed to generate reply';
            if (error instanceof Error) {
                errorMessage = error.message;
            }

            alert(`XAi Reply Error: ${errorMessage}`);

            // Reset button
            if (button) {
                button.textContent = originalText;
                button.disabled = false;
            }
        }
    }

    /**
     * Inserts the generated reply into LinkedIn comment input using robust typing simulation
     */
    private async insertPostReply(reply: string, inputElement: HTMLElement, postContainer?: HTMLElement | null) {
        if (!reply || reply.trim() === '') {
            console.error('LinkedIn: Cannot insert empty reply');
            return;
        }

        // Get typing speed from platform settings
        const { linkedinSettings } = await chrome.storage.sync.get(['linkedinSettings']);
        const typingSpeed = linkedinSettings?.advancedSettings?.typingSpeed ?? 5;

        // Helper to check if an element is the editable LinkedIn comment input
        const isEditableCommentInput = (el: Element | null): el is HTMLElement => {
            return !!el && el instanceof HTMLElement && (
                (el.isContentEditable && (
                    el.getAttribute('aria-label')?.toLowerCase().includes('comment') ||
                    el.classList.contains('tiptap') ||
                    el.classList.contains('ProseMirror') ||
                    el.classList.contains('ql-editor') ||
                    el.hasAttribute('data-test-ql-editor-contenteditable') ||
                    el.hasAttribute('data-placeholder') ||
                    el.closest('[aria-label*="comment"]') !== null ||
                    el.closest('.comments-comment-box__form') !== null ||
                    (el.getAttribute('aria-label')?.toLowerCase().includes('creating content') ?? false)
                )) ||
                (el instanceof HTMLTextAreaElement && el.placeholder?.toLowerCase().includes('comment'))
            );
        };

        // Helper to find the active editable element
        const findEditableInput = (): HTMLElement | null => {
            if (inputElement.isConnected && isEditableCommentInput(inputElement)) {
                return inputElement;
            }
            if (postContainer) {
                const selectors = [
                    '[aria-label="Text editor for creating comment"]',
                    '.tiptap.ProseMirror[contenteditable="true"]',
                    '[data-testid="ui-core-tiptap-text-editor-wrapper"] [contenteditable="true"]',
                    'textarea[placeholder*="comment" i]',
                    '[contenteditable="true"][aria-label*="comment" i]',
                    '.ql-editor[contenteditable="true"]',
                    '.ql-editor[data-test-ql-editor-contenteditable="true"]',
                    '.comments-comment-box__form .ql-editor',
                    '.editor-content .ql-editor',
                    '.ql-container .ql-editor',
                    '[aria-label="Text editor for creating content"]',
                    '[data-placeholder="Add a comment…"][contenteditable="true"]'
                ];

                for (const selector of selectors) {
                    const candidate = postContainer.querySelector<HTMLElement>(selector);
                    if (candidate && isEditableCommentInput(candidate)) {
                        return candidate;
                    }
                }
            }

            if (isEditableCommentInput(document.activeElement)) {
                const activeElement = document.activeElement as HTMLElement;
                if (postContainer) {
                    if (postContainer.contains(activeElement)) {
                        return activeElement;
                    }
                } else {
                    return activeElement;
                }
            }

            if (!postContainer) {
                const selectors = [
                    '[aria-label="Text editor for creating comment"]',
                    '.tiptap.ProseMirror[contenteditable="true"]',
                    '[data-testid="ui-core-tiptap-text-editor-wrapper"] [contenteditable="true"]',
                    'textarea[placeholder*="comment" i]',
                    '[contenteditable="true"][aria-label*="comment" i]',
                    '.ql-editor[contenteditable="true"]',
                    '.ql-editor[data-test-ql-editor-contenteditable="true"]',
                    '.comments-comment-box__form .ql-editor',
                    '.editor-content .ql-editor',
                    '.ql-container .ql-editor',
                    '[aria-label="Text editor for creating content"]',
                    '[data-placeholder="Add a comment…"][contenteditable="true"]'
                ];

                for (const selector of selectors) {
                    const candidate = document.querySelector<HTMLElement>(selector);
                    if (candidate && isEditableCommentInput(candidate)) {
                        return candidate;
                    }
                }
            }

            return null;
        };

        let editableElement = findEditableInput();

        if (!editableElement) {
            console.warn('LinkedIn: Editable element was disconnected during typing, attempting to recover.');
            await new Promise(r => setTimeout(r, 50));
            editableElement = findEditableInput();
        }

        if (!editableElement) {
            console.warn('LinkedIn: Could not recover editable element. Aborting reply typing.');
            alert('LinkedIn: Could not continue typing because the comment box disappeared.');
            return;
        }

        // Focus and clear existing content
        editableElement.focus();

        if (editableElement.isContentEditable) {
            if ((editableElement.textContent || '').trim() !== '') {
                editableElement.textContent = '';
                if (document.getSelection) {
                    const selection = document.getSelection();
                    if (selection) {
                        selection.selectAllChildren(editableElement);
                        selection.deleteFromDocument();
                    }
                }
            }

            // Cache original autocomplete attributes
            const origSpellcheck = editableElement.getAttribute('spellcheck');
            const origAutocorrect = editableElement.getAttribute('autocorrect');
            const origAutocomplete = editableElement.getAttribute('autocomplete');

            editableElement.setAttribute('spellcheck', 'false');
            editableElement.setAttribute('autocorrect', 'off');
            editableElement.setAttribute('autocomplete', 'off');

            try {
                if (typingSpeed === 0) {
                    // Instantly insert
                    document.execCommand('insertText', false, reply);
                } else {
                    // Type character by character
                    for (const char of reply) {
                        editableElement = findEditableInput();
                        if (!editableElement) {
                            console.warn('LinkedIn: Editable element was disconnected during typing.');
                            alert('LinkedIn: Reply cancelled because the comment box was closed.');
                            return;
                        }
                        editableElement.focus();
                        document.execCommand('insertText', false, char);

                        if (typingSpeed > 0) {
                            await new Promise(resolve => setTimeout(resolve, typingSpeed));
                        }
                    }
                }
            } finally {
                // Restore autocomplete attributes
                editableElement = findEditableInput();
                if (editableElement) {
                    if (origSpellcheck !== null) editableElement.setAttribute('spellcheck', origSpellcheck);
                    else editableElement.removeAttribute('spellcheck');

                    if (origAutocorrect !== null) editableElement.setAttribute('autocorrect', origAutocorrect);
                    else editableElement.removeAttribute('autocorrect');

                    if (origAutocomplete !== null) editableElement.setAttribute('autocomplete', origAutocomplete);
                    else editableElement.removeAttribute('autocomplete');

                    // Notify framework of final value
                    editableElement.dispatchEvent(new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        composed: true,
                    }));

                    // Set cursor to the end
                    editableElement.focus();
                    const selection = window.getSelection();
                    if (selection) {
                        const range = document.createRange();
                        range.selectNodeContents(editableElement);
                        range.collapse(false);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            }
        } else if (editableElement instanceof HTMLTextAreaElement || editableElement instanceof HTMLInputElement) {
            // Handle textarea/input elements
            editableElement.value = '';

            for (const char of reply) {
                editableElement = findEditableInput();
                if (!editableElement || !(editableElement instanceof HTMLTextAreaElement || editableElement instanceof HTMLInputElement)) {
                    console.warn('LinkedIn: Text input element was disconnected during typing.');
                    alert('LinkedIn: Reply cancelled because the text input was closed.');
                    return;
                }

                editableElement.focus();
                editableElement.value += char;

                if (typingSpeed > 0) {
                    await new Promise(resolve => setTimeout(resolve, typingSpeed));
                }
            }

            // Dispatch final input event for the textarea
            editableElement.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true
            }));
        }
    }

    /**
     * Gets the LinkedIn post context (content + container) we're commenting on
     */
    private getLinkedInPostContext(inputElement?: HTMLElement): { content: string | null; container: HTMLElement | null } {
        // If we have the input element context, try to find the specific post being replied to
        if (inputElement) {
            // Walk up the DOM from the comment input to find the post container
            let current = inputElement;
            let postContainer: HTMLElement | null = null;
            let extractedContent: string | null = null;

            // Look for the parent post container (similar to how X/Twitter finds the article)
            while (current && current !== document.body) {
                // LinkedIn post containers - check multiple patterns used by LinkedIn
                const isPostContainer = (
                    current.classList.contains('feed-shared-update-detail-viewer__modal-content') ||
                    current.classList.contains('feed-shared-update-detail-viewer__content') ||
                    current.classList.contains('feed-shared-update-detail-viewer__overflow-content') ||
                    current.getAttribute('role') === 'dialog' ||
                    current.classList.contains('modal') ||
                    current.classList.contains('overlay') ||
                    current.classList.contains('artdeco-modal') ||
                    current.hasAttribute('aria-modal') ||
                    current.getAttribute('role') === 'listitem' ||
                    current.classList.contains('feed-shared-update-v2') ||
                    current.classList.contains('feed-shared-update') ||
                    current.classList.contains('occludable-update') ||
                    current.classList.contains('feed-shared-activity') ||
                    current.hasAttribute('componentkey') ||
                    current.getAttribute('data-view-name') === 'main-feed-activity-card' ||
                    current.getAttribute('data-view-name') === 'feed-shared-update' ||
                    current.hasAttribute('data-urn') ||
                    (current.tagName === 'DIV' &&
                        current.offsetHeight > 200 &&
                        current.querySelector('[data-view-name="feed-commentary"]') !== null) ||
                    (current.tagName === 'DIV' && 
                        current.offsetHeight > 300 &&
                        (current.querySelector('.comments-comment-box__form') !== null ||
                         current.querySelector('[data-view-name="feed-commentary"]') !== null ||
                         current.querySelector('.feed-shared-text') !== null))
                );

                if (isPostContainer) {
                    // EXCLUDE containers that don't contain the actual post content
                    if (current.classList.contains('feed-shared-update-v2__comments-container') ||
                        current.classList.contains('comments-comments-list') ||
                        current.classList.contains('comments-comment-box') ||
                        current.classList.contains('update-v2-social-activity') ||
                        current.classList.contains('feed-shared-social-action-bar')) {
                        current = current.parentElement as HTMLElement;
                        continue;
                    }
                    
                    // Try to extract content inside this container candidate.
                    // If we find valid content, this is our true postContainer!
                    const contentResult = this.extractContentFromContainer(current);
                    if (contentResult) {
                        extractedContent = contentResult;
                        postContainer = current;
                        break;
                    }
                }
                current = current.parentElement as HTMLElement;
            }

            if (extractedContent && postContainer) {
                return { content: extractedContent, container: postContainer };
            }

            // BACKUP METHOD: Walk up until we find a parent with .break-words content
            let backupCurrent = inputElement;
            let backupContainer: HTMLElement | null = null;
            let depth = 0;
            
            while (backupCurrent && backupCurrent !== document.body && depth < 15) {
                const breakWordsElement = backupCurrent.querySelector('.break-words');
                if (breakWordsElement) {
                    const text = breakWordsElement.textContent?.trim();
                    if (text && text.length > 20 && !breakWordsElement.closest('.comments-comments-list, .comments-comment-item, .comments-comment-box')) {
                        backupContainer = backupCurrent;
                        break;
                    }
                }
                backupCurrent = backupCurrent.parentElement as HTMLElement;
                depth++;
            }
            
            if (backupContainer) {
                const contentResult = this.extractContentFromContainer(backupContainer);
                if (contentResult) {
                    return { content: contentResult, container: backupContainer };
                }
            }
        }

        // Only use global search as absolute fallback when no input element context is available
        const globalSelectors = [
            '[data-view-name="feed-commentary"] .break-words',
            '[data-testid="expandable-text-box"]',
            '.feed-shared-text__text-view .break-words'
        ];

        for (const selector of globalSelectors) {
            const elements = document.querySelectorAll(selector);

            if (elements.length > 0) {
                const element = elements[0];
                const text = element.textContent?.trim();

                if (text &&
                    text.length > 20 &&
                    text.length < 5000 &&
                    !element.closest('.comments-comments-list, .comments-comment-item, .comments-comment-box') &&
                    text.match(/[a-zA-Z]{3,}/)) {

                    return { content: text, container: null };
                }
            }
        }

        return { content: null, container: null };
    }

    /**
     * Extracts meaningful post content text from a candidate post container
     */
    private extractContentFromContainer(container: HTMLElement): string | null {
        const contentSelectors = [
            '[data-view-name="feed-commentary"] .break-words',
            '[data-testid="expandable-text-box"]',
            '.feed-shared-text__text-view .break-words',
            '.feed-shared-article__description .break-words',
            '.update-components-text .break-words .tvm-parent-container',
            '.update-components-text .break-words',
            '.update-components-update-v2__commentary .break-words',
            '.tvm-parent-container',
            '.update-components-text',
            '.update-components-update-v2__commentary',
            '[data-view-name="feed-commentary"]',
            '.feed-shared-text__text-view',
            '.feed-shared-text',
            '.feed-shared-article__description',
            '.feed-shared-text-view .break-words',
            '.feed-shared-update-v2__description .break-words',
            '.feed-shared-text-view',
            '.feed-shared-update-v2__description',
            '.article-header__title',
            '.article-content',
            '.linked-article__title',
            '.linked-article__summary',
            '.break-words',
            'span[dir="ltr"]',
            'h1, h2, h3',
            '[role="heading"]',
            'p'
        ];

        for (const selector of contentSelectors) {
            const elements = container.querySelectorAll(selector);
            for (let i = 0; i < elements.length; i++) {
                const element = elements[i];
                const text = element.textContent?.trim();

                if (!text) continue;
                if (text.length <= 10) continue;
                if (text.length >= 5000) continue;

                // Exclude any elements that are located inside comment threads or comment inputs
                if (element.closest('.comments-comments-list, .comments-comment-item, .comments-comment-box, .feed-shared-social-action-bar, .feed-shared-update-v2__comments-container')) {
                    continue;
                }

                // Exclude metric counters and standard action texts
                if (text.match(/^\d+\s*(like|comment|share|repost)/i)) continue;
                if (text.match(/^(like|comment|share|repost|send|follow|connect)\s*$/i)) continue;
                if (text.match(/^(•|·|\|)\s*/)) continue;
                if (!text.match(/[a-zA-Z]{3,}/)) continue;

                return text;
            }
        }

        return null;
    }


    /**
     * Sends message to background script with retry logic
     */
    private async sendMessageWithRetry(request: any, maxRetries = 3, delayMs = 200): Promise<any> {
        // Check if chrome.runtime is available
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
            throw new Error('Extension context is not available. Please refresh the page and try again.');
        }

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await chrome.runtime.sendMessage(request);

                // Check if we got a valid response
                if (response === undefined && attempt < maxRetries - 1) {
                    console.warn(`XAi Reply LinkedIn: Got undefined response, retrying... (attempt ${attempt + 1})`);
                    await new Promise(res => setTimeout(res, delayMs * (attempt + 1)));
                    continue;
                }

                return response;
            } catch (error) {
                console.warn(`XAi Reply LinkedIn: sendMessage attempt ${attempt + 1} failed:`, error);

                if (error instanceof Error) {
                    // Check for extension context invalidation
                    if (error.message.includes('Extension context invalidated') ||
                        error.message.includes('message port closed') ||
                        error.message.includes('Could not establish connection')) {

                        if (attempt === maxRetries - 1) {
                            throw new Error('Extension was reloaded or disconnected. Please refresh the page and try again.');
                        }

                        await new Promise(res => setTimeout(res, delayMs * (attempt + 1)));
                        continue;
                    }
                }

                throw error;
            }
        }
        throw new Error('Failed to communicate with extension background script after multiple attempts.');
    }
}

// Initialize the bot once the page is ready.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new XAiReplyLinkedIn();
    });
} else {
    new XAiReplyLinkedIn();
} 