// ================= VARIABLES GLOBALES =================
let predictionHistory = JSON.parse(localStorage.getItem('predictionHistory')) || [];
let isHistoryVisible = true;
let pendingVerification = [];

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
    // Attendre que Firebase soit initialisé
    setTimeout(() => {
        if (window.isLicenseValid) {
            initPredictorInterface();
        }
    }, 1000);
});

// Fonction d'initialisation de l'interface du prédicteur
window.initPredictorInterface = function() {
    updatePredictionHistory();
    updateStatistics();
    analyzeHistoricalData();
};

// ================= FONCTIONS DE PRÉDICTION =================

// Fonction pour appliquer la marge selon les règles
function applyMargin(prediction) {
    const rawPrediction = parseFloat(prediction);
    let margin = 0;
    let finalPrediction = 0;
    
    // Appliquer les règles de marge
    if (rawPrediction < 2.00) {
        margin = 0.15; // 15%
        finalPrediction = rawPrediction * (1 - margin);
    } else if (rawPrediction < 3.00) {
        margin = 0.25; // 25%
        finalPrediction = rawPrediction * (1 - margin);
    } else {
        margin = 0.35; // 35%
        finalPrediction = rawPrediction * (1 - margin);
    }
    
    // Arrondir à 2 décimales
    finalPrediction = parseFloat(finalPrediction.toFixed(2));
    
    return {
        rawPrediction: rawPrediction.toFixed(2),
        finalPrediction: finalPrediction.toFixed(2),
        marginPercentage: (margin * 100).toFixed(0),
        marginAmount: (rawPrediction - finalPrediction).toFixed(2)
    };
}

// Fonction de régression linéaire
function linearRegression(x, y) {
    const n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumXX += x[i] * x[i];
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
}

// Fonction d'analyse avancée des motifs
function analyzePatternStrength(data) {
    if (data.length < 3) return { pattern: 'neutral', strength: 0 };
    
    const lastThree = data.slice(-3);
    const diff1 = lastThree[1] - lastThree[0];
    const diff2 = lastThree[2] - lastThree[1];
    
    // Calcul de la force du motif
    const strength = Math.min(1, Math.abs(diff1 + diff2) / 0.3);
    
    if (diff1 > 0 && diff2 > 0) {
        return { pattern: 'bullish', strength };
    } else if (diff1 < 0 && diff2 < 0) {
        return { pattern: 'bearish', strength };
    } else {
        return { pattern: 'neutral', strength };
    }
}

