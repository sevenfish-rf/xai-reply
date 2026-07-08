// Content script for XAi Reply (X/Twitter)
import { DEFAULT_X_TEMPLATES, GenerateReplyRequest, GenerateReplyResponse, ReplyTemplate, PlatformSettings, OPENROUTER_MODELS, GrabbedTweet, NoteSession, NotesSettings } from './types';

class XAiReply {
    private templates: ReplyTemplate[] = DEFAULT_X_TEMPLATES;
    private buttonsInjected = new WeakSet<HTMLElement>();
    private observer: MutationObserver | null = null;
    private lastGeneration: { template: ReplyTemplate; textArea: HTMLElement; customInstruction?: string } | null = null;

    // XAi Notes state
    private notesEnabled = false;
    private notesSettings: NotesSettings = { enabled: false, layout: 'sidebar' };
    private notesSessions: NoteSession[] = [];
    private activeSessionId = '';
    private notesContainerEl: HTMLElement | null = null;

    constructor() {
        this.init();
    }

    private providerConfig: any = null;
    private cachedModels: any[] = [];

    private async init() {
        // Load X-specific settings and provider config from storage
        try {
            const [syncRes, localRes] = await Promise.all([
                chrome.storage.sync.get(['xSettings', 'providerConfig', 'xaiNotesEnabled', 'xaiNotesSettings']),
                chrome.storage.local.get(['fetchedModels', 'xaiNotesSessions', 'xaiActiveSessionId'])
            ]);

            if (syncRes.xSettings?.templates) {
                this.templates = syncRes.xSettings.templates;
            }
            this.providerConfig = syncRes.providerConfig || null;
            this.cachedModels = localRes.fetchedModels || [];

            // Load XAi Notes configuration
            this.notesEnabled = !!syncRes.xaiNotesEnabled;
            this.notesSettings = syncRes.xaiNotesSettings || { enabled: this.notesEnabled, layout: 'sidebar' };
            this.notesSessions = localRes.xaiNotesSessions || [];
            this.activeSessionId = localRes.xaiActiveSessionId || '';

            if (this.notesEnabled) {
                await this.initNotesState();
                this.renderNotesBox();
            }
        } catch (err) {
            console.error('XAi Reply: Failed to load config', err);
        }

        // Listen for storage changes reactively
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'sync') {
                if (changes.xaiNotesEnabled) {
                    this.notesEnabled = !!changes.xaiNotesEnabled.newValue;
                    this.notesSettings.enabled = this.notesEnabled;
                    this.handleNotesEnabledChange();
                }
                if (changes.xaiNotesSettings) {
                    this.notesSettings = changes.xaiNotesSettings.newValue || { enabled: this.notesEnabled, layout: 'sidebar' };
                    this.updateNotesBoxStyleAndLayout();
                }
            }
            if (areaName === 'local') {
                if (changes.xaiNotesSessions) {
                    this.notesSessions = changes.xaiNotesSessions.newValue || [];
                    this.refreshNotesBoxContent();
                }
                if (changes.xaiActiveSessionId) {
                    this.activeSessionId = changes.xaiActiveSessionId.newValue || '';
                    this.refreshNotesBoxContent();
                }
            }
        });

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

        // Initial check for any existing reply buttons and tweets
        this.checkForReplyButton(document.body);
        if (this.notesEnabled) {
            this.injectGrabButtonsGlobal();
        }
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

        // Also check for tweets to inject Grab button
        if (this.notesEnabled) {
            this.checkNodeForTweets(node);
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

    // ── XAi Notes Implementation Methods ───────────────────────

    private async initNotesState() {
        // Load sessions
        const localRes = await chrome.storage.local.get(['xaiNotesSessions', 'xaiActiveSessionId']);
        this.notesSessions = localRes.xaiNotesSessions || [];
        this.activeSessionId = localRes.xaiActiveSessionId || '';

        if (this.notesSessions.length === 0) {
            const defaultSession: NoteSession = {
                id: 'sess_' + Date.now(),
                name: 'General',
                tweets: [],
                createdAt: Date.now()
            };
            this.notesSessions = [defaultSession];
            this.activeSessionId = defaultSession.id;
            await chrome.storage.local.set({
                xaiNotesSessions: this.notesSessions,
                xaiActiveSessionId: this.activeSessionId
            });
        } else if (!this.activeSessionId || !this.notesSessions.find(s => s.id === this.activeSessionId)) {
            this.activeSessionId = this.notesSessions[0].id;
            await chrome.storage.local.set({ xaiActiveSessionId: this.activeSessionId });
        }
    }

    private async handleNotesEnabledChange() {
        if (this.notesEnabled) {
            await this.initNotesState();
            this.renderNotesBox();
            this.injectGrabButtonsGlobal();
        } else {
            this.removeNotesBox();
            this.removeGrabButtonsGlobal();
        }
    }

    private injectGrabButtonsGlobal() {
        if (!this.notesEnabled) return;
        const tweets = document.querySelectorAll('article[data-testid="tweet"]');
        tweets.forEach(tweet => this.injectGrabButtonToTweet(tweet as HTMLElement));
    }

    private removeGrabButtonsGlobal() {
        const grabs = document.querySelectorAll('.xai-notes-grab-container');
        grabs.forEach(el => el.remove());
    }

    private checkNodeForTweets(node: HTMLElement) {
        if (!this.notesEnabled) return;
        const tweets = node.querySelectorAll('article[data-testid="tweet"]');
        tweets.forEach(tweet => this.injectGrabButtonToTweet(tweet as HTMLElement));
        if (node.tagName === 'ARTICLE' && node.getAttribute('data-testid') === 'tweet') {
            this.injectGrabButtonToTweet(node);
        }
    }

    private injectGrabButtonToTweet(tweetEl: HTMLElement) {
        if (!this.notesEnabled) return;
        
        // Find caret (three-dots menu) in the top-right of the tweet header
        const caret = tweetEl.querySelector('[data-testid="caret"]');
        if (!caret) return;

        // Find the parent container of caret
        const headerContainer = caret.parentElement;
        if (!headerContainer || headerContainer.querySelector('.xai-notes-grab-container')) {
            return;
        }

        const grabContainer = document.createElement('div');
        grabContainer.className = 'xai-notes-grab-container';
        grabContainer.style.display = 'inline-flex';
        grabContainer.style.alignItems = 'center';
        grabContainer.style.marginRight = '8px';

        const grabBtn = document.createElement('button');
        grabBtn.className = 'xai-notes-grab-btn';
        grabBtn.type = 'button';
        grabBtn.style.background = 'linear-gradient(135deg, #ffd700, #ff8800)';
        grabBtn.style.border = 'none';
        grabBtn.style.color = '#000000';
        grabBtn.style.fontSize = '11px';
        grabBtn.style.fontWeight = '800';
        grabBtn.style.padding = '2px 8px';
        grabBtn.style.borderRadius = '12px';
        grabBtn.style.cursor = 'pointer';
        grabBtn.style.display = 'inline-flex';
        grabBtn.style.alignItems = 'center';
        grabBtn.style.lineHeight = '1.2';
        grabBtn.style.boxShadow = '0 1px 4px rgba(255, 215, 0, 0.2)';
        
        grabBtn.innerHTML = `
            <svg class="grab-icon" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle; stroke: #000000;"><path d="M12 5v14M5 12h14"/></svg>
            Grab It
        `;
        grabBtn.title = 'Grab post content for XAi Notes';
        
        grabBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.grabTweetContent(tweetEl, grabBtn);
        });

        grabContainer.appendChild(grabBtn);

        // Find Grok button inside the headerContainer
        const grokButton = headerContainer.querySelector('[data-testid*="grok"]') || 
                           headerContainer.querySelector('[aria-label*="Grok"]') ||
                           headerContainer.querySelector('a[href*="grok"]');

        let targetSibling: Element | null = null;
        if (grokButton) {
            let parent = grokButton;
            // Go up until we reach a direct child of headerContainer
            while (parent && parent.parentElement !== headerContainer) {
                parent = parent.parentElement as HTMLElement;
            }
            targetSibling = parent;
        }

        if (!targetSibling) {
            // Fallback to caret
            targetSibling = caret;
        }

        headerContainer.insertBefore(grabContainer, targetSibling);
    }

    private async grabTweetContent(tweetEl: HTMLElement, grabBtn: HTMLButtonElement) {
        try {
            const activeSession = this.notesSessions.find(s => s.id === this.activeSessionId);
            if (!activeSession) {
                alert('No active session found. Please enable XAi Notes.');
                return;
            }

            if (activeSession.tweets.length >= 50) {
                alert('Limit reached! Maximum 50 posts allowed per session.');
                return;
            }

            // Get tweet text
            const textEl = tweetEl.querySelector('[data-testid="tweetText"]');
            const content = textEl?.textContent?.trim() || '';
            if (!content) {
                alert('Cannot grab a media-only tweet without text.');
                return;
            }

            // Get author handle and name
            const userNameEl = tweetEl.querySelector('[data-testid="User-Name"]');
            const authorName = userNameEl?.querySelector('span')?.textContent || 'User';
            const author = userNameEl?.querySelector('a[href*="/"]')?.textContent || '@User';

            // Get post URL
            const statusAnchor = tweetEl.querySelector('a[href*="/status/"]');
            const postUrl = statusAnchor ? `https://x.com${statusAnchor.getAttribute('href')}` : window.location.href;

            const match = postUrl.match(/\/status\/(\d+)/);
            const tweetId = match ? match[1] : 'tweet_' + Date.now() + Math.random().toString(36).substring(2, 5);

            // Check if duplicate
            if (activeSession.tweets.some(t => t.id === tweetId)) {
                const originalHtml = grabBtn.innerHTML;
                grabBtn.innerHTML = 'Already Grabbed';
                grabBtn.classList.add('already-grabbed');
                grabBtn.disabled = true;
                setTimeout(() => {
                    grabBtn.innerHTML = originalHtml;
                    grabBtn.classList.remove('already-grabbed');
                    grabBtn.disabled = false;
                }, 1500);
                return;
            }

            const newTweet: GrabbedTweet = {
                id: tweetId,
                author,
                authorName,
                content,
                postUrl,
                grabbedAt: Date.now()
            };

            activeSession.tweets.push(newTweet);
            await chrome.storage.local.set({ xaiNotesSessions: this.notesSessions });

            // Button feedback
            const originalHtml = grabBtn.innerHTML;
            grabBtn.innerHTML = '✅ Grabbed';
            grabBtn.classList.add('grabbed');
            setTimeout(() => {
                grabBtn.innerHTML = originalHtml;
                grabBtn.classList.remove('grabbed');
            }, 1500);

        } catch (error) {
            console.error('XAi Reply: Error grabbing tweet', error);
            alert('Failed to grab post.');
        }
    }

    private renderNotesBox() {
        if (!this.notesEnabled) return;

        if (this.notesContainerEl) {
            this.updateNotesBoxStyleAndLayout();
            this.refreshNotesBoxContent();
            return;
        }

        const container = document.createElement('div');
        container.className = 'xai-notes-container';
        this.notesContainerEl = container;
        document.body.appendChild(container);

        this.updateNotesBoxStyleAndLayout();
        this.buildNotesBoxSkeleton();
        this.setupNotesBoxListeners();
        this.refreshNotesBoxContent();
    }

    private removeNotesBox() {
        if (this.notesContainerEl) {
            this.notesContainerEl.remove();
            this.notesContainerEl = null;
        }
        document.documentElement.style.marginRight = '0';
    }

    private updateNotesBoxStyleAndLayout() {
        if (!this.notesContainerEl) return;

        const layout = this.notesSettings.layout || 'sidebar';
        this.notesContainerEl.classList.remove('layout-sidebar', 'layout-floating');
        this.notesContainerEl.classList.add(`layout-${layout}`);

        if (layout === 'sidebar') {
            this.notesContainerEl.style.left = '';
            this.notesContainerEl.style.top = '';
            this.notesContainerEl.style.right = '0';
            this.notesContainerEl.style.width = '350px';
            this.notesContainerEl.style.height = '100vh';
            document.documentElement.style.marginRight = '350px';
        } else {
            document.documentElement.style.marginRight = '0';
            this.notesContainerEl.style.right = '20px';
            this.notesContainerEl.style.top = '70px';
            this.notesContainerEl.style.left = 'auto';
            this.notesContainerEl.style.width = '360px';
            this.notesContainerEl.style.height = 'auto';
        }
    }

    private buildNotesBoxSkeleton() {
        if (!this.notesContainerEl) return;

        this.notesContainerEl.innerHTML = `
            <div class="xai-notes-header">
                <div class="xai-notes-header-top">
                    <span class="xai-notes-title">📋 XAi Notes</span>
                    <div class="xai-notes-header-controls">
                        <button class="xai-notes-layout-toggle" title="Switch Layout Mode" type="button">📌 Float</button>
                        <button class="xai-notes-close" title="Disable Notes Panel" type="button"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                    </div>
                </div>
                <div class="xai-notes-sessions-bar">
                    <button class="xai-notes-new-session-btn" title="Create New Session" type="button">+ New</button>
                    <div class="xai-notes-sessions-badges"></div>
                    <button class="xai-notes-clear-btn" title="Clear Sesi" type="button">🗑️ Clear</button>
                </div>
            </div>
            
            <div class="xai-notes-body">
                <div class="xai-notes-tweets-list"></div>
                
                <div class="xai-notes-ai-output-section" style="display: none;">
                    <div class="xai-notes-ai-output-header">
                        <span>💡 AI Research Response:</span>
                        <button class="xai-notes-ai-output-copy" type="button">📋 Copy</button>
                    </div>
                    <div class="xai-notes-ai-output-text"></div>
                </div>
            </div>

            <div class="xai-notes-footer">
                <div class="xai-notes-prompt-container">
                    <textarea class="xai-notes-prompt-input" placeholder="Instruct AI to summarize/research grabbed posts..."></textarea>
                </div>
                <div class="xai-notes-footer-row">
                    <select class="xai-notes-model-select"></select>
                    <button class="xai-notes-generate-btn" type="button">Generate</button>
                </div>
            </div>
        `;
    }

    private setupNotesBoxListeners() {
        if (!this.notesContainerEl) return;

        // Toggle layout
        const layoutBtn = this.notesContainerEl.querySelector('.xai-notes-layout-toggle') as HTMLButtonElement;
        layoutBtn.addEventListener('click', async () => {
            const newLayout = this.notesSettings.layout === 'sidebar' ? 'floating' : 'sidebar';
            this.notesSettings.layout = newLayout;
            await chrome.storage.sync.set({ xaiNotesSettings: this.notesSettings });
        });

        // Close/Disable panel
        const closeBtn = this.notesContainerEl.querySelector('.xai-notes-close') as HTMLButtonElement;
        closeBtn.addEventListener('click', async () => {
            this.notesEnabled = false;
            this.notesSettings.enabled = false;
            await chrome.storage.sync.set({ xaiNotesEnabled: false });
        });

        // Create new session
        const newSessionBtn = this.notesContainerEl.querySelector('.xai-notes-new-session-btn') as HTMLButtonElement;
        newSessionBtn.addEventListener('click', async () => {
            const sessionName = prompt('Enter research session name:');
            if (!sessionName || !sessionName.trim()) return;

            const newSess: NoteSession = {
                id: 'sess_' + Date.now(),
                name: sessionName.trim(),
                tweets: [],
                createdAt: Date.now()
            };
            this.notesSessions.push(newSess);
            this.activeSessionId = newSess.id;

            await chrome.storage.local.set({
                xaiNotesSessions: this.notesSessions,
                xaiActiveSessionId: this.activeSessionId
            });
        });

        // Clear active session tweets
        const clearBtn = this.notesContainerEl.querySelector('.xai-notes-clear-btn') as HTMLButtonElement;
        clearBtn.addEventListener('click', async () => {
            const activeSession = this.notesSessions.find(s => s.id === this.activeSessionId);
            if (!activeSession) return;

            if (confirm(`Clear all grabbed posts in session "${activeSession.name}"?`)) {
                activeSession.tweets = [];
                activeSession.aiOutput = '';
                await chrome.storage.local.set({ xaiNotesSessions: this.notesSessions });
            }
        });

        // Draggable floating handler
        const header = this.notesContainerEl.querySelector('.xai-notes-header') as HTMLElement;
        let isDragging = false;
        let startX = 0, startY = 0;
        let elementX = 0, elementY = 0;

        header.addEventListener('mousedown', (e) => {
            if (this.notesSettings.layout !== 'floating') return;
            if ((e.target as HTMLElement).closest('button, select, input, textarea')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = this.notesContainerEl!.getBoundingClientRect();
            elementX = rect.left;
            elementY = rect.top;

            this.notesContainerEl!.style.right = 'auto';
            this.notesContainerEl!.style.left = `${elementX}px`;
            this.notesContainerEl!.style.top = `${elementY}px`;

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging || !this.notesContainerEl) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            this.notesContainerEl.style.left = `${elementX + dx}px`;
            this.notesContainerEl.style.top = `${elementY + dy}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // AI Generation trigger
        const generateBtn = this.notesContainerEl.querySelector('.xai-notes-generate-btn') as HTMLButtonElement;
        const promptInput = this.notesContainerEl.querySelector('.xai-notes-prompt-input') as HTMLTextAreaElement;
        const modelSelect = this.notesContainerEl.querySelector('.xai-notes-model-select') as HTMLSelectElement;

        generateBtn.addEventListener('click', async () => {
            const instruction = promptInput.value.trim();
            if (!instruction) {
                alert('Please enter an instruction prompt.');
                return;
            }

            const activeSession = this.notesSessions.find(s => s.id === this.activeSessionId);
            if (!activeSession || activeSession.tweets.length === 0) {
                alert('Grab some posts first before running AI research.');
                return;
            }

            try {
                generateBtn.textContent = '⏳ Processing...';
                generateBtn.disabled = true;

                // Format grabbed tweets into context text block
                const contextBlock = activeSession.tweets.map((t, idx) => {
                    return `[Post #${idx + 1} by ${t.authorName} (${t.author})]\n${t.content}`;
                }).join('\n\n=======================\n\n');

                const response = await this.sendMessageWithRetry<any, any>({
                    action: 'generateResearch',
                    data: {
                        prompt: instruction,
                        context: contextBlock,
                        model: modelSelect.value
                    }
                });

                if (response.error) {
                    throw new Error(response.error);
                }

                activeSession.aiOutput = response.reply;
                await chrome.storage.local.set({ xaiNotesSessions: this.notesSessions });

                promptInput.value = '';
            } catch (err) {
                console.error('XAi Research generation failed:', err);
                alert('Research failed: ' + (err instanceof Error ? err.message : err));
            } finally {
                generateBtn.textContent = 'Generate';
                generateBtn.disabled = false;
            }
        });

        // Copy AI output trigger
        const copyBtn = this.notesContainerEl.querySelector('.xai-notes-ai-output-copy') as HTMLButtonElement;
        copyBtn.addEventListener('click', async () => {
            const activeSession = this.notesSessions.find(s => s.id === this.activeSessionId);
            if (activeSession && activeSession.aiOutput) {
                try {
                    await navigator.clipboard.writeText(activeSession.aiOutput);
                    copyBtn.textContent = '✅ Copied!';
                    setTimeout(() => {
                        copyBtn.textContent = '📋 Copy';
                    }, 1500);
                } catch (e) {
                    console.error('Clipboard copy failed:', e);
                }
            }
        });
    }

    private refreshNotesBoxContent() {
        if (!this.notesContainerEl) return;

        // Render badges
        const badgesContainer = this.notesContainerEl.querySelector('.xai-notes-sessions-badges') as HTMLElement;
        badgesContainer.innerHTML = '';

        this.notesSessions.forEach(session => {
            const badge = document.createElement('div');
            badge.className = `xai-notes-session-badge${session.id === this.activeSessionId ? ' active' : ''}`;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'session-name-text';
            nameSpan.textContent = session.name;
            nameSpan.title = session.name;
            nameSpan.addEventListener('click', async () => {
                this.activeSessionId = session.id;
                await chrome.storage.local.set({ xaiActiveSessionId: this.activeSessionId });
            });

            badge.appendChild(nameSpan);

            // Add delete button if not last session
            if (this.notesSessions.length > 1) {
                const delBtn = document.createElement('button');
                delBtn.className = 'session-badge-delete';
                delBtn.innerHTML = '×';
                delBtn.title = 'Delete Session';
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to delete session "${session.name}"?`)) {
                        this.notesSessions = this.notesSessions.filter(s => s.id !== session.id);
                        if (this.activeSessionId === session.id) {
                            this.activeSessionId = this.notesSessions[0].id;
                        }
                        await chrome.storage.local.set({
                            xaiNotesSessions: this.notesSessions,
                            xaiActiveSessionId: this.activeSessionId
                        });
                    }
                });
                badge.appendChild(delBtn);
            }

            badgesContainer.appendChild(badge);
        });

        // Update layout toggle text
        const layoutBtn = this.notesContainerEl.querySelector('.xai-notes-layout-toggle') as HTMLButtonElement;
        if (layoutBtn) {
            layoutBtn.textContent = this.notesSettings.layout === 'sidebar' ? '📌 Float' : '🔲 Sidebar';
        }

        // Render tweets list of active session
        const tweetsList = this.notesContainerEl.querySelector('.xai-notes-tweets-list') as HTMLElement;
        tweetsList.innerHTML = '';

        const activeSession = this.notesSessions.find(s => s.id === this.activeSessionId);
        if (!activeSession || activeSession.tweets.length === 0) {
            tweetsList.innerHTML = `
                <div class="xai-notes-empty-state">
                    No posts grabbed yet. Click the "Grab It" button under any post in your timeline. (Max 50 posts)
                </div>
            `;
        } else {
            // Show tweet cards
            activeSession.tweets.forEach((tweet, index) => {
                const card = document.createElement('div');
                card.className = 'xai-notes-tweet-card';
                card.innerHTML = `
                    <div class="xai-notes-card-header">
                        <span class="xai-notes-card-author" title="${tweet.authorName}">${tweet.authorName} <span class="author-handle">${tweet.author}</span></span>
                        <button class="xai-notes-card-delete" title="Remove from notes" type="button">×</button>
                    </div>
                    <div class="xai-notes-card-body">${tweet.content}</div>
                    <div class="xai-notes-card-footer">
                        <a href="${tweet.postUrl}" target="_blank">🔗 View Original</a>
                    </div>
                `;

                // Wire up delete card
                const cardDelete = card.querySelector('.xai-notes-card-delete') as HTMLButtonElement;
                cardDelete.addEventListener('click', async () => {
                    activeSession.tweets.splice(index, 1);
                    await chrome.storage.local.set({ xaiNotesSessions: this.notesSessions });
                });

                tweetsList.appendChild(card);
            });
        }

        // Render AI output
        const aiOutputSection = this.notesContainerEl.querySelector('.xai-notes-ai-output-section') as HTMLElement;
        const aiOutputText = this.notesContainerEl.querySelector('.xai-notes-ai-output-text') as HTMLElement;

        if (activeSession && activeSession.aiOutput) {
            aiOutputText.textContent = activeSession.aiOutput;
            aiOutputSection.style.display = 'block';
        } else {
            aiOutputSection.style.display = 'none';
        }

        // Render model select items inside Notes Box footer
        const modelSelect = this.notesContainerEl.querySelector('.xai-notes-model-select') as HTMLSelectElement;
        if (modelSelect.innerHTML === '') {
            const currentModel = this.providerConfig?.model || 'openai/gpt-4o-mini';
            let modelsToShow: any[] = [];
            if (this.providerConfig?.mode === 'openrouter') {
                modelsToShow = OPENROUTER_MODELS;
            } else {
                modelsToShow = this.cachedModels;
            }

            if (modelsToShow.length === 0) {
                const opt = document.createElement('option');
                opt.value = currentModel;
                opt.textContent = currentModel;
                modelSelect.appendChild(opt);
            } else {
                modelsToShow.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.name || m.id;
                    modelSelect.appendChild(opt);
                });
            }

            modelSelect.value = currentModel;

            modelSelect.addEventListener('change', async () => {
                const selectedModel = modelSelect.value;
                if (this.providerConfig) {
                    this.providerConfig.model = selectedModel;
                    await chrome.storage.sync.set({ providerConfig: this.providerConfig });
                }
            });
        }
    }
}

// Initialize the bot when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new XAiReply());
} else {
    new XAiReply();
} 