// Variables globales du bot
let coefficientsHistory = [];
let isPredictionActive = false;
let predictionTimeout = null;
let currentPrediction = null;
let flyingCheckInterval = null;
let isFlyingState = false;
let flyingCheckCounter = 0;
let gameStateCheckInterval = null;
let gameStateCheckCount = 0;
let validationInterval = null;
let lastCoefficient = null;
let lastFetchTime = null;
const MAX_GAME_STATE_CHECKS = 20;
const VALIDATION_WINDOW = 40;
const STATE_CHECK_AT = 5;

// Configuration de l'API avec la session_id du premier fichier
const apiURL = "https://crash-gateway-grm-cr.100hp.app/state";
const CUSTOMER_ID = '077dee8d-c923-4c02-9bee-757573662e69';
const SESSION_ID = '25369bd7-6c50-49d1-846c-8b1cc1ae4239';

// Créer les étoiles en arrière-plan
window.createStars = function() {
    if (!window.checkLicenseBeforeOperation()) return;
    
    const starsContainer = document.getElementById('stars');
    const numberOfStars = 100;
    
    for (let i = 0; i < numberOfStars; i++) {
        const star = document.createElement('div');
        star.classList.add('star');
        
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const size = Math.random() * 3;
        const duration = 2 + Math.random() * 4;
        const opacity = 0.2 + Math.random() * 0.8;
        
        star.style.left = `${x}%`;
        star.style.top = `${y}%`;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.setProperty('--duration', `${duration}s`);
        star.style.setProperty('--opacity', opacity);
        
        starsContainer.appendChild(star);
    }
};

// Mettre à jour l'heure actuelle
window.updateCurrentTime = function() {
    if (!window.checkLicenseBeforeOperation()) return;
    
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    document.getElementById('time').textContent = `Temps: ${hours}:${minutes}`;
};