// Fonction de calcul de prédiction principale
function calculatePrediction(oddsArray, betAmount, settings) {
    let processedOddsArray = [...oddsArray];
    
    if (settings.excludeExtremes) {
        processedOddsArray.sort((a, b) => a - b);
        processedOddsArray = processedOddsArray.slice(1, -1);
    }

    // Calculer la moyenne mobile exponentielle (EMA)
    const calculateEMA = (data, smoothing = 0.2) => {
        let ema = [data[0]];
        for (let i = 1; i < data.length; i++) {
            ema.push(data[i] * smoothing + ema[i-1] * (1 - smoothing));
        }
        return ema;
    };

    // Calculer la volatilité
    const calculateVolatility = (data) => {
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const deviations = data.map(val => Math.pow(val - mean, 2));
        const variance = deviations.reduce((a, b) => a + b, 0) / data.length;
        return Math.sqrt(variance);
    };

    // Calculer la tendance
    const calculateTrend = (data) => {
        if (data.length < 2) return 'stable';
        const last = data[data.length - 1];
        const prev = data[data.length - 2];
        return last > prev ? 'up' : last < prev ? 'down' : 'stable';
    };

    // Détecter les motifs dans les données
    const detectPattern = (data) => {
        if (data.length < 3) return 'neutral';
        
        const lastThree = data.slice(-3);
        // Détecter un motif ascendant
        if (lastThree[0] < lastThree[1] && lastThree[1] < lastThree[2]) {
            return 'bullish';
        }
        // Détecter un motif descendant
        if (lastThree[0] > lastThree[1] && lastThree[1] > lastThree[2]) {
            return 'bearish';
        }
        return 'neutral';
    };

    // Calculs statistiques avancés
    const mean = processedOddsArray.reduce((a, b) => a + b, 0) / processedOddsArray.length;
    const volatility = calculateVolatility(processedOddsArray);
    const ema = calculateEMA(processedOddsArray);
    const emaValue = ema[ema.length - 1];
    const trend = calculateTrend(processedOddsArray);
    let pattern = detectPattern(processedOddsArray);

    // Facteur de confiance basé sur la volatilité
    const confidenceFactor = Math.max(0.1, 1 - (volatility * 2));
    const confidencePercentage = Math.round(confidenceFactor * 100);

    // Calcul de la prédiction brute avec pondération
    let rawPrediction;
    switch(settings.analysisMode) {
        case 'advanced':
            const weights = processedOddsArray.map((_, i) => 1 + (i * 0.1));
            const weightedSum = processedOddsArray.reduce((acc, curr, i) => acc + (curr * weights[i]), 0);
            const weightSum = weights.reduce((acc, curr) => acc + curr, 0);
            rawPrediction = weightedSum / weightSum;
            break;
        case 'pro':
            // Pondération: 60% EMA, 30% moyenne, 10% dernier coefficient
            rawPrediction = (emaValue * 0.6) + (mean * 0.3) + (processedOddsArray[processedOddsArray.length - 1] * 0.1);
            // Ajustement basé sur la tendance
            if (trend === 'up') rawPrediction *= 1.05;
            if (trend === 'down') rawPrediction *= 0.97;
            break;
        default:
            rawPrediction = mean;
    }

    // Ajustement final basé sur la confiance
    rawPrediction = rawPrediction * (1 + (confidenceFactor * 0.1));

    // Appliquer la marge selon les règles
    const marginResult = applyMargin(rawPrediction);
    
    const probabilities = processedOddsArray.map(odd => (1 / odd * 100).toFixed(2));

    // Analyse avancée des rounds
    const lastFive = processedOddsArray.slice(-5);
    const n = lastFive.length;
    
    let slope = 0;
    let volatilityForRegression = 0;
    let patternStrength = 0;
    
    if (n >= 2) {
        // Calcul de la pente
        const x = Array.from({length: n}, (_, i) => i+1);
        const regression = linearRegression(x, lastFive);
        slope = regression.slope;
        
        // Calcul de la volatilité spécifique
        volatilityForRegression = calculateVolatility(lastFive);
        
        // Analyse détaillée du motif
        if (n >= 3) {
            const patternAnalysis = analyzePatternStrength(lastFive);
            pattern = patternAnalysis.pattern;
            patternStrength = patternAnalysis.strength;
        }
    }

    // Scores normalisés
    const normalizedSlope = Math.min(1, Math.abs(slope) / 0.25);
    const normalizedVolatility = Math.min(1, volatilityForRegression / settings.volatilityThreshold);
    const normalizedPattern = pattern === 'bullish' ? 1 : pattern === 'bearish' ? 0 : 0.5;
    
    // Calcul du score global avec pondération
    const globalScore = (
        (normalizedSlope * 0.3) + 
        (normalizedVolatility * 0.2) + 
        (normalizedPattern * 0.1) + 
        (confidenceFactor * 0.4) +
        (patternStrength * 0.1)
    );

    return {
        id: Date.now(),
        date: new Date().toLocaleString(),
        rawOdds: marginResult.rawPrediction,
        finalOdds: marginResult.finalPrediction,
        marginPercentage: marginResult.marginPercentage,
        marginAmount: marginResult.marginAmount,
        probabilities: probabilities,
        status: 'pending',
        originalOdds: oddsArray.join(', '),
        round: null,
        analysisMode: settings.analysisMode,
        verificationStatus: 'pending',
        verifiedRound: null,
        confidence: confidencePercentage,
        trend: trend,
        pattern: pattern,
        volatility: volatility.toFixed(3),
        globalScore: globalScore.toFixed(3),
        betAmount: betAmount || 0,
        potentialWin: betAmount ? (betAmount * parseFloat(marginResult.finalPrediction)).toFixed(2) : 0
    };
}

// ================= FONCTIONS PRINCIPALES =================

// Fonction de prédiction manuelle
window.predictManualOdds = function() {
    // Vérifier la licence d'abord
    if (!window.isLicenseValid) {
        Swal.fire({
            icon: 'error',
            title: 'Licence requise',
            text: 'Vous devez avoir une licence active pour utiliser le prédicteur',
            confirmButtonText: 'Acheter une licence',
            showCancelButton: true,
            cancelButtonText: 'Annuler',
            confirmButtonColor: '#1e3a8a',
            cancelButtonColor: '#f59e0b'
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = 'accueil.html';
            }
        });
        return;
    }
    
    const settings = JSON.parse(localStorage.getItem('predictionSettings')) || {
        analysisMode: 'pro',
        excludeExtremes: true,
        trendAnalysis: false,
        volatilityThreshold: 0.15
    };

    const oddsInput = document.getElementById('manualOddsInput').value;
    const betAmount = parseFloat(document.getElementById('manualBetAmount').value) || 0;
    
    let oddsArray = oddsInput.split(',')
        .map(odd => parseFloat(odd.trim()))
        .filter(odd => !isNaN(odd) && odd > 1);

    if (oddsArray.length < 5) {
        Swal.fire({
            icon: 'error',
            title: 'Données Insuffisantes',
            text: 'Veuillez entrer au moins 5 côtes valides',
            confirmButtonColor: '#1e3a8a'
        });
        return;
    }

    // Exécuter la prédiction
    const predictionResult = calculatePrediction(oddsArray, betAmount, settings);
    
    // Ajouter des informations spécifiques à la prédiction manuelle
    predictionResult.type = 'manuelle';
    predictionResult.source = 'manual-input';
    
    // Ajouter à la vérification automatique
    pendingVerification.push({
        id: predictionResult.id,
        predictedOdds: parseFloat(predictionResult.finalOdds),
        currentRound: 1
    });

    // Ajouter à l'historique
    predictionHistory.unshift(predictionResult);
    localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory));

    updatePredictionDisplay(predictionResult);
    updatePredictionHistory();
    updateStatistics();
    analyzeHistoricalData();

    // Réinitialiser les champs
    document.getElementById('manualOddsInput').value = '';
    document.getElementById('manualBetAmount').value = '';

    // Notification pour les 3 rounds
    Swal.fire({
        icon: 'success',
        title: 'Prédiction Générée!',
        html: `
            <div class="text-left">
                <p><strong>Prédiction brute:</strong> ${predictionResult.rawOdds}</p>
                <p><strong>Prédiction finale (avec marge ${predictionResult.marginPercentage}%):</strong> ${predictionResult.finalOdds}</p>
                <p class="text-sm text-gray-600">Probabilité: ${predictionResult.probabilities[0]}%</p>
                <p class="text-sm text-gray-600">Mode: ${settings.analysisMode}</p>
                <div class="mt-2 p-2 bg-blue-50 rounded-lg border border-yellow-200">
                    <p class="font-semibold text-blue-700">📢 La prédiction finale de ${predictionResult.finalOdds} devrait apparaître dans l'un des 3 rounds suivants</p>
                </div>
            </div>
        `,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 4000,
        background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
        color: 'white'
    });
};

