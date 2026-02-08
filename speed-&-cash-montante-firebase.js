import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { 
    getFirestore,
    collection,
    query,
    getDocs,
    where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDhySV3lXOlCQ8fMIYRlzs0YpMg6MZ_Ixo",
    authDomain: "gamehub-e45ea.firebaseapp.com",
    projectId: "gamehub-e45ea",
    storageBucket: "gamehub-e45ea.firebasestorage.app",
    messagingSenderId: "609288909968",
    appId: "1:609288909968:web:45f3716ce6b2d4970d1415"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Variables globales pour la licence
let userLicense = null;
let licenseCheckInterval = null;
window.isLicenseValid = false;
let botIntervals = [];

// Vérifier l'état d'authentification et la licence
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Vérifier si l'email est vérifié
        if (!user.emailVerified) {
            showLicenseMessage("Email non vérifié", "Veuillez vérifier votre email pour accéder au bot", true);
            return;
        }
        
        console.log("Utilisateur connecté:", user.uid);
        
        // Vérifier la licence pour Speed & Cash
        await checkUserLicense(user.uid);
        
        // Démarrer la vérification périodique de la licence
        startLicenseCheck();
        
        // Mettre à jour les informations utilisateur
        updateUserInfo(user);
    } else {
        // Rediriger vers la page de connexion si non connecté
        showLicenseMessage("Non connecté", "Vous devez être connecté pour utiliser ce bot", true);
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 3000);
    }
});

// Vérifier la licence de l'utilisateur pour le jeu Speed & Cash
async function checkUserLicense(userId) {
    console.log("Vérification de la licence pour Speed & Cash, utilisateur:", userId);
    
    try {
        const userPurchasesRef = collection(db, 'users', userId, 'purchases');
        
        // Chercher toutes les licences pour 'speed-cash'
        const q = query(
            userPurchasesRef,
            where('gameId', '==', 'speed-cash')
        );
        
        console.log("Exécution de la requête Firestore...");
        const querySnapshot = await getDocs(q);
        console.log("Résultats trouvés:", querySnapshot.size);
        
        if (querySnapshot.empty) {
            console.log("Aucune licence trouvée pour 'speed-cash'");
            showLicenseMessage("Licence non trouvée", "Vous n'avez pas acheté Speed & Cash Pro", true);
            window.isLicenseValid = false;
            updateLicenseIndicator();
            return;
        }
        
        let activeLicense = null;
        let latestLicense = null;
        let now = new Date();
        
        // Parcourir tous les résultats
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log("Document trouvé:", data);
            
            const expirationDate = new Date(data.expirationDate);
            const purchaseDate = new Date(data.purchaseDate);
            
            console.log("Statut:", data.status);
            console.log("Date d'expiration:", expirationDate);
            console.log("Date d'achat:", purchaseDate);
            
            // Vérifier si la licence est active ET non expirée
            if (data.status === 'active' && expirationDate > now) {
                if (!activeLicense || purchaseDate > new Date(activeLicense.purchaseDate)) {
                    activeLicense = {
                        id: doc.id,
                        ...data,
                        expirationDate: expirationDate,
                        purchaseDate: purchaseDate,
                        remainingTime: expirationDate - now
                    };
                }
            }
            
            // Garder la licence la plus récente même si expirée (pour debug)
            if (!latestLicense || purchaseDate > new Date(latestLicense.purchaseDate)) {
                latestLicense = {
                    id: doc.id,
                    ...data,
                    expirationDate: expirationDate,
                    purchaseDate: purchaseDate
                };
            }
        });
        
        if (activeLicense) {
            // Licence active trouvée
            userLicense = activeLicense;
            window.isLicenseValid = true;
            
            const remainingHours = Math.floor(userLicense.remainingTime / (1000 * 60 * 60));
            const remainingMinutes = Math.floor((userLicense.remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            
            console.log("Licence active trouvée:", userLicense);
            console.log("Temps restant:", remainingHours + "h " + remainingMinutes + "m");
            
            // Mettre à jour l'indicateur de licence
            updateLicenseIndicator();
            
            // Démarrer le bot
            startBot();
        } else if (latestLicense) {
            // Afficher les détails de la licence trouvée
            console.log("Licence trouvée mais inactive ou expirée:", latestLicense);
            
            const now = new Date();
            const expirationDate = new Date(latestLicense.expirationDate);
            const isExpired = expirationDate < now;
            const isInactive = latestLicense.status !== 'active';
            
            let message = "Licence ";
            if (isInactive) message += "inactive";
            if (isExpired) message += isInactive ? " et expirée" : "expirée";
            
            showLicenseMessage(
                message,
                `Date d'expiration: ${expirationDate.toLocaleDateString()} ${expirationDate.toLocaleTimeString()}`,
                true
            );
            
            window.isLicenseValid = false;
            updateLicenseIndicator();
        } else {
            console.log("Aucune licence valide trouvée");
            showLicenseMessage("Licence non valide", "Votre licence n'est pas active ou a expiré", true);
            window.isLicenseValid = false;
            updateLicenseIndicator();
        }
        
    } catch (error) {
        console.error('Erreur lors de la vérification de la licence:', error);
        console.error('Détails de l\'erreur:', error.message);
        
        // Afficher un message d'erreur détaillé
        showLicenseMessage(
            "Erreur technique", 
            "Impossible de vérifier votre licence. Veuillez réessayer.", 
            true
        );
        window.isLicenseValid = false;
        updateLicenseIndicator();
    }
}

