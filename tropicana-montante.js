// Variables globales du bot
window.coefficientsHistory = [];
window.isPredictionActive = false;
window.predictionTimeout = null;
window.currentPrediction = null;
window.flyingCheckInterval = null;
window.isFlyingState = false;
window.flyingCheckCounter = 0;
window.gameStateCheckInterval = null;
window.gameStateCheckCount = 0;
window.validationInterval = null;
window.lastCoefficient = null;
window.lastFetchTime = null;

const MAX_GAME_STATE_CHECKS = 20;
const VALIDATION_WINDOW = 40;
const STATE_CHECK_AT = 5;

// Configuration de l'API - Session ID du PREMIER fichier (tropicana-predictor.html)
const apiURL = "https://crash-gateway-grm-cr.100hp.app/state";
const headers = {
    'customer-id': '077dee8d-c923-4c02-9bee-757573662e69',
    'session-id': '5da25268-1954-4a9e-a51e-70983eb630a4', // Session ID du premier fichier Tropicana
    'accept': 'application/json',
};

// Créer les palmiers en arrière-plan (style Tropicana)
function createPalmTrees() {
    if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) return;
    
    const palmContainer = document.getElementById('palmTrees');
    if (!palmContainer) return;
    
    palmContainer.innerHTML = '';
    const numberOfPalms = 8;
    
    for (let i = 0; i < numberOfPalms; i++) {
        const palm = document.createElement('div');
        palm.classList.add('palm-tree');
        palm.innerHTML = '🌴';
        
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const duration = 3 + Math.random() * 5;
        const fontSize = 20 + Math.random() * 30;
        
        palm.style.left = `${x}%`;
        palm.style.top = `${y}%`;
        palm.style.fontSize = `${fontSize}px`;
        palm.style.setProperty('--duration', `${duration}s`);
        
        palmContainer.appendChild(palm);
    }
}

// Mettre à jour l'heure actuelle
function updateCurrentTime() {
    if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) return;
    
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    
    const timeElement = document.getElementById('time');
    if (timeElement) {
        timeElement.textContent = `Temps: ${hours}:${minutes}`;
    }
}

