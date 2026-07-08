// Content script for XAi Reply (X/Twitter)
import { DEFAULT_X_TEMPLATES, GenerateReplyRequest, GenerateReplyResponse, ReplyTemplate, PlatformSettings, OPENROUTER_MODELS } from './types';

class XAiReply {
    private templates: ReplyTemplate[] = DEFAULT_X_TEMPLATES;
    private buttonsInjected = new WeakSet<HTMLElement>();
    private observer: MutationObserver | null = null;
    private lastGeneration: { template: ReplyTemplate; textArea: HTMLElement; customInstruction?: string } | null = null;

    constructor() {
        this.init();
    }

    private providerConfig: any = null;
    private cachedModels: any[] = [];

    private async init() {
        // Load X-specific settings and provider config from storage
        try {
            const [syncRes, localRes] = await Promise.all([
                chrome.storage.sync.get(['xSettings', 'providerConfig']),
                chrome.storage.local.get(['fetchedModels'])
            ]);

            if (syncRes.xSettings?.templates) {
                this.templates = syncRes.xSettings.templates;
            }
            this.providerConfig = syncRes.providerConfig || null;
            this.cachedModels = localRes.fetchedModels || [];
        } catch (err) {
            console.error('XAi Reply: Failed to load config', err);
        }

        // Listen for focus events on the page
        this.setupFocusListener();

        // Also observe DOM changes to catch reply boxes as they appear
        this.startObserving();
    }

    private setupFocusListener() {
        // Use event delegation to catch all focus events
        document.addEventListener('focus', (event) => {
            const target = event.target as HTMLElement;

            // Check if this is a reply text area
            if (this.isReplyTextArea(target)) {
                this.injectButtons(target);
            }
        }, true); // Use capture phase to catch events early
    }