// Récupérer les coefficients
window.fetchCoefficients = async function() {
    if (!window.checkLicenseBeforeOperation() || isPredictionActive) return;
    
    try {
        // Utiliser exactement la même structure que le premier fichier
        const response = await fetch(apiURL, {
            method: 'GET',
            headers: {
                'customer-id': CUSTOMER_ID,
                'session-id': SESSION_ID,
                'accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.log("Erreur API (statut):", response.status);
            return; // Ignorer l'erreur sans l'afficher
        }

        const data = await response.json();
        
        if (data && data.stopCoefficients && data.stopCoefficients.length > 0) {
            const coefficient = data.stopCoefficients[0];
            const adjustedCoefficient = coefficient === 1.00 ? 1.01 : coefficient;
            const roundedCoefficient = parseFloat(adjustedCoefficient.toFixed(2));
            const now = Date.now();
            
            // Vérifier les doublons
            if (lastCoefficient === roundedCoefficient && lastFetchTime && (now - lastFetchTime) < 7000) {
                console.log("Coefficient identique détecté, ignoré");
                return;
            }
            
            lastCoefficient = roundedCoefficient;
            lastFetchTime = now;
            
            coefficientsHistory.unshift(roundedCoefficient);
            if (coefficientsHistory.length > 3) {
                coefficientsHistory.pop();
            }
            
            console.log("Historique des coefficients:", coefficientsHistory);
            
            document.getElementById('statusIndicator').innerHTML = 
                `<i class="fas fa-check-circle"></i> ${coefficientsHistory.length}/3 coefficients`;
            
            if (coefficientsHistory.length === 3 && !isPredictionActive) {
                console.log("3 coefficients collectés, démarrage de la prédiction...");
                startPrediction();
            }
        } else {
            console.log("Aucun coefficient valide trouvé dans la réponse");
            document.getElementById('statusIndicator').innerHTML = 
                `<i class="fas fa-exclamation-triangle"></i> Pas de données, réessai...`;
        }
    } catch (error) {
        console.log("Erreur lors de la récupération (ignorée):", error.message);
        // Ne pas afficher l'erreur pour éviter les messages intrusifs
    }
};

// Démarrer une nouvelle prédiction
function startPrediction() {
    if (!window.checkLicenseBeforeOperation() || isPredictionActive) return;
    
    isPredictionActive = true;
    isFlyingState = false;
    flyingCheckCounter = 0;
    gameStateCheckCount = 0;
    
    const { predictedValue, estimatedDate } = calculatePrediction();
    
    if (predictedValue < 1.50 || predictedValue > 2.50) {
        document.getElementById('statusIndicator').innerHTML = 
            `<i class="fas fa-exclamation-circle"></i> Prédiction hors plage (${predictedValue.toFixed(2)}X)`;
        isPredictionActive = false;
        return;
    }
    
    currentPrediction = {
        value: predictedValue,
        targetTime: estimatedDate,
        status: 'pending'
    };
    
    const multiplierElement = document.getElementById('multiplier');
    multiplierElement.textContent = predictedValue.toFixed(2) + 'X';
    
    const circleInner = document.querySelector('.circle-inner');
    if (predictedValue > 8) {
        circleInner.style.color = '#FBBF24';
        circleInner.style.textShadow = '0 0 15px rgba(251, 191, 36, 0.8)';
    } else if (predictedValue > 6) {
        circleInner.style.color = '#F59E0B';
        circleInner.style.textShadow = '0 0 12px rgba(245, 158, 11, 0.7)';
    } else if (predictedValue > 4) {
        circleInner.style.color = '#D97706';
        circleInner.style.textShadow = '0 0 12px rgba(217, 119, 6, 0.7)';
    } else {
        circleInner.style.color = '#F59E0B';
        circleInner.style.textShadow = '0 0 10px rgba(245, 158, 11, 0.7)';
    }
    
    const hours = estimatedDate.getHours();
    const minutes = estimatedDate.getMinutes();
    updateTime(hours, minutes);
    
    document.getElementById('statusIndicator').innerHTML = 
        `<i class="fas fa-bolt"></i> Prédiction active: ${predictedValue.toFixed(2)}X`;
    
    startCountdownTimer(estimatedDate);
}

// Calculer la prédiction
function calculatePrediction() {
    const values = coefficientsHistory.slice(0, 3);
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
    if (!window.checkLicenseBeforeOperation()) return;
    
    const updateCountdownDisplay = () => {
        if (!window.checkLicenseBeforeOperation()) {
            clearTimeout(predictionTimeout);
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
        
        predictionTimeout = setTimeout(updateCountdownDisplay, 1000);
    };
    
    updateCountdownDisplay();
}

// Mettre à jour le compte à rebours d'affichage
function updateCountdown(secondsLeft) {
    if (!window.checkLicenseBeforeOperation()) return;
    
    const minutesLeft = Math.floor(secondsLeft / 60);
    const secondsLeftFormatted = secondsLeft % 60;
    const formattedMinutesLeft = minutesLeft.toString().padStart(2, '0');
    const formattedSecondsLeft = secondsLeftFormatted.toString().padStart(2, '0');
    document.getElementById('countdown').textContent = `Miser dans: ${formattedMinutesLeft}:${formattedSecondsLeft}`;
    
    if (secondsLeft <= 10 && secondsLeft > 0) {
        document.getElementById('countdown').style.color = '#ef4444';
        
        if (secondsLeft <= 5 && !flyingCheckInterval) {
            startFlyingStateCheck();
        }
    } else {
        document.getElementById('countdown').style.color = '';
    }
}

// Démarrer la vérification de l'état Flying
function startFlyingStateCheck() {
    if (!window.checkLicenseBeforeOperation()) return;
    
    flyingCheckCounter = 0;
    isFlyingState = false;
    document.getElementById('flyingIndicator').style.display = 'inline-block';
    
    flyingCheckInterval = setInterval(async () => {
        if (!window.checkLicenseBeforeOperation()) {
            clearInterval(flyingCheckInterval);
            return;
        }
        
        try {
            const response = await fetch(apiURL, {
                method: 'GET',
                headers: {
                    'customer-id': CUSTOMER_ID,
                    'session-id': SESSION_ID,
                    'accept': 'application/json'
                }
            });
            
            if (!response.ok) throw new Error("Erreur API");
            const data = await response.json();
            
            if (data.game && data.game.state === 'flying') {
                isFlyingState = true;
                document.getElementById('flyingIndicator').innerHTML = 
                    `<i class="fas fa-rocket"></i> État: Flying (${++flyingCheckCounter}/5)`;
            }
        } catch (error) {
            console.error("Erreur lors de la vérification de l'état:", error);
        }
    }, 1000);
}

// Arrêter la vérification de l'état Flying
function stopFlyingStateCheck() {
    if (flyingCheckInterval) {
        clearInterval(flyingCheckInterval);
        flyingCheckInterval = null;
        document.getElementById('flyingIndicator').style.display = 'none';
    }
}

// Vérifier le résultat de la prédiction
async function checkPredictionResult() {
    if (!window.checkLicenseBeforeOperation()) return;
    
    clearTimeout(predictionTimeout);
    
    try {
        document.getElementById('verificationIndicator').style.display = 'inline-block';
        
        const response = await fetch(apiURL, {
            method: 'GET',
            headers: {
                'customer-id': CUSTOMER_ID,
                'session-id': SESSION_ID,
                'accept': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error("Erreur API");
        const data = await response.json();
        
        const gameState = data.game?.state;
        
        if (gameState === 'flying') {
            document.getElementById('verificationIndicator').style.display = 'none';
            document.getElementById('waitIndicator').style.display = 'inline-block';
            document.getElementById('statusIndicator').innerHTML = 
                `<i class="fas fa-clock"></i> ATTENDRE LE PROCHAIN JEU`;
            
            await waitForNextGame();
            await startValidationWindow();
            return;
        }
        
        await startValidationWindow();
        
    } catch (error) {
        console.error("Erreur lors de la vérification:", error);
        document.getElementById('verificationIndicator').style.display = 'none';
        document.getElementById('statusIndicator').innerHTML = 
            `<i class="fas fa-exclamation-triangle"></i> Erreur de vérification: ${error.message}`;
        
        setTimeout(() => {
            resetPrediction();
        }, 3000);
    }
}

// Attendre le prochain jeu
async function waitForNextGame() {
    return new Promise((resolve, reject) => {
        gameStateCheckCount = 0;
        gameStateCheckInterval = setInterval(async () => {
            if (!window.checkLicenseBeforeOperation()) {
                clearInterval(gameStateCheckInterval);
                reject(new Error("Licence expirée"));
                return;
            }
            
            try {
                gameStateCheckCount++;
                
                if (gameStateCheckCount > MAX_GAME_STATE_CHECKS) {
                    clearInterval(gameStateCheckInterval);
                    reject(new Error("Délai d'attente dépassé pour le prochain jeu"));
                    return;
                }
                
                const response = await fetch(apiURL, {
                    method: 'GET',
                    headers: {
                        'customer-id': CUSTOMER_ID,
                        'session-id': SESSION_ID,
                        'accept': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                const gameState = data.game?.state;
                
                if (gameState === 'idle' || gameState === 'flying') {
                    document.getElementById('waitIndicator').style.display = 'none';
                    document.getElementById('playIndicator').style.display = 'inline-block';
                    document.getElementById('statusIndicator').innerHTML = 
                        `<i class="fas fa-play-circle"></i> JOUER - Prêt à miser!`;
                    
                    clearInterval(gameStateCheckInterval);
                    resolve();
                }
            } catch (error) {
                clearInterval(gameStateCheckInterval);
                reject(error);
            }
        }, 1000);
    });
}

// Démarrer la fenêtre de validation de 40 secondes
async function startValidationWindow() {
    if (!window.checkLicenseBeforeOperation()) return;
    
    document.getElementById('verificationIndicator').style.display = 'none';
    document.getElementById('playIndicator').style.display = 'none';
    document.getElementById('validationIndicator').style.display = 'inline-block';
    document.getElementById('progressBarContainer').style.display = 'block';
    
    const progressBar = document.getElementById('progressBar');
    
    document.getElementById('statusIndicator').innerHTML = 
        `<i class="fas fa-search"></i> Validation en cours (${VALIDATION_WINDOW}s)...`;
    
    let validationTimeLeft = VALIDATION_WINDOW;
    let validationSuccess = false;
    let actualMultiplier = null;
    let stateChecked = false;
    let stateCheckScheduled = false;
    
    const updateValidationDisplay = () => {
        document.getElementById('validationIndicator').innerHTML = 
            `<i class="fas fa-clock"></i> Validation en cours: ${validationTimeLeft}s`;
        
        const progressPercentage = ((VALIDATION_WINDOW - validationTimeLeft) / VALIDATION_WINDOW) * 100;
        progressBar.style.width = `${progressPercentage}%`;
    };
    
    updateValidationDisplay();
    
    const scheduleStateCheck = () => {
        if (stateCheckScheduled) return;
        stateCheckScheduled = true;
        
        setTimeout(async () => {
            if (validationTimeLeft <= STATE_CHECK_AT && !validationSuccess) {
                document.getElementById('stateCheckIndicator').style.display = 'inline-block';
                await checkGameStateAtEnd();
                document.getElementById('stateCheckIndicator').style.display = 'none';
            }
        }, (VALIDATION_WINDOW - STATE_CHECK_AT) * 1000);
    };
    
    scheduleStateCheck();
    
    validationInterval = setInterval(async () => {
        if (!window.checkLicenseBeforeOperation()) {
            clearInterval(validationInterval);
            return;
        }
        
        try {
            validationTimeLeft--;
            updateValidationDisplay();
            
            const response = await fetch(apiURL, {
                method: 'GET',
                headers: {
                    'customer-id': CUSTOMER_ID,
                    'session-id': SESSION_ID,
                    'accept': 'application/json'
                }
            });
            
            const data = await response.json();
            
            const currentMultiplier = getActualMultiplierFromData(data);
            
            if (currentMultiplier && currentMultiplier >= currentPrediction.value) {
                validationSuccess = true;
                actualMultiplier = currentMultiplier;
                clearInterval(validationInterval);
                finishValidation(validationSuccess, actualMultiplier);
                return;
            }
            
            if (validationTimeLeft <= 0) {
                clearInterval(validationInterval);
                
                if (stateChecked) {
                    finishValidation(validationSuccess, actualMultiplier);
                } else {
                    document.getElementById('stateCheckIndicator').style.display = 'inline-block';
                    await checkGameStateAtEnd();
                    document.getElementById('stateCheckIndicator').style.display = 'none';
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
        const response = await fetch(apiURL, {
            method: 'GET',
            headers: {
                'customer-id': CUSTOMER_ID,
                'session-id': SESSION_ID,
                'accept': 'application/json'
            }
        });
        
        const data = await response.json();
        const gameState = data.game?.state;
        
        if (gameState === 'flying') {
            document.getElementById('statusIndicator').innerHTML = 
                `<i class="fas fa-rocket"></i> Jeu en cours, attente du résultat...`;
            
            const crashPoint = await waitForGameResult();
            
            if (crashPoint !== null && crashPoint >= currentPrediction.value) {
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
            if (!window.checkLicenseBeforeOperation()) {
                clearInterval(interval);
                reject(new Error("Licence expirée"));
                return;
            }
            
            try {
                checks++;
                const response = await fetch(apiURL, {
                    method: 'GET',
                    headers: {
                        'customer-id': CUSTOMER_ID,
                        'session-id': SESSION_ID,
                        'accept': 'application/json'
                    }
                });
                
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
    if (!window.checkLicenseBeforeOperation()) return;
    
    const multiplierElement = document.getElementById('multiplier');
    const circleInner = document.querySelector('.circle-inner');
    
    document.getElementById('validationIndicator').style.display = 'none';
    document.getElementById('progressBarContainer').style.display = 'none';
    
    if (success) {
        multiplierElement.textContent = 'validé ✅';
        circleInner.style.borderColor = '#10b981';
        circleInner.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.5)';
        circleInner.style.color = '#10b981';
        document.getElementById('statusIndicator').innerHTML = 
            `<i class="fas fa-check-circle"></i> Prédiction validée: ${actualMultiplier.toFixed(2)}X`;
    } else {
        multiplierElement.textContent = 'échoué ❌';
        circleInner.style.borderColor = '#ef4444';
        circleInner.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.5)';
        circleInner.style.color = '#ef4444';
        document.getElementById('statusIndicator').innerHTML = 
            `<i class="fas fa-times-circle"></i> Prédiction échouée`;
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
    if (!window.checkLicenseBeforeOperation()) return;
    
    const multiplierElement = document.getElementById('multiplier');
    const circleInner = document.querySelector('.circle-inner');
    const progressBar = document.getElementById('progressBar');
    
    circleInner.style.borderColor = '';
    circleInner.style.boxShadow = '';
    circleInner.style.color = '';
    circleInner.style.textShadow = '';
    multiplierElement.textContent = '0.00X';
    progressBar.style.width = '0%';
    
    coefficientsHistory = [];
    isPredictionActive = false;
    currentPrediction = null;
    isFlyingState = false;
    flyingCheckCounter = 0;
    stopFlyingStateCheck();
    document.getElementById('verificationIndicator').style.display = 'none';
    document.getElementById('waitIndicator').style.display = 'none';
    document.getElementById('playIndicator').style.display = 'none';
    document.getElementById('validationIndicator').style.display = 'none';
    document.getElementById('stateCheckIndicator').style.display = 'none';
    document.getElementById('progressBarContainer').style.display = 'none';
    
    if (gameStateCheckInterval) {
        clearInterval(gameStateCheckInterval);
        gameStateCheckInterval = null;
    }
    
    if (validationInterval) {
        clearInterval(validationInterval);
        validationInterval = null;
    }
    
    document.getElementById('statusIndicator').innerHTML = 
        `<i class="fas fa-sync fa-spin"></i> Analyse en cours...`;
    
    document.getElementById('countdown').textContent = 'Prochaine prédiction: 00:00';
    document.getElementById('countdown').style.color = '';
}

// Mettre à jour l'affichage du temps de pari
function updateTime(hours, minutes) {
    if (!window.checkLicenseBeforeOperation()) return;
    
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');
    document.getElementById('time').textContent = `Temps: ${formattedHours}:${formattedMinutes}`;
}

// Exposer les variables et fonctions globalement
window.flyingCheckInterval = flyingCheckInterval;
window.gameStateCheckInterval = gameStateCheckInterval;
window.validationInterval = validationInterval;
window.predictionTimeout = predictionTimeout;
window.isPredictionActive = isPredictionActive;

// Attendre que la page soit chargée
document.addEventListener('DOMContentLoaded', function() {
    console.log("Page chargée, attente de l'initialisation Firebase...");
});