// Récupérer les coefficients
async function fetchCoefficients() {
    if ((!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) || window.isPredictionActive) return;
    
    try {
        const response = await fetch(apiURL, { headers });
        if (!response.ok) throw new Error("Erreur API");

        const data = await response.json();
        const coefficient = data.stopCoefficients?.[0] ?? null;
        
        if (coefficient !== null) {
            const adjustedCoefficient = coefficient === 1.00 ? 1.01 : coefficient;
            const roundedCoefficient = parseFloat(adjustedCoefficient.toFixed(2));
            const now = Date.now();
            
            if (window.lastCoefficient === roundedCoefficient && window.lastFetchTime && (now - window.lastFetchTime) < 7000) {
                return;
            }
            
            window.lastCoefficient = roundedCoefficient;
            window.lastFetchTime = now;
            
            window.coefficientsHistory.unshift(roundedCoefficient);
            if (window.coefficientsHistory.length > 3) {
                window.coefficientsHistory.pop();
            }
            
            const statusIndicator = document.getElementById('statusIndicator');
            if (statusIndicator) {
                statusIndicator.innerHTML = `<i class="fas fa-check-circle"></i> ${window.coefficientsHistory.length}/3 coefficients`;
            }
            
            if (window.coefficientsHistory.length === 3) {
                startPrediction();
            }
        }
    } catch (error) {
        console.error("Erreur lors de la récupération des coefficients:", error);
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Erreur API, réessai...`;
        }
    }
}

// Démarrer une nouvelle prédiction
function startPrediction() {
    if ((!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) || window.isPredictionActive) return;
    
    window.isPredictionActive = true;
    window.isFlyingState = false;
    window.flyingCheckCounter = 0;
    window.gameStateCheckCount = 0;
    
    const { predictedValue, estimatedDate } = calculatePrediction();
    
    if (predictedValue < 1.50 || predictedValue > 2.50) {
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.innerHTML = `<i class="fas fa-exclamation-circle"></i> Prédiction hors plage (${predictedValue.toFixed(2)}X)`;
        }
        window.isPredictionActive = false;
        return;
    }
    
    window.currentPrediction = {
        value: predictedValue,
        targetTime: estimatedDate,
        status: 'pending'
    };
    
    const multiplierElement = document.getElementById('multiplier');
    if (multiplierElement) {
        multiplierElement.textContent = predictedValue.toFixed(2) + 'X';
    }
    
    const circleInner = document.querySelector('.circle-inner');
    if (circleInner) {
        if (predictedValue > 8) {
            circleInner.style.color = '#7dd3fc';
            circleInner.style.textShadow = '0 0 15px rgba(125, 211, 252, 0.8)';
        } else if (predictedValue > 6) {
            circleInner.style.color = '#38bdf8';
            circleInner.style.textShadow = '0 0 12px rgba(56, 189, 248, 0.7)';
        } else if (predictedValue > 4) {
            circleInner.style.color = '#0ea5e9';
            circleInner.style.textShadow = '0 0 12px rgba(14, 165, 233, 0.7)';
        } else {
            circleInner.style.color = '#7dd3fc';
            circleInner.style.textShadow = '0 0 10px rgba(125, 211, 252, 0.7)';
        }
    }
    
    const hours = estimatedDate.getHours();
    const minutes = estimatedDate.getMinutes();
    updateTime(hours, minutes);
    
    const statusIndicator = document.getElementById('statusIndicator');
    if (statusIndicator) {
        statusIndicator.innerHTML = `<i class="fas fa-bolt"></i> Prédiction active: ${predictedValue.toFixed(2)}X`;
    }
    
    startCountdownTimer(estimatedDate);
}

// Calculer la prédiction
function calculatePrediction() {
    const values = window.coefficientsHistory.slice(0, 3);
    const average = values.reduce((a, b) => a + b, 0) / 3;
    
    const { a, b } = exponentialRegression(values);
    const predictedValue = applyExponentialRegression(a, b, 4);
    
    const now = new Date();
    const estimatedTime = new Date(now.getTime() + predictedValue * 60000);
    const isTomorrow = estimatedTime < now;
    const estimatedDate = isTomorrow ? 
        new Date(estimatedTime.getTime() + 24 * 60 * 60 * 1000) : estimatedTime;
    
    return { predictedValue, estimatedDate };
}

// Régression exponentielle
function exponentialRegression(values) {
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
        const x = Math.log(i + 1);
        const y = Math.log(values[i]);
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return { a: slope, b: intercept };
}

// Appliquer la régression exponentielle
function applyExponentialRegression(a, b, x) {
    return Math.exp(a * Math.log(x) + b);
}

// Démarrer le compte à rebours
function startCountdownTimer(targetDate) {
    if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) return;
    
    const updateCountdownDisplay = () => {
        if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) {
            if (window.predictionTimeout) {
                clearTimeout(window.predictionTimeout);
            }
            return;
        }
        
        const now = new Date();
        const diff = targetDate - now;
        
        if (diff <= 0) {
            stopFlyingStateCheck();
            checkPredictionResult();
            return;
        }
        
        const secondsLeft = Math.floor(diff / 1000);
        updateCountdown(secondsLeft);
        
        window.predictionTimeout = setTimeout(updateCountdownDisplay, 1000);
    };
    
    updateCountdownDisplay();
}

// Mettre à jour le compte à rebours d'affichage
function updateCountdown(secondsLeft) {
    if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) return;
    
    const minutesLeft = Math.floor(secondsLeft / 60);
    const secondsLeftFormatted = secondsLeft % 60;
    const formattedMinutesLeft = minutesLeft.toString().padStart(2, '0');
    const formattedSecondsLeft = secondsLeftFormatted.toString().padStart(2, '0');
    
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        countdownElement.textContent = `Miser dans: ${formattedMinutesLeft}:${formattedSecondsLeft}`;
        
        if (secondsLeft <= 10 && secondsLeft > 0) {
            countdownElement.style.color = '#38bdf8';
            
            if (secondsLeft <= 5 && !window.flyingCheckInterval) {
                startFlyingStateCheck();
            }
        } else {
            countdownElement.style.color = '';
        }
    }
}

// Démarrer la vérification de l'état Flying
function startFlyingStateCheck() {
    if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) return;
    
    window.flyingCheckCounter = 0;
    window.isFlyingState = false;
    
    const flyingIndicator = document.getElementById('flyingIndicator');
    if (flyingIndicator) {
        flyingIndicator.style.display = 'inline-block';
    }
    
    window.flyingCheckInterval = setInterval(async () => {
        if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) {
            clearInterval(window.flyingCheckInterval);
            window.flyingCheckInterval = null;
            return;
        }
        
        try {
            const response = await fetch(apiURL, { headers });
            if (!response.ok) throw new Error("Erreur API");
            const data = await response.json();
            
            if (data.game && data.game.state === 'flying') {
                window.isFlyingState = true;
                const flyingIndicator = document.getElementById('flyingIndicator');
                if (flyingIndicator) {
                    flyingIndicator.innerHTML = `<i class="fas fa-plane"></i> État: Flying (${++window.flyingCheckCounter}/5)`;
                }
            }
        } catch (error) {
            console.error("Erreur lors de la vérification de l'état:", error);
        }
    }, 1000);
}

// Arrêter la vérification de l'état Flying
function stopFlyingStateCheck() {
    if (window.flyingCheckInterval) {
        clearInterval(window.flyingCheckInterval);
        window.flyingCheckInterval = null;
        
        const flyingIndicator = document.getElementById('flyingIndicator');
        if (flyingIndicator) {
            flyingIndicator.style.display = 'none';
        }
    }
}

// Vérifier le résultat de la prédiction
async function checkPredictionResult() {
    if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) return;
    
    if (window.predictionTimeout) {
        clearTimeout(window.predictionTimeout);
        window.predictionTimeout = null;
    }
    
    try {
        const verificationIndicator = document.getElementById('verificationIndicator');
        if (verificationIndicator) {
            verificationIndicator.style.display = 'inline-block';
        }
        
        const response = await fetch(apiURL, { headers });
        if (!response.ok) throw new Error("Erreur API");
        const data = await response.json();
        
        const gameState = data.game?.state;
        
        if (gameState === 'flying') {
            if (verificationIndicator) {
                verificationIndicator.style.display = 'none';
            }
            
            const waitIndicator = document.getElementById('waitIndicator');
            if (waitIndicator) {
                waitIndicator.style.display = 'inline-block';
            }
            
            const statusIndicator = document.getElementById('statusIndicator');
            if (statusIndicator) {
                statusIndicator.innerHTML = `<i class="fas fa-clock"></i> WAIT FOR THE NEXT GAME`;
            }
            
            await waitForNextGame();
            await startValidationWindow();
            return;
        }
        
        await startValidationWindow();
        
    } catch (error) {
        console.error("Erreur lors de la vérification:", error);
        const verificationIndicator = document.getElementById('verificationIndicator');
        if (verificationIndicator) {
            verificationIndicator.style.display = 'none';
        }
        
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Erreur de vérification: ${error.message}`;
        }
        
        setTimeout(() => {
            resetPrediction();
        }, 3000);
    }
}

