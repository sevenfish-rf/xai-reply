// Background service worker for XAi Reply
import { GenerateReplyRequest, GenerateReplyResponse, ProviderConfig, DraftItem } from './types';
import { loadXSystemPrompt, loadLinkedInSystemPrompt } from './utils/promptLoader';

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

class BackgroundService {
    private defaultXSystemPrompt: string = 'Loading...';
    private defaultLinkedInSystemPrompt: string = 'Loading...';

    constructor() {
        this.init();
    }

    private async init() {
        try {
            // Load the default prompts for both platforms
            this.defaultXSystemPrompt = await loadXSystemPrompt();
            this.defaultLinkedInSystemPrompt = await loadLinkedInSystemPrompt();
            this.setupMessageListener();
        } catch (error) {
            console.error('XAi Reply: Failed to initialize background service:', error);
        }
    }

    private setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'generateReply') {
                // Handle the request asynchronously
                this.handleGenerateReply(request.data, sendResponse)
                    .catch(error => {
                        console.error('Error in handleGenerateReply:', error);
                        sendResponse({
                            reply: '',
                            error: error instanceof Error ? error.message : 'Unknown error occurred'
                        });
                    });
                return true; // Will respond asynchronously
            } else if (request.action === 'generateResearch') {
                this.handleGenerateResearch(request.data, sendResponse)
                    .catch(error => {
                        console.error('Error in handleGenerateResearch:', error);
                        sendResponse({
                            reply: '',
                            error: error instanceof Error ? error.message : 'Unknown error occurred'
                        });
                    });
                return true; // Will respond asynchronously
            } else if (request.action === 'fetchModels') {
                this.handleFetchModels(request.data, sendResponse)
                    .catch(error => {
                        console.error('Error in handleFetchModels:', error);
                        sendResponse({
                            models: [],
                            error: error instanceof Error ? error.message : 'Unknown error occurred'
                        });
                    });
                return true; // Will respond asynchronously
            }
            return false;
        });
    }

    private async handleFetchModels(
        data: { mode: 'openrouter' | 'custom', customBaseUrl?: string, customApiKey?: string, openrouterApiKey?: string },
        sendResponse: (response: { models: any[], error?: string }) => void
    ) {
        try {
            let url = '';
            let headers: Record<string, string> = {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };

            if (data.mode === 'openrouter') {
                url = 'https://openrouter.ai/api/v1/models';
                if (data.openrouterApiKey) {
                    headers['Authorization'] = `Bearer ${data.openrouterApiKey}`;
                }
            } else {
                if (!data.customBaseUrl) {
                    throw new Error('Custom Base URL is required to fetch models.');
                }
                let baseUrl = data.customBaseUrl.trim();
                if (baseUrl.endsWith('/')) {
                    baseUrl = baseUrl.slice(0, -1);
                }
                
                if (baseUrl.endsWith('/models')) {
                    url = baseUrl;
                } else {
                    url = `${baseUrl}/models`;
                }

                if (data.customApiKey) {
                    headers['Authorization'] = `Bearer ${data.customApiKey}`;
                }
            }

            const response = await fetch(url, {
                method: 'GET',
                headers
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`HTTP ${response.status} - ${errorText}`);
            }

            const resData = await response.json();
            let modelsList: any[] = [];
            if (Array.isArray(resData)) {
                modelsList = resData;
            } else if (resData && Array.isArray(resData.data)) {
                modelsList = resData.data;
            } else if (resData && Array.isArray(resData.models)) {
                modelsList = resData.models;
            }

            const models = modelsList.map((m: any) => {
                const id = m.id || m.name || '';
                return {
                    id: id,
                    name: m.name || id,
                    provider: data.mode,
                    description: m.description || ''
                };
            }).filter((m: any) => m.id);

            sendResponse({ models });
        } catch (error) {
            console.error('Error fetching models:', error);
            sendResponse({
                models: [],
                error: error instanceof Error ? error.message : 'Failed to fetch models'
            });
        }
    }

    private async handleGenerateReply(
        request: GenerateReplyRequest,
        sendResponse: (response: GenerateReplyResponse) => void
    ) {
        try {
            // Get platform-specific settings from storage
            const platform = request.platform || 'x';
            const storageKeys = platform === 'linkedin'
                ? ['providerConfig', 'openrouterApiKey', 'model', 'linkedinSettings']
                : ['providerConfig', 'openrouterApiKey', 'model', 'xSettings'];

            const result = await chrome.storage.sync.get(storageKeys);
            let providerConfig: ProviderConfig = result.providerConfig;

            // Migration / Fallback logic for legacy keys
            if (!providerConfig) {
                providerConfig = {
                    mode: 'openrouter',
                    openrouterApiKey: result.openrouterApiKey,
                    model: result.model || 'openai/gpt-4o-mini'
                };
            }

            const mode = providerConfig.mode || 'openrouter';
            const model = providerConfig.model || 'openai/gpt-4o-mini';

            let apiKey = '';
            let baseUrl = '';
            let headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            if (mode === 'custom' || mode.startsWith('custom-')) {
                apiKey = providerConfig.customApiKey || '';
                let rawBaseUrl = (providerConfig.customBaseUrl || '').trim();
                if (rawBaseUrl.endsWith('/')) {
                    rawBaseUrl = rawBaseUrl.slice(0, -1);
                }
                if (rawBaseUrl.endsWith('/chat/completions')) {
                    baseUrl = rawBaseUrl;
                } else {
                    baseUrl = `${rawBaseUrl}/chat/completions`;
                }
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
            } else {
                apiKey = providerConfig.openrouterApiKey || '';
                baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
                if (!apiKey) {
                    sendResponse({
                        reply: '',
                        error: 'OpenRouter API key not configured. Please set it in the extension popup.'
                    });
                    return;
                }
                headers['Authorization'] = `Bearer ${apiKey}`;
                headers['HTTP-Referer'] = 'https://xaireply.extension';
                headers['X-Title'] = 'XAi Reply Extension';
            }

            // Get platform-specific settings
            let systemPrompt: string;
            let advancedSettings: AdvancedSettings;

            if (platform === 'linkedin') {
                const linkedinSettings = result.linkedinSettings || {};
                systemPrompt = linkedinSettings.systemPrompt || this.defaultLinkedInSystemPrompt;
                advancedSettings = linkedinSettings.advancedSettings || { ...DEFAULT_SETTINGS, maxTokens: 60 };
            } else {
                const xSettings = result.xSettings || {};
                systemPrompt = xSettings.systemPrompt || this.defaultXSystemPrompt;
                advancedSettings = xSettings.advancedSettings || DEFAULT_SETTINGS;
            }

            // Generate the reply
            const replyResult = await this.callLLMProvider(
                baseUrl,
                headers,
                model,
                systemPrompt,
                advancedSettings,
                request
            );

            sendResponse({
                reply: replyResult.reply,
                usage: replyResult.usage
            });
        } catch (error) {
            console.error('Error generating reply:', error);
            sendResponse({
                reply: '',
                error: error instanceof Error ? error.message : 'Failed to generate reply'
            });
        }
    }

    private async callLLMProvider(
        url: string,
        headers: Record<string, string>,
        model: string,
        systemPrompt: string,
        settings: AdvancedSettings,
        request: GenerateReplyRequest
    ): Promise<{ reply: string, usage?: any }> {
        const { tweetContent, template, customInstruction, length, context, targetLanguage } = request;
        let finalSystemPrompt = `${systemPrompt}\n\n${template.prompt}`;
        if (customInstruction && customInstruction.trim() !== '') {
            finalSystemPrompt += `\n\nADDITIONAL INSTRUCTION: You must strictly follow this custom styling or content instruction: "${customInstruction.trim()}"`;
        }

        // Apply length constraints dynamically
        let lengthInstruction = '';
        if (length === 'short') {
            lengthInstruction = 'LIMIT output length to a maximum of 1 sentence or 15-20 words. Be extremely concise and snappy.';
        } else if (length === 'medium') {
            lengthInstruction = 'LIMIT output length to a maximum of 2-3 sentences or 40-50 words. Balanced length.';
        } else if (length === 'long') {
            lengthInstruction = 'Generate a detailed reply of 3-5 sentences or 80-100 words. Provide complete thoughts.';
        }
        
        if (lengthInstruction) {
            finalSystemPrompt += `\n\nLENGTH CONSTRAINT: ${lengthInstruction}`;
        }

        // Apply target language constraint if set
        if (targetLanguage && targetLanguage !== 'auto') {
            finalSystemPrompt += `\n\nLANGUAGE CONSTRAINT: You must write the final reply strictly in the following language: ${targetLanguage}. Translate the context text in your head if necessary, but keep the response output entirely in ${targetLanguage}.`;
        }

        let userPrompt = '';
        if (context && context.length > 0) {
            userPrompt = `Conversation Thread Context (in chronological order):\n${context.join('\n')}\n\nGenerate the reply to the last message.`;
        } else if (tweetContent) {
            userPrompt = `Generate a reply to this post: "${tweetContent}"`;
        } else {
            userPrompt = `Create a post`;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: finalSystemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: settings.maxTokens,
                    temperature: settings.temperature,
                    presence_penalty: settings.presencePenalty,
                    frequency_penalty: settings.frequencyPenalty
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: { message: 'Unknown API error' } }));
                throw new Error(error.error?.message || `Request failed with HTTP status ${response.status}`);
            }

            const data = await response.json();
            
            // Check for API-specific error envelopes in 200 OK responses
            if (data && data.error) {
                const errorMsg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
                throw new Error(`API Error: ${errorMsg}`);
            }

            let replyContent = data.choices?.[0]?.message?.content?.trim();

            if (!replyContent) {
                const choice = data.choices?.[0];
                if (choice && choice.finish_reason === 'length' && (choice.message?.reasoning_content || data.usage?.completion_tokens_details?.reasoning_tokens)) {
                    throw new Error(`The model ran out of tokens during its reasoning process. Please go to the X/Twitter or LinkedIn tab in the popup, open 'Advanced Settings', and increase 'Max Tokens' (currently capped at ${settings.maxTokens}).`);
                }
                console.error('XAi Reply: Empty reply content. API Response:', data);
                throw new Error(`No reply content generated from the model API. Response: ${JSON.stringify(data)}`);
            }

            // Map token usage info
            let usage = undefined;
            if (data.usage) {
                usage = {
                    promptTokens: data.usage.prompt_tokens || 0,
                    completionTokens: data.usage.completion_tokens || 0,
                    totalTokens: data.usage.total_tokens || 0,
                    reasoningTokens: data.usage.completion_tokens_details?.reasoning_tokens || undefined
                };
            }

            return {
                reply: this.formatReplyContent(replyContent),
                usage
            };
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Failed to communicate with LLM provider API.');
        }
    }

    private async handleGenerateResearch(
        data: { prompt: string, context: string, model?: string },
        sendResponse: (response: { reply: string, error?: string }) => void
    ) {
        try {
            const result = await chrome.storage.sync.get(['providerConfig', 'openrouterApiKey', 'model']);
            let providerConfig: ProviderConfig = result.providerConfig;

            if (!providerConfig) {
                providerConfig = {
                    mode: 'openrouter',
                    openrouterApiKey: result.openrouterApiKey,
                    model: result.model || 'openai/gpt-4o-mini'
                };
            }

            const mode = providerConfig.mode || 'openrouter';
            const model = data.model || providerConfig.model || 'openai/gpt-4o-mini';

            let apiKey = '';
            let baseUrl = '';
            let headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            if (mode === 'custom' || mode.startsWith('custom-')) {
                apiKey = providerConfig.customApiKey || '';
                let rawBaseUrl = (providerConfig.customBaseUrl || '').trim();
                if (rawBaseUrl.endsWith('/')) {
                    rawBaseUrl = rawBaseUrl.slice(0, -1);
                }
                if (rawBaseUrl.endsWith('/chat/completions')) {
                    baseUrl = rawBaseUrl;
                } else {
                    baseUrl = `${rawBaseUrl}/chat/completions`;
                }
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
            } else {
                apiKey = providerConfig.openrouterApiKey || '';
                baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
                if (!apiKey) {
                    sendResponse({
                        reply: '',
                        error: 'OpenRouter API key not configured. Please set it in the extension popup.'
                    });
                    return;
                }
                headers['Authorization'] = `Bearer ${apiKey}`;
                headers['HTTP-Referer'] = 'https://xaireply.extension';
                headers['X-Title'] = 'XAi Reply Extension';
            }

            const systemPrompt = "You are a helpful AI research assistant. Your task is to analyze, summarize, synthesize, or extract key insights from the provided posts according to the user instructions. Be detailed, professional, and accurate.";
            const userPrompt = `Here are the collected posts:\n\n${data.context}\n\nUser instructions:\n${data.prompt}`;

            const response = await fetch(baseUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: 1500, // higher limit for research output
                    temperature: 0.3 // more factual/analytical
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: { message: 'Unknown API error' } }));
                throw new Error(error.error?.message || `Request failed with HTTP status ${response.status}`);
            }

            const resData = await response.json();
            if (resData && resData.error) {
                const errorMsg = typeof resData.error === 'string' ? resData.error : (resData.error.message || JSON.stringify(resData.error));
                throw new Error(`API Error: ${errorMsg}`);
            }

            const replyContent = resData.choices?.[0]?.message?.content?.trim();
            if (!replyContent) {
                throw new Error('No reply content generated from the model API.');
            }

            sendResponse({ reply: replyContent });
        } catch (error) {
            console.error('Error generating research:', error);
            sendResponse({
                reply: '',
                error: error instanceof Error ? error.message : 'Failed to generate research response'
            });
        }
    }

    private formatReplyContent(content: string): string {
        return content; // Return raw content for now (per existing implementation)
    }
}

// Initialize the service worker
new BackgroundService();