// Vérification des prédictions en attente (3 rounds seulement)
window.verifyPendingPredictions = function(newCoefficient) {
    const updatedPending = [];
    
    for (const pending of pendingVerification) {
        // Vérifier si le nouveau coefficient valide la prédiction
        if (newCoefficient >= pending.predictedOdds) {
            // Succès - mettre à jour la prédiction
            const predictionIndex = predictionHistory.findIndex(p => p.id === pending.id);
            if (predictionIndex !== -1) {
                predictionHistory[predictionIndex].verificationStatus = 'success';
                predictionHistory[predictionIndex].verifiedRound = pending.currentRound;
                predictionHistory[predictionIndex].status = 'success';
                predictionHistory[predictionIndex].round = pending.currentRound;
                localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory));
                updatePredictionHistory();
                updateStatistics();
                
                // Afficher notification
                Swal.fire({
                    icon: 'success',
                    title: 'Prédiction validée!',
                    html: `La prédiction ${pending.predictedOdds} a été validée au Round ${pending.currentRound}`,
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000,
                    background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                    color: 'white'
                });
            }
        } else {
            // Incrémenter le round
            pending.currentRound++;
            
            // Vérifier si on a dépassé le nombre de rounds à vérifier (3 rounds max)
            if (pending.currentRound <= 3) {
                updatedPending.push(pending);
                
                // Mettre à jour l'historique
                updatePredictionHistory();
            } else {
                // Échec après 3 rounds
                const predictionIndex = predictionHistory.findIndex(p => p.id === pending.id);
                if (predictionIndex !== -1) {
                    predictionHistory[predictionIndex].verificationStatus = 'failed';
                    predictionHistory[predictionIndex].status = 'failed';
                    
                    localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory));
                    updatePredictionHistory();
                    updateStatistics();
                    
                    Swal.fire({
                        icon: 'error',
                        title: 'Prédiction échouée',
                        html: `La prédiction ${pending.predictedOdds} n'a pas été validée dans les 3 rounds`,
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 3000
                    });
                }
            }
        }
    }
    
    pendingVerification = updatedPending;
};