// Attendre le prochain jeu
async function waitForNextGame() {
    return new Promise((resolve, reject) => {
        window.gameStateCheckCount = 0;
        window.gameStateCheckInterval = setInterval(async () => {
            if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) {
                clearInterval(window.gameStateCheckInterval);
                window.gameStateCheckInterval = null;
                reject(new Error("Licence expirée"));
                return;
            }
            
            try {
                window.gameStateCheckCount++;
                
                if (window.gameStateCheckCount > MAX_GAME_STATE_CHECKS) {
                    clearInterval(window.gameStateCheckInterval);
                    window.gameStateCheckInterval = null;
                    reject(new Error("Délai d'attente dépassé pour le prochain jeu"));
                    return;
                }
                
                const response = await fetch(apiURL, { headers });
                const data = await response.json();
                
                const gameState = data.game?.state;
                
                if (gameState === 'idle' || gameState === 'flying') {
                    const waitIndicator = document.getElementById('waitIndicator');
                    if (waitIndicator) {
                        waitIndicator.style.display = 'none';
                    }
                    
                    const playIndicator = document.getElementById('playIndicator');
                    if (playIndicator) {
                        playIndicator.style.display = 'inline-block';
                    }
                    
                    const statusIndicator = document.getElementById('statusIndicator');
                    if (statusIndicator) {
                        statusIndicator.innerHTML = `<i class="fas fa-play-circle"></i> PLAY - Prêt à miser!`;
                    }
                    
                    clearInterval(window.gameStateCheckInterval);
                    window.gameStateCheckInterval = null;
                    resolve();
                }
            } catch (error) {
                clearInterval(window.gameStateCheckInterval);
                window.gameStateCheckInterval = null;
                reject(error);
            }
        }, 1000);
    });
}

