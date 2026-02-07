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
window.userLicense = null;
window.isLicenseValid = false;
window.licenseCheckInterval = null;
window.userData = null;

// Vérifier l'état d'authentification et la licence
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Vérifier si l'email est vérifié
        if (!user.emailVerified) {
            showLicenseMessage("Email non vérifié", "Veuillez vérifier votre email pour accéder au prédicteur", true);
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 5000);
            return;
        }
        
        console.log("Utilisateur connecté:", user.uid);
        window.userData = user;
        
        // Vérifier la licence
        await checkUserLicense(user.uid);
        
        // Démarrer la vérification périodique de la licence
        startLicenseCheck();
        
        // Afficher l'info utilisateur
        updateUserInfo(user);
    } else {
        // Rediriger vers la page de connexion si non connecté
        showLicenseMessage("Non connecté", "Vous devez être connecté pour utiliser le prédicteur", true);
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 3000);
    }
});

// Vérifier la licence de l'utilisateur pour le jeu Crime Empire
async function checkUserLicense(userId) {
    console.log("Vérification de la licence pour l'utilisateur:", userId);
    
    try {
        const userPurchasesRef = collection(db, 'users', userId, 'purchases');
        
        // Chercher toutes les licences pour 'crimeempire'
        const q = query(
            userPurchasesRef,
            where('gameId', '==', 'crimeempire')
        );
        
        console.log("Exécution de la requête Firestore...");
        const querySnapshot = await getDocs(q);
        console.log("Résultats trouvés:", querySnapshot.size);
        
        if (querySnapshot.empty) {
            console.log("Aucune licence trouvée pour 'crimeempire'");
            showLicenseMessage("Licence non trouvée", "Vous n'avez pas acheté le prédicteur Crime Empire", true);
            window.isLicenseValid = false;
            disableBotFeatures();
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
            window.userLicense = activeLicense;
            window.isLicenseValid = true;
            
            const remainingHours = Math.floor(window.userLicense.remainingTime / (1000 * 60 * 60));
            const remainingMinutes = Math.floor((window.userLicense.remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            
            console.log("Licence active trouvée:", window.userLicense);
            console.log("Temps restant:", remainingHours + "h " + remainingMinutes + "m");
            
            // Activer les fonctionnalités du bot
            enableBotFeatures();
            
        } else if (latestLicense) {
            // Afficher les détails de la licence trouvée (pour debug)
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
            disableBotFeatures();
        } else {
            console.log("Aucune licence valide trouvée");
            showLicenseMessage("Licence non valide", "Votre licence n'est pas active ou a expiré", true);
            window.isLicenseValid = false;
            disableBotFeatures();
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
        disableBotFeatures();
    }
}

// Démarrer la vérification périodique de la licence
function startLicenseCheck() {
    if (window.licenseCheckInterval) {
        clearInterval(window.licenseCheckInterval);
    }
    
    // Vérifier toutes les 30 secondes
    window.licenseCheckInterval = setInterval(async () => {
        const user = auth.currentUser;
        if (user && window.isLicenseValid) {
            await checkUserLicense(user.uid);
        }
    }, 30000);
}

// Afficher un message de licence (uniquement pour les erreurs)
function showLicenseMessage(title, message, isError = false) {
    const existingMessage = document.getElementById('licenseMessage');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Afficher uniquement les messages d'erreur
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

// Désactiver les fonctionnalités du bot
function disableBotFeatures() {
    console.log("Désactivation des fonctionnalités du bot");
    
    // Arrêter la récupération automatique si active
    if (window.autoFetchInterval) {
        clearInterval(window.autoFetchInterval);
        window.autoFetchInterval = null;
        window.isAutoFetchActive = false;
        
        const statusElement = document.getElementById('autoFetchStatus');
        if (statusElement) {
            statusElement.innerHTML = `
                <span class="bg-red-500 rounded-full w-2 h-2 inline-block mr-1"></span>
                <span>Licence expirée</span>
            `;
        }
    }
    
    // Désactiver les boutons
    const startButton = document.querySelector('button[onclick="startAutoFetch()"]');
    const stopButton = document.querySelector('button[onclick="stopAutoFetch()"]');
    const optionsButton = document.querySelector('button[onclick="openAdvancedSettings()"]');
    const analyzeButton = document.querySelector('button[onclick="analyzeHistoricalData()"]');
    
    if (startButton) {
        startButton.disabled = true;
        startButton.style.opacity = '0.5';
        startButton.style.cursor = 'not-allowed';
    }
    
    if (stopButton) {
        stopButton.disabled = true;
        stopButton.style.opacity = '0.5';
        stopButton.style.cursor = 'not-allowed';
    }
    
    if (optionsButton) {
        optionsButton.disabled = true;
        optionsButton.style.opacity = '0.5';
        optionsButton.style.cursor = 'not-allowed';
    }
    
    if (analyzeButton) {
        analyzeButton.disabled = true;
        analyzeButton.style.opacity = '0.5';
        analyzeButton.style.cursor = 'not-allowed';
    }
    
    // Afficher un indicateur de licence expirée
    const licenseIndicator = document.getElementById('licenseIndicator');
    if (licenseIndicator) {
        licenseIndicator.innerHTML = `
            <span class="bg-red-500 rounded-full w-2 h-2 inline-block mr-1"></span>
            <span class="text-white font-medium">Licence expirée</span>
        `;
    }
    
    // Afficher un message dans la zone de résultats
    const resultElement = document.getElementById('result');
    if (resultElement) {
        resultElement.innerHTML = `
            <div class="text-center p-4">
                <i class="fas fa-crown text-3xl text-yellow-400 mb-3"></i>
                <p class="text-gray-600">Le prédicteur est verrouillé</p>
                <p class="text-sm text-gray-500 mt-1">Activez votre licence pour débloquer toutes les fonctionnalités</p>
            </div>
        `;
    }
}

// Activer les fonctionnalités du bot
function enableBotFeatures() {
    console.log("Activation des fonctionnalités du bot");
    
    // Activer les boutons
    const startButton = document.querySelector('button[onclick="startAutoFetch()"]');
    const stopButton = document.querySelector('button[onclick="stopAutoFetch()"]');
    const optionsButton = document.querySelector('button[onclick="openAdvancedSettings()"]');
    const analyzeButton = document.querySelector('button[onclick="analyzeHistoricalData()"]');
    
    if (startButton) {
        startButton.disabled = false;
        startButton.style.opacity = '1';
        startButton.style.cursor = 'pointer';
    }
    
    if (stopButton) {
        stopButton.disabled = false;
        stopButton.style.opacity = '1';
        stopButton.style.cursor = 'pointer';
    }
    
    if (optionsButton) {
        optionsButton.disabled = false;
        optionsButton.style.opacity = '1';
        optionsButton.style.cursor = 'pointer';
    }
    
    if (analyzeButton) {
        analyzeButton.disabled = false;
        analyzeButton.style.opacity = '1';
        analyzeButton.style.cursor = 'pointer';
    }
    
    // Mettre à jour l'indicateur de licence
    const licenseIndicator = document.getElementById('licenseIndicator');
    if (licenseIndicator) {
        const remainingHours = Math.floor(window.userLicense.remainingTime / (1000 * 60 * 60));
        const remainingMinutes = Math.floor((window.userLicense.remainingTime % (1000 * 60 * 60)) / (1000 * 60));
        
        licenseIndicator.innerHTML = `
            <span class="bg-green-500 rounded-full w-2 h-2 inline-block mr-1"></span>
            <span class="text-white font-medium">Licence: ${remainingHours}h ${remainingMinutes}m</span>
        `;
    }
    
    // Vider la zone de résultats
    const resultElement = document.getElementById('result');
    if (resultElement) {
        resultElement.innerHTML = '';
    }
}

// Mettre à jour les informations utilisateur
function updateUserInfo(user) {
    const userInfoElement = document.getElementById('userInfo');
    if (userInfoElement) {
        userInfoElement.innerHTML = `
            <div class="flex items-center">
                <div class="w-8 h-8 rounded-full bg-gradient-to-r from-yellow-600 to-yellow-400 flex items-center justify-center text-white font-bold mr-2 border border-yellow-300">
                    ${user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                </div>
                <div class="text-left">
                    <p class="text-sm font-medium text-white">${user.email || 'Utilisateur'}</p>
                    <p class="text-xs text-yellow-200">Prédicteur Crime Empire Pro</p>
                </div>
            </div>
        `;
    }
}

// Fonction de déconnexion
window.logoutUser = async function() {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
        Swal.fire({
            icon: 'error',
            title: 'Erreur',
            text: 'Impossible de se déconnecter'
        });
    }
};

// Exposer les fonctions globalement
window.checkLicenseBeforeOperation = function() {
    if (!window.isLicenseValid) {
        Swal.fire({
            icon: 'error',
            title: 'Licence expirée',
            text: 'Votre licence a expiré. Veuillez en acheter une nouvelle.',
            confirmButtonText: 'Acheter une licence',
            showCancelButton: true,
            cancelButtonText: 'Annuler'
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = 'accueil.html';
            }
        });
        return false;
    }
    return true;
};