function updatePredictionDisplay(prediction) {
    let roundHTML = '';
    
    // Déterminer l'indicateur de tendance
    let trendIndicator = '';
    if (prediction.trend === 'up') {
        trendIndicator = '<span class="trend-indicator trend-up"><i class="fas fa-arrow-up mr-1"></i> Hausse</span>';
    } else if (prediction.trend === 'down') {
        trendIndicator = '<span class="trend-indicator trend-down"><i class="fas fa-arrow-down mr-1"></i> Baisse</span>';
    } else {
        trendIndicator = '<span class="trend-indicator trend-stable"><i class="fas fa-arrows-alt-h mr-1"></i> Stable</span>';
    }
    
    // Déterminer le motif détecté
    let patternIndicator = '';
    if (prediction.pattern === 'bullish') {
        patternIndicator = '<span class="pattern-indicator pattern-bullish">Tendance haussière</span>';
    } else if (prediction.pattern === 'bearish') {
        patternIndicator = '<span class="pattern-indicator pattern-bearish">Tendance baissière</span>';
    } else {
        patternIndicator = '<span class="pattern-indicator pattern-neutral">Pas de tendance claire</span>';
    }
    
    // Notification pour les 3 rounds
    roundHTML = `
        <div class="round-notification">
            <i class="fas fa-info-circle mr-2"></i>
            La prédiction finale de <strong>${prediction.finalOdds}</strong> devrait apparaître dans l'un des 3 rounds suivants (1, 2 ou 3)
        </div>
    `;
    
    // Information sur la marge appliquée
    const marginInfo = `
        <div class="margin-info">
            <i class="fas fa-percentage mr-2"></i>
            Marge de ${prediction.marginPercentage}% appliquée : ${prediction.rawOdds} → ${prediction.finalOdds} (retrait de ${prediction.marginAmount})
        </div>
    `;
    
    // Statut de vérification
    let verificationStatus = '';
    if (prediction.verificationStatus === 'pending') {
        const pendingInfo = pendingVerification.find(p => p.id === prediction.id);
        const currentRound = pendingInfo ? pendingInfo.currentRound : 1;
        
        verificationStatus = `
            <div class="validation-container">
                <div class="validation-status validation-pending">
                    <i class="fas fa-sync-alt fa-spin mr-2"></i>
                    Vérification en cours - Round ${currentRound}/3
                </div>
                <p class="text-xs text-center mt-2 text-gray-600">
                    Le système vérifie automatiquement cette prédiction sur les 3 prochains rounds
                </p>
            </div>
        `;
    } else if (prediction.verificationStatus === 'success') {
        verificationStatus = `
            <div class="validation-container">
                <div class="validation-status validation-success">
                    <i class="fas fa-check-circle mr-2"></i>
                    ✅ Validé au Round ${prediction.verifiedRound}
                </div>
                <p class="text-xs text-center mt-2 text-green-600 font-medium">
                    Cette prédiction a été validée avec succès!
                </p>
            </div>
        `;
    } else if (prediction.verificationStatus === 'failed') {
        verificationStatus = `
            <div class="validation-container">
                <div class="validation-status validation-failed">
                    <i class="fas fa-times-circle mr-2"></i>
                    ❌ Échoué après 3 rounds
                </div>
                <p class="text-xs text-center mt-2 text-red-600 font-medium">
                    Cette prédiction n'a pas été validée dans les 3 rounds
                </p>
            </div>
        `;
    }
    
    let potentialWinHTML = '';
    if (prediction.betAmount > 0) {
        potentialWinHTML = `
            <div class="mt-4 text-center">
                <span class="text-sm text-gray-600 block mb-1">Gain Potentiel</span>
                <p class="text-2xl font-bold text-yellow-600">${prediction.potentialWin} €</p>
                <p class="text-xs text-gray-500 mt-1">Pour une mise de ${prediction.betAmount} €</p>
            </div>
        `;
    }
    
    document.getElementById('result').innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span class="text-xs text-gray-600 block mb-1">Prédiction Brute</span>
                <p class="text-xl font-bold text-blue-700">${prediction.rawOdds}</p>
            </div>
            
            <div class="text-center p-3 bg-gradient-to-r from-blue-100 to-yellow-50 rounded-lg border border-yellow-300">
                <span class="text-xs text-gray-600 block mb-1">Prédiction Finale</span>
                <p class="text-2xl font-bold text-blue-800">${prediction.finalOdds}</p>
            </div>
            
            <div class="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span class="text-xs text-gray-600 block mb-1">Probabilité de Réussite</span>
                <p class="text-xl font-bold text-yellow-600">${prediction.probabilities[0]}%</p>
            </div>
        </div>
        
        ${marginInfo}
        ${roundHTML}
        
        <div class="mt-4">
            <div class="flex justify-between mb-1">
                <span class="text-sm font-medium text-gray-700">Score de prédiction</span>
                <span class="text-sm font-bold text-blue-700">${prediction.globalScore}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="bg-gradient-to-r from-blue-600 to-yellow-500 h-2 rounded-full" style="width: ${prediction.globalScore * 100}%"></div>
            </div>
        </div>
        
        <div class="mt-3">
            <div class="flex justify-between mb-1">
                <span class="text-sm font-medium text-gray-700">Niveau de confiance</span>
                <span class="text-sm font-medium text-gray-700">${prediction.confidence}%</span>
            </div>
            <div class="confidence-level w-full rounded-full h-2 bg-gray-200">
                <div class="confidence-fill h-2 rounded-full" style="width: ${prediction.confidence}%"></div>
            </div>
        </div>
        
        <div class="mt-3 flex justify-between items-center flex-wrap">
            <div class="mb-1">
                <span class="text-xs text-gray-700">Tendance: </span>
                ${trendIndicator}
            </div>
            <div>
                ${patternIndicator}
            </div>
        </div>
        
        <div class="mt-2 text-xs text-gray-600">
            <i class="fas fa-chart-bar mr-1"></i>Volatilité: ${prediction.volatility}
        </div>
        
        ${verificationStatus}
        ${potentialWinHTML}
    `;
}

function updatePredictionHistory() {
    const historyContainer = document.getElementById('predictionHistory');
    
    if (predictionHistory.length === 0) {
        historyContainer.innerHTML = `
            <div class="text-center text-gray-500 p-4">
                <i class="fas fa-chart-line text-2xl text-gray-400 mb-2"></i>
                <p>Aucune donnée disponible</p>
                <p class="text-xs mt-1">L'historique s'affichera ici après vos premières prédictions</p>
            </div>
        `;
        return;
    }
    
    historyContainer.innerHTML = predictionHistory.map((prediction, index) => {
        const isPendingVerification = pendingVerification.some(p => p.id === prediction.id);
        const pendingInfo = pendingVerification.find(p => p.id === prediction.id);
        
        // Ajouter une classe pour les nouvelles prédictions
        const isNew = index === 0 ? 'new-prediction' : '';
        
        return `
        <div class="history-item bg-white border border-gray-200 p-3 rounded-lg ${isNew}">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-semibold text-gray-800 text-sm">${prediction.date}</p>
                            <p class="text-xs text-gray-600">
                                Prédiction: 
                                <span class="font-bold text-blue-700">${prediction.finalOdds}</span> 
                                <span class="text-gray-500 text-xs">(Brute: ${prediction.rawOdds})</span>
                                <span class="ml-1 text-xs">(${prediction.probabilities[0]}%)</span>
                            </p>
                            <p class="text-xs text-gray-500">${prediction.type === 'automatique' ? '⚡ Auto' : '✍️ Manuel'}</p>
                            <p class="text-xs text-yellow-600 font-medium">
                                <i class="fas fa-percentage mr-1"></i>Marge: ${prediction.marginPercentage}%
                            </p>
                        </div>
                        <div>
                            ${prediction.status === 'pending' ? `
                                <span class="status-badge status-pending text-xs">En attente</span>
                            ` : prediction.status === 'success' ? `
                                <span class="status-badge status-success text-xs">Validée</span>
                            ` : `
                                <span class="status-badge status-failed text-xs">Échouée</span>
                            `}
                        </div>
                    </div>
                    
                    <div class="mt-1 text-xs">
                        <span class="text-gray-600">Confiance: </span>
                        <span class="font-semibold">${prediction.confidence}%</span>
                    </div>
                    
                    <!-- Boutons de validation pour les prédictions manuelles -->
                    ${prediction.type === 'manuelle' && prediction.status === 'pending' ? `
                        <div class="mt-2 flex gap-2">
                            <button 
                                onclick="updatePredictionStatus('${prediction.id}', 'success')" 
                                class="px-2 py-1 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition"
                            >
                                ✓ Validé
                            </button>
                            <button 
                                onclick="updatePredictionStatus('${prediction.id}', 'failed')" 
                                class="px-2 py-1 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 transition"
                            >
                                ✕ Échoué
                            </button>
                        </div>
                    ` : ''}
                    
                    <!-- Statut de vérification pour les prédictions automatiques -->
                    ${isPendingVerification ? `
                        <div class="mt-2 text-xs bg-orange-50 text-orange-800 p-1.5 rounded border border-orange-300">
                            <i class="fas fa-sync-alt fa-spin mr-1"></i>
                            Vérification en cours: 
                            <span class="font-bold">Round ${pendingInfo.currentRound}/3</span>
                        </div>
                    ` : ''}
                    
                    ${prediction.verificationStatus === 'success' ? `
                        <div class="mt-2 text-xs bg-green-50 text-green-800 p-1.5 rounded border border-green-300">
                            <i class="fas fa-check-circle mr-1"></i>
                            Validé au Round ${prediction.verifiedRound}
                        </div>
                    ` : ''}
                    
                    ${prediction.verificationStatus === 'failed' ? `
                        <div class="mt-2 text-xs bg-red-50 text-red-800 p-1.5 rounded border border-red-300">
                            <i class="fas fa-times-circle mr-1"></i>
                            Échoué après 3 rounds
                        </div>
                    ` : ''}
                    
                    ${prediction.betAmount > 0 ? `
                        <div class="mt-2 text-xs bg-blue-50 text-blue-800 p-1.5 rounded border border-blue-300">
                            <i class="fas fa-coins mr-1"></i>
                            Mise: ${prediction.betAmount} € | Gain: ${prediction.potentialWin} €
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

window.updatePredictionStatus = function(predictionId, newStatus) {
    const predictionIndex = predictionHistory.findIndex(p => p.id.toString() === predictionId);
    
    if (predictionIndex !== -1) {
        const prediction = predictionHistory[predictionIndex];
        
        if (newStatus === 'success') {
            Swal.fire({
                title: 'Validation de la Prédiction',
                html: `
                    <div class="mb-4">
                        <p class="text-sm mb-3">Prédiction finale: ${prediction.finalOdds} (Brute: ${prediction.rawOdds})</p>
                        <p class="text-sm mb-3">Probabilité initiale: ${prediction.probabilities[0]}%</p>
                        <label class="block text-gray-700 mb-2">À quel round la prédiction a-t-elle été validée? (1-3)</label>
                        <select id="roundSelect" class="w-full p-2 border rounded">
                            ${[1,2,3].map(num => 
                                `<option value="${num}">Round ${num}</option>`
                            ).join('')}
                        </select>
                    </div>
                `,
                confirmButtonText: 'Confirmer',
                confirmButtonColor: '#1e3a8a',
                showCancelButton: true,
                cancelButtonText: 'Annuler',
                cancelButtonColor: '#f59e0b',
                allowOutsideClick: false
            }).then((result) => {
                if (result.isConfirmed) {
                    const selectedRound = document.getElementById('roundSelect').value;
                    predictionHistory[predictionIndex].status = newStatus;
                    predictionHistory[predictionIndex].round = parseInt(selectedRound);
                    
                    localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory));
                    updatePredictionHistory();
                    updateStatistics();
                    analyzeHistoricalData();

                    Swal.fire({
                        icon: 'success',
                        title: `Prédiction validée au Round ${selectedRound}`,
                        html: `Précision initiale: ${prediction.probabilities[0]}%`,
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 3000,
                        background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                        color: 'white'
                    });
                }
            });
        } else {
            predictionHistory[predictionIndex].status = newStatus;
            localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory));
            updatePredictionHistory();
            updateStatistics();
            analyzeHistoricalData();
        }
    }
};

function updateStatistics() {
    const total = predictionHistory.length;
    const success = predictionHistory.filter(p => p.status === 'success').length;
    const failed = predictionHistory.filter(p => p.status === 'failed').length;
    const pending = predictionHistory.filter(p => p.status === 'pending').length;
    
    const accuracy = total > 0 
        ? ((success / total) * 100).toFixed(1)
        : '0';

    document.getElementById('totalPredictions').textContent = total;
    document.getElementById('predictionAccuracy').textContent = accuracy + '%';
    document.getElementById('successCount').textContent = success;
    document.getElementById('failedCount').textContent = failed;
    document.getElementById('pendingCount').textContent = pending;
}

window.openAdvancedSettings = function() {
    // Vérifier la licence
    if (!window.isLicenseValid) {
        Swal.fire({
            icon: 'error',
            title: 'Licence requise',
            text: 'Vous devez avoir une licence active pour accéder aux paramètres',
            confirmButtonText: 'Acheter une licence',
            showCancelButton: true,
            cancelButtonText: 'Annuler',
            confirmButtonColor: '#1e3a8a',
            cancelButtonColor: '#f59e0b'
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = 'accueil.html';
            }
        });
        return;
    }
    
    const currentSettings = JSON.parse(localStorage.getItem('predictionSettings')) || {
        analysisMode: 'pro',
        excludeExtremes: true,
        trendAnalysis: false,
        volatilityThreshold: 0.15
    };

    Swal.fire({
        title: 'Paramètres Avancés',
        html: `
            <div class="grid grid-cols-1 gap-3 text-sm">
                <div class="text-left">
                    <label class="block text-gray-700 mb-1">Mode d'Analyse</label>
                    <select id="analysisMode" class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500">
                        <option value="standard" ${currentSettings.analysisMode === 'standard' ? 'selected' : ''}>
                            Standard (Moyenne simple)
                        </option>
                        <option value="advanced" ${currentSettings.analysisMode === 'advanced' ? 'selected' : ''}>
                            Avancé (Pondération adaptative)
                        </option>
                        <option value="pro" ${currentSettings.analysisMode === 'pro' ? 'selected' : ''}>
                            Professionnel (Analyse complète)
                        </option>
                    </select>
                </div>
                <div class="text-left">
                    <label class="block text-gray-700 mb-1">Options d'Analyse</label>
                    <div class="space-y-1">
                        <label class="flex items-center p-1.5 bg-gray-50 rounded-lg">
                            <input type="checkbox" id="excludeExtremes" class="mr-2 h-4 w-4 text-yellow-600" 
                                ${currentSettings.excludeExtremes ? 'checked' : ''}>
                            Exclure les valeurs extrêmes
                        </label>
                        <label class="flex items-center p-1.5 bg-gray-50 rounded-lg">
                            <input type="checkbox" id="trendAnalysis" class="mr-2 h-4 w-4 text-yellow-600"
                                ${currentSettings.trendAnalysis ? 'checked' : ''}>
                            Analyse tendancielle
                        </label>
                    </div>
                </div>
                <div class="text-left">
                    <label class="block text-gray-700 mb-1">Seuil de volatilité</label>
                        <input type="range" id="volatilityThreshold" min="0.05" max="0.5" step="0.01" 
                            value="${currentSettings.volatilityThreshold}" class="w-full accent-yellow-600">
                        <div class="text-center text-xs text-gray-600 mt-1" id="volatilityValue">
                            ${currentSettings.volatilityThreshold}
                        </div>
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Sauvegarder',
        cancelButtonText: 'Annuler',
        confirmButtonColor: '#1e3a8a',
        cancelButtonColor: '#f59e0b',
        didOpen: () => {
            const slider = document.getElementById('volatilityThreshold');
            const valueDisplay = document.getElementById('volatilityValue');
            slider.addEventListener('input', () => {
                valueDisplay.textContent = slider.value;
            });
        },
        preConfirm: () => {
            const settings = {
                analysisMode: document.getElementById('analysisMode').value,
                excludeExtremes: document.getElementById('excludeExtremes').checked,
                trendAnalysis: document.getElementById('trendAnalysis').checked,
                volatilityThreshold: parseFloat(document.getElementById('volatilityThreshold').value)
            };
            localStorage.setItem('predictionSettings', JSON.stringify(settings));
            return settings;
        }
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                icon: 'success',
                title: 'Paramètres sauvegardés',
                toast: true,
                position: 'top',
                showConfirmButton: false,
                timer: 1500,
                background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                color: 'white'
            });
        }
    });
};