// Démarrer la fenêtre de validation de 40 secondes
async function startValidationWindow() {
    if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) return;
    
    const verificationIndicator = document.getElementById('verificationIndicator');
    if (verificationIndicator) {
        verificationIndicator.style.display = 'none';
    }
    
    const playIndicator = document.getElementById('playIndicator');
    if (playIndicator) {
        playIndicator.style.display = 'none';
    }
    
    const validationIndicator = document.getElementById('validationIndicator');
    if (validationIndicator) {
        validationIndicator.style.display = 'inline-block';
    }
    
    const progressBarContainer = document.getElementById('progressBarContainer');
    if (progressBarContainer) {
        progressBarContainer.style.display = 'block';
    }
    
    const progressBar = document.getElementById('progressBar');
    
    const statusIndicator = document.getElementById('statusIndicator');
    if (statusIndicator) {
        statusIndicator.innerHTML = `<i class="fas fa-search"></i> Validation en cours (${VALIDATION_WINDOW}s)...`;
    }
    
    let validationTimeLeft = VALIDATION_WINDOW;
    let validationSuccess = false;
    let actualMultiplier = null;
    let stateChecked = false;
    let stateCheckScheduled = false;
    
    const updateValidationDisplay = () => {
        const validationIndicator = document.getElementById('validationIndicator');
        if (validationIndicator) {
            validationIndicator.innerHTML = `<i class="fas fa-clock"></i> Validation en cours: ${validationTimeLeft}s`;
        }
        
        if (progressBar) {
            const progressPercentage = ((VALIDATION_WINDOW - validationTimeLeft) / VALIDATION_WINDOW) * 100;
            progressBar.style.width = `${progressPercentage}%`;
        }
    };
    
    updateValidationDisplay();
    
    const scheduleStateCheck = () => {
        if (stateCheckScheduled) return;
        stateCheckScheduled = true;
        
        setTimeout(async () => {
            if (validationTimeLeft <= STATE_CHECK_AT && !validationSuccess) {
                const stateCheckIndicator = document.getElementById('stateCheckIndicator');
                if (stateCheckIndicator) {
                    stateCheckIndicator.style.display = 'inline-block';
                }
                await checkGameStateAtEnd();
                if (stateCheckIndicator) {
                    stateCheckIndicator.style.display = 'none';
                }
            }
        }, (VALIDATION_WINDOW - STATE_CHECK_AT) * 1000);
    };
    
    scheduleStateCheck();
    
    window.validationInterval = setInterval(async () => {
        if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) {
            clearInterval(window.validationInterval);
            window.validationInterval = null;
            return;
        }
        
        try {
            validationTimeLeft--;
            updateValidationDisplay();
            
            const response = await fetch(apiURL, { headers });
            const data = await response.json();
            
            const currentMultiplier = getActualMultiplierFromData(data);
            
            if (currentMultiplier && currentMultiplier >= window.currentPrediction.value) {
                validationSuccess = true;
                actualMultiplier = currentMultiplier;
                clearInterval(window.validationInterval);
                window.validationInterval = null;
                finishValidation(validationSuccess, actualMultiplier);
                return;
            }
            
            if (validationTimeLeft <= 0) {
                clearInterval(window.validationInterval);
                window.validationInterval = null;
                
                if (stateChecked) {
                    finishValidation(validationSuccess, actualMultiplier);
                } else {
                    const stateCheckIndicator = document.getElementById('stateCheckIndicator');
                    if (stateCheckIndicator) {
                        stateCheckIndicator.style.display = 'inline-block';
                    }
                    await checkGameStateAtEnd();
                    if (stateCheckIndicator) {
                        stateCheckIndicator.style.display = 'none';
                    }
                    finishValidation(validationSuccess, actualMultiplier);
                }
            }
        } catch (error) {
            console.error("Erreur lors de la validation:", error);
        }
    }, 1000);
}

