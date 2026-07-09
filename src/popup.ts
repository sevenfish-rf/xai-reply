// Popup script for XAi Reply
import { loadXSystemPrompt } from './utils/promptLoader';
import { DEFAULT_X_TEMPLATES, DEFAULT_LINKEDIN_POST_TEMPLATES, ReplyTemplate, OPENROUTER_MODELS, ModelOption, ProviderConfig, DraftItem } from './types';

interface AdvancedSettings {
    temperature: number;
    maxTokens: number;
    presencePenalty: number;
    frequencyPenalty: number;
    typingSpeed: number;
}

const DEFAULT_SETTINGS: AdvancedSettings = {
    temperature: 0.0,
    maxTokens: 50,
    presencePenalty: 0.25,
    frequencyPenalty: 0.25,
    typingSpeed: 5
};

class PopupManager {
    private openrouterApiKeyInput!: HTMLInputElement;
    private saveButton!: HTMLButtonElement;
    private statusMessage!: HTMLElement;
    private modelSelect!: HTMLSelectElement;
    private modelDescription!: HTMLElement;

    // Tab elements
    private generalTab!: HTMLButtonElement;
    private xSettingsTab!: HTMLButtonElement;
    private linkedinSettingsTab!: HTMLButtonElement;
    private draftsTab!: HTMLButtonElement;
    private settingsTab!: HTMLButtonElement;
    private generalContent!: HTMLElement;
    private xSettingsContent!: HTMLElement;
    private linkedinSettingsContent!: HTMLElement;
    private draftsContent!: HTMLElement;
    private settingsContent!: HTMLElement;
    private draftsList!: HTMLElement;
    private clearAllDraftsButton!: HTMLButtonElement;
    private exportAllButton!: HTMLButtonElement;
    private importButton!: HTMLButtonElement;
    private importFileInput!: HTMLInputElement;
    private settingsStatus!: HTMLElement;
    private xaiNotesToggle!: HTMLInputElement;

    // X Settings
    private xSystemPromptInput!: HTMLTextAreaElement;
    private resetXPromptButton!: HTMLButtonElement;
    private xAdvancedToggle!: HTMLButtonElement;
    private xAdvancedContent!: HTMLElement;
    private xTemperatureInput!: HTMLInputElement;
    private xMaxTokensInput!: HTMLInputElement;
    private xPresencePenaltyInput!: HTMLInputElement;
    private xFrequencyPenaltyInput!: HTMLInputElement;
    private xTypingSpeedInput!: HTMLInputElement;
    private resetXAdvancedButton!: HTMLButtonElement;
    private xTemplatesList!: HTMLElement;
    private addXTemplateButton!: HTMLButtonElement;
    private resetXTemplatesButton!: HTMLButtonElement;

    // LinkedIn Settings
    private linkedinSystemPromptInput!: HTMLTextAreaElement;
    private resetLinkedInPromptButton!: HTMLButtonElement;
    private linkedinAdvancedToggle!: HTMLButtonElement;
    private linkedinAdvancedContent!: HTMLElement;
    private linkedinTemperatureInput!: HTMLInputElement;
    private linkedinMaxTokensInput!: HTMLInputElement;
    private linkedinPresencePenaltyInput!: HTMLInputElement;
    private linkedinFrequencyPenaltyInput!: HTMLInputElement;
    private linkedinTypingSpeedInput!: HTMLInputElement;
    private resetLinkedInAdvancedButton!: HTMLButtonElement;
    private linkedinConnectionTemplatesList!: HTMLElement;
    private addLinkedInConnectionTemplateButton!: HTMLButtonElement;
    private resetLinkedInConnectionTemplatesButton!: HTMLButtonElement;
    private linkedinPostTemplatesList!: HTMLElement;
    private addLinkedInPostTemplateButton!: HTMLButtonElement;
    private resetLinkedInPostTemplatesButton!: HTMLButtonElement;

    // Custom Provider & Theme Elements
    private providerModeSelect!: HTMLSelectElement;
    private deleteProviderButton!: HTMLButtonElement;
    private openrouterKeySection!: HTMLElement;
    private newCustomProviderForm!: HTMLElement;
    private customProviderNameInput!: HTMLInputElement;
    private customBaseUrlInput!: HTMLInputElement;
    private customApiKeyInput!: HTMLInputElement;
    private saveCustomProviderButton!: HTMLButtonElement;
    private fetchModelsButton!: HTMLButtonElement;
    private manualModelToggle!: HTMLInputElement;
    private modelSelectContainer!: HTMLElement;
    private modelManualContainer!: HTMLElement;
    private modelManualInput!: HTMLInputElement;

    private defaultSystemPrompt: string = 'Loading...';
    private xTemplates: ReplyTemplate[] = [];
    private linkedinConnectionTemplates: ReplyTemplate[] = [];
    private linkedinPostTemplates: ReplyTemplate[] = [];

    // State properties
    private selectedProviderId: string = 'openrouter';
    private customProviders: { id: string, name: string, baseUrl: string, apiKey: string }[] = [];
    private fetchedModels: ModelOption[] = [];

    constructor() {
        this.initializeElements();
        this.init();
    }