window.analyzeHistoricalData = function() {
    // Vérifier la licence
    if (!window.isLicenseValid) {
        document.getElementById('intelligentAnalysis').innerHTML = `
            <div class="text-center text-gray-500 p-3">
                <i class="fas fa-lock text-2xl text-gray-400 mb-2"></i>
                <p>Activez votre licence pour débloquer l'analyse</p>
            </div>
        `;
        return;
    }
    
    const successfulPredictions = predictionHistory.filter(p => p.status === 'success');
    if (successfulPredictions.length === 0) {
        document.getElementById('intelligentAnalysis').innerHTML = `
            <div class="text-center text-gray-500 p-3 text-xs">
                <i class="fas fa-database text-2xl text-gray-400 mb-2"></i>
                Pas encore assez de données pour l'analyse
            </div>
        `;
        return;
    }

    const avgConfidence = successfulPredictions.reduce((sum, p) => sum + p.confidence, 0) / successfulPredictions.length;
    
    const oddsRanges = {
        '1.0-1.5': 0,
        '1.5-2.0': 0,
        '2.0-2.5': 0,
        '2.5+': 0
    };
    
    successfulPredictions.forEach(p => {
        const odds = parseFloat(p.finalOdds);
        if (odds <= 1.5) oddsRanges['1.0-1.5']++;
        else if (odds <= 2.0) oddsRanges['1.5-2.0']++;
        else if (odds <= 2.5) oddsRanges['2.0-2.5']++;
        else oddsRanges['2.5+']++;
    });
    
    let bestRange = '';
    let maxCount = 0;
    for (const [range, count] of Object.entries(oddsRanges)) {
        if (count > maxCount) {
            maxCount = count;
            bestRange = range;
        }
    }
    
    const avgSuccessConfidence = Math.round(avgConfidence);
    
    const percentageRanges = analyzePercentageRanges(successfulPredictions);
    const roundAnalysis = analyzeRounds(successfulPredictions);
    const oddsAnalysis = analyzeOddsRanges(successfulPredictions);

    document.getElementById('intelligentAnalysis').innerHTML = `
        <div class="space-y-3">
            <div class="p-2 bg-blue-50 rounded-lg border border-blue-200">
                <div class="font-bold text-blue-800 mb-1 text-sm">
                    <i class="fas fa-chart-line mr-1"></i>
                    Performance Moyenne
                </div>
                <p class="text-blue-600 text-xs">
                    Taux de réussite: <span class="font-bold">${((successfulPredictions.length / predictionHistory.length) * 100).toFixed(1)}%</span>
                </p>
                <p class="text-blue-600 text-xs mt-1">
                    Confiance moyenne des succès: <span class="font-bold">${avgSuccessConfidence}%</span>
                </p>
            </div>
            
            <div class="p-2 bg-gradient-to-r from-blue-50 to-yellow-50 rounded-lg border border-yellow-200">
                <div class="font-bold text-blue-900 mb-1 text-sm">
                    <i class="fas fa-check-circle mr-1"></i>
                    Meilleures Côtes Finales
                </div>
                <p class="text-blue-800 text-xs">
                    Plage optimale: <span class="font-bold">${bestRange}</span>
                </p>
                <div class="mt-1">
                    <p class="text-xs text-gray-600 mb-1">Répartition des succès (après marge):</p>
                    <div class="space-y-1">
                        <div class="flex items-center">
                            <span class="text-xs w-12">1.0-1.5:</span>
                            <div class="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div class="bg-gradient-to-r from-blue-600 to-yellow-500 h-1.5 rounded-full" style="width: ${(oddsRanges['1.0-1.5'] / successfulPredictions.length) * 100}%"></div>
                            </div>
                            <span class="text-xs w-6 text-right">${oddsRanges['1.0-1.5']}</span>
                        </div>
                        <div class="flex items-center">
                            <span class="text-xs w-12">1.5-2.0:</span>
                            <div class="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div class="bg-gradient-to-r from-blue-600 to-yellow-500 h-1.5 rounded-full" style="width: ${(oddsRanges['1.5-2.0'] / successfulPredictions.length) * 100}%"></div>
                            </div>
                            <span class="text-xs w-6 text-right">${oddsRanges['1.5-2.0']}</span>
                        </div>
                        <div class="flex items-center">
                            <span class="text-xs w-12">2.0-2.5:</span>
                            <div class="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div class="bg-gradient-to-r from-blue-600 to-yellow-500 h-1.5 rounded-full" style="width: ${(oddsRanges['2.0-2.5'] / successfulPredictions.length) * 100}%"></div>
                            </div>
                            <span class="text-xs w-6 text-right">${oddsRanges['2.0-2.5']}</span>
                        </div>
                        <div class="flex items-center">
                            <span class="text-xs w-12">2.5+:</span>
                            <div class="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div class="bg-gradient-to-r from-blue-600 to-yellow-500 h-1.5 rounded-full" style="width: ${(oddsRanges['2.5+'] / successfulPredictions.length) * 100}%"></div>
                            </div>
                            <span class="text-xs w-6 text-right">${oddsRanges['2.5+']}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="p-2 bg-blue-50 rounded-lg border border-blue-200">
                <div class="font-bold text-blue-800 mb-1 text-sm">
                    <i class="fas fa-history mr-1"></i>
                    Analyse Historique
                </div>
                <p class="text-blue-600 text-xs">
                    <span class="font-bold">${successfulPredictions.length}</span> prédictions réussies sur 
                    <span class="font-bold">${predictionHistory.length}</span> au total
                </p>
            </div>
            
            <div class="p-2 bg-yellow-50 rounded-lg border border-yellow-200">
                <div class="font-bold text-yellow-800 mb-1 text-sm">
                    <i class="fas fa-chart-bar mr-1"></i>
                    Meilleur Intervalle de Probabilité
                </div>
                <p class="text-yellow-600 text-xs">
                    ${percentageRanges.bestRange}% (${percentageRanges.bestCount} succès)
                    <span class="text-xs text-yellow-500">
                        Taux de réussite: ${percentageRanges.successRate}%
                    </span>
                </p>
            </div>
            
            <div class="p-2 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg border border-orange-200">
                <div class="font-bold text-orange-800 mb-1 text-sm">
                    <i class="fas fa-trophy mr-1"></i>
                    Round le Plus Performant
                </div>
                <p class="text-orange-600 text-xs">
                    Round ${roundAnalysis.bestRound} 
                    <span class="text-xs text-orange-500">
                        (${roundAnalysis.roundCount} succès sur ${roundAnalysis.totalForRound} prédictions)
                    </span>
                </p>
            </div>
        </div>
    `;
}