// Vérifier l'état du jeu à 5 secondes de la fin
async function checkGameStateAtEnd() {
    try {
        const response = await fetch(apiURL, { headers });
        const data = await response.json();
        const gameState = data.game?.state;
        
        if (gameState === 'flying') {
            const statusIndicator = document.getElementById('statusIndicator');
            if (statusIndicator) {
                statusIndicator.innerHTML = `<i class="fas fa-plane"></i> Jeu en cours, attente du résultat...`;
            }
            
            const crashPoint = await waitForGameResult();
            
            if (crashPoint !== null && crashPoint >= window.currentPrediction.value) {
                validationSuccess = true;
                actualMultiplier = crashPoint;
            }
        }
        
        stateChecked = true;
    } catch (error) {
        console.error("Erreur lors de la vérification de l'état:", error);
    }
}

// Attendre le résultat du jeu en cours
async function waitForGameResult() {
    return new Promise((resolve, reject) => {
        const maxChecks = 40;
        let checks = 0;
        
        const interval = setInterval(async () => {
            if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) {
                clearInterval(interval);
                reject(new Error("Licence expirée"));
                return;
            }
            
            try {
                checks++;
                const response = await fetch(apiURL, { headers });
                const data = await response.json();
                
                if (data.game?.state === 'ended') {
                    clearInterval(interval);
                    const crashPoint = getActualMultiplierFromData(data);
                    resolve(crashPoint);
                } else if (checks >= maxChecks) {
                    clearInterval(interval);
                    resolve(null);
                }
            } catch (error) {
                clearInterval(interval);
                reject(error);
            }
        }, 1000);
    });
}

// Terminer la validation et afficher le résultat
function finishValidation(success, actualMultiplier) {
    if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) return;
    
    const multiplierElement = document.getElementById('multiplier');
    const circleInner = document.querySelector('.circle-inner');
    
    const validationIndicator = document.getElementById('validationIndicator');
    if (validationIndicator) {
        validationIndicator.style.display = 'none';
    }
    
    const progressBarContainer = document.getElementById('progressBarContainer');
    if (progressBarContainer) {
        progressBarContainer.style.display = 'none';
    }
    
    if (success) {
        if (multiplierElement) {
            multiplierElement.textContent = 'validé ✅';
        }
        if (circleInner) {
            circleInner.style.borderColor = '#22c55e';
            circleInner.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.5)';
            circleInner.style.color = '#22c55e';
        }
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.innerHTML = `<i class="fas fa-check-circle"></i> Prédiction validée: ${actualMultiplier.toFixed(2)}X`;
        }
    } else {
        if (multiplierElement) {
            multiplierElement.textContent = 'échoué ❌';
        }
        if (circleInner) {
            circleInner.style.borderColor = '#38bdf8';
            circleInner.style.boxShadow = '0 0 20px rgba(56, 189, 248, 0.5)';
            circleInner.style.color = '#38bdf8';
        }
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.innerHTML = `<i class="fas fa-times-circle"></i> Prédiction échouée`;
        }
    }
    
    setTimeout(() => {
        resetPrediction();
    }, 3000);
}

