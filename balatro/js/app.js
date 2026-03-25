/**
 * Balatro Analyzer App
 * Handles UI, screenshot upload, and Claude API integration.
 */

const App = (() => {
    let currentImage = null;
    let analysisHistory = [];

    // DOM elements
    const els = {};

    function init() {
        // Cache DOM elements
        els.apiKey = document.getElementById('api-key');
        els.saveKey = document.getElementById('save-key');
        els.apiKeyDetails = document.getElementById('api-key-details');
        els.modelSelect = document.getElementById('model-select');
        els.dropZone = document.getElementById('drop-zone');
        els.dropZoneContent = document.getElementById('drop-zone-content');
        els.fileInput = document.getElementById('file-input');
        els.previewImage = document.getElementById('preview-image');
        els.uploadActions = document.getElementById('upload-actions');
        els.analyzeBtn = document.getElementById('analyze-btn');
        els.clearBtn = document.getElementById('clear-btn');
        els.loadingSection = document.getElementById('loading-section');
        els.loadingText = document.getElementById('loading-text');
        els.gameStateSection = document.getElementById('game-state-section');
        els.gameStateDisplay = document.getElementById('game-state-display');
        els.recommendationSection = document.getElementById('recommendation-section');
        els.recommendationDisplay = document.getElementById('recommendation-display');
        els.historySection = document.getElementById('history-section');
        els.historyDisplay = document.getElementById('history-display');

        // Load saved settings
        const savedKey = localStorage.getItem('balatro_api_key');
        if (savedKey) {
            els.apiKey.value = savedKey;
            els.apiKeyDetails.removeAttribute('open');
        } else {
            els.apiKeyDetails.setAttribute('open', '');
        }

        const savedModel = localStorage.getItem('balatro_model');
        if (savedModel) els.modelSelect.value = savedModel;

        // Load history
        try {
            analysisHistory = JSON.parse(localStorage.getItem('balatro_history') || '[]');
            if (analysisHistory.length > 0) renderHistory();
        } catch (e) {
            analysisHistory = [];
        }

        // Event listeners
        els.saveKey.addEventListener('click', saveApiKey);
        els.modelSelect.addEventListener('change', () => {
            localStorage.setItem('balatro_model', els.modelSelect.value);
        });
        els.dropZone.addEventListener('click', () => els.fileInput.click());
        els.dropZone.addEventListener('dragover', handleDragOver);
        els.dropZone.addEventListener('dragleave', handleDragLeave);
        els.dropZone.addEventListener('drop', handleDrop);
        els.fileInput.addEventListener('change', handleFileSelect);
        els.analyzeBtn.addEventListener('click', analyzeScreenshot);
        els.clearBtn.addEventListener('click', clearImage);

        // Paste support
        document.addEventListener('paste', handlePaste);
    }

    function saveApiKey() {
        const key = els.apiKey.value.trim();
        if (key) {
            localStorage.setItem('balatro_api_key', key);
            els.apiKeyDetails.removeAttribute('open');
            showToast('API key saved');
        }
    }

    function getApiKey() {
        return (els.apiKey.value.trim() || localStorage.getItem('balatro_api_key') || '').trim();
    }

    // --- File handling ---

    function handleDragOver(e) {
        e.preventDefault();
        els.dropZone.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        els.dropZone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        els.dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            loadImage(file);
        }
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) loadImage(file);
    }

    function handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) loadImage(file);
                break;
            }
        }
    }

    function loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            compressImage(e.target.result, (compressed) => {
                currentImage = compressed;
                els.previewImage.src = currentImage;
                els.previewImage.classList.remove('hidden');
                els.dropZoneContent.classList.add('hidden');
                els.uploadActions.classList.remove('hidden');
            });
        };
        reader.readAsDataURL(file);
    }

    /**
     * Compress image to stay under the Claude API 5MB base64 limit.
     * Uses canvas to resize and re-encode as JPEG.
     */
    function compressImage(dataUrl, callback) {
        const MAX_BYTES = 4.5 * 1024 * 1024; // 4.5MB to leave headroom
        const img = new Image();
        img.onload = () => {
            // Check if already small enough
            const base64Part = dataUrl.split(',')[1] || '';
            if (base64Part.length * 0.75 <= MAX_BYTES) {
                callback(dataUrl);
                return;
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let { width, height } = img;

            // Scale down until it fits, starting at 2000px max dimension
            let maxDim = 2000;
            let quality = 0.85;
            let result = dataUrl;

            function tryCompress() {
                const scale = Math.min(1, maxDim / Math.max(width, height));
                canvas.width = Math.round(width * scale);
                canvas.height = Math.round(height * scale);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                result = canvas.toDataURL('image/jpeg', quality);

                const b64 = result.split(',')[1] || '';
                if (b64.length * 0.75 <= MAX_BYTES || maxDim <= 800) {
                    callback(result);
                } else {
                    // Try smaller
                    maxDim -= 300;
                    quality = Math.max(0.6, quality - 0.05);
                    tryCompress();
                }
            }
            tryCompress();
        };
        img.src = dataUrl;
    }

    function clearImage() {
        currentImage = null;
        els.previewImage.src = '';
        els.previewImage.classList.add('hidden');
        els.dropZoneContent.classList.remove('hidden');
        els.uploadActions.classList.add('hidden');
        els.fileInput.value = '';
        els.gameStateSection.classList.add('hidden');
        els.recommendationSection.classList.add('hidden');
    }

    // --- API Communication ---

    async function analyzeScreenshot() {
        const apiKey = getApiKey();
        if (!apiKey) {
            els.apiKeyDetails.setAttribute('open', '');
            showToast('Please enter your Claude API key first');
            return;
        }
        if (!currentImage) {
            showToast('Please upload a screenshot first');
            return;
        }

        showLoading('Analyzing your Balatro hand...');
        els.analyzeBtn.disabled = true;

        try {
            const result = await callClaudeAPI(apiKey, currentImage);
            displayResults(result);
            saveToHistory(result);
        } catch (err) {
            hideLoading();
            showToast('Error: ' + err.message);
        } finally {
            els.analyzeBtn.disabled = false;
        }
    }

    async function callClaudeAPI(apiKey, imageDataUrl) {
        const model = els.modelSelect.value;

        // Extract base64 and media type from data URL
        const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) throw new Error('Invalid image data');
        const mediaType = match[1];
        const base64Data = match[2];

        const systemPrompt = `You are a Balatro game analyzer. You will be given a screenshot from Balatro (a roguelike poker deck-builder game).

Your job:
1. Parse the COMPLETE game state visible in the screenshot
2. Identify ALL possible hands that can be played from the current cards
3. Calculate expected scores considering jokers, hand levels, and card enhancements
4. Recommend the OPTIMAL play with clear reasoning

IMPORTANT RULES FOR ANALYSIS:
- Consider joker effects and their interactions carefully
- Factor in remaining hands and discards when recommending plays
- Consider the blind target - sometimes a "worse" hand that beats the blind is better than fishing for a "better" hand
- If discards remain, consider what discarding could lead to
- Account for hand levels (planet card upgrades)
- Note card enhancements (bonus, mult, wild, glass, steel, stone, gold, lucky), editions (foil, holographic, polychrome), and seals (gold, red, blue, purple)

Respond with ONLY valid JSON in this exact format:
{
  "gameState": {
    "blind": { "name": "Small Blind/Big Blind/The X", "target": 300, "current": 0 },
    "handsLeft": 4,
    "discardsLeft": 3,
    "money": 5,
    "ante": 1,
    "round": 1,
    "handCards": [
      { "rank": "A", "suit": "Spades", "enhancement": null, "edition": null, "seal": null }
    ],
    "jokers": [
      { "name": "Joker Name", "edition": null, "description": "effect description" }
    ],
    "handLevels": {
      "Pair": 1, "Two Pair": 1, "Three of a Kind": 1, "Straight": 1,
      "Flush": 1, "Full House": 1, "Four of a Kind": 1, "Straight Flush": 1,
      "High Card": 1, "Five of a Kind": 1, "Flush House": 1, "Flush Five": 1
    },
    "consumables": [],
    "deckRemaining": null
  },
  "analysis": {
    "bestPlay": {
      "cards": ["AS", "AH", "AD"],
      "handType": "Three of a Kind",
      "estimatedScore": 150,
      "beatsBlind": true
    },
    "alternativePlays": [
      {
        "cards": ["AS", "AH"],
        "handType": "Pair",
        "estimatedScore": 50,
        "beatsBlind": false,
        "note": "Safe option if you want to save discards"
      }
    ],
    "discardAdvice": {
      "shouldDiscard": false,
      "cardsToDiscard": [],
      "reasoning": "Your current hand can beat the blind"
    },
    "reasoning": "Detailed explanation of why this is the optimal play...",
    "strategyNotes": "Any broader strategic considerations..."
  }
}

If you cannot clearly read parts of the screenshot, make your best guess and note any uncertainty in the reasoning.
For card shorthand: use rank + first letter of suit (AS = Ace of Spades, 10H = 10 of Hearts, etc.)
Hand levels default to 1 if not visible.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType,
                                data: base64Data
                            }
                        },
                        {
                            type: 'text',
                            text: 'Analyze this Balatro screenshot. What is the optimal play and why? Return JSON only.'
                        }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            if (response.status === 401) {
                throw new Error('Invalid API key. Check your key and try again.');
            }
            throw new Error(`API error (${response.status}): ${errorBody}`);
        }

        const data = await response.json();
        const text = data.content[0]?.text || '';

        // Parse JSON from response (handle markdown code blocks)
        let jsonStr = text;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        }

        try {
            return JSON.parse(jsonStr.trim());
        } catch (e) {
            // If JSON parsing fails, return raw analysis
            return {
                gameState: null,
                analysis: { reasoning: text },
                parseError: true
            };
        }
    }

    // --- Display ---

    function displayResults(result) {
        hideLoading();

        if (result.parseError) {
            // Couldn't parse structured JSON, show raw analysis
            els.recommendationSection.classList.remove('hidden');
            els.recommendationDisplay.innerHTML = `
                <div class="raw-analysis">
                    <p>${escapeHtml(result.analysis.reasoning)}</p>
                </div>`;
            return;
        }

        const { gameState, analysis } = result;

        // Display game state
        if (gameState) {
            els.gameStateSection.classList.remove('hidden');
            els.gameStateDisplay.innerHTML = renderGameState(gameState);

            // Run local analysis if we have card data
            if (gameState.handCards?.length > 0) {
                const localPlays = BalatroAnalyzer.findAllPlays(
                    gameState.handCards,
                    gameState.handLevels || {},
                    gameState.jokers || []
                );
                // Merge local scores with AI analysis for display
                if (localPlays.length > 0) {
                    const topLocalPlays = localPlays.slice(0, 5);
                    const localScoresHtml = topLocalPlays.map((play, i) => {
                        const cardStrs = play.cards.map(c => {
                            const f = BalatroAnalyzer.formatCard(c);
                            return `<span class="card-chip" style="color:${f.color}">${escapeHtml(f.text)}</span>`;
                        }).join(' ');
                        return `
                            <div class="play-option ${i === 0 ? 'best' : ''}">
                                <div class="play-cards">${cardStrs}</div>
                                <div class="play-info">
                                    <span class="hand-type">${play.handType} (Lvl ${play.level})</span>
                                    <span class="play-score">${BalatroAnalyzer.formatNumber(play.totalScore)}</span>
                                </div>
                                <div class="play-breakdown">
                                    ${play.totalChips} chips × ${play.totalMult} mult${play.xMult > 1 ? ` × ${play.xMult}x` : ''}
                                </div>
                            </div>`;
                    }).join('');

                    els.gameStateDisplay.innerHTML += `
                        <div class="local-analysis">
                            <h3>Possible Hands (by score)</h3>
                            ${localScoresHtml}
                        </div>`;
                }
            }
        }

        // Display recommendation
        if (analysis) {
            els.recommendationSection.classList.remove('hidden');
            els.recommendationDisplay.innerHTML = renderRecommendation(analysis, gameState);
        }

        // Scroll to results
        els.gameStateSection.scrollIntoView({ behavior: 'smooth' });
    }

    function renderGameState(state) {
        let html = '<div class="state-grid">';

        // Blind info
        if (state.blind) {
            const progress = state.blind.target > 0
                ? Math.min(100, (state.blind.current / state.blind.target) * 100)
                : 0;
            html += `
                <div class="state-item blind-info">
                    <span class="state-label">Blind</span>
                    <span class="state-value">${escapeHtml(state.blind.name || 'Unknown')}</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width:${progress}%"></div>
                    </div>
                    <span class="state-detail">${BalatroAnalyzer.formatNumber(state.blind.current || 0)} / ${BalatroAnalyzer.formatNumber(state.blind.target || 0)}</span>
                </div>`;
        }

        html += `
            <div class="state-item">
                <span class="state-label">Hands</span>
                <span class="state-value big">${state.handsLeft ?? '?'}</span>
            </div>
            <div class="state-item">
                <span class="state-label">Discards</span>
                <span class="state-value big">${state.discardsLeft ?? '?'}</span>
            </div>
            <div class="state-item">
                <span class="state-label">Money</span>
                <span class="state-value big">$${state.money ?? '?'}</span>
            </div>`;

        html += '</div>';

        // Hand cards
        if (state.handCards?.length > 0) {
            html += '<div class="hand-cards"><h3>Your Hand</h3><div class="cards-row">';
            for (const card of state.handCards) {
                const f = BalatroAnalyzer.formatCard(card);
                let extras = '';
                if (card.enhancement) extras += `<span class="card-tag enhancement">${card.enhancement}</span>`;
                if (card.edition) extras += `<span class="card-tag edition">${card.edition}</span>`;
                if (card.seal) extras += `<span class="card-tag seal">${card.seal}</span>`;
                html += `
                    <div class="card-display" style="border-color:${f.color}">
                        <span class="card-rank" style="color:${f.color}">${escapeHtml(f.text)}</span>
                        ${extras}
                    </div>`;
            }
            html += '</div></div>';
        }

        // Jokers
        if (state.jokers?.length > 0) {
            html += '<div class="jokers-display"><h3>Jokers</h3><div class="joker-row">';
            for (const joker of state.jokers) {
                html += `
                    <div class="joker-card">
                        <span class="joker-name">${escapeHtml(joker.name || 'Unknown')}</span>
                        ${joker.edition ? `<span class="card-tag edition">${escapeHtml(joker.edition)}</span>` : ''}
                    </div>`;
            }
            html += '</div></div>';
        }

        return html;
    }

    function renderRecommendation(analysis, gameState) {
        let html = '';

        // Best play
        if (analysis.bestPlay) {
            const bp = analysis.bestPlay;
            html += `
                <div class="best-play">
                    <div class="play-header">
                        <span class="play-label">PLAY THIS</span>
                        <span class="beats-blind ${bp.beatsBlind ? 'yes' : 'no'}">
                            ${bp.beatsBlind ? 'Beats blind' : 'Doesn\'t beat blind'}
                        </span>
                    </div>
                    <div class="play-cards big">
                        ${(bp.cards || []).map(c => `<span class="card-chip-big">${escapeHtml(c)}</span>`).join(' ')}
                    </div>
                    <div class="play-type">${escapeHtml(bp.handType || '')}</div>
                    <div class="play-est-score">~${BalatroAnalyzer.formatNumber(bp.estimatedScore || 0)} chips</div>
                </div>`;
        }

        // Discard advice
        if (analysis.discardAdvice && analysis.discardAdvice.shouldDiscard) {
            html += `
                <div class="discard-advice">
                    <div class="play-header">
                        <span class="play-label discard">DISCARD INSTEAD</span>
                    </div>
                    <div class="play-cards">
                        ${(analysis.discardAdvice.cardsToDiscard || []).map(c =>
                            `<span class="card-chip-big discard">${escapeHtml(c)}</span>`).join(' ')}
                    </div>
                    <p class="advice-reason">${escapeHtml(analysis.discardAdvice.reasoning || '')}</p>
                </div>`;
        }

        // Alternative plays
        if (analysis.alternativePlays?.length > 0) {
            html += '<div class="alternatives"><h3>Alternatives</h3>';
            for (const alt of analysis.alternativePlays) {
                html += `
                    <div class="alt-play">
                        <div class="play-cards">
                            ${(alt.cards || []).map(c => `<span class="card-chip">${escapeHtml(c)}</span>`).join(' ')}
                        </div>
                        <span class="hand-type">${escapeHtml(alt.handType || '')}</span>
                        <span class="play-score">~${BalatroAnalyzer.formatNumber(alt.estimatedScore || 0)}</span>
                        ${alt.note ? `<p class="alt-note">${escapeHtml(alt.note)}</p>` : ''}
                    </div>`;
            }
            html += '</div>';
        }

        // Reasoning
        if (analysis.reasoning) {
            html += `
                <div class="reasoning">
                    <h3>Why?</h3>
                    <p>${escapeHtml(analysis.reasoning)}</p>
                </div>`;
        }

        // Strategy notes
        if (analysis.strategyNotes) {
            html += `
                <div class="strategy-notes">
                    <h3>Strategy</h3>
                    <p>${escapeHtml(analysis.strategyNotes)}</p>
                </div>`;
        }

        return html;
    }

    // --- History ---

    function saveToHistory(result) {
        const entry = {
            timestamp: Date.now(),
            thumbnail: currentImage ? currentImage.substring(0, 200) + '...' : null,
            bestPlay: result.analysis?.bestPlay,
            handType: result.analysis?.bestPlay?.handType,
            score: result.analysis?.bestPlay?.estimatedScore
        };
        analysisHistory.unshift(entry);
        if (analysisHistory.length > 20) analysisHistory = analysisHistory.slice(0, 20);
        localStorage.setItem('balatro_history', JSON.stringify(analysisHistory));
        renderHistory();
    }

    function renderHistory() {
        if (analysisHistory.length === 0) {
            els.historySection.classList.add('hidden');
            return;
        }
        els.historySection.classList.remove('hidden');
        els.historyDisplay.innerHTML = analysisHistory.map(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            return `
                <div class="history-entry">
                    <span class="history-time">${time}</span>
                    <span class="history-hand">${escapeHtml(entry.handType || '?')}</span>
                    <span class="history-score">~${BalatroAnalyzer.formatNumber(entry.score || 0)}</span>
                </div>`;
        }).join('');
    }

    // --- Utilities ---

    function showLoading(text) {
        els.loadingText.textContent = text;
        els.loadingSection.classList.remove('hidden');
        els.gameStateSection.classList.add('hidden');
        els.recommendationSection.classList.add('hidden');
    }

    function hideLoading() {
        els.loadingSection.classList.add('hidden');
    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init };
})();