function analyzePercentageRanges(predictions) {
    const ranges = {};
    const allPredictions = predictionHistory.filter(p => p.status !== 'pending');

    allPredictions.forEach(pred => {
        const probability = parseFloat(pred.probabilities[0]);
        const rangeStart = Math.floor(probability / 10) * 10;
        const rangeKey = `${rangeStart}-${rangeStart + 10}`;
        
        if (!ranges[rangeKey]) {
            ranges[rangeKey] = { total: 0, success: 0 };
        }
        ranges[rangeKey].total++;
        if (pred.status === 'success') {
            ranges[rangeKey].success++;
        }
    });

    let bestRange = '';
    let bestCount = 0;
    let bestSuccessRate = 0;

    Object.entries(ranges).forEach(([range, stats]) => {
        const successRate = (stats.success / stats.total) * 100;
        if (stats.success > bestCount || (stats.success === bestCount && successRate > bestSuccessRate)) {
            bestRange = range;
            bestCount = stats.success;
            bestSuccessRate = successRate;
        }
    });

    return {
        bestRange,
        bestCount,
        successRate: bestSuccessRate.toFixed(1)
    };
}

function analyzeRounds(predictions) {
    const roundStats = {};
    const allPredictions = predictionHistory.filter(p => p.status !== 'pending' && p.round);

    allPredictions.forEach(pred => {
        if (!roundStats[pred.round]) {
            roundStats[pred.round] = { total: 0, success: 0 };
        }
        roundStats[pred.round].total++;
        if (pred.status === 'success') {
            roundStats[pred.round].success++;
        }
    });

    let bestRound = 0;
    let bestSuccessRate = 0;
    let roundCount = 0;
    let totalForRound = 0;

    Object.entries(roundStats).forEach(([round, stats]) => {
        const successRate = (stats.success / stats.total) * 100;
        if (successRate > bestSuccessRate || (successRate === bestSuccessRate && stats.success > roundCount)) {
            bestRound = round;
            bestSuccessRate = successRate;
            roundCount = stats.success;
            totalForRound = stats.total;
        }
    });
  
    return {
        bestRound,
        roundCount,
        totalForRound,
        successRate: bestSuccessRate.toFixed(1)
    };
}