// Démarrer la vérification périodique de la licence
function startLicenseCheck() {
    if (licenseCheckInterval) {
        clearInterval(licenseCheckInterval);
    }
    
    // Vérifier toutes les 30 secondes
    licenseCheckInterval = setInterval(async () => {
        const user = auth.currentUser;
        if (user && window.isLicenseValid) {
            await checkUserLicense(user.uid);
        }
    }, 30000);
}

// Afficher un message de licence
function showLicenseMessage(title, message, isError = false) {
    const existingMessage = document.getElementById('licenseMessage');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    if (!isError) {
        return;
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.id = 'licenseMessage';
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(220, 53, 69, 0.95);
        color: white;
        padding: 15px 30px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
        text-align: center;
        max-width: 90%;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(220, 53, 69, 0.3);
    `;
    
    messageDiv.innerHTML = `
        <strong style="font-size: 16px;">${title}</strong><br>
        <span style="font-size: 14px;">${message}</span>
        <br><button id="goToStore" style="margin-top: 10px; padding: 8px 16px; background: white; color: #dc3545; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Acheter une licence</button>
    `;
    
    document.body.appendChild(messageDiv);
    
    const goToStoreBtn = document.getElementById('goToStore');
    if (goToStoreBtn) {
        goToStoreBtn.addEventListener('click', () => {
            window.location.href = 'accueil.html';
        });
    }
    
    // Rediriger automatiquement après 5 secondes si licence invalide
    setTimeout(() => {
        if (!window.isLicenseValid) {
            window.location.href = 'accueil.html';
        }
    }, 5000);
}

// Masquer le message de licence
function hideLicenseMessage() {
    const messageDiv = document.getElementById('licenseMessage');
    if (messageDiv) {
        messageDiv.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 300);
    }
}

// Mettre à jour les informations utilisateur
function updateUserInfo(user) {
    const userInfoElement = document.getElementById('userInfo');
    if (userInfoElement) {
        userInfoElement.innerHTML = `
            <div class="flex items-center">
                <div class="user-avatar mr-2">
                    ${user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                </div>
                <div class="text-left">
                    <p class="user-email">${user.email || 'Utilisateur'}</p>
                    <p class="user-subtitle">Speed & Cash Pro</p>
                </div>
            </div>
        `;
    }
}

// Mettre à jour l'indicateur de licence
function updateLicenseIndicator() {
    const licenseIndicator = document.getElementById('licenseIndicator');
    if (licenseIndicator) {
        if (window.isLicenseValid && userLicense) {
            const remainingHours = Math.floor(userLicense.remainingTime / (1000 * 60 * 60));
            const remainingMinutes = Math.floor((userLicense.remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            
            licenseIndicator.innerHTML = `
                <span class="license-dot valid"></span>
                <span class="license-text">Licence: ${remainingHours}h ${remainingMinutes}m</span>
            `;
        } else {
            licenseIndicator.innerHTML = `
                <span class="license-dot expired"></span>
                <span class="license-text">Licence expirée</span>
            `;
        }
    }
}

// Fonction de déconnexion
window.logoutUser = async function() {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
    }
};

// Arrêter le bot
function stopBot() {
    console.log("Arrêt du bot Speed & Cash...");
    
    // Arrêter tous les intervalles du bot
    botIntervals.forEach(interval => {
        clearInterval(interval);
    });
    botIntervals = [];
    
    // Désactiver le bot
    window.isPredictionActive = false;
    
    // Afficher un message d'arrêt
    const multiplierElement = document.getElementById('coefficient');
    if (multiplierElement) {
        multiplierElement.textContent = 'BOT STOPPÉ';
        multiplierElement.style.color = '#dc3545';
    }
    
    const statusIndicator = document.getElementById('statusIndicator');
    if (statusIndicator) {
        statusIndicator.innerHTML = `<i class="fas fa-stop-circle"></i> Bot arrêté - Licence expirée`;
        statusIndicator.style.color = '#dc3545';
    }
    
    showLicenseMessage("Licence expirée", "Votre temps est épuisé. Achetez une nouvelle licence.", true);
}

// Démarrer le bot
function startBot() {
    console.log("Démarrage du bot Speed & Cash...");
    
    // Initialiser le bot
    if (window.updateCurrentTime) {
        window.updateCurrentTime();
    }
    
    // Mettre à jour l'heure toutes les minutes
    botIntervals.push(setInterval(() => {
        if (window.updateCurrentTime) window.updateCurrentTime();
    }, 60000));
    
    // Récupérer les coefficients toutes les 5 secondes
    botIntervals.push(setInterval(() => {
        if (window.fetchLatestCoefficient) window.fetchLatestCoefficient();
    }, 5000));
    
    // Mettre à jour le statut
    const statusIndicator = document.getElementById('statusIndicator');
    if (statusIndicator) {
        statusIndicator.innerHTML = `<i class="fas fa-sync fa-spin"></i> Bot actif - Analyse en cours...`;
    }
    
    console.log("Bot Speed & Cash démarré avec succès");
}

// Fonction pour vérifier la licence avant chaque opération
window.checkLicenseBeforeOperation = function() {
    if (!window.isLicenseValid) {
        console.log("Licence invalide - arrêt de l'opération");
        stopBot();
        return false;
    }
    return true;
};

// Exposer la fonction stopBot globalement
window.stopBotGlobal = stopBot;