    private initializeElements() {
        // Custom Provider Elements
        this.providerModeSelect = document.getElementById('providerModeSelect') as HTMLSelectElement;
        this.deleteProviderButton = document.getElementById('deleteProviderButton') as HTMLButtonElement;
        this.openrouterKeySection = document.getElementById('openrouterKeySection') as HTMLElement;
        this.newCustomProviderForm = document.getElementById('newCustomProviderForm') as HTMLElement;
        this.customProviderNameInput = document.getElementById('customProviderName') as HTMLInputElement;
        this.customBaseUrlInput = document.getElementById('customBaseUrl') as HTMLInputElement;
        this.customApiKeyInput = document.getElementById('customApiKey') as HTMLInputElement;
        this.saveCustomProviderButton = document.getElementById('saveCustomProviderButton') as HTMLButtonElement;
        this.fetchModelsButton = document.getElementById('fetchModelsButton') as HTMLButtonElement;
        this.manualModelToggle = document.getElementById('manualModelToggle') as HTMLInputElement;
        this.modelSelectContainer = document.getElementById('modelSelectContainer') as HTMLElement;
        this.modelManualContainer = document.getElementById('modelManualContainer') as HTMLElement;
        this.modelManualInput = document.getElementById('modelManualInput') as HTMLInputElement;

        // General tab elements
        this.openrouterApiKeyInput = document.getElementById('openrouterApiKey') as HTMLInputElement;
        this.saveButton = document.getElementById('saveButton') as HTMLButtonElement;
        this.statusMessage = document.getElementById('statusMessage') as HTMLElement;
        this.modelSelect = document.getElementById('modelSelect') as HTMLSelectElement;
        this.modelDescription = document.getElementById('modelDescription') as HTMLElement;

        // Tab elements
        this.generalTab = document.getElementById('generalTab') as HTMLButtonElement;
        this.xSettingsTab = document.getElementById('xSettingsTab') as HTMLButtonElement;
        this.linkedinSettingsTab = document.getElementById('linkedinSettingsTab') as HTMLButtonElement;
        this.draftsTab = document.getElementById('draftsTab') as HTMLButtonElement;
        this.settingsTab = document.getElementById('settingsTab') as HTMLButtonElement;
        this.generalContent = document.getElementById('generalContent') as HTMLElement;
        this.xSettingsContent = document.getElementById('xSettingsContent') as HTMLElement;
        this.linkedinSettingsContent = document.getElementById('linkedinSettingsContent') as HTMLElement;
        this.draftsContent = document.getElementById('draftsContent') as HTMLElement;
        this.settingsContent = document.getElementById('settingsContent') as HTMLElement;
        this.draftsList = document.getElementById('draftsList') as HTMLElement;
        this.clearAllDraftsButton = document.getElementById('clearAllDraftsButton') as HTMLButtonElement;
        this.exportAllButton = document.getElementById('exportAllButton') as HTMLButtonElement;
        this.importButton = document.getElementById('importButton') as HTMLButtonElement;
        this.importFileInput = document.getElementById('importFileInput') as HTMLInputElement;
        this.settingsStatus = document.getElementById('settingsStatus') as HTMLElement;
        this.xaiNotesToggle = document.getElementById('xaiNotesToggle') as HTMLInputElement;

        // X Settings elements
        this.xSystemPromptInput = document.getElementById('xSystemPrompt') as HTMLTextAreaElement;
        this.resetXPromptButton = document.getElementById('resetXPromptButton') as HTMLButtonElement;
        this.xAdvancedToggle = document.getElementById('xAdvancedToggle') as HTMLButtonElement;
        this.xAdvancedContent = document.getElementById('xAdvancedContent') as HTMLElement;
        this.xTemperatureInput = document.getElementById('xTemperature') as HTMLInputElement;
        this.xMaxTokensInput = document.getElementById('xMaxTokens') as HTMLInputElement;
        this.xPresencePenaltyInput = document.getElementById('xPresencePenalty') as HTMLInputElement;
        this.xFrequencyPenaltyInput = document.getElementById('xFrequencyPenalty') as HTMLInputElement;
        this.xTypingSpeedInput = document.getElementById('xTypingSpeed') as HTMLInputElement;
        this.resetXAdvancedButton = document.getElementById('resetXAdvancedButton') as HTMLButtonElement;
        this.xTemplatesList = document.getElementById('xTemplatesList') as HTMLElement;
        this.addXTemplateButton = document.getElementById('addXTemplateButton') as HTMLButtonElement;
        this.resetXTemplatesButton = document.getElementById('resetXTemplatesButton') as HTMLButtonElement;

        // LinkedIn Settings elements
        this.linkedinSystemPromptInput = document.getElementById('linkedinSystemPrompt') as HTMLTextAreaElement;
        this.resetLinkedInPromptButton = document.getElementById('resetLinkedInPromptButton') as HTMLButtonElement;
        this.linkedinAdvancedToggle = document.getElementById('linkedinAdvancedToggle') as HTMLButtonElement;
        this.linkedinAdvancedContent = document.getElementById('linkedinAdvancedContent') as HTMLElement;
        this.linkedinTemperatureInput = document.getElementById('linkedinTemperature') as HTMLInputElement;
        this.linkedinMaxTokensInput = document.getElementById('linkedinMaxTokens') as HTMLInputElement;
        this.linkedinPresencePenaltyInput = document.getElementById('linkedinPresencePenalty') as HTMLInputElement;
        this.linkedinFrequencyPenaltyInput = document.getElementById('linkedinFrequencyPenalty') as HTMLInputElement;
        this.linkedinTypingSpeedInput = document.getElementById('linkedinTypingSpeed') as HTMLInputElement;
        this.resetLinkedInAdvancedButton = document.getElementById('resetLinkedInAdvancedButton') as HTMLButtonElement;
        this.linkedinConnectionTemplatesList = document.getElementById('linkedinConnectionTemplatesList') as HTMLElement;
        this.addLinkedInConnectionTemplateButton = document.getElementById('addLinkedInConnectionTemplateButton') as HTMLButtonElement;
        this.resetLinkedInConnectionTemplatesButton = document.getElementById('resetLinkedInConnectionTemplatesButton') as HTMLButtonElement;
        this.linkedinPostTemplatesList = document.getElementById('linkedinPostTemplatesList') as HTMLElement;
        this.addLinkedInPostTemplateButton = document.getElementById('addLinkedInPostTemplateButton') as HTMLButtonElement;
        this.resetLinkedInPostTemplatesButton = document.getElementById('resetLinkedInPostTemplatesButton') as HTMLButtonElement;
    }

    private async init() {
        // Load the default prompt
        this.defaultSystemPrompt = await loadXSystemPrompt();

        // Load existing settings
        await this.loadSettings();

        // Set up event listeners
        this.setupEventListeners();

        // Load and render templates
        await this.loadTemplates();
    }