function analyzeOddsRanges(predictions) {
    const ranges = {};
    predictions.forEach(pred => {
        const odds = parseFloat(pred.finalOdds);
        const rangeStart = Math.floor(odds * 2) / 2;
        const rangeKey = `${rangeStart.toFixed(1)}-${(rangeStart + 0.5).toFixed(1)}`;
        
        ranges[rangeKey] = (ranges[rangeKey] || 0) + 1;
    });

    let bestRange = '';
    let maxSuccess = 0;

    Object.entries(ranges).forEach(([range, count]) => {
        if (count > maxSuccess) {
            bestRange = range;
            maxSuccess = count;
        }
    });

    return {
        bestRange,
        successCount: maxSuccess
    };
}

window.toggleHistoryVisibility = function() {
    const historyContainer = document.getElementById('predictionHistory');
    const toggleButton = document.getElementById('toggleHistory');
    isHistoryVisible = !isHistoryVisible;
    
    if (isHistoryVisible) {
        historyContainer.style.display = 'block';
        toggleButton.textContent = 'Masquer';
        toggleButton.classList.remove('bg-blue-800');
        toggleButton.classList.add('bg-blue-900');
    } else {
        historyContainer.style.display = 'none';
        toggleButton.textContent = 'Afficher';
        toggleButton.classList.remove('bg-blue-900');
        toggleButton.classList.add('bg-blue-800');
    }
};