    private startObserving() {

        this.observer = new MutationObserver((mutations) => {
            // Look for reply buttons in the mutations
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    // Check added nodes
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.checkForReplyButton(node as HTMLElement);
                        }
                    });
                }
            }
        });

        // Start observing
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial check for any existing reply buttons
        this.checkForReplyButton(document.body);
    }

    private checkForReplyButton(node: HTMLElement) {
        // Look for the Reply button
        const replyButtons = node.querySelectorAll('[data-testid="tweetButtonInline"]');

        replyButtons.forEach((button) => {
            this.injectButtonsNearReplyButton(button as HTMLElement);
        });

        // Also check if the node itself is a reply button
        if (node.getAttribute('data-testid') === 'tweetButtonInline') {
            this.injectButtonsNearReplyButton(node);
        }
    }

    private injectButtonsNearReplyButton(replyButton: HTMLElement) {
        // Find a common ancestor for the reply button and toolbar/text area
        const composerRoot = replyButton.closest('div[data-testid="cellInnerDiv"], div[role="dialog"]');

        if (!composerRoot) {
            return;
        }

        const toolbar = composerRoot.querySelector('[data-testid="toolBar"]') as HTMLElement;
        if (!toolbar) {
            return;
        }

        // Check if buttons already exist
        if (toolbar.parentElement?.querySelector('.reply-bot-container')) {
            return;
        }

        // Find the text area associated with this reply button
        const textArea = composerRoot.querySelector('[contenteditable="true"][role="textbox"]') as HTMLElement;
        if (!textArea) {
            return;
        }

        // Create and inject the buttons
        const buttonContainer = this.createButtonContainer(textArea);

        // Insert after the toolbar
        toolbar.parentElement?.insertBefore(buttonContainer, toolbar.nextSibling);
    }

    private findAssociatedTextArea(toolbar: HTMLElement): HTMLElement | null {
        // Look for text area in the same container structure
        let parent = toolbar.parentElement;
        while (parent && parent !== document.body) {
            const textArea = parent.querySelector('[contenteditable="true"][role="textbox"]') as HTMLElement;
            if (textArea) {
                return textArea;
            }
            parent = parent.parentElement;
        }

        // Fallback: look for any contenteditable in the page
        const allTextAreas = document.querySelectorAll('[contenteditable="true"][role="textbox"]');
        if (allTextAreas.length === 1) {
            return allTextAreas[0] as HTMLElement;
        }

        return null;
    }

    private checkNodeForReplyBoxes(node: HTMLElement) {
        // Now just check for Reply buttons instead of text areas
        this.checkForReplyButton(node);
    }

    private isReplyTextArea(element: HTMLElement): boolean {
        // Check various indicators that this is a reply text area
        return (
            element.getAttribute('contenteditable') === 'true' &&
            (
                element.getAttribute('data-testid')?.includes('tweetTextarea') ||
                element.getAttribute('aria-label')?.includes('Post text') ||
                element.getAttribute('aria-label')?.includes('Reply') ||
                // Check if placeholder says "Post your reply"
                element.getAttribute('aria-describedby')?.includes('placeholder') ||
                // Check parent structure
                element.closest('[data-testid*="tweetTextarea"]') !== null
            )
        );
    }

    private injectButtons(textArea: HTMLElement) {
        // Check if we already injected buttons for this text area
        if (this.buttonsInjected.has(textArea)) {
            return;
        }

        // Find the toolbar
        const toolbar = this.findToolbar(textArea);
        if (!toolbar) {
            return;
        }

        // Check if buttons already exist in this area
        if (toolbar.parentElement?.querySelector('.reply-bot-container')) {
            return;
        }

        // Create and inject the buttons
        const buttonContainer = this.createButtonContainer(textArea);

        // Insert after the toolbar
        toolbar.parentElement?.insertBefore(buttonContainer, toolbar.nextSibling);

        // Mark this text area as having buttons
        this.buttonsInjected.add(textArea);

    }

    private findToolbar(textArea: HTMLElement): HTMLElement | null {
        // Try multiple strategies to find the toolbar

        // Strategy 1: Look for toolbar sibling
        let parent = textArea.closest('[data-testid*="tweetTextarea"]')?.parentElement;
        while (parent && parent !== document.body) {
            const toolbar = parent.querySelector('[data-testid="toolBar"]');
            if (toolbar) {
                return toolbar as HTMLElement;
            }
            parent = parent.parentElement;
        }

        // Strategy 2: Look for the specific structure from the provided DOM
        const editorRoot = textArea.closest('.DraftEditor-root');
        if (editorRoot) {
            const mainContainer = editorRoot.closest('.css-175oi2r.r-kemksi.r-jumn1c.r-xd6kpl.r-gtdqiz.r-ipm5af.r-184en5c');
            if (mainContainer) {
                const toolbar = mainContainer.querySelector('[data-testid="toolBar"]');
                if (toolbar) {
                    return toolbar as HTMLElement;
                }
            }
        }

        // Strategy 3: Global search (less ideal but works)
        const allToolbars = document.querySelectorAll('[data-testid="toolBar"]');
        if (allToolbars.length === 1) {
            return allToolbars[0] as HTMLElement;
        }

        return null;
    }

    private createButtonContainer(textArea: HTMLElement): HTMLElement {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'reply-bot-container';
        buttonContainer.innerHTML = `
            <div class="reply-bot-header">
                <span class="reply-bot-title">✨ XAi Reply</span>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <button class="reply-bot-toggle-btn" title="Minimize" type="button"><svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
                    <button class="reply-bot-close-btn" title="Hide assistant" type="button"><svg class="close-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                </div>
            </div>
            
            <div class="reply-bot-body">
                <div class="reply-bot-prompt-section">
                    <input type="text" class="reply-bot-custom-input" placeholder="Instruct AI (e.g. 'make it witty', 'reply in Spanish')..." />
                    <button class="reply-bot-custom-go" title="Generate with custom instructions">Go</button>
                    <button class="reply-bot-regen-btn" title="Regenerate reply" style="display: none;">🔄</button>
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
            </div>
        `;

        // Toggle minimize/maximize action
        const toggleBtn = buttonContainer.querySelector('.reply-bot-toggle-btn') as HTMLButtonElement;
        const botBody = buttonContainer.querySelector('.reply-bot-body') as HTMLElement;
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isCollapsed = buttonContainer.classList.contains('collapsed');
            if (isCollapsed) {
                botBody.style.display = '';
                toggleBtn.innerHTML = `<svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
                toggleBtn.title = 'Minimize';
                buttonContainer.classList.remove('collapsed');
            } else {
                botBody.style.display = 'none';
                toggleBtn.innerHTML = `<svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>`;
                toggleBtn.title = 'Maximize';
                buttonContainer.classList.add('collapsed');
            }
        });

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

            await this.generateReplyWithCustom(customGo, customTemplate, textArea, instruction);
        };

        customGo.addEventListener('click', triggerCustomGen);
        customInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                triggerCustomGen(e);
            }
        });

        // Regenerate button
        const regenBtn = buttonContainer.querySelector('.reply-bot-regen-btn') as HTMLButtonElement;
        regenBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.lastGeneration) return;
            regenBtn.disabled = true;
            regenBtn.textContent = '⏳';
            try {
                await this.generateReplyInternal(
                    regenBtn,
                    this.lastGeneration.template,
                    this.lastGeneration.textArea,
                    this.lastGeneration.customInstruction
                );
            } finally {
                regenBtn.textContent = '🔄';
                regenBtn.disabled = false;
            }
        });

        // Handle template category tabs and rendering
        const templatesGrid = buttonContainer.querySelector('.reply-bot-templates-grid') as HTMLElement;
        const categoryTabs = buttonContainer.querySelectorAll('.reply-bot-templates-tab');

        const descriptionsMap: Record<string, string> = {
            'question': 'Clarify with a supportive question',
            'funny': 'Add clean humor and light wit',
            'agree': 'Validate and build on the post',
            'sarcastic': 'Reply with sharp ironic humor',
            'insightful': 'Share deep value or thoughts',
            'disagree': 'Politely debate perspective',
            'promote': 'Pitch a value proposition/link',
            'congrats': 'Celebrate achievements & wins',
            'respond': 'Standard friendly reaction',
            'encourage': 'Motivate and show positive vibes'
        };

        const renderCategoryTemplates = (category: string) => {
            templatesGrid.innerHTML = '';

            // Map categories to list of template IDs
            let allowedIds: string[] = [];
            if (category === 'positive') {
                allowedIds = ['agree', 'congrats', 'encourage', 'promote'];
            } else if (category === 'brainy') {
                allowedIds = ['question', 'insightful', 'respond'];
            } else {
                allowedIds = ['funny', 'sarcastic', 'disagree'];
            }

            const filtered = this.templates.filter(t => allowedIds.includes(t.id));

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
                    await this.generateReply(e, template, textArea);
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

    private async sendMessageWithRetry<TRequest, TResponse>(request: TRequest, maxRetries = 3, delayMs = 200): Promise<TResponse> {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await chrome.runtime.sendMessage(request) as TResponse;
                return response;
            } catch (error) {
                if (error instanceof Error && error.message.includes('Could not establish connection')) {
                    // Give the service worker time to spin up and try again
                    await new Promise(res => setTimeout(res, delayMs));
                    continue;
                }
                throw error; // propagate other errors
            }
        }
        throw new Error('Failed to communicate with extension background script.');
    }
    private async generateReply(event: MouseEvent, template: ReplyTemplate, textArea: HTMLElement) {
        const button = event.currentTarget as HTMLButtonElement;
        await this.generateReplyInternal(button, template, textArea);
    }

    private async generateReplyWithCustom(button: HTMLButtonElement, template: ReplyTemplate, textArea: HTMLElement, customInstruction: string) {
        await this.generateReplyInternal(button, template, textArea, customInstruction);
    }

    private async generateReplyInternal(button: HTMLButtonElement, template: ReplyTemplate, textArea: HTMLElement, customInstruction?: string) {
        // Save for regeneration
        this.lastGeneration = { template, textArea, customInstruction };
        const originalText = button.innerHTML;
        let currentTextArea: HTMLElement | null = textArea;

        // Check if the text area is still in the document
        if (!currentTextArea || !currentTextArea.isConnected) {
            const buttonContainer = button.closest('.reply-bot-container');
            const toolbar = buttonContainer?.previousElementSibling as HTMLElement;

            if (toolbar && toolbar.getAttribute('data-testid') === 'toolBar') {
                const newTextArea = this.findAssociatedTextArea(toolbar);
                if (newTextArea) {
                    currentTextArea = newTextArea;
                } else {
                    console.warn('XAi Reply: Could not re-find associated text area.');
                    currentTextArea = null;
                }
            } else {
                console.warn('XAi Reply: Could not find toolbar to re-find text area.');
                currentTextArea = null;
            }
        }

        if (!currentTextArea) {
            alert('XAi Reply: Could not find the reply text area. Please try again.');
            return;
        }

        const buttonContainer = button.closest('.reply-bot-container');

        try {
            // Show loading state
            button.innerHTML = '⏳ Generating...';
            button.disabled = true;

            // Get selected length option from DOM
            const activeLengthPill = buttonContainer?.querySelector('.reply-bot-option-pill.active');
            const length = (activeLengthPill?.getAttribute('data-length') || 'short') as 'short' | 'medium' | 'long';

            // Get selected language option from DOM
            const activeLangSelect = buttonContainer?.querySelector('.reply-bot-lang-select') as HTMLSelectElement;
            const targetLanguage = activeLangSelect?.value || 'auto';

            // Gather thread conversation context
            const context = this.getThreadContext(currentTextArea);

            // Get the tweet content we're replying to
            const tweetContent = this.getTweetContent();

            if (!tweetContent) {
                throw new Error('Could not find tweet content');
            }

            // Send request to background script
            const request: GenerateReplyRequest = {
                tweetContent,
                template,
                platform: 'x',
                customInstruction,
                length,
                context,
                targetLanguage
            };

            let response: GenerateReplyResponse;

            try {
                response = await this.sendMessageWithRetry({
                    action: 'generateReply',
                    data: request
                });
            } catch (error) {
                // Check if it's an extension context invalidated error
                if (error instanceof Error && error.message.includes('Extension context invalidated')) {
                    alert('The extension was updated. Please refresh the page to continue using XAi Reply.');
                    throw error;
                }
                throw error;
            }

            if (!response) {
                throw new Error('No response from extension. Please refresh the page and try again.');
            }

            if (response.error) {
                throw new Error(response.error);
            }

            if (!response.reply || response.reply.trim() === '') {
                throw new Error('Generated reply is empty. Please try again.');
            }

            // Insert the generated reply
            await this.insertReply(response.reply, currentTextArea);

            // Auto-like the post
            await this.autoLikePost();

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

                        // Try to get recipient handle if possible
                        const userNameEl = document.querySelector('article[data-testid="tweet"] [data-testid="User-Name"]');
                        const userHandle = userNameEl?.querySelector('a[href*="/"]')?.textContent || 'User';

                        // Try to find the tweet's unique status URL
                        const tweetEl = document.querySelector('article[data-testid="tweet"]');
                        const statusAnchor = tweetEl?.querySelector('a[href*="/status/"]');
                        const postUrl = statusAnchor ? `https://x.com${statusAnchor.getAttribute('href')}` : window.location.href;

                        const newDraft = {
                            id: Math.random().toString(36).substring(2, 9),
                            platform: 'x',
                            tweetContent: tweetContent.length > 150 ? tweetContent.substring(0, 150) + '...' : tweetContent,
                            replyContent: response.reply,
                            timestamp: Date.now(),
                            handle: userHandle,
                            postUrl
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
            button.innerHTML = originalText;
            button.disabled = false;

            // Show regenerate button
            const regenBtn = buttonContainer?.querySelector('.reply-bot-regen-btn') as HTMLButtonElement;
            if (regenBtn) {
                regenBtn.style.display = 'inline-flex';
            }

        } catch (error) {
            console.error('Error generating reply:', error);

            // Provide user-friendly error messages
            let errorMessage = 'Failed to generate reply';
            if (error instanceof Error) {
                if (error.message.includes('Extension context invalidated')) {
                    errorMessage = 'Please refresh the page to continue using the extension';
                } else {
                    errorMessage = error.message;
                }
            }

            alert(`Error: ${errorMessage}`);

            if (button) {
                button.innerHTML = originalText;
                button.disabled = false;
            }
        }
    }

    private getThreadContext(textArea: HTMLElement): string[] {
        const tweets: string[] = [];
        try {
            // Find all tweet articles on the page
            const tweetArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
            const textAreaRect = textArea.getBoundingClientRect();

            for (const article of tweetArticles) {
                const rect = article.getBoundingClientRect();
                // Vertically above the composer input area
                if (rect.bottom <= textAreaRect.top + 15) {
                    const textEl = article.querySelector('[data-testid="tweetText"]');
                    const userNameEl = article.querySelector('[data-testid="User-Name"]');
                    const userHandle = userNameEl?.querySelector('a[href*="/"]')?.textContent || 'User';
                    if (textEl && textEl.textContent) {
                        tweets.push(`${userHandle}: ${textEl.textContent.trim()}`);
                    }
                }
            }
        } catch (e) {
            console.warn('XAi Reply: Failed to gather thread context', e);
        }

        // Take the last 3 messages to avoid context explosion
        return tweets.slice(-3);
    }

    private async autoLikePost() {
        // Find the tweet article we're replying to
        const article = document.querySelector('article[data-testid="tweet"]');
        if (!article) {
            console.warn('XAi Reply: Could not find tweet article');
            return;
        }

        // Look for the like button using data-testid="like"
        const likeButton = article.querySelector('[data-testid="like"]');

        if (!likeButton) {
            console.warn('XAi Reply: Could not find like button');
            return;
        }

        // Click the like button
        (likeButton as HTMLElement).click();

        // Small delay to ensure the like is registered
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    private getTweetContent(): string | null {
        // Try multiple selectors to find the tweet we're replying to
        const selectors = [
            'article[data-testid="tweet"] [data-testid="tweetText"]',
            'article[role="article"] [data-testid="tweetText"]',
            'div[data-testid="tweetText"]',
            '[data-testid="tweet-text-show-more-link"]',
            'article [lang] span'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            // Get the first tweet text (should be the one we're replying to)
            if (elements.length > 0) {
                const tweetText = elements[0];
                return tweetText?.textContent || null;
            }
        }

        // Fallback: try to find any article with text
        const article = document.querySelector('article');
        if (article) {
            const textElement = article.querySelector('[dir="auto"] span');
            return textElement?.textContent || null;
        }

        return null;
    }

    private async insertReply(reply: string, textArea: HTMLElement) {
        // Validate reply
        if (!reply || reply.trim() === '') {
            console.error('XAi Reply: Cannot insert empty reply');
            return;
        }

        // Wait 50ms to let button click focus effects settle
        await new Promise(r => setTimeout(r, 50));

        // Helper to check if an element is the editable tweet textbox
        const isEditableTextbox = (el: Element | null): el is HTMLElement => {
            return !!el && el instanceof HTMLElement && el.isContentEditable && el.getAttribute('role') === 'textbox';
        };

        // Helper to find the active editable element
        const findEditable = (): HTMLElement | null => {
            if (textArea.isConnected && isEditableTextbox(textArea)) {
                return textArea;
            }
            if (isEditableTextbox(document.activeElement)) {
                return document.activeElement as HTMLElement;
            }
            const candidate = document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]');
            if (candidate) {
                return candidate;
            }
            return null;
        };

        let editableElement = findEditable();

        if (!editableElement) {
            console.warn('XAi Reply: Editable element was disconnected, attempting to recover.');
            await new Promise(r => setTimeout(r, 30));
            editableElement = findEditable();
        }
        if (!editableElement) {
            console.warn('XAi Reply: Could not recover editable element. Aborting reply typing.');
            alert('XAi Reply: Could not continue because the reply box disappeared.');
            return;
        }

        // 1. Focus the editor element
        editableElement.focus();

        // Helper to find the deepest child node (text node or leaf element) in the DOM
        const getDeepestNode = (node: Node): Node => {
            let cur = node;
            while (cur.lastChild) {
                cur = cur.lastChild;
            }
            return cur;
        };

        // 2. Set selection inside the deepest child of Draft.js block hierarchy
        // This ensures Draft.js knows the selection context is inside the editor blocks.
        const selection = window.getSelection();
        if (selection) {
            const targetNode = getDeepestNode(editableElement);
            const range = document.createRange();
            try {
                if (targetNode.nodeType === Node.TEXT_NODE) {
                    range.setStart(targetNode, 0);
                    range.setEnd(targetNode, targetNode.nodeValue?.length || 0);
                } else {
                    range.selectNode(targetNode);
                }
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (e) {
                console.warn('XAi Reply: Deep selection failed, falling back.', e);
                range.selectNodeContents(editableElement);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }

        // 3. Select all text (which Draft.js intercepts safely because selection is within a block)
        document.execCommand('selectAll', false);

        // 4. Simulate a native paste event with the reply text.
        // Draft.js's onPaste handler intercepts this, prevents default DOM paste,
        // and safely replaces the selected text with our reply text using native react modifiers.
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', reply);

        const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dataTransfer
        });

        editableElement.dispatchEvent(pasteEvent);

        // 5. Reset cursor focus to the end of the text
        editableElement.focus();
        if (selection) {
            const range = document.createRange();
            range.selectNodeContents(editableElement);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
}

// Initialize the bot when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new XAiReply());
} else {
    new XAiReply();
} 