    private setupEventListeners() {
        // Provider switcher select
        this.providerModeSelect.addEventListener('change', () => this.handleProviderSelectChange());

        // Delete custom provider
        this.deleteProviderButton.addEventListener('click', () => this.deleteSelectedProvider());

        // Save Custom Provider Button
        this.saveCustomProviderButton.addEventListener('click', () => this.saveCustomProvider());

        // Fetch models button listener
        this.fetchModelsButton.addEventListener('click', () => this.fetchModels());

        // Manual model checkbox listener
        this.manualModelToggle.addEventListener('change', () => this.toggleManualModelEntry());

        // General tab listeners
        this.saveButton.addEventListener('click', () => this.saveSettings());
        
        // Keypress listeners for saving
        [this.openrouterApiKeyInput, this.customProviderNameInput, this.customBaseUrlInput, this.customApiKeyInput, this.modelManualInput].forEach(input => {
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        if (input === this.customProviderNameInput || input === this.customBaseUrlInput || input === this.customApiKeyInput) {
                            this.saveCustomProvider();
                        } else {
                            this.saveSettings();
                        }
                    }
                });
            }
        });

        this.modelSelect.addEventListener('change', () => {
            this.updateModelDescription();
        });

        this.modelManualInput.addEventListener('input', () => {
            this.updateModelDescription();
        });

        // Tab switching
        this.generalTab.addEventListener('click', () => this.switchTab('general'));
        this.xSettingsTab.addEventListener('click', () => this.switchTab('x'));
        this.linkedinSettingsTab.addEventListener('click', () => this.switchTab('linkedin'));
        this.draftsTab.addEventListener('click', () => this.switchTab('drafts'));
        this.settingsTab.addEventListener('click', () => this.switchTab('settings'));

        this.clearAllDraftsButton.addEventListener('click', () => this.clearAllDrafts());

        // Settings tab listeners
        this.exportAllButton.addEventListener('click', () => this.exportAllData());
        this.importButton.addEventListener('click', () => this.importFileInput.click());
        this.importFileInput.addEventListener('change', (e) => this.handleImportFile(e));

        this.xaiNotesToggle.addEventListener('change', async () => {
            const enabled = this.xaiNotesToggle.checked;
            await chrome.storage.sync.set({ xaiNotesEnabled: enabled });
            this.showStatus(enabled ? 'XAi Notes enabled!' : 'XAi Notes disabled!', 'success');
        });

        // X Settings listeners
        this.xSystemPromptInput.addEventListener('change', () => this.saveXSettings());
        this.resetXPromptButton.addEventListener('click', () => this.resetXSystemPrompt());
        this.xAdvancedToggle.addEventListener('click', () => this.toggleAdvancedSettings('x'));

        // X Advanced settings listeners
        this.xTemperatureInput.addEventListener('input', () => this.updateRangeValue('x', 'temperature'));
        this.xPresencePenaltyInput.addEventListener('input', () => this.updateRangeValue('x', 'presencePenalty'));
        this.xFrequencyPenaltyInput.addEventListener('input', () => this.updateRangeValue('x', 'frequencyPenalty'));
        this.xTypingSpeedInput.addEventListener('input', () => this.updateRangeValue('x', 'typingSpeed'));

        // Save X advanced settings on change
        [this.xTemperatureInput, this.xMaxTokensInput, this.xPresencePenaltyInput,
        this.xFrequencyPenaltyInput, this.xTypingSpeedInput].forEach(input => {
            input.addEventListener('change', () => this.saveXSettings());
        });

        this.resetXAdvancedButton.addEventListener('click', () => this.resetXAdvancedSettings());

        // X Templates listeners
        this.addXTemplateButton.addEventListener('click', () => this.addTemplate('x'));
        this.resetXTemplatesButton.addEventListener('click', () => this.resetTemplates('x'));

        // LinkedIn Settings listeners
        this.linkedinSystemPromptInput.addEventListener('change', () => this.saveLinkedInSettings());
        this.resetLinkedInPromptButton.addEventListener('click', () => this.resetLinkedInSystemPrompt());
        this.linkedinAdvancedToggle.addEventListener('click', () => this.toggleAdvancedSettings('linkedin'));

        // LinkedIn Advanced settings listeners
        this.linkedinTemperatureInput.addEventListener('input', () => this.updateRangeValue('linkedin', 'temperature'));
        this.linkedinPresencePenaltyInput.addEventListener('input', () => this.updateRangeValue('linkedin', 'presencePenalty'));
        this.linkedinFrequencyPenaltyInput.addEventListener('input', () => this.updateRangeValue('linkedin', 'frequencyPenalty'));
        this.linkedinTypingSpeedInput.addEventListener('input', () => this.updateRangeValue('linkedin', 'typingSpeed'));

        // Save LinkedIn advanced settings on change
        [this.linkedinTemperatureInput, this.linkedinMaxTokensInput, this.linkedinPresencePenaltyInput,
        this.linkedinFrequencyPenaltyInput, this.linkedinTypingSpeedInput].forEach(input => {
            input.addEventListener('change', () => this.saveLinkedInSettings());
        });

        this.resetLinkedInAdvancedButton.addEventListener('click', () => this.resetLinkedInAdvancedSettings());

        // LinkedIn Templates listeners
        this.addLinkedInConnectionTemplateButton.addEventListener('click', () => this.addTemplate('linkedinConnection'));
        this.resetLinkedInConnectionTemplatesButton.addEventListener('click', () => this.resetTemplates('linkedinConnection'));
        this.addLinkedInPostTemplateButton.addEventListener('click', () => this.addTemplate('linkedinPost'));
        this.resetLinkedInPostTemplatesButton.addEventListener('click', () => this.resetTemplates('linkedinPost'));
    }

    private async loadSettings() {
        try {
            const result = await chrome.storage.sync.get([
                'providerConfig',
                'openrouterApiKey',
                'model',
                'xSettings',
                'linkedinSettings',
                'customProviders',
                'xaiNotesEnabled'
            ]);

            // Set notes toggle checked state
            this.xaiNotesToggle.checked = !!result.xaiNotesEnabled;

            // Custom providers list
            this.customProviders = result.customProviders || [];

            // Enforce dark mode by default since we removed theme toggle button
            document.body.classList.add('dark');

            // Provider Configuration load
            let providerConfig: ProviderConfig = result.providerConfig;

            // Migration logic for old users
            if (!providerConfig) {
                providerConfig = {
                    mode: 'openrouter',
                    openrouterApiKey: result.openrouterApiKey || '',
                    model: result.model || 'openai/gpt-4o-mini'
                };
            }

            this.selectedProviderId = providerConfig.mode || 'openrouter';

            // Populate provider dropdown select options
            this.updateProviderDropdownOptions();

            this.providerModeSelect.value = this.selectedProviderId;
            this.handleProviderViewToggle(this.selectedProviderId);

            this.openrouterApiKeyInput.value = providerConfig.openrouterApiKey || '';

            // Load cached models for this provider
            const localCacheKey = 'fetchedModels_' + this.selectedProviderId;
            const localResult = await chrome.storage.local.get([localCacheKey]);
            this.fetchedModels = localResult[localCacheKey] || [];

            // Handle Manual Entry Toggle
            const isManual = !!providerConfig.manualModelEntry;
            this.manualModelToggle.checked = isManual;
            this.toggleManualModelEntry();

            // Setup model list based on provider mode
            this.updateModelDropdown(providerConfig.model || '');

            if (isManual) {
                this.modelManualInput.value = providerConfig.model || '';
            }

            // Load X settings
            const xSettings = result.xSettings || {
                systemPrompt: this.defaultSystemPrompt,
                advancedSettings: DEFAULT_SETTINGS
            };
            this.xSystemPromptInput.value = xSettings.systemPrompt || this.defaultSystemPrompt;
            this.loadAdvancedSettings('x', xSettings.advancedSettings || DEFAULT_SETTINGS);

            // Load LinkedIn settings  
            const linkedinSettings = result.linkedinSettings || {
                systemPrompt: 'You are a professional LinkedIn user focused on meaningful business connections.',
                advancedSettings: { ...DEFAULT_SETTINGS, maxTokens: 60 }
            };
            this.linkedinSystemPromptInput.value = linkedinSettings.systemPrompt;
            this.loadAdvancedSettings('linkedin', linkedinSettings.advancedSettings || { ...DEFAULT_SETTINGS, maxTokens: 60 });

            // Update range values
            this.updateAllRangeValues();
            this.updateModelDescription();
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    private loadAdvancedSettings(platform: 'x' | 'linkedin', settings: AdvancedSettings) {
        if (platform === 'x') {
            this.xTemperatureInput.value = settings.temperature.toString();
            this.xMaxTokensInput.value = settings.maxTokens.toString();
            this.xPresencePenaltyInput.value = settings.presencePenalty.toString();
            this.xFrequencyPenaltyInput.value = settings.frequencyPenalty.toString();
            this.xTypingSpeedInput.value = settings.typingSpeed.toString();
        } else {
            this.linkedinTemperatureInput.value = settings.temperature.toString();
            this.linkedinMaxTokensInput.value = settings.maxTokens.toString();
            this.linkedinPresencePenaltyInput.value = settings.presencePenalty.toString();
            this.linkedinFrequencyPenaltyInput.value = settings.frequencyPenalty.toString();
            this.linkedinTypingSpeedInput.value = settings.typingSpeed.toString();
        }
    }

    private async saveSettings() {
        const mode = this.selectedProviderId;
        const openrouterApiKey = this.openrouterApiKeyInput.value.trim();
        const manualModelEntry = this.manualModelToggle.checked;
        const model = manualModelEntry ? this.modelManualInput.value.trim() : this.modelSelect.value;

        if (mode === 'add-new-custom') {
            this.showStatus('Please save your custom provider configuration first.', 'error');
            return;
        }

        // Validations
        if (mode === 'openrouter') {
            if (!openrouterApiKey) {
                this.showStatus('Please enter an OpenRouter API key', 'error');
                return;
            }
            if (!openrouterApiKey.startsWith('sk-or-v1-')) {
                this.showStatus('Invalid OpenRouter API key format (should start with sk-or-v1-)', 'error');
                return;
            }
        }

        if (!model) {
            this.showStatus('Please select or enter a model name', 'error');
            return;
        }

        // Look up custom provider details if custom mode is selected
        let customBaseUrl = '';
        let customApiKey = '';
        if (mode.startsWith('custom-')) {
            const match = this.customProviders.find(p => p.id === mode);
            if (match) {
                customBaseUrl = match.baseUrl;
                customApiKey = match.apiKey;
            }
        }

        const providerConfig: ProviderConfig = {
            mode: mode as any,
            openrouterApiKey,
            customBaseUrl,
            customApiKey,
            model,
            manualModelEntry
        };

        try {
            this.saveButton.disabled = true;
            this.saveButton.textContent = 'Saving...';

            await chrome.storage.sync.set({
                providerConfig
            });

            this.showStatus('Settings saved successfully!', 'success');

            setTimeout(() => {
                this.saveButton.disabled = false;
                this.saveButton.textContent = 'Save Settings';
            }, 1000);

        } catch (error) {
            console.error('Error saving settings:', error);
            this.showStatus('Error saving settings', 'error');
            this.saveButton.disabled = false;
            this.saveButton.textContent = 'Save Settings';
        }
    }

    private async saveXSettings() {
        try {
            const advancedSettings: AdvancedSettings = {
                temperature: parseFloat(this.xTemperatureInput.value),
                maxTokens: parseInt(this.xMaxTokensInput.value),
                presencePenalty: parseFloat(this.xPresencePenaltyInput.value),
                frequencyPenalty: parseFloat(this.xFrequencyPenaltyInput.value),
                typingSpeed: parseFloat(this.xTypingSpeedInput.value)
            };

            const xSettings = {
                systemPrompt: this.xSystemPromptInput.value.trim() || this.defaultSystemPrompt,
                advancedSettings,
                templates: this.xTemplates
            };

            await chrome.storage.sync.set({ xSettings });
            this.showStatus('X settings saved!', 'success');
        } catch (error) {
            console.error('Error saving X settings:', error);
            this.showStatus('Error saving X settings', 'error');
        }
    }

    private async saveLinkedInSettings() {
        try {
            const advancedSettings: AdvancedSettings = {
                temperature: parseFloat(this.linkedinTemperatureInput.value),
                maxTokens: parseInt(this.linkedinMaxTokensInput.value),
                presencePenalty: parseFloat(this.linkedinPresencePenaltyInput.value),
                frequencyPenalty: parseFloat(this.linkedinFrequencyPenaltyInput.value),
                typingSpeed: parseFloat(this.linkedinTypingSpeedInput.value)
            };

            const linkedinSettings = {
                systemPrompt: this.linkedinSystemPromptInput.value.trim() || 'You are a professional LinkedIn user focused on meaningful business connections.',
                advancedSettings,
                templates: this.linkedinPostTemplates
            };

            await chrome.storage.sync.set({
                linkedinSettings,
                linkedinTemplates: this.linkedinConnectionTemplates
            });
            this.showStatus('LinkedIn settings saved!', 'success');
        } catch (error) {
            console.error('Error saving LinkedIn settings:', error);
            this.showStatus('Error saving LinkedIn settings', 'error');
        }
    }

    private switchTab(tab: 'general' | 'x' | 'linkedin' | 'drafts' | 'settings') {
        // Update tab buttons
        this.generalTab.classList.toggle('active', tab === 'general');
        this.xSettingsTab.classList.toggle('active', tab === 'x');
        this.linkedinSettingsTab.classList.toggle('active', tab === 'linkedin');
        this.draftsTab.classList.toggle('active', tab === 'drafts');
        this.settingsTab.classList.toggle('active', tab === 'settings');

        // Update content visibility
        this.generalContent.classList.toggle('active', tab === 'general');
        this.xSettingsContent.classList.toggle('active', tab === 'x');
        this.linkedinSettingsContent.classList.toggle('active', tab === 'linkedin');
        this.draftsContent.classList.toggle('active', tab === 'drafts');
        this.settingsContent.classList.toggle('active', tab === 'settings');

        if (tab === 'drafts') {
            this.loadDrafts();
        }
    }

    private async loadDrafts() {
        this.draftsList.innerHTML = '';
        try {
            const localRes = await chrome.storage.local.get(['drafts']);
            const draftsList: DraftItem[] = localRes.drafts || [];

            if (draftsList.length === 0) {
                this.draftsList.innerHTML = `
                    <div class="no-drafts-message" style="color: #707880; font-size: 13px; text-align: center; padding: 30px 10px;">
                        No saved drafts yet. Click "Save Draft" in X/Twitter when generating replies.
                    </div>
                `;
                return;
            }

            draftsList.forEach(draft => {
                const card = document.createElement('div');
                card.className = 'draft-card';
                
                const timeString = new Date(draft.timestamp).toLocaleString();
                const platformLabel = draft.platform === 'x' ? 'X/Twitter' : 'LinkedIn';
                const platformHtml = draft.postUrl 
                    ? `<a href="${draft.postUrl}" target="_blank" class="draft-platform-link" title="Visit original post">${platformLabel} 🔗</a>`
                    : `<span class="draft-platform">${platformLabel}</span>`;
                
                card.innerHTML = `
                    <div class="draft-card-header">
                        ${platformHtml}
                        <span class="draft-time">${timeString}</span>
                    </div>
                    <div class="draft-content-wrapper">
                        <span class="draft-label-context">Context (${draft.handle || 'User'})</span>
                        <div class="draft-original-context">${draft.tweetContent}</div>
                    </div>
                    <div class="draft-content-wrapper">
                        <span class="draft-label-context">Generated Reply</span>
                        <div class="draft-reply-text">${draft.replyContent}</div>
                    </div>
                    <div class="draft-card-actions">
                        <button class="draft-action-btn copy-btn">📋 Copy</button>
                        <button class="draft-action-btn delete-btn">🗑️ Delete</button>
                    </div>
                `;

                // Event Listeners
                const copyBtn = card.querySelector('.copy-btn') as HTMLButtonElement;
                copyBtn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(draft.replyContent);
                        copyBtn.textContent = '✅ Copied!';
                        setTimeout(() => {
                            copyBtn.textContent = '📋 Copy';
                        }, 1500);
                    } catch (err) {
                        console.error('Failed to copy to clipboard', err);
                    }
                });

                const deleteBtn = card.querySelector('.delete-btn') as HTMLButtonElement;
                deleteBtn.addEventListener('click', async () => {
                    if (confirm('Are you sure you want to delete this draft?')) {
                        await this.deleteDraft(draft.id);
                    }
                });

                this.draftsList.appendChild(card);
            });
        } catch (error) {
            console.error('Error loading drafts:', error);
            this.draftsList.innerHTML = `<div class="error-message">Error loading drafts: ${error}</div>`;
        }
    }

    private async deleteDraft(id: string) {
        try {
            const localRes = await chrome.storage.local.get(['drafts']);
            const draftsList: DraftItem[] = localRes.drafts || [];
            const updated = draftsList.filter(d => d.id !== id);
            await chrome.storage.local.set({ drafts: updated });
            this.loadDrafts();
        } catch (error) {
            console.error('Error deleting draft:', error);
        }
    }

    private async clearAllDrafts() {
        if (confirm('Are you sure you want to clear all drafts? This cannot be undone.')) {
            try {
                await chrome.storage.local.set({ drafts: [] });
                this.loadDrafts();
            } catch (error) {
                console.error('Error clearing drafts:', error);
            }
        }
    }

    private toggleAdvancedSettings(platform: 'x' | 'linkedin') {
        const content = platform === 'x' ? this.xAdvancedContent : this.linkedinAdvancedContent;
        const toggle = platform === 'x' ? this.xAdvancedToggle : this.linkedinAdvancedToggle;

        const isExpanded = content.style.display !== 'none';
        content.style.display = isExpanded ? 'none' : 'block';
        toggle.setAttribute('aria-expanded', (!isExpanded).toString());

        const icon = toggle.querySelector('.toggle-icon');
        if (icon) {
            icon.textContent = isExpanded ? '▶' : '▼';
        }
    }

    private updateRangeValue(platform: 'x' | 'linkedin', type: 'temperature' | 'presencePenalty' | 'frequencyPenalty' | 'typingSpeed') {
        const valueElement = document.getElementById(`${platform}${type.charAt(0).toUpperCase() + type.slice(1)}Value`);
        const inputElement = document.getElementById(`${platform}${type.charAt(0).toUpperCase() + type.slice(1)}`);

        if (valueElement && inputElement) {
            valueElement.textContent = (inputElement as HTMLInputElement).value;
        }
    }

    private updateAllRangeValues() {
        // Update X range values
        this.updateRangeValue('x', 'temperature');
        this.updateRangeValue('x', 'presencePenalty');
        this.updateRangeValue('x', 'frequencyPenalty');
        this.updateRangeValue('x', 'typingSpeed');

        // Update LinkedIn range values
        this.updateRangeValue('linkedin', 'temperature');
        this.updateRangeValue('linkedin', 'presencePenalty');
        this.updateRangeValue('linkedin', 'frequencyPenalty');
        this.updateRangeValue('linkedin', 'typingSpeed');
    }

    private resetXSystemPrompt() {
        this.xSystemPromptInput.value = this.defaultSystemPrompt;
        this.saveXSettings();
    }

    private resetLinkedInSystemPrompt() {
        this.linkedinSystemPromptInput.value = 'You are a professional LinkedIn user focused on meaningful business connections.';
        this.saveLinkedInSettings();
    }

    private resetXAdvancedSettings() {
        this.xTemperatureInput.value = DEFAULT_SETTINGS.temperature.toString();
        this.xMaxTokensInput.value = DEFAULT_SETTINGS.maxTokens.toString();
        this.xPresencePenaltyInput.value = DEFAULT_SETTINGS.presencePenalty.toString();
        this.xFrequencyPenaltyInput.value = DEFAULT_SETTINGS.frequencyPenalty.toString();
        this.xTypingSpeedInput.value = DEFAULT_SETTINGS.typingSpeed.toString();
        this.updateAllRangeValues();
        this.saveXSettings();
    }

    private resetLinkedInAdvancedSettings() {
        this.linkedinTemperatureInput.value = DEFAULT_SETTINGS.temperature.toString();
        this.linkedinMaxTokensInput.value = '60'; // LinkedIn default higher
        this.linkedinPresencePenaltyInput.value = DEFAULT_SETTINGS.presencePenalty.toString();
        this.linkedinFrequencyPenaltyInput.value = DEFAULT_SETTINGS.frequencyPenalty.toString();
        this.linkedinTypingSpeedInput.value = DEFAULT_SETTINGS.typingSpeed.toString();
        this.updateAllRangeValues();
        this.saveLinkedInSettings();
    }

    private showStatus(message: string, type: 'success' | 'error') {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message ${type}`;
        this.statusMessage.style.display = 'block';

        setTimeout(() => {
            this.statusMessage.style.display = 'none';
        }, 3000);
    }

    private updateProviderDropdownOptions() {
        this.providerModeSelect.innerHTML = '';
        
        const openrouterOpt = document.createElement('option');
        openrouterOpt.value = 'openrouter';
        openrouterOpt.textContent = 'OpenRouter';
        this.providerModeSelect.appendChild(openrouterOpt);

        this.customProviders.forEach(prov => {
            const opt = document.createElement('option');
            opt.value = prov.id;
            opt.textContent = prov.name;
            this.providerModeSelect.appendChild(opt);
        });

        const addOpt = document.createElement('option');
        addOpt.value = 'add-new-custom';
        addOpt.textContent = '+ Add Custom Provider...';
        this.providerModeSelect.appendChild(addOpt);
    }

    private handleProviderSelectChange() {
        const value = this.providerModeSelect.value;
        this.selectedProviderId = value;
        this.handleProviderViewToggle(value);
        this.loadCachedModelsForSelectedProvider();
    }

    private handleProviderViewToggle(mode: string) {
        if (mode === 'openrouter') {
            this.openrouterKeySection.style.display = 'block';
            this.newCustomProviderForm.style.display = 'none';
            this.deleteProviderButton.style.display = 'none';
        } else if (mode === 'add-new-custom') {
            this.openrouterKeySection.style.display = 'none';
            this.newCustomProviderForm.style.display = 'flex';
            this.deleteProviderButton.style.display = 'none';
            this.customProviderNameInput.value = '';
            this.customBaseUrlInput.value = '';
            this.customApiKeyInput.value = '';
        } else {
            this.openrouterKeySection.style.display = 'none';
            this.newCustomProviderForm.style.display = 'none';
            this.deleteProviderButton.style.display = 'block';
        }
    }

    private async loadCachedModelsForSelectedProvider() {
        const localCacheKey = 'fetchedModels_' + this.selectedProviderId;
        const localResult = await chrome.storage.local.get([localCacheKey]);
        this.fetchedModels = localResult[localCacheKey] || [];
        const currentSelection = this.manualModelToggle.checked ? this.modelManualInput.value : this.modelSelect.value;
        this.updateModelDropdown(currentSelection);
        this.updateModelDescription();
    }

    private async saveCustomProvider() {
        const name = this.customProviderNameInput.value.trim();
        const baseUrl = this.customBaseUrlInput.value.trim();
        const apiKey = this.customApiKeyInput.value.trim();

        if (!name) {
            this.showStatus('Please enter a Provider Name', 'error');
            return;
        }
        if (!baseUrl) {
            this.showStatus('Please enter a Base URL', 'error');
            return;
        }

        const newId = 'custom-' + Date.now();
        const newProvider = { id: newId, name, baseUrl, apiKey };
        this.customProviders.push(newProvider);

        try {
            await chrome.storage.sync.set({ customProviders: this.customProviders });
            this.showStatus('Custom provider saved successfully!', 'success');
            
            this.updateProviderDropdownOptions();
            this.providerModeSelect.value = newId;
            this.selectedProviderId = newId;
            this.handleProviderViewToggle(newId);
            
            this.fetchModels();
        } catch (err) {
            console.error('Error saving custom provider:', err);
            this.showStatus('Failed to save provider', 'error');
        }
    }

    private async deleteSelectedProvider() {
        if (this.selectedProviderId === 'openrouter' || this.selectedProviderId === 'add-new-custom') {
            return;
        }

        if (confirm('Are you sure you want to delete this custom provider?')) {
            const providerToDelete = this.selectedProviderId;
            this.customProviders = this.customProviders.filter(p => p.id !== providerToDelete);

            try {
                await chrome.storage.sync.set({ customProviders: this.customProviders });
                await chrome.storage.local.remove('fetchedModels_' + providerToDelete);

                this.showStatus('Provider deleted successfully.', 'success');

                this.selectedProviderId = 'openrouter';
                this.updateProviderDropdownOptions();
                this.providerModeSelect.value = 'openrouter';
                this.handleProviderViewToggle('openrouter');
                this.loadCachedModelsForSelectedProvider();
            } catch (err) {
                console.error('Error deleting provider:', err);
                this.showStatus('Failed to delete provider', 'error');
            }
        }
    }

    private toggleManualModelEntry() {
        const isManual = this.manualModelToggle.checked;
        if (isManual) {
            this.modelSelectContainer.style.display = 'none';
            this.modelManualContainer.style.display = 'block';
            if (this.modelSelect.value) {
                this.modelManualInput.value = this.modelSelect.value;
            }
        } else {
            this.modelSelectContainer.style.display = 'block';
            this.modelManualContainer.style.display = 'none';
            if (this.modelManualInput.value) {
                this.updateModelDropdown(this.modelManualInput.value);
            }
        }
    }

    private async fetchModels() {
        const mode = this.selectedProviderId;
        const openrouterApiKey = this.openrouterApiKeyInput.value.trim();

        if (mode === 'add-new-custom') {
            this.showStatus('Please save your custom provider configuration first.', 'error');
            return;
        }

        let customBaseUrl = '';
        let customApiKey = '';
        if (mode.startsWith('custom-')) {
            const match = this.customProviders.find(p => p.id === mode);
            if (match) {
                customBaseUrl = match.baseUrl;
                customApiKey = match.apiKey;
            }
        }

        if (mode === 'openrouter' && !openrouterApiKey) {
            this.showStatus('Please enter an OpenRouter API key first.', 'error');
            return;
        }

        this.fetchModelsButton.disabled = true;
        this.fetchModelsButton.textContent = 'Fetching...';

        chrome.runtime.sendMessage({
            action: 'fetchModels',
            data: {
                mode: mode.startsWith('custom-') ? 'custom' : 'openrouter',
                openrouterApiKey,
                customBaseUrl,
                customApiKey
            }
        }, (response) => {
            this.fetchModelsButton.disabled = false;
            this.fetchModelsButton.textContent = 'Fetch Models';

            if (chrome.runtime.lastError) {
                this.showStatus(`Fetch failed: ${chrome.runtime.lastError.message}`, 'error');
                return;
            }

            if (response && response.error) {
                this.showStatus(`Fetch failed: ${response.error}`, 'error');
                return;
            }

            if (response && Array.isArray(response.models)) {
                this.fetchedModels = response.models;
                const localCacheKey = 'fetchedModels_' + mode;
                chrome.storage.local.set({ [localCacheKey]: response.models }).catch(err => {
                    console.error('Failed to cache fetched models:', err);
                });
                const currentSelection = this.manualModelToggle.checked ? this.modelManualInput.value : this.modelSelect.value;
                this.updateModelDropdown(currentSelection);
                this.showStatus(`Successfully fetched ${response.models.length} models!`, 'success');
            } else {
                this.showStatus('No models returned from provider API.', 'error');
            }
        });
    }

    private updateModelDropdown(selectedModel: string) {
        this.modelSelect.innerHTML = '';
        
        let modelsToShow: ModelOption[] = [];
        if (this.selectedProviderId === 'openrouter') {
            modelsToShow = OPENROUTER_MODELS;
        } else {
            modelsToShow = this.fetchedModels;
        }

        if (modelsToShow.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = this.selectedProviderId !== 'openrouter' ? '(Click Fetch Models)' : '(No models found)';
            opt.disabled = true;
            this.modelSelect.appendChild(opt);
        } else {
            modelsToShow.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                this.modelSelect.appendChild(opt);
            });
        }

        // If the selected model is not in the dropdown but is set, add it as a temporary option so it stays selected
        if (selectedModel && !modelsToShow.find(m => m.id === selectedModel)) {
            const opt = document.createElement('option');
            opt.value = selectedModel;
            opt.textContent = selectedModel;
            this.modelSelect.appendChild(opt);
        }

        if (selectedModel) {
            this.modelSelect.value = selectedModel;
        }
        this.updateModelDescription();
    }

    private updateModelDescription() {
        const selectedModelId = this.manualModelToggle.checked ? this.modelManualInput.value : this.modelSelect.value;
        let description = '';

        if (this.selectedProviderId === 'openrouter') {
            const selectedModel = OPENROUTER_MODELS.find(m => m.id === selectedModelId);
            if (selectedModel) {
                description = selectedModel.description || '';
            }
        } else {
            const selectedModel = this.fetchedModels.find(m => m.id === selectedModelId);
            if (selectedModel) {
                description = selectedModel.description || '';
            } else {
                description = `Custom model: ${selectedModelId}`;
            }
        }

        this.modelDescription.textContent = description;
    }

    private async loadTemplates() {
        try {
            const result = await chrome.storage.sync.get(['xSettings', 'linkedinSettings', 'linkedinTemplates']);

            // Load X templates from xSettings
            this.xTemplates = result.xSettings?.templates || [...DEFAULT_X_TEMPLATES];

            // Load LinkedIn connection templates (separate key for backward compatibility)
            this.linkedinConnectionTemplates = result.linkedinTemplates || [
                {
                    id: 'connect1',
                    name: 'Message #1',
                    prompt: 'Hi {name}, I came across your profile and would love to connect to share insights and opportunities.',
                    icon: '💬'
                },
                {
                    id: 'connect2',
                    name: 'Message #2',
                    prompt: 'Hello {name}! I found your work fascinating and would be happy to connect and keep in touch.',
                    icon: '🔗'
                }
            ];

            // Load LinkedIn post reply templates from linkedinSettings
            this.linkedinPostTemplates = result.linkedinSettings?.templates || [...DEFAULT_LINKEDIN_POST_TEMPLATES];

            this.renderTemplates();
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    }

    private renderTemplates() {
        // Render X templates
        this.xTemplatesList.innerHTML = '';
        this.xTemplates.forEach((template, index) => {
            const templateEl = this.createTemplateElement(template, index, 'x');
            this.xTemplatesList.appendChild(templateEl);
        });

        // Render LinkedIn connection templates
        this.linkedinConnectionTemplatesList.innerHTML = '';
        this.linkedinConnectionTemplates.forEach((template, index) => {
            const templateEl = this.createTemplateElement(template, index, 'linkedinConnection');
            this.linkedinConnectionTemplatesList.appendChild(templateEl);
        });

        // Render LinkedIn post templates
        this.linkedinPostTemplatesList.innerHTML = '';
        this.linkedinPostTemplates.forEach((template, index) => {
            const templateEl = this.createTemplateElement(template, index, 'linkedinPost');
            this.linkedinPostTemplatesList.appendChild(templateEl);
        });
    }

    private createTemplateElement(template: ReplyTemplate, index: number, platform: 'x' | 'linkedinConnection' | 'linkedinPost'): HTMLElement {
        const div = document.createElement('div');
        div.className = 'template-item';

        const getXCategory = (t: ReplyTemplate) => {
            if (t.category) return t.category;
            const positive = ['agree', 'congrats', 'encourage', 'promote'];
            const brainy = ['question', 'insight', 'response'];
            if (positive.includes(t.id)) return 'positive';
            if (brainy.includes(t.id)) return 'brainy';
            return 'spiced';
        };
        const currentCategory = platform === 'x' ? getXCategory(template) : '';

        let categoryFieldHtml = '';
        if (platform === 'x') {
            categoryFieldHtml = `
                <div class="template-field">
                    <label>Category:</label>
                    <select class="template-category-select" style="background-color: rgba(255, 255, 255, 0.05); color: #e7e9ea; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 6px 10px; font-size: 13px; outline: none; cursor: pointer; width: 100%; margin-top: 4px;">
                        <option value="positive" ${currentCategory === 'positive' ? 'selected' : ''}>Positive</option>
                        <option value="brainy" ${currentCategory === 'brainy' ? 'selected' : ''}>Brainy</option>
                        <option value="spiced" ${currentCategory === 'spiced' ? 'selected' : ''}>Spiced</option>
                    </select>
                </div>
            `;
        }

        div.innerHTML = `
            <div class="template-header">
                <div class="template-name">
                    <span class="template-icon">${template.icon || '📝'}</span>
                    <span>${template.name}</span>
                </div>
                <div class="template-actions">
                    <button class="template-action-button edit">Edit</button>
                    <button class="template-action-button delete">Delete</button>
                </div>
            </div>
            <div class="template-fields" style="display: none;">
                <div class="template-field">
                    <label>Name:</label>
                    <input type="text" class="template-name-input" value="${template.name}">
                </div>
                <div class="template-field">
                    <label>Icon:</label>
                    <input type="text" class="template-icon-input" value="${template.icon || ''}">
                </div>
                ${categoryFieldHtml}
                <div class="template-field">
                    <label>Prompt:</label>
                    <textarea class="template-prompt-input">${template.prompt}</textarea>
                </div>
                <button class="template-action-button save">Save Changes</button>
            </div>
        `;

        // Add event listeners
        const editButton = div.querySelector('.edit') as HTMLButtonElement;
        const deleteButton = div.querySelector('.delete') as HTMLButtonElement;
        const saveButton = div.querySelector('.save') as HTMLButtonElement;
        const fields = div.querySelector('.template-fields') as HTMLElement;

        editButton.addEventListener('click', () => {
            fields.style.display = fields.style.display === 'none' ? 'flex' : 'none';
        });

        deleteButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this template?')) {
                this.deleteTemplate(index, platform);
            }
        });

        saveButton.addEventListener('click', () => {
            const nameInput = div.querySelector('.template-name-input') as HTMLInputElement;
            const iconInput = div.querySelector('.template-icon-input') as HTMLInputElement;
            const promptInput = div.querySelector('.template-prompt-input') as HTMLTextAreaElement;

            const updatedTemplate: ReplyTemplate = {
                ...template,
                name: nameInput.value,
                icon: iconInput.value,
                prompt: promptInput.value
            };

            if (platform === 'x') {
                const categorySelect = div.querySelector('.template-category-select') as HTMLSelectElement;
                updatedTemplate.category = categorySelect.value as 'positive' | 'brainy' | 'spiced';
            }

            this.updateTemplate(index, updatedTemplate, platform);

            fields.style.display = 'none';
        });

        return div;
    }

    private async updateTemplate(index: number, template: ReplyTemplate, platform: 'x' | 'linkedinConnection' | 'linkedinPost') {
        if (platform === 'x') {
            this.xTemplates[index] = template;
            await this.saveXSettings();
        } else if (platform === 'linkedinConnection') {
            this.linkedinConnectionTemplates[index] = template;
            await this.saveLinkedInSettings();
        } else if (platform === 'linkedinPost') {
            this.linkedinPostTemplates[index] = template;
            await this.saveLinkedInSettings();
        }
        this.renderTemplates();
    }

    private async deleteTemplate(index: number, platform: 'x' | 'linkedinConnection' | 'linkedinPost') {
        if (platform === 'x') {
            this.xTemplates.splice(index, 1);
            await this.saveXSettings();
        } else if (platform === 'linkedinConnection') {
            this.linkedinConnectionTemplates.splice(index, 1);
            await this.saveLinkedInSettings();
        } else if (platform === 'linkedinPost') {
            this.linkedinPostTemplates.splice(index, 1);
            await this.saveLinkedInSettings();
        }
        this.renderTemplates();
    }

    private async addTemplate(platform: 'x' | 'linkedinConnection' | 'linkedinPost') {
        const newTemplate: ReplyTemplate = {
            id: `custom-${Date.now()}`,
            name: platform === 'x' ? 'New Template' : platform === 'linkedinConnection' ? 'New Connection Message' : 'New Post Template',
            prompt: platform === 'x' ? 'Enter your custom prompt here' : platform === 'linkedinConnection' ? 'Hi {name}, enter your message here' : 'Enter your LinkedIn post comment prompt here',
            icon: platform === 'x' ? '📝' : platform === 'linkedinConnection' ? '💬' : '💼'
        };

        if (platform === 'x') {
            newTemplate.category = 'positive';
            this.xTemplates.push(newTemplate);
            await this.saveXSettings();
        } else if (platform === 'linkedinConnection') {
            this.linkedinConnectionTemplates.push(newTemplate);
            await this.saveLinkedInSettings();
        } else if (platform === 'linkedinPost') {
            this.linkedinPostTemplates.push(newTemplate);
            await this.saveLinkedInSettings();
        }

        this.renderTemplates();

        // Scroll to the new template
        let listEl: HTMLElement;
        if (platform === 'x') {
            listEl = this.xTemplatesList;
        } else if (platform === 'linkedinConnection') {
            listEl = this.linkedinConnectionTemplatesList;
        } else {
            listEl = this.linkedinPostTemplatesList;
        }
        listEl.scrollTop = listEl.scrollHeight;
    }

    private async resetTemplates(platform: 'x' | 'linkedinConnection' | 'linkedinPost') {
        if (confirm('Are you sure you want to reset templates to default?')) {
            if (platform === 'x') {
                this.xTemplates = [...DEFAULT_X_TEMPLATES];
                await this.saveXSettings();
            } else if (platform === 'linkedinConnection') {
                this.linkedinConnectionTemplates = [
                    {
                        id: 'connect1',
                        name: 'Share Insights',
                        prompt: 'Hi {name}, I came across your profile and would love to connect to share insights and opportunities.',
                        icon: '👋'
                    },
                    {
                        id: 'connect2',
                        name: 'Work Interest',
                        prompt: 'Hello {name}! I found your work fascinating and would be happy to connect and keep in touch.',
                        icon: '🔗'
                    }
                ];
                await this.saveLinkedInSettings();
            } else if (platform === 'linkedinPost') {
                this.linkedinPostTemplates = [...DEFAULT_LINKEDIN_POST_TEMPLATES];
                await this.saveLinkedInSettings();
            }
            this.renderTemplates();
        }
    }


    // ── Export / Import ──────────────────────────────────────────

    private showSettingsStatus(message: string, type: 'success' | 'error') {
        this.settingsStatus.textContent = message;
        this.settingsStatus.className = `settings-status ${type}`;
        this.settingsStatus.style.display = 'block';
        setTimeout(() => {
            this.settingsStatus.style.display = 'none';
        }, 4000);
    }

    private async exportAllData() {
        try {
            const result = await chrome.storage.sync.get(['xSettings', 'linkedinSettings', 'linkedinTemplates']);

            const exportPayload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                xSettings: result.xSettings || null,
                linkedinSettings: result.linkedinSettings || null,
                linkedinConnectionTemplates: result.linkedinTemplates || null
            };

            const jsonString = JSON.stringify(exportPayload, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const now = new Date();
            const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const filename = `xai-reply-backup-${datePart}.json`;

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showSettingsStatus(`Exported to ${filename}`, 'success');
        } catch (error) {
            console.error('Export failed:', error);
            this.showSettingsStatus('Export failed: ' + error, 'error');
        }
    }

    private async handleImportFile(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Validate structure
            if (!data.xSettings && !data.linkedinSettings && !data.linkedinConnectionTemplates) {
                this.showSettingsStatus('Invalid file: no recognized data found.', 'error');
                input.value = '';
                return;
            }

            if (!confirm('This will overwrite your current templates, system prompts, and advanced settings for both X and LinkedIn. Continue?')) {
                input.value = '';
                return;
            }

            const updatePayload: Record<string, any> = {};

            if (data.xSettings) {
                updatePayload.xSettings = data.xSettings;
                this.xTemplates = data.xSettings.templates || this.xTemplates;
                if (data.xSettings.systemPrompt) {
                    this.xSystemPromptInput.value = data.xSettings.systemPrompt;
                }
                if (data.xSettings.advancedSettings) {
                    this.loadAdvancedSettings('x', data.xSettings.advancedSettings);
                }
            }

            if (data.linkedinSettings) {
                updatePayload.linkedinSettings = data.linkedinSettings;
                this.linkedinPostTemplates = data.linkedinSettings.templates || this.linkedinPostTemplates;
                if (data.linkedinSettings.systemPrompt) {
                    this.linkedinSystemPromptInput.value = data.linkedinSettings.systemPrompt;
                }
                if (data.linkedinSettings.advancedSettings) {
                    this.loadAdvancedSettings('linkedin', data.linkedinSettings.advancedSettings);
                }
            }

            if (data.linkedinConnectionTemplates) {
                updatePayload.linkedinTemplates = data.linkedinConnectionTemplates;
                this.linkedinConnectionTemplates = data.linkedinConnectionTemplates;
            }

            await chrome.storage.sync.set(updatePayload);

            this.updateAllRangeValues();
            this.renderTemplates();

            this.showSettingsStatus('Import successful! All data restored.', 'success');
        } catch (error) {
            console.error('Import failed:', error);
            this.showSettingsStatus('Import failed: invalid JSON file.', 'error');
        }

        input.value = '';
    }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    new PopupManager();
}); 