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
     * Crop out Balatro's dead space and compress.
     * Balatro landscape layout (iPhone):
     *   Left ~20%: Blind info, score, ante
     *   ~20-35%: Joker slots + consumables (vertical stack)
     *   ~35-65%: Table felt (mostly empty)
     *   ~55-100%: Hand cards at bottom, play/discard buttons at right
     * We detect orientation and crop accordingly.
     */
    function compressImage(dataUrl, callback) {
        const MAX_BYTES = 4.5 * 1024 * 1024;
        const img = new Image();
        img.onload = () => {
            const { width, height } = img;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const isLandscape = width > height;

            if (isLandscape) {
                // Landscape: crop out the empty center of the table
                // Left strip: blind info + jokers (0-40% of width)
                // Right strip: hand area + buttons (55-100% of width)
                const leftEnd = Math.round(width * 0.40);
                const rightStart = Math.round(width * 0.50);
                const rightWidth = width - rightStart;
                const croppedWidth = leftEnd + rightWidth;

                canvas.width = croppedWidth;
                canvas.height = height;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Draw left strip (blind, jokers, consumables)
                ctx.drawImage(img, 0, 0, leftEnd, height, 0, 0, leftEnd, height);
                // Draw right strip (hand cards, buttons)
                ctx.drawImage(img, rightStart, 0, rightWidth, height, leftEnd, 0, rightWidth, height);
            } else {
                // Portrait: crop out the empty middle
                const topEnd = Math.round(height * 0.35);
                const bottomStart = Math.round(height * 0.48);
                const bottomHeight = height - bottomStart;
                const croppedHeight = topEnd + bottomHeight;

                canvas.width = width;
                canvas.height = croppedHeight;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                ctx.drawImage(img, 0, 0, width, topEnd, 0, 0, width, topEnd);
                ctx.drawImage(img, 0, bottomStart, width, bottomHeight, 0, topEnd, width, bottomHeight);
            }

            // Scale down if still too large
            let maxDim = 2400;
            let quality = 0.90;

            function tryCompress() {
                const outCanvas = document.createElement('canvas');
                const outCtx = outCanvas.getContext('2d');
                const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
                outCanvas.width = Math.round(canvas.width * scale);
                outCanvas.height = Math.round(canvas.height * scale);
                outCtx.imageSmoothingEnabled = true;
                outCtx.imageSmoothingQuality = 'high';
                outCtx.drawImage(canvas, 0, 0, outCanvas.width, outCanvas.height);
                const result = outCanvas.toDataURL('image/jpeg', quality);

                const b64 = result.split(',')[1] || '';
                if (b64.length * 0.75 <= MAX_BYTES || maxDim <= 1000) {
                    callback(result);
                } else {
                    maxDim -= 200;
                    quality = Math.max(0.7, quality - 0.03);
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

STEP 1 — READ CARDS CAREFULLY:
Before doing ANY analysis, carefully identify every card in the hand. Balatro cards show:
- The RANK in the top-left and bottom-right corners (2,3,4,5,6,7,8,9,10,J,Q,K,A)
- The SUIT symbol: Hearts (red ♥), Diamonds (red ♦), Clubs (black ♣), Spades (black ♠)
- Face cards (J/Q/K) have distinctive artwork — J has a young face, Q has a queen, K has a king with crown
- Cards are arranged left to right in the hand area at the bottom of the screen
- Count the cards — a standard Balatro hand has 8 cards (can vary with certain jokers/vouchers)
- Look at EACH card individually. Do not guess — zoom in mentally on each card's corner rank and suit
- Double-check: if you see what looks like a 6, make sure it's not a 9 (and vice versa). If a face looks like Q, confirm it's not K or J.

NOTE: The image has been pre-cropped to remove the empty table felt. The two halves are stitched together — don't be confused by the seam. In landscape mode (most common): left side has blind info, jokers, and consumables; right side has hand cards and action buttons. In portrait mode: top has blind/jokers, bottom has hand/buttons.

STEP 2 — READ GAME STATE:
- Blind name and chip target (left side in landscape, top in portrait)
- Current chip score so far this round
- Hands remaining and Discards remaining (near the action buttons, usually blue and red numbers)
- Money ($) amount
- Jokers in the joker slots — read each joker name carefully
- Any consumables (tarot/planet/spectral cards) in the consumable slots

STEP 3 — ANALYZE:
- Identify ALL possible poker hands from the cards
- Calculate expected scores considering joker effects and hand levels
- Consider the blind target and remaining hands/discards
- Sometimes a "worse" hand that beats the blind is better than fishing for a "better" hand
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