// Récupérer le multiplicateur réel à partir des données
function getActualMultiplierFromData(data) {
    if (data && data.game && data.game.crash_point) {
        return parseFloat(data.game.crash_point);
    }
    
    if (data && data.crash_point) {
        return parseFloat(data.crash_point);
    }
    
    if (data && data.history && Array.isArray(data.history) && data.history.length > 0) {
        return parseFloat(data.history[0]);
    }
    
    if (data && data.game && data.game.history && Array.isArray(data.game.history) && data.game.history.length > 0) {
        return parseFloat(data.game.history[0]);
    }
    
    if (data && data.stopCoefficients && Array.isArray(data.stopCoefficients) && data.stopCoefficients.length > 0) {
        const coefficient = data.stopCoefficients[0];
        const adjustedCoefficient = coefficient === 1.00 ? 1.01 : coefficient;
        return parseFloat(adjustedCoefficient.toFixed(2));
    }
    
    return null;
}

// Réinitialiser la prédiction
function resetPrediction() {
    if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) return;
    
    const multiplierElement = document.getElementById('multiplier');
    const circleInner = document.querySelector('.circle-inner');
    const progressBar = document.getElementById('progressBar');
    
    if (circleInner) {
        circleInner.style.borderColor = '';
        circleInner.style.boxShadow = '';
        circleInner.style.color = '';
        circleInner.style.textShadow = '';
    }
    
    if (multiplierElement) {
        multiplierElement.textContent = '0.00X';
    }
    
    if (progressBar) {
        progressBar.style.width = '0%';
    }
    
    window.coefficientsHistory = [];
    window.isPredictionActive = false;
    window.currentPrediction = null;
    window.isFlyingState = false;
    window.flyingCheckCounter = 0;
    stopFlyingStateCheck();
    
    const indicators = [
        'verificationIndicator',
        'waitIndicator',
        'playIndicator',
        'validationIndicator',
        'stateCheckIndicator',
        'progressBarContainer'
    ];
    
    indicators.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'none';
        }
    });
    
    if (window.gameStateCheckInterval) {
        clearInterval(window.gameStateCheckInterval);
        window.gameStateCheckInterval = null;
    }
    
    if (window.validationInterval) {
        clearInterval(window.validationInterval);
        window.validationInterval = null;
    }
    
    const statusIndicator = document.getElementById('statusIndicator');
    if (statusIndicator) {
        statusIndicator.innerHTML = `<i class="fas fa-sync fa-spin"></i> Analyse en cours...`;
    }
    
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        countdownElement.textContent = 'Prochaine prédiction: 00:00';
        countdownElement.style.color = '';
    }
}

// Mettre à jour l'affichage du temps de pari
function updateTime(hours, minutes) {
    if (!window.checkLicenseBeforeOperation || !window.checkLicenseBeforeOperation()) return;
    
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');
    
    const timeElement = document.getElementById('time');
    if (timeElement) {
        timeElement.textContent = `Temps: ${formattedHours}:${formattedMinutes}`;
    }
}

// Exposer les fonctions globalement
window.createPalmTrees = createPalmTrees;
window.updateCurrentTime = updateCurrentTime;
window.fetchCoefficients = fetchCoefficients;
window.startPrediction = startPrediction;
window.resetPrediction = resetPrediction;
window.updateTime = updateTime;

// Initialiser lorsque la page est chargée
document.addEventListener('DOMContentLoaded', function() {
    console.log("Page Tropicana Montante chargée");
    
    // Les fonctions Firebase initialiseront le bot après vérification de la licence
});