// ================= NOUVELLE FONCTION: SUPPRIMER L'HISTORIQUE =================

window.deleteHistory = function() {
    // Vérifier la licence
    if (!window.isLicenseValid) {
        Swal.fire({
            icon: 'error',
            title: 'Licence requise',
            text: 'Vous devez avoir une licence active pour utiliser cette fonctionnalité',
            confirmButtonText: 'Acheter une licence',
            showCancelButton: true,
            cancelButtonText: 'Annuler',
            confirmButtonColor: '#1e3a8a',
            cancelButtonColor: '#f59e0b'
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = 'accueil.html';
            }
        });
        return;
    }
    
    Swal.fire({
        title: 'Êtes-vous sûr?',
        html: `
            <div class="text-sm text-gray-700">
                <p class="mb-3">Cette action supprimera <strong>TOUT</strong> l'historique des prédictions.</p>
                <p>Cette action est irréversible.</p>
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#1e3a8a',
        confirmButtonText: 'Oui, supprimer tout!',
        cancelButtonText: 'Annuler',
        reverseButtons: true
    }).then((result) => {
        if (result.isConfirmed) {
            // Supprimer l'historique du localStorage
            localStorage.removeItem('predictionHistory');
            
            // Réinitialiser les variables
            predictionHistory = [];
            pendingVerification = [];
            
            // Mettre à jour l'affichage
            updatePredictionHistory();
            updateStatistics();
            analyzeHistoricalData();
            
            // Réinitialiser les résultats
            document.getElementById('result').innerHTML = '';
            
            // Afficher une confirmation
            Swal.fire({
                icon: 'success',
                title: 'Historique supprimé!',
                text: 'Toutes les prédictions ont été supprimées.',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000,
                background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                color: 'white'
            });
        }
    });
};