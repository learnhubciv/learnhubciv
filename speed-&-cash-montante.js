// Variables globales du bot Speed & Cash
let coefficientsHistory = [];
let isPredictionActive = false;
let lastCoefficientValue = null;
let lastFetchTime = null;
let analysisInterval = null;
let currentPrediction = null;

// Configuration de l'API - Utilisant les mêmes identifiants que le premier fichier
const API_URL = "https://crash-gateway-grm-cr.100hp.app/state";
const CUSTOMER_ID = '077dee8d-c923-4c02-9bee-757573662e69';
const SESSION_ID = '1bcca7b0-acfc-4ffd-b526-01b5e199319d'; // Session ID du premier fichier

// Initialiser le compte à rebours
function startCountdownTimer(seconds) {
    let timeLeft = seconds;
    
    const countdownInterval = setInterval(() => {
        if (!window.isLicenseValid) {
            clearInterval(countdownInterval);
            return;
        }
        
        timeLeft--;
        document.getElementById('countdown').textContent = `Prochaine analyse: 00:${timeLeft.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            document.getElementById('countdown').textContent = 'Analyse en cours...';
        }
    }, 1000);
}

// Vérifier si la licence est valide avant chaque opération
function checkLicenseBeforeOperation() {
    if (!window.isLicenseValid) {
        console.log("Licence invalide - arrêt de l'opération");
        if (window.stopBotGlobal) window.stopBotGlobal();
        return false;
    }
    return true;
}

// Mettre à jour l'heure actuelle
function updateCurrentTime() {
    if (!checkLicenseBeforeOperation()) return;
    
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    document.getElementById('time').textContent = `Temps: ${hours}:${minutes}`;
}

// Récupérer le dernier coefficient
async function fetchLatestCoefficient() {
    if (!checkLicenseBeforeOperation()) return;
    
    try {
        console.log('Récupération coefficient depuis API Speed & Cash...');
        
        // Récupération directe depuis l'API
        const response = await fetch(API_URL, {
            method: 'GET',
            headers: {
                'customer-id': CUSTOMER_ID,
                'session-id': SESSION_ID,
                'accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.log('Erreur API (ignorée):', response.status);
            return;
        }

        const data = await response.json();
        
        if (data && data.stopCoefficients && data.stopCoefficients.length > 0) {
            const coefficient = data.stopCoefficients[0];
            const adjustedCoefficient = coefficient === 1.00 ? 1.01 : coefficient;
            const roundedCoefficient = parseFloat(adjustedCoefficient.toFixed(2));
            const now = Date.now();
            
            // Vérifier les doublons
            if (lastCoefficientValue === roundedCoefficient && lastFetchTime && (now - lastFetchTime) < 7000) {
                return;
            }
            
            lastCoefficientValue = roundedCoefficient;
            lastFetchTime = now;
            
            // Afficher le coefficient
            document.getElementById('coefficient').textContent = roundedCoefficient.toFixed(2);
            
            // Mettre à jour l'indicateur
            document.getElementById('coefficientIndicator').style.display = 'inline-block';
            document.getElementById('lastCoefficient').textContent = roundedCoefficient.toFixed(2);
            
            // Ajouter à l'historique
            coefficientsHistory.push(roundedCoefficient);
            if (coefficientsHistory.length > 10) {
                coefficientsHistory.shift();
            }
            
            // Mettre à jour le statut
            document.getElementById('statusIndicator').innerHTML = 
                `<i class="fas fa-check-circle"></i> Coefficient: ${roundedCoefficient.toFixed(2)}`;
            
            // Démarrer l'analyse si on a assez de données
            if (coefficientsHistory.length >= 3) {
                startAnalysis();
            }
        } else {
            console.log('Aucun coefficient disponible');
        }
    } catch (error) {
        console.log("Erreur lors de la récupération (ignorée):", error.message);
    }
}

// Démarrer l'analyse
function startAnalysis() {
    if (!checkLicenseBeforeOperation() || isPredictionActive) return;
    
    document.getElementById('analysisIndicator').style.display = 'inline-block';
    
    // Utiliser les 3 derniers coefficients pour l'analyse
    const recentCoefficients = coefficientsHistory.slice(-3);
    
    // Calculer la prédiction (logique simplifiée du premier fichier)
    const mean = recentCoefficients.reduce((a, b) => a + b, 0) / recentCoefficients.length;
    
    // Appliquer la marge selon les règles du premier fichier
    let margin = 0;
    if (mean < 2.00) {
        margin = 0.15; // 15%
    } else if (mean < 3.00) {
        margin = 0.25; // 25%
    } else {
        margin = 0.35; // 35%
    }
    
    const prediction = mean * (1 - margin);
    const finalPrediction = parseFloat(prediction.toFixed(2));
    
    currentPrediction = {
        value: finalPrediction,
        rawValue: mean.toFixed(2),
        marginPercentage: (margin * 100).toFixed(0),
        timestamp: new Date()
    };
    
    // Afficher la prédiction
    document.getElementById('coefficient').textContent = finalPrediction.toFixed(2);
    document.getElementById('predictionIndicator').style.display = 'inline-block';
    document.getElementById('currentPrediction').textContent = finalPrediction.toFixed(2);
    
    // Animation pour la prédiction
    const circleInner = document.querySelector('.circle-inner');
    circleInner.style.color = '#92400e';
    circleInner.style.textShadow = '0 0 15px rgba(245, 158, 11, 0.8)';
    
    document.getElementById('statusIndicator').innerHTML = 
        `<i class="fas fa-bolt"></i> Prédiction: ${finalPrediction.toFixed(2)} (Marge: ${currentPrediction.marginPercentage}%)`;
    
    document.getElementById('analysisIndicator').style.display = 'none';
    
    // Démarrer la vérification
    startVerification(finalPrediction);
}

// Démarrer la vérification de la prédiction
function startVerification(predictionValue) {
    if (!checkLicenseBeforeOperation()) return;
    
    isPredictionActive = true;
    let verificationTime = 0;
    const maxVerificationTime = 40; // 40 secondes de vérification
    
    document.getElementById('verificationIndicator').style.display = 'inline-block';
    document.getElementById('verificationStatus').textContent = '0s/' + maxVerificationTime + 's';
    
    const verificationInterval = setInterval(() => {
        if (!checkLicenseBeforeOperation()) {
            clearInterval(verificationInterval);
            return;
        }
        
        verificationTime++;
        document.getElementById('verificationStatus').textContent = verificationTime + 's/' + maxVerificationTime + 's';
        
        // Vérifier si la prédiction est atteinte
        if (lastCoefficientValue && lastCoefficientValue >= predictionValue) {
            // Prédiction réussie
            clearInterval(verificationInterval);
            finishVerification(true, lastCoefficientValue);
            return;
        }
        
        // Si le temps de vérification est écoulé
        if (verificationTime >= maxVerificationTime) {
            clearInterval(verificationInterval);
            finishVerification(false, null);
        }
    }, 1000);
}

// Terminer la vérification
function finishVerification(success, actualValue) {
    if (!checkLicenseBeforeOperation()) return;
    
    const circleInner = document.querySelector('.circle-inner');
    
    if (success) {
        circleInner.style.borderColor = '#22c55e';
        circleInner.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.5)';
        circleInner.style.color = '#166534';
        document.getElementById('coefficient').textContent = '✅ ' + actualValue.toFixed(2);
        document.getElementById('statusIndicator').innerHTML = 
            `<i class="fas fa-check-circle"></i> Prédiction validée: ${actualValue.toFixed(2)}`;
        document.getElementById('verificationStatus').textContent = 'Validée';
    } else {
        circleInner.style.borderColor = '#dc3545';
        circleInner.style.boxShadow = '0 0 20px rgba(220, 53, 69, 0.5)';
        circleInner.style.color = '#b91c1c';
        document.getElementById('coefficient').textContent = '❌ ' + currentPrediction.value.toFixed(2);
        document.getElementById('statusIndicator').innerHTML = 
            `<i class="fas fa-times-circle"></i> Prédiction échouée`;
        document.getElementById('verificationStatus').textContent = 'Échouée';
    }
    
    setTimeout(() => {
        resetPrediction();
    }, 3000);
}

// Réinitialiser la prédiction
function resetPrediction() {
    if (!checkLicenseBeforeOperation()) return;
    
    const circleInner = document.querySelector('.circle-inner');
    circleInner.style.borderColor = '';
    circleInner.style.boxShadow = '';
    circleInner.style.color = '';
    circleInner.style.textShadow = '';
    
    document.getElementById('coefficient').textContent = '0.00';
    document.getElementById('coefficientIndicator').style.display = 'none';
    document.getElementById('analysisIndicator').style.display = 'none';
    document.getElementById('predictionIndicator').style.display = 'none';
    document.getElementById('verificationIndicator').style.display = 'none';
    
    isPredictionActive = false;
    currentPrediction = null;
    
    document.getElementById('statusIndicator').innerHTML = 
        `<i class="fas fa-sync fa-spin"></i> Analyse en cours...`;
    
    document.getElementById('countdown').textContent = 'Prochaine analyse: 00:05';
    
    // Redémarrer le compte à rebours
    startCountdownTimer(5);
}

// Arrêt manuel du bot
function stopBot() {
    console.log("Arrêt manuel du bot Speed & Cash...");
    
    // Arrêter tous les intervalles
    if (analysisInterval) {
        clearInterval(analysisInterval);
        analysisInterval = null;
    }
    
    isPredictionActive = false;
    coefficientsHistory = [];
    
    const circleInner = document.querySelector('.circle-inner');
    circleInner.style.borderColor = '';
    circleInner.style.boxShadow = '';
    circleInner.style.color = '';
    circleInner.style.textShadow = '';
    
    document.getElementById('coefficient').textContent = 'STOPPÉ';
    document.getElementById('statusIndicator').innerHTML = 
        `<i class="fas fa-stop-circle"></i> Bot arrêté manuellement`;
}

// Exposer les fonctions globalement
window.updateCurrentTime = updateCurrentTime;
window.fetchLatestCoefficient = fetchLatestCoefficient;
window.stopBot = stopBot;

// Attendre que le DOM soit chargé
document.addEventListener('DOMContentLoaded', function() {
    console.log("Speed & Cash Pro chargé, initialisation...");
    
    // Démarrer le compte à rebours initial
    startCountdownTimer(5);
});