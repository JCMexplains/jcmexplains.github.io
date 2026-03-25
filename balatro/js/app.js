/**
 * Balatro Analyzer App
 * Two-phase: (1) Vision reads game state → user verifies/corrects → (2) Analysis runs.
 */

const App = (() => {
    let currentImage = null;
    let parsedState = null;  // Parsed game state from vision, editable by user
    let analysisHistory = [];

    const els = {};

    function init() {
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
        els.verifyActions = document.getElementById('verify-actions');
        els.runAnalysisBtn = document.getElementById('run-analysis-btn');
        els.recommendationSection = document.getElementById('recommendation-section');
        els.recommendationDisplay = document.getElementById('recommendation-display');
        els.historySection = document.getElementById('history-section');
        els.historyDisplay = document.getElementById('history-display');
        els.cardEditModal = document.getElementById('card-edit-modal');
        els.modalSave = document.getElementById('modal-save');
        els.modalCancel = document.getElementById('modal-cancel');

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

        try {
            analysisHistory = JSON.parse(localStorage.getItem('balatro_history') || '[]');
            if (analysisHistory.length > 0) renderHistory();
        } catch (e) { analysisHistory = []; }

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
        els.analyzeBtn.addEventListener('click', parseScreenshot);
        els.clearBtn.addEventListener('click', clearImage);
        els.runAnalysisBtn.addEventListener('click', runAnalysis);
        els.modalCancel.addEventListener('click', closeCardModal);
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

    function handleDragOver(e) { e.preventDefault(); els.dropZone.classList.add('drag-over'); }
    function handleDragLeave(e) { e.preventDefault(); els.dropZone.classList.remove('drag-over'); }

    function handleDrop(e) {
        e.preventDefault();
        els.dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) loadImage(file);
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
     * Simple compression — no cropping. Just scale down if over 5MB.
     */
    function compressImage(dataUrl, callback) {
        const MAX_BYTES = 4.5 * 1024 * 1024;
        const img = new Image();
        img.onload = () => {
            // Check if already small enough
            const base64Part = dataUrl.split(',')[1] || '';
            if (base64Part.length * 0.75 <= MAX_BYTES) {
                callback(dataUrl);
                return;
            }

            const { width, height } = img;
            let maxDim = 2400;
            let quality = 0.88;

            function tryCompress() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const scale = Math.min(1, maxDim / Math.max(width, height));
                canvas.width = Math.round(width * scale);
                canvas.height = Math.round(height * scale);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const result = canvas.toDataURL('image/jpeg', quality);

                const b64 = result.split(',')[1] || '';
                if (b64.length * 0.75 <= MAX_BYTES || maxDim <= 1000) {
                    callback(result);
                } else {
                    maxDim -= 200;
                    quality = Math.max(0.65, quality - 0.04);
                    tryCompress();
                }
            }
            tryCompress();
        };
        img.src = dataUrl;
    }

    function clearImage() {
        currentImage = null;
        parsedState = null;
        els.previewImage.src = '';
        els.previewImage.classList.add('hidden');
        els.dropZoneContent.classList.remove('hidden');
        els.uploadActions.classList.add('hidden');
        els.fileInput.value = '';
        els.gameStateSection.classList.add('hidden');
        els.recommendationSection.classList.add('hidden');
        els.verifyActions.classList.add('hidden');
    }

    // --- Phase 1: Parse screenshot ---

    async function parseScreenshot() {
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

        showLoading('Reading your cards...');
        els.analyzeBtn.disabled = true;

        try {
            const result = await callParseAPI(apiKey, currentImage);
            if (result.parseError) {
                hideLoading();
                els.recommendationSection.classList.remove('hidden');
                els.recommendationDisplay.innerHTML = `
                    <div class="raw-analysis">
                        <p>${escapeHtml(result.raw || 'Could not parse the screenshot.')}</p>
                    </div>`;
                return;
            }
            parsedState = result;
            hideLoading();
            displayVerification(parsedState);
        } catch (err) {
            hideLoading();
            showToast('Error: ' + err.message);
        } finally {
            els.analyzeBtn.disabled = false;
        }
    }

    async function callParseAPI(apiKey, imageDataUrl) {
        const model = els.modelSelect.value;
        const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) throw new Error('Invalid image data');

        const systemPrompt = `You are a Balatro screenshot reader. Your ONLY job is to accurately read the game state from the screenshot. Do NOT analyze or recommend plays.

READING CARDS — BE EXTREMELY CAREFUL:
- Balatro is played in LANDSCAPE mode on mobile
- Cards are in the hand area (bottom center of screen)
- Each card shows its RANK in the top-left corner and bottom-right corner: 2,3,4,5,6,7,8,9,10,J,Q,K,A
- Each card shows its SUIT: Hearts (red ♥), Diamonds (red ♦), Clubs (black ♣), Spades (black ♠)
- Face cards have distinctive art: Jack (young face, no crown), Queen (feminine face, small crown), King (bearded face, large crown)
- COMMON MISTAKES TO AVOID:
  * Q vs K — Queens have a smaller/no crown and feminine features. Kings have beards and large crowns.
  * 6 vs 9 — Check orientation carefully
  * J vs Q — Jacks are younger looking, no crown at all
  * 10 vs other numbers — 10 has two digits
- Count every card. A standard hand is 8 cards but can vary.
- Read left to right, one card at a time.

READING JOKERS:
- Joker slots are typically in the top-left area in landscape
- Read the NAME text on each joker card carefully
- Note any edition glow (foil=rainbow shimmer, holographic=rainbow stripes, polychrome=rainbow swirl)

READING GAME INFO:
- Blind name and target score (usually top-center or top-left)
- Score so far this round
- Hands remaining (blue number) and Discards remaining (red number)
- Money amount ($)
- Ante and round number if visible

Respond with ONLY valid JSON:
{
  "gameState": {
    "blind": { "name": "Small Blind", "target": 300, "current": 0 },
    "handsLeft": 4,
    "discardsLeft": 3,
    "money": 5,
    "ante": 1,
    "round": 1,
    "handCards": [
      { "rank": "A", "suit": "Spades", "enhancement": null, "edition": null, "seal": null }
    ],
    "jokers": [
      { "name": "Joker Name", "edition": null, "description": "short effect" }
    ],
    "consumables": [],
    "deckRemaining": null
  },
  "confidence": {
    "cards": "high/medium/low",
    "uncertainCards": [0],
    "notes": "any cards I'm unsure about"
  }
}

Use standard rank values: 2,3,4,5,6,7,8,9,10,J,Q,K,A
Use full suit names: Hearts, Diamonds, Clubs, Spades
If unsure about a card, include your best guess but list its index (0-based) in uncertainCards.`;

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
                max_tokens: 2048,
                system: systemPrompt,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } },
                        { type: 'text', text: 'Read every card and game element in this Balatro screenshot. Return JSON only.' }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            if (response.status === 401) throw new Error('Invalid API key.');
            throw new Error(`API error (${response.status}): ${errorBody}`);
        }

        const data = await response.json();
        const text = data.content[0]?.text || '';
        let jsonStr = text;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];

        try {
            return JSON.parse(jsonStr.trim());
        } catch (e) {
            return { parseError: true, raw: text };
        }
    }

    // --- Verification UI ---

    function displayVerification(result) {
        const state = result.gameState;
        if (!state) return;

        els.gameStateSection.classList.remove('hidden');
        els.recommendationSection.classList.add('hidden');

        const uncertainSet = new Set(result.confidence?.uncertainCards || []);

        let html = '<div class="state-grid">';
        if (state.blind) {
            const progress = state.blind.target > 0
                ? Math.min(100, (state.blind.current / state.blind.target) * 100) : 0;
            html += `
                <div class="state-item blind-info">
                    <span class="state-label">Blind</span>
                    <span class="state-value">${escapeHtml(state.blind.name || 'Unknown')}</span>
                    <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
                    <span class="state-detail">${BalatroAnalyzer.formatNumber(state.blind.current || 0)} / ${BalatroAnalyzer.formatNumber(state.blind.target || 0)}</span>
                </div>`;
        }
        html += `
            <div class="state-item"><span class="state-label">Hands</span><span class="state-value big">${state.handsLeft ?? '?'}</span></div>
            <div class="state-item"><span class="state-label">Discards</span><span class="state-value big">${state.discardsLeft ?? '?'}</span></div>
            <div class="state-item"><span class="state-label">Money</span><span class="state-value big">$${state.money ?? '?'}</span></div>
        </div>`;

        // Editable hand cards
        if (state.handCards?.length > 0) {
            html += '<div class="hand-cards"><h3>Your Hand <span class="edit-hint">(tap to fix)</span></h3><div class="cards-row">';
            state.handCards.forEach((card, i) => {
                const f = BalatroAnalyzer.formatCard(card);
                const uncertain = uncertainSet.has(i) ? ' uncertain' : '';
                html += `
                    <div class="card-display editable${uncertain}" style="border-color:${f.color}" data-card-index="${i}" onclick="App.editCard(${i})">
                        <span class="card-rank" style="color:${f.color}">${escapeHtml(f.text)}</span>
                    </div>`;
            });
            html += '</div></div>';
        }

        // Jokers
        if (state.jokers?.length > 0) {
            html += '<div class="jokers-display"><h3>Jokers</h3><div class="joker-row">';
            for (const joker of state.jokers) {
                html += `<div class="joker-card"><span class="joker-name">${escapeHtml(joker.name || 'Unknown')}</span></div>`;
            }
            html += '</div></div>';
        }

        // Confidence note
        if (result.confidence?.notes) {
            html += `<div class="confidence-note"><p>${escapeHtml(result.confidence.notes)}</p></div>`;
        }

        els.gameStateDisplay.innerHTML = html;
        els.verifyActions.classList.remove('hidden');
        els.gameStateSection.scrollIntoView({ behavior: 'smooth' });
    }

    // --- Card editing ---

    let editingCardIndex = null;
    let editRank = null;
    let editSuit = null;

    function editCard(index) {
        const card = parsedState?.gameState?.handCards?.[index];
        if (!card) return;
        editingCardIndex = index;
        editRank = card.rank;
        editSuit = card.suit;

        // Highlight current selections
        updateModalSelection();
        els.cardEditModal.classList.remove('hidden');

        // Set up rank buttons
        els.cardEditModal.querySelectorAll('[data-rank]').forEach(btn => {
            btn.onclick = () => {
                editRank = btn.dataset.rank;
                updateModalSelection();
            };
        });

        // Set up suit buttons
        els.cardEditModal.querySelectorAll('[data-suit]').forEach(btn => {
            btn.onclick = () => {
                editSuit = btn.dataset.suit;
                updateModalSelection();
            };
        });

        // Save button
        els.modalSave.onclick = () => {
            parsedState.gameState.handCards[editingCardIndex].rank = editRank;
            parsedState.gameState.handCards[editingCardIndex].suit = editSuit;
            closeCardModal();
            displayVerification(parsedState);
        };
    }

    function updateModalSelection() {
        els.cardEditModal.querySelectorAll('[data-rank]').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.rank === editRank);
        });
        els.cardEditModal.querySelectorAll('[data-suit]').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.suit === editSuit);
        });
    }

    function closeCardModal() {
        els.cardEditModal.classList.add('hidden');
        editingCardIndex = null;
    }

    // --- Phase 2: Run analysis on verified state ---

    async function runAnalysis() {
        if (!parsedState?.gameState) {
            showToast('No game state to analyze');
            return;
        }
        const apiKey = getApiKey();
        if (!apiKey) {
            showToast('Please enter your API key');
            return;
        }

        showLoading('Calculating optimal play...');
        els.runAnalysisBtn.disabled = true;

        try {
            const analysis = await callAnalyzeAPI(apiKey, parsedState.gameState);
            hideLoading();
            displayAnalysis(analysis, parsedState.gameState);
            saveToHistory(analysis);
        } catch (err) {
            hideLoading();
            showToast('Error: ' + err.message);
        } finally {
            els.runAnalysisBtn.disabled = false;
        }
    }

    async function callAnalyzeAPI(apiKey, gameState) {
        const model = els.modelSelect.value;

        // Also run local analysis
        const localPlays = BalatroAnalyzer.findAllPlays(
            gameState.handCards || [],
            gameState.handLevels || {},
            gameState.jokers || []
        );
        const topPlays = localPlays.slice(0, 10).map(p => ({
            cards: p.cards.map(c => c.rank + c.suit[0]),
            handType: p.handType,
            localScore: p.totalScore
        }));

        const prompt = `You are a Balatro strategy expert. Analyze this VERIFIED game state and recommend the optimal play.

GAME STATE (verified by player):
${JSON.stringify(gameState, null, 2)}

LOCAL HAND EVALUATION (top plays by base score, may not account for all joker effects):
${JSON.stringify(topPlays, null, 2)}

Consider:
1. All joker effects and their interactions (order matters for some jokers)
2. The blind target vs remaining hands — can we beat it? Do we need to be aggressive?
3. Whether to discard first (if discards remain) to fish for a better hand
4. Card enhancements, editions, and seals
5. Overall strategic position (ante, money, etc.)

Respond with ONLY valid JSON:
{
  "bestPlay": {
    "cards": ["QS", "QH", "QD", "QC"],
    "handType": "Four of a Kind",
    "estimatedScore": 1500,
    "beatsBlind": true
  },
  "alternativePlays": [
    { "cards": ["QS", "QH"], "handType": "Pair", "estimatedScore": 50, "beatsBlind": false, "note": "reason" }
  ],
  "discardAdvice": {
    "shouldDiscard": false,
    "cardsToDiscard": [],
    "reasoning": "explanation"
  },
  "reasoning": "Detailed explanation of the optimal play and why...",
  "strategyNotes": "Broader strategic considerations..."
}`;

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
                max_tokens: 2048,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API error (${response.status}): ${errorBody}`);
        }

        const data = await response.json();
        const text = data.content[0]?.text || '';
        let jsonStr = text;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];

        try {
            return JSON.parse(jsonStr.trim());
        } catch (e) {
            return { reasoning: text, parseError: true };
        }
    }

    // --- Display analysis results ---

    function displayAnalysis(analysis, gameState) {
        els.recommendationSection.classList.remove('hidden');

        if (analysis.parseError) {
            els.recommendationDisplay.innerHTML = `
                <div class="raw-analysis"><p>${escapeHtml(analysis.reasoning || '')}</p></div>`;
            return;
        }

        // Also show local hand rankings
        const localPlays = BalatroAnalyzer.findAllPlays(
            gameState.handCards || [], gameState.handLevels || {}, gameState.jokers || []
        );

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
        if (analysis.discardAdvice?.shouldDiscard) {
            html += `
                <div class="discard-advice">
                    <div class="play-header"><span class="play-label discard">DISCARD INSTEAD</span></div>
                    <div class="play-cards">
                        ${(analysis.discardAdvice.cardsToDiscard || []).map(c =>
                            `<span class="card-chip-big discard">${escapeHtml(c)}</span>`).join(' ')}
                    </div>
                    <p class="advice-reason">${escapeHtml(analysis.discardAdvice.reasoning || '')}</p>
                </div>`;
        }

        // Alternatives
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

        // Local hand rankings
        if (localPlays.length > 0) {
            const top5 = localPlays.slice(0, 5);
            html += '<div class="local-analysis"><h3>All Possible Hands (by score)</h3>';
            html += top5.map((play, i) => {
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
            html += '</div>';
        }

        // Reasoning
        if (analysis.reasoning) {
            html += `<div class="reasoning"><h3>Why?</h3><p>${escapeHtml(analysis.reasoning)}</p></div>`;
        }
        if (analysis.strategyNotes) {
            html += `<div class="strategy-notes"><h3>Strategy</h3><p>${escapeHtml(analysis.strategyNotes)}</p></div>`;
        }

        els.recommendationDisplay.innerHTML = html;
        els.recommendationSection.scrollIntoView({ behavior: 'smooth' });
    }

    // --- History ---

    function saveToHistory(result) {
        const entry = {
            timestamp: Date.now(),
            handType: result.bestPlay?.handType,
            score: result.bestPlay?.estimatedScore
        };
        analysisHistory.unshift(entry);
        if (analysisHistory.length > 20) analysisHistory = analysisHistory.slice(0, 20);
        localStorage.setItem('balatro_history', JSON.stringify(analysisHistory));
        renderHistory();
    }

    function renderHistory() {
        if (analysisHistory.length === 0) { els.historySection.classList.add('hidden'); return; }
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
        els.recommendationSection.classList.add('hidden');
    }

    function hideLoading() { els.loadingSection.classList.add('hidden'); }

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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init, editCard };
})();
