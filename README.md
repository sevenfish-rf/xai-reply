# ✨ XAI Reply

A Chrome extension that lets you generate context-aware replies on **X (Twitter)** and **LinkedIn** using AI. 

Built with a clean dark theme, support for custom API providers (like Ollama, LM Studio, DeepSeek, or OpenRouter), model list caching, and custom templates.

## 📸 Screenshots

<p align="center">
  <img src="screenshots/Screenshots (0).png" width="18%" alt="Demo 1" />
  <img src="screenshots/Screenshots (1).png" width="18%" alt="Demo 2" />
  <img src="screenshots/Screenshots (2).png" width="18%" alt="Demo 3" />
  <img src="screenshots/Screenshots (3).png" width="18%" alt="Demo 4" />
  <img src="screenshots/Screenshots (4).png" width="18%" alt="Demo 5" />
</p>

---

## 🎨 UI 
*   **Dark theme by default**: Space-black background with a subtle blue/orange gradient header and warm yellow highlights.
*   **Compact settings layout**: Settings rows are inspired by clean iOS settings menus to keep things neat and avoid scrolling fatigue.
*   **Centered layouts**: Everything is set to `border-box` and flex-centered to prevent layouts from breaking or clipping.

---

## What it does

### 1. Social Media Injection
Injects a small template selector next to reply inputs on:
*   **X (Twitter)**: Right below the reply box.
*   **LinkedIn**: In comments and connection message boxes.

### 2. Custom Providers (Ollama, DeepSeek, etc.)
*   You are not locked into OpenRouter. You can save multiple custom OpenAI-compatible endpoints.
*   The UI stays clean: the Base URL and API Key inputs are hidden until you choose `+ Add Custom Provider...`.
*   Saved custom endpoints can be selected from a single dropdown, and you can delete them anytime.

### 3. Model Caching
*   Model lists fetched from APIs are saved locally per provider.
*   Switching providers loads the cached model dropdown instantly without redundant API calls.

### 4. Custom Templates
*   Manage your reply prompts (Question, Funny, Agreement, Insight, etc.) in a unified row list.
*   Add, edit, or remove templates directly.

### 5. Local Drafts
*   Save generated replies to a local drafts list.
*   View, copy, or clean up your saved drafts in the **Drafts** tab.

### 6. Advanced Settings & Fine-Tuning
Under the **X (Twitter)** and **LinkedIn** tabs, you can expand **Advanced Settings** to fine-tune the model parameters for each platform individually:
*   **Temperature** (0.0 - 2.0): Controls response randomness. Lower values (e.g., 0.3) make output focused and predictable; higher values (e.g., 0.9) increase creativity.
*   **Max Tokens**: Restricts the maximum length of generated replies to keep API costs predictable.
*   **Presence Penalty** (-2.0 - 2.0): Positive values encourage the model to discuss new topics; negative values keep it closely aligned with the exact context.
*   **Frequency Penalty** (-2.0 - 2.0): Positive values penalize repeating the same words or phrases, forcing more vocabulary variation.
*   **Typing Speed** (ms): Simulates human typing speed character-by-character on the target text area (e.g., 5ms per char). Set to `0` for instant insertion.
*   **Manual Model Overrides**: Check the "Manual" box next to the model dropdown to type in any local or custom model name directly.

---

## 🛠️ How to run it

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the files:
   ```bash
   npm run build
   ```
   *(For development with auto-rebuilding, run `npm run dev`)*.

### Loading to Chrome
1. Go to `chrome://extensions/` in your browser.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the **`dist`** folder inside this project directory.

---

## Project Files

*   `src/background.ts`: Handles requests and fetches models behind the scenes.
*   `src/content.ts` & `src/content_linkedin.ts`: Content scripts that hook into textareas.
*   `src/popup.ts`: Logic for the settings panel.
*   `src/styles.css`: Stylesheet for the dark theme.
*   `popup.html`: The HTML layout for the popup.
*   `manifest.json`: Configuration manifest.

---

## Privacy
Everything (keys, drafts, templates, custom providers) is saved locally in your browser storage (`chrome.storage.sync` and `chrome.storage.local`). Nothing is sent to external trackers.

---

## License
MIT
