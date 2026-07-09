// 369 Laundry Web Application - Frontend Controller & Audio Synthesizer

// Core State
let currentUser = null;
let currentBasket = [];
let orders = [];
let activeOrder = null;
let activeCustomerPanel = 'book';
let activeAddressType = 'home';
let chartInstance = null;
let activeLogTab = 'wa';
let activeCoupon = null;
let availableCoupons = JSON.parse(localStorage.getItem('available_coupons')) || [
    { code: 'WELCOME10', type: 'percent', value: 10 },
    { code: 'LAUNDRY20', type: 'percent', value: 20 },
    { code: 'FREESHIP', type: 'flat', value: 50 }
];
function saveCouponsToStorage() {
    localStorage.setItem('available_coupons', JSON.stringify(availableCoupons));
}

// Three.js washer instance
let washer3D = null;

// Leaflet Map instance
let bookingMap = null;
let bookingMarker = null;

// Audio System State
let audioCtx = null;
let motorOsc = null;
let motorGain = null;
let waterNoise = null;
let waterGain = null;

// API Configurations and Fallback State
const API_BASE = window.location.origin === "file://" ? "http://localhost:3000/api" : `${window.location.origin}/api`;
let useLocalFallback = false;

// 30-item Premium Price Catalog
const priceCatalog = {
    // Weight-based (₹ / kg)
    "wash_fold_normal": { name: "Wash & Fold (Normal)", price: 35, unit: "kg" },
    "wash_fold_organic": { name: "Wash & Fold (Organic)", price: 45, unit: "kg" },
    "wash_fold_organic_ezee": { name: "Wash & Fold (Organic Ezee)", price: 55, unit: "kg" },
    "wash_fold_ezee": { name: "Wash & Fold (Ezee)", price: 45, unit: "kg" },
    "wash_fold_whites": { name: "Wash & Fold (Whites)", price: 60, unit: "kg" },
    "wash_iron_normal": { name: "Wash & Iron (Normal)", price: 45, unit: "kg" },
    "wash_iron_organic": { name: "Wash & Iron (Organic)", price: 55, unit: "kg" },
    "wash_iron_organic_ezee": { name: "Wash & Iron (Organic Ezee)", price: 65, unit: "kg" },
    "wash_iron_ezee": { name: "Wash & Iron (Ezee)", price: 55, unit: "kg" },
    "wash_iron_whites": { name: "Wash & Iron (Whites)", price: 70, unit: "kg" },

    // Piece-based (₹ / pair)
    "shoe_cleaning_machine": { name: "Shoe Cleaning (Machine)", price: 70, unit: "pair" },
    "shoe_cleaning_hand_wash": { name: "Shoe Cleaning (Hand Wash)", price: 100, unit: "pair" },
    "shoe_cleaning_deep_clean": { name: "Shoe Cleaning (Deep Clean)", price: 150, unit: "pair" },

    // Piece-based (₹ / pcs)
    "bag_cleaning_machine": { name: "Bag Cleaning (Machine)", price: 70, unit: "pcs" },
    "bag_cleaning_hand_wash": { name: "Bag Cleaning (Hand Wash)", price: 100, unit: "pcs" },
    "bag_cleaning_deep_clean": { name: "Bag Cleaning (Deep Clean)", price: 150, unit: "pcs" },
    "soft_toy_cleaning_machine": { name: "Soft Toy Cleaning (Machine)", price: 70, unit: "pcs" },
    "soft_toy_cleaning_hand_wash": { name: "Soft Toy Cleaning (Hand Wash)", price: 100, unit: "pcs" },
    "soft_toy_cleaning_deep_clean": { name: "Soft Toy Cleaning (Deep Clean)", price: 150, unit: "pcs" },
    "stain_treatment_white": { name: "Stain Treatment (White Clothes)", price: 70, unit: "pcs" },
    "stain_treatment_colored": { name: "Stain Treatment (Colored Clothes)", price: 100, unit: "pcs" },
    "color_dye_basic": { name: "Color Dye (Basic)", price: 150, unit: "pcs" },
    "color_dye_premium": { name: "Color Dye (Premium)", price: 250, unit: "pcs" },
    "dry_cleaning_basic": { name: "Dry Cleaning (Basic)", price: 100, unit: "pcs" },
    "dry_cleaning_premium": { name: "Dry Cleaning (Premium)", price: 150, unit: "pcs" },
    "blanket_cleaning_single": { name: "Blanket Cleaning (Single)", price: 300, unit: "pcs" },
    "blanket_cleaning_double": { name: "Blanket Cleaning (Double)", price: 450, unit: "pcs" },
    "blanket_dry_cleaning_single": { name: "Blanket Dry Cleaning (Single)", price: 400, unit: "pcs" },
    "blanket_dry_cleaning_double": { name: "Blanket Dry Cleaning (Double)", price: 600, unit: "pcs" },
    "only_iron": { name: "Only Iron", price: 10, unit: "pcs" }
};

// INITIALIZE APP
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize 3D Washer if container element exists
    // const canvasContainer = document.getElementById('three-canvas-container');
    // if (canvasContainer) {
    //     washer3D = new LaundryWasher('three-canvas-container');
    // }

    // 2. Set min date for pickup input to today
    const dateInput = document.getElementById('pickup-date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        dateInput.min = today;
    }

    // 3. Setup Navigation tabs
    const navButtons = document.querySelectorAll('.nav-menu .nav-btn');
    navButtons.forEach(btn => {
        if (btn.id !== 'nav-logout-btn') {
            btn.addEventListener('click', () => {
                const tabName = btn.getAttribute('data-tab');
                switchTab(tabName);
            });
        }
    });

    updateGuestFieldsVisibility();

    // 4. Initialize dropdown logic
    onServiceSelectChange();
    setTimeout(() => {
        initBookingMap();
    }, 600);

    // 5. Initialize Charts (Admin Pane)
    initAdminChart();

    // Restore user session from localStorage if present
    const storedUser = localStorage.getItem('washing_basket_user');
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            applyLoginState(currentUser);
        } catch (e) {
            console.error("Failed to restore session from localStorage:", e);
        }
    }

    // 6. Test connection to backend and load initial data
    await checkBackendConnection();
    await syncAppData();

    // 6.1 Check for Reset Token URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const resetTokenParam = urlParams.get('resetToken');
    const resetEmailParam = urlParams.get('email');
    if (resetTokenParam && resetEmailParam) {
        showToast("Password reset link detected. Opening password reset form.", "info");
        const resetEmail = document.getElementById('reset-email');
        const resetTokenInput = document.getElementById('reset-token');
        if (resetEmail) resetEmail.value = resetEmailParam;
        if (resetTokenInput) resetTokenInput.value = resetTokenParam;
        showAuthMode('reset');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // 7. Start polling sync if connected
    setInterval(async () => {
        if (!useLocalFallback) {
            await syncAppData();
            if (currentUser && currentUser.role === 'admin') {
                await syncEmailLogs();
                if (typeof activeAdminSubTab !== 'undefined' && activeAdminSubTab === 'valets') {
                    await syncValetsData();
                } else {
                    await syncCustomersData();
                }
            }
        }
    }, 4000);
});

// TAB ROUTING
function switchTab(tabName) {
    if (tabName === 'customer-book') {
        switchTab('landing');
        setTimeout(() => {
            const container = document.getElementById('landing-booking-container');
            if (container) {
                container.scrollIntoView({ behavior: 'smooth' });
                container.style.boxShadow = '0 0 15px var(--color-coral-pulse)';
                setTimeout(() => { container.style.boxShadow = ''; }, 1500);
            }
        }, 200);
        return;
    }
    if (tabName === 'customer-track') {
        switchTab('landing');
        setTimeout(() => {
            const container = document.getElementById('landing-tracking-section');
            if (container) {
                container.scrollIntoView({ behavior: 'smooth' });
                container.style.boxShadow = '0 0 15px var(--color-coral-pulse)';
                setTimeout(() => { container.style.boxShadow = ''; }, 1500);
            }
        }, 200);
        return;
    }

    if ((tabName.startsWith('customer-') || tabName === 'customer') && !currentUser) {
        showAuthMode('signin');
        return;
    }

    // Update active nav button
    document.querySelectorAll('.nav-menu .nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    // Determine which main panel to display
    let targetPanel = 'landing';
    if (tabName === 'gatekeeper' || tabName === 'login') {
        targetPanel = 'login';
    } else if (tabName.startsWith('customer-') || tabName === 'customer') {
        targetPanel = 'customer';
    } else if (tabName === 'admin') {
        targetPanel = 'admin';
    }

    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `panel-${targetPanel}`);
    });

    // Update headers if present
    const title = document.getElementById('page-title');
    const subtitle = document.getElementById('page-subtitle');
    
    if (title && subtitle) {
        if (targetPanel === 'landing') {
            title.innerText = "369 Laundry Overview";
            subtitle.innerText = "Experience automated laundry tracking with instant WhatsApp and Email updates.";
        } else if (targetPanel === 'customer') {
            title.innerText = "Customer Dashboard";
            subtitle.innerText = currentUser ? `Welcome back, ${currentUser.name}. Manage your bookings.` : "Sign in to place orders.";
        } else if (targetPanel === 'admin') {
            const isValet = currentUser && currentUser.role === 'valet';
            title.innerText = isValet ? "Valet Logistical Console" : "Admin Operations Center";
            subtitle.innerText = isValet ? "Scan customer tickets, update laundry stages, and weigh bookings." : "Track operational statuses, dispatch drivers, and view financials.";
        }
    }

    if (targetPanel === 'customer' && currentUser) {
        const authCard = document.getElementById('customer-auth');
        const dashCard = document.getElementById('customer-dashboard');
        if (authCard) authCard.style.display = 'none';
        if (dashCard) dashCard.style.display = 'block';
        
        const greetingTitle = document.getElementById('customer-greeting-title');
        if (greetingTitle) {
            greetingTitle.innerText = `Welcome back, ${currentUser.name}`;
        }
        
        if (tabName === 'customer-book' || tabName === 'customer') {
            switchCustomerPanel('book');
        } else if (tabName === 'customer-track' || tabName === 'customer-history') {
            switchCustomerPanel(tabName.split('-')[1]);
        }
    }
}

// BACKEND CONNECTIVITY & SYNC HELPERS
async function checkBackendConnection() {
    try {
        const response = await fetch(`${API_BASE}/orders?role=admin`);
        if (response.ok) {
            console.log("Connected to 369 Laundry Backend Server.");
            useLocalFallback = false;
        } else {
            throw new Error();
        }
    } catch (e) {
        console.warn("Backend server offline. Running in Local Memory Fallback Mode.");
        useLocalFallback = true;
        showToast("Backend Server Offline. Running in simulated offline mode.", "warning");
    }
}

async function syncAppData() {
    if (useLocalFallback) {
        renderAdminOrdersTable();
        updateAdminStats();
        return;
    }

    try {
        const resAdmin = await fetch(`${API_BASE}/orders?role=admin`);
        if (!resAdmin.ok) throw new Error("Sync failed");
        const allOrders = await resAdmin.json();
        
        if (Array.isArray(allOrders)) {
            orders = allOrders;
            
            if (activeOrder) {
                const matched = orders.find(o => o.orderId === activeOrder.orderId);
                if (matched) {
                    if (activeOrder.status !== matched.status || activeOrder.amount !== matched.amount) {
                        if (activeOrder.status !== matched.status) {
                            showToast(`Order status updated to: ${matched.status.replace('_', ' ')}`, 'info');
                            sync3DWasherWithOrder(matched.status);
                        } else {
                            showToast(`Final bill updated: ₹${matched.amount.toFixed(2)}`, 'success');
                        }
                        playBeep(659.25, 0.1, 0); 
                    }
                    activeOrder = matched;
                    renderActiveOrderTracking();
                    updateCustomerActiveBadge();
                }
            }
        }

        renderAdminOrdersTable();
        updateAdminStats();
        if (currentUser && currentUser.role === 'admin') {
            if (typeof activeAdminSubTab !== 'undefined' && activeAdminSubTab === 'valets') {
                await syncValetsData();
            } else {
                await syncCustomersData();
            }
        }
    } catch (e) {
        console.warn("Sync failed. Server might have gone offline.", e.message);
        renderAdminOrdersTable();
        updateAdminStats();
        if (currentUser && currentUser.role === 'admin') {
            if (typeof activeAdminSubTab !== 'undefined' && activeAdminSubTab === 'valets') {
                renderAdminValetsTable([]);
            } else {
                renderAdminCustomersTable([]);
            }
        }
    }
}

async function loadSavedAddresses() {
    if (useLocalFallback || !currentUser) return;
    try {
        const res = await fetch(`${API_BASE}/users/addresses?phone=${encodeURIComponent(currentUser.phone)}`);
        if (!res.ok) throw new Error();
        const addresses = await res.json();
        
        if (addresses && addresses.length > 0) {
            const lastAddr = addresses[addresses.length - 1];
            const addrStr = lastAddr.address_line || "";
            
            let apartment = "";
            let locality = "";
            let landmark = "";
            
            const landmarkMatch = addrStr.match(/\(Landmark:\s*([^)]+)\)/i);
            let baseAddr = addrStr;
            if (landmarkMatch) {
                landmark = landmarkMatch[1].trim();
                baseAddr = addrStr.replace(/\(Landmark:\s*[^)]+\)/i, "").trim();
            }
            
            const parts = baseAddr.split(',');
            if (parts.length >= 2) {
                apartment = parts[0].trim();
                locality = parts.slice(1).join(',').trim();
            } else {
                apartment = baseAddr.trim();
            }
            
            const aptEl = document.getElementById('pickup-address-apartment');
            const locEl = document.getElementById('pickup-address-locality');
            const lndEl = document.getElementById('pickup-address-landmark');
            
            if (aptEl) aptEl.value = apartment;
            if (locEl) locEl.value = locality;
            if (lndEl) lndEl.value = landmark;
            
            const typeBtn = Array.from(document.querySelectorAll('.addr-type-btn'))
                .find(btn => btn.innerText.toLowerCase() === lastAddr.type.toLowerCase());
            if (typeBtn) selectAddressType(typeBtn, lastAddr.type);
        }
    } catch (e) {
        console.warn("Error loading saved addresses:", e.message);
    }
}


// AUDIO SYNTHESIS SYSTEM (Web Audio API)
function initAudio() {
    if (audioCtx) return; 
    
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        
        // 1. Motor Hum Setup
        motorOsc = audioCtx.createOscillator();
        motorOsc.type = 'sine';
        motorOsc.frequency.setValueAtTime(45, audioCtx.currentTime); 
        
        motorGain = audioCtx.createGain();
        motorGain.gain.setValueAtTime(0, audioCtx.currentTime); 
        
        motorOsc.connect(motorGain);
        motorGain.connect(audioCtx.destination);
        motorOsc.start(0);

        // 2. Water Noise Setup
        const bufferSize = audioCtx.sampleRate * 2;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        waterNoise = audioCtx.createBufferSource();
        waterNoise.buffer = noiseBuffer;
        waterNoise.loop = true;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(400, audioCtx.currentTime);
        filter.Q.setValueAtTime(1.0, audioCtx.currentTime);

        waterGain = audioCtx.createGain();
        waterGain.gain.setValueAtTime(0, audioCtx.currentTime);

        waterNoise.connect(filter);
        filter.connect(waterGain);
        waterGain.connect(audioCtx.destination);
        waterNoise.start(0);
        
    } catch (e) {
        console.warn("Web Audio API not supported on this browser:", e);
    }
}

function playBeep(freq, duration, delay) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + delay + 0.02);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime + delay + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + delay + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime + delay);
    osc.stop(audioCtx.currentTime + delay + duration);
}

function playCompletionBeeps() {
    playBeep(523.25, 0.12, 0);     // C5
    playBeep(659.25, 0.12, 0.15);  // E5
    playBeep(783.99, 0.12, 0.30);  // G5
    playBeep(1046.50, 0.25, 0.45); // C6
}

function updateSynthSound(rpm, phase) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') return;

    if (rpm > 5) {
        motorGain.gain.setTargetAtTime(Math.min(0.2, 0.02 + (rpm / 800) * 0.18), audioCtx.currentTime, 0.1);
        const pitch = 45 + (rpm / 800) * 90;
        motorOsc.frequency.setTargetAtTime(pitch, audioCtx.currentTime, 0.1);
    } else {
        motorGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.2);
    }

    if (phase === 'filling') {
        waterGain.gain.setTargetAtTime(0.15, audioCtx.currentTime, 0.5); 
    } else if (phase === 'washing' || phase === 'rinsing') {
        const sloshVol = 0.08 + Math.abs(Math.sin(Date.now() / 800)) * 0.10;
        waterGain.gain.setTargetAtTime(sloshVol, audioCtx.currentTime, 0.2);
    } else {
        waterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.5);
    }
}


// ROLE-BASED ACCESS & AUTH CONSOLE
function showAuthMode(mode) {
    initAudio(); 
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // Toggle forms
    const signinForm = document.getElementById('signin-form');
    const signupForm = document.getElementById('signup-form');
    const adminForm = document.getElementById('admin-login-form');
    const forgotForm = document.getElementById('forgot-password-form');
    const resetForm = document.getElementById('reset-password-form');
    
    if (signinForm) signinForm.style.display = mode === 'signin' ? 'block' : 'none';
    if (signupForm) signupForm.style.display = mode === 'signup' ? 'block' : 'none';
    if (adminForm) adminForm.style.display = mode === 'admin' ? 'block' : 'none';
    if (forgotForm) forgotForm.style.display = mode === 'forgot' ? 'block' : 'none';
    if (resetForm) resetForm.style.display = mode === 'reset' ? 'block' : 'none';

    // Toggle tab headers container visibility
    const tabsContainer = document.getElementById('auth-tabs-container');
    if (tabsContainer) {
        tabsContainer.style.display = (mode === 'forgot' || mode === 'reset') ? 'none' : 'flex';
    }

    // Toggle tab headers active state if present
    const tabSignin = document.getElementById('auth-tab-signin');
    const tabSignup = document.getElementById('auth-tab-signup');
    const tabAdmin = document.getElementById('auth-tab-admin');
    
    if (tabSignin) tabSignin.classList.toggle('active', mode === 'signin');
    if (tabSignup) tabSignup.classList.toggle('active', mode === 'signup');
    if (tabAdmin) tabAdmin.classList.toggle('active', mode === 'admin');

    // Switch tab to gatekeeper
    switchTab('gatekeeper');
    
    // Hide dashboard contents
    const authCard = document.getElementById('customer-auth');
    const dashCard = document.getElementById('customer-dashboard');
    if (authCard) authCard.style.display = 'block';
    if (dashCard) dashCard.style.display = 'none';
}

async function handleSignInSubmit(e) {
    e.preventDefault();
    const rawPhone = document.getElementById('signin-phone').value.trim();
    const password = document.getElementById('signin-password').value;

    const phone = normalizePhoneNumber(rawPhone);

    if (!useLocalFallback) {
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                applyLoginState(data.user);
                showToast(`Signed in successfully. Welcome back, ${currentUser.name}!`, 'success');
            } else {
                showToast(data.error || "Authentication failed", "danger");
                alert(data.error || "Authentication failed: Incorrect phone number or password.");
                playBeep(220, 0.25, 0); 
            }
        } catch (err) {
            console.error("Login API error:", err);
            showToast("Server error connecting to database.", "danger");
            alert("Server error connecting to database.");
        }
    } else {
        if (phone === 'admin') {
            alert("To log in as administrator, please use the STAFF login tab.");
        } else {
            const seedCusts = {
                "+919823045678": "Amit Patel",
                "+918839012345": "Priya Nair",
                "+917738299221": "Vikram Singh",
                "+919999988888": "Rahul Sharma"
            };
            const custName = seedCusts[phone] || "Offline Customer";
            applyLoginState({ name: custName, phone, email: "offline@369laundry.com", role: "customer" });
            showToast("Signed in successfully (Simulated memory mode)", "success");
        }
    }
}

// Validation Helper Functions
function isValidIndianPhoneNumber(phone) {
    if (!phone) return false;
    const clean = phone.replace(/[\s\-\(\)\+]/g, '');
    if (clean.length === 12 && clean.startsWith('91')) {
        return /^[6-9]\d{9}$/.test(clean.substring(2));
    }
    if (clean.length === 10) {
        return /^[6-9]\d{9}$/.test(clean);
    }
    return false;
}

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    const clean = phone.replace(/[\s\-\(\)\+]/g, '');
    if (clean.length === 12 && clean.startsWith('91')) {
        return '+91' + clean.substring(2);
    }
    if (clean.length === 10) {
        return '+91' + clean;
    }
    return phone;
}

function isValidEmail(email) {
    if (!email) return false;
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(String(email).toLowerCase().trim());
}

async function handleSignUpSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const rawPhone = document.getElementById('signup-phone').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const phone = normalizePhoneNumber(rawPhone);
    const password = document.getElementById('signup-password').value;

    if (!name) {
        showToast("Full Name is required.", "danger");
        return;
    }

    if (!isValidEmail(email)) {
        showToast("Invalid email address format. Must be user@domain.com.", "danger");
        return;
    }

    if (!isValidIndianPhoneNumber(phone)) {
        showToast("Invalid Indian phone number. Please enter a valid 10-digit mobile number.", "danger");
        return;
    }

    if (password.length < 6) {
        showToast("Password must be at least 6 characters long for security.", "danger");
        return;
    }

    if (!useLocalFallback) {
        try {
            const res = await fetch(`${API_BASE}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, email, password })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                applyLoginState(data.user);
                showToast(`Registration complete. Welcome to 369 Laundry, ${name}!`, 'success');
            } else {
                showToast(data.error || "Sign Up failed", "danger");
                playBeep(220, 0.25, 0); 
            }
        } catch (err) {
            console.error("Signup API error:", err);
            showToast("Server error connecting to database.", "danger");
        }
    } else {
        applyLoginState({ name, phone, email, role: "customer" });
        showToast(`Registration complete (Simulated memory mode). Welcome, ${name}!`, 'success');
    }
}

async function handleAdminLoginSubmit(e) {
    e.preventDefault();
    const rawPhone = document.getElementById('admin-login-phone').value.trim();
    const password = document.getElementById('admin-login-password').value;

    const phone = normalizePhoneNumber(rawPhone);

    if (!useLocalFallback) {
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                applyLoginState(data.user);
                showToast(`Administrator authenticated successfully. Welcome, Admin.`, 'success');
                switchTab('admin');
            } else {
                showToast(data.error || "Access denied.", "danger");
                alert(data.error || "Access denied: Incorrect staff credentials.");
                playBeep(220, 0.25, 0); 
            }
        } catch (err) {
            console.error("Admin login API error:", err);
            showToast("Server error connecting to database.", "danger");
            alert("Server error connecting to database.");
        }
    } else {
        if ((phone === 'admin' || phone === '8699013959' || phone === '+918699013959') && password === 'ADMIN123') {
            applyLoginState({ name: "Admin Manager", phone: phone, email: "admin@369laundry.com", role: "admin" });
            showToast("Admin authenticated successfully (Simulated memory mode)", "success");
            switchTab('admin');
        } else {
            alert("Incorrect admin credentials in simulated mode. Use phone: admin or 8699013959 and password: ADMIN123.");
        }
    }
}

function applyLoginState(user) {
    currentUser = user;
    localStorage.setItem('washing_basket_user', JSON.stringify(user));

    // Update mobile bottom navigation bar dynamically
    const mobDash = document.getElementById('mobile-nav-dashboard');
    const mobDashText = document.getElementById('mobile-nav-dashboard-text');
    const mobAuthIcon = document.getElementById('mobile-nav-auth-icon');
    const mobAuthText = document.getElementById('mobile-nav-auth-text');

    if (mobDash) mobDash.style.display = 'flex';
    if (mobDashText) {
        mobDashText.innerText = (user.role === 'admin' || user.role === 'valet') ? 'Control' : 'Dashboard';
    }
    if (mobAuthIcon) mobAuthIcon.innerText = 'logout';
    if (mobAuthText) mobAuthText.innerText = 'Logout';

    // Header updates
    document.querySelector('.profile-name').innerText = user.name;
    document.querySelector('.profile-role').innerText = user.role.toUpperCase();
    document.getElementById('profile-indicator').style.borderColor = 'rgba(0,0,0,0.1)';

    const avatarLetter = document.getElementById('profile-avatar-letter');
    if (avatarLetter) {
        avatarLetter.innerText = user.name.charAt(0).toUpperCase();
    }

    // Toggle navigation panels
    document.getElementById('nav-btn-gate').style.display = 'none';
    document.getElementById('nav-logout-btn').style.display = 'flex';

    if (user.role === 'admin' || user.role === 'valet') {
        document.getElementById('nav-customer-menu').style.display = 'none';
        document.getElementById('nav-admin-menu').style.display = 'flex';
        syncEmailLogs();
    } else {
        document.getElementById('nav-customer-menu').style.display = 'flex';
        document.getElementById('nav-admin-menu').style.display = 'none';
        loadSavedAddresses();
    }

    // Toggle customer page dashboard view
    const authCard = document.getElementById('customer-auth');
    const dashCard = document.getElementById('customer-dashboard');
    if (authCard) authCard.style.display = 'none';
    if (dashCard) dashCard.style.display = 'block';

    // Differentiate admin/valet views
    const revenueCard = document.getElementById('revenueChart') ? document.getElementById('revenueChart').closest('.lg\\:col-span-5') : null;
    const seedBtn = document.querySelector('button[onclick="seedSampleOrders()"]');
    const customersTab = document.getElementById('admin-subtab-btn-customers');
    const valetsTab = document.getElementById('admin-subtab-btn-valets');

    if (user.role === 'valet') {
        if (revenueCard) revenueCard.style.display = 'none';
        if (seedBtn) seedBtn.style.display = 'none';
        if (customersTab) customersTab.style.display = 'none';
        setTimeout(() => {
            if (valetsTab) switchAdminSubTab('valets');
        }, 100);
    } else {
        if (revenueCard) revenueCard.style.display = 'block';
        if (seedBtn) seedBtn.style.display = 'inline-flex';
        if (customersTab) customersTab.style.display = 'inline-block';
        setTimeout(() => {
            if (customersTab) switchAdminSubTab('customers');
        }, 100);
    }

    // Refresh data
    syncAppData();
    updateGuestFieldsVisibility();

    playBeep(880, 0.15, 0);

    // Redirect to respective dashboard
    if (user.role === 'admin' || user.role === 'valet') {
        switchTab('admin');
    } else {
        switchTab('customer');
    }
}

function handleLogout() {
    currentUser = null;
    activeOrder = null;
    currentBasket = [];
    localStorage.removeItem('washing_basket_user');
    renderBasket();

    // Reset mobile navigation bar to guest states
    const mobDash = document.getElementById('mobile-nav-dashboard');
    const mobAuthIcon = document.getElementById('mobile-nav-auth-icon');
    const mobAuthText = document.getElementById('mobile-nav-auth-text');

    if (mobDash) mobDash.style.display = 'none';
    if (mobAuthIcon) mobAuthIcon.innerText = 'login';
    if (mobAuthText) mobAuthText.innerText = 'Login';

    // Reset profile avatar
    document.querySelector('.profile-name').innerText = "Guest Mode";
    document.querySelector('.profile-role').innerText = "Viewer Mode";
    document.getElementById('profile-indicator').style.borderColor = "transparent";

    const avatarLetter = document.getElementById('profile-avatar-letter');
    if (avatarLetter) {
        avatarLetter.innerText = 'G';
    }

    // Reset Nav Sidebars
    document.getElementById('nav-btn-gate').style.display = 'flex';
    document.getElementById('nav-logout-btn').style.display = 'none';
    document.getElementById('nav-customer-menu').style.display = 'none';
    document.getElementById('nav-admin-menu').style.display = 'none';

    // Show Auth Box
    showAuthMode('signin');
    updateGuestFieldsVisibility();

    playBeep(440, 0.2, 0);

    switchTab('landing');
}

function updateGuestFieldsVisibility() {
    const fields = document.getElementById('booking-guest-fields');
    if (!fields) return;
    const nameInp = document.getElementById('booking-guest-name');
    const phoneInp = document.getElementById('booking-guest-phone');
    const emailInp = document.getElementById('booking-guest-email');

    const saveContainer = document.getElementById('save-address-container');
    const saveTip = document.getElementById('save-address-guest-tip');

    if (currentUser) {
        fields.style.display = 'none';
        if (nameInp) nameInp.removeAttribute('required');
        if (phoneInp) phoneInp.removeAttribute('required');
        if (emailInp) emailInp.removeAttribute('required');
        
        if (saveContainer) saveContainer.style.display = 'flex';
        if (saveTip) saveTip.style.display = 'none';
    } else {
        fields.style.display = 'flex';
        if (nameInp) nameInp.setAttribute('required', 'true');
        if (phoneInp) phoneInp.setAttribute('required', 'true');
        if (emailInp) emailInp.setAttribute('required', 'true');
        
        if (saveContainer) saveContainer.style.display = 'none';
        if (saveTip) saveTip.style.display = 'block';
    }
}

// CONDITIONAL INPUTS ON CALC SELECT
function onServiceSelectChange() {
    const service = document.getElementById('laundry-service-select').value;
    const isWeightBased = service.includes('wash_fold') || service.includes('wash_iron');
    
    document.getElementById('laundry-qty-container').style.display = isWeightBased ? 'none' : 'block';
    document.getElementById('laundry-weight-note').style.display = isWeightBased ? 'block' : 'none';
}


// CONDITIONAL SERVICE CALCULATIONS
function addItemToBasket() {
    const service = document.getElementById('laundry-service-select').value;
    const selected = priceCatalog[service];
    if (!selected) return;

    let qty = 1;
    let totalWeight = 1.0; 
    let totalPrice = 0;
    let serviceLabel = selected.name;

    if (selected.unit === 'kg') {
        qty = 1;
        totalWeight = 0; 
        totalPrice = 0; 
        serviceLabel += ` (Weighed at Facility)`;
    } else {
        qty = parseInt(document.getElementById('item-qty').value) || 1;
        totalWeight = 0; 
        totalPrice = selected.price * qty;
    }

    const basketItem = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        name: selected.name,
        qty: qty,
        unitWeight: 0,
        totalWeight: totalWeight,
        serviceCode: service,
        serviceLabel: serviceLabel,
        unitPrice: selected.price,
        totalPrice: totalPrice
    };

    currentBasket.push(basketItem);
    renderBasket();
    showToast(`Added ${selected.name} to basket.`, 'success');
    
    playBeep(659.25, 0.05, 0); // E5
}

function removeBasketItem(id) {
    currentBasket = currentBasket.filter(item => item.id !== id);
    renderBasket();
    showToast("Item removed from basket.", "warning");
    playBeep(440, 0.05, 0); // A4
}

function renderBasket() {
    const container = document.getElementById('basket-items-container');
    if (!container) return;
    container.innerHTML = '';

    if (currentBasket.length === 0) {
        container.innerHTML = `<div class="empty-basket-message">Your basket is empty. Add items on the left to start!</div>`;
        document.getElementById('total-weight').innerText = "0.0 kg";
        document.getElementById('total-price').innerText = "₹0.00";
        
        // Hide coupon success details if empty
        const origPriceRow = document.getElementById('original-price-row');
        const successMsg = document.getElementById('coupon-success-msg');
        if (origPriceRow) origPriceRow.style.display = 'none';
        if (successMsg) successMsg.style.display = 'none';
        activeCoupon = null;
        return;
    }

    let totalWeight = 0;
    let totalPrice = 0;
    let hasWeightBased = false;

    currentBasket.forEach(item => {
        totalWeight += item.totalWeight;
        totalPrice += item.totalPrice;
        
        const isWeight = item.serviceCode.includes('wash_fold') || item.serviceCode.includes('wash_iron');
        if (isWeight) hasWeightBased = true;

        const priceDisplay = isWeight ? 'Awaiting Weigh-in' : `₹${item.totalPrice.toFixed(2)}`;

        const row = document.createElement('div');
        row.className = 'basket-item-row';
        row.innerHTML = `
            <div class="basket-item-details">
                <span class="basket-item-name">${isWeight ? '' : item.qty + 'x '}${item.name}</span>
                <span class="basket-item-service">${item.serviceLabel}</span>
            </div>
            <div class="basket-item-meta">
                <span class="basket-item-price">${priceDisplay}</span>
                <button type="button" class="remove-basket-item" onclick="removeBasketItem('${item.id}')">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        container.appendChild(row);
    });

    document.getElementById('total-weight').innerText = hasWeightBased ? "Weighed at facility" : `${totalWeight.toFixed(2)} kg`;
    
    // Apply discount calculations
    let finalPrice = totalPrice;
    let discountAmount = 0;
    if (activeCoupon) {
        if (activeCoupon.type === 'percent') {
            discountAmount = totalPrice * (activeCoupon.value / 100);
        } else if (activeCoupon.type === 'flat') {
            discountAmount = activeCoupon.value;
        }
        finalPrice = Math.max(0, totalPrice - discountAmount);
    }

    // Render coupon success labels
    const origPriceRow = document.getElementById('original-price-row');
    const successMsg = document.getElementById('coupon-success-msg');
    const appliedName = document.getElementById('applied-coupon-name');
    const appliedDiscount = document.getElementById('applied-coupon-discount');

    if (activeCoupon && totalPrice > 0) {
        if (origPriceRow) {
            origPriceRow.style.display = 'block';
            origPriceRow.innerText = hasWeightBased 
                ? `₹${totalPrice.toFixed(2)} + Weigh-in` 
                : `₹${totalPrice.toFixed(2)}`;
        }
        if (successMsg) {
            successMsg.style.display = 'flex';
            appliedName.innerText = activeCoupon.code;
            appliedDiscount.innerText = activeCoupon.type === 'percent' 
                ? `${activeCoupon.value}%` 
                : `₹${activeCoupon.value.toFixed(2)}`;
        }
    } else {
        if (origPriceRow) origPriceRow.style.display = 'none';
        if (successMsg) successMsg.style.display = 'none';
    }

    let subtotalDisplay = `₹${finalPrice.toFixed(2)}`;
    if (hasWeightBased) {
        subtotalDisplay = finalPrice > 0 ? `₹${finalPrice.toFixed(2)} + Weigh-in` : "Awaiting Weigh-in";
    }
    document.getElementById('total-price').innerText = subtotalDisplay;
}

// ADDRESS TYPE SELECTOR
function selectAddressType(btn, type) {
    document.querySelectorAll('.addr-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeAddressType = type;
}

// BOOKING SUBMIT
async function handleNewBooking(e) {
    e.preventDefault();

    if (currentBasket.length === 0) {
        showToast("Please add items to your laundry basket first!", "danger");
        return;
    }

    const date = document.getElementById('pickup-date').value;
    const slot = document.getElementById('pickup-slot').value;
    const apartment = document.getElementById('pickup-address-apartment').value.trim();
    const locality = document.getElementById('pickup-address-locality').value.trim();
    const landmark = document.getElementById('pickup-address-landmark').value.trim();
    const payment = document.getElementById('payment-method').value;
    const latVal = parseFloat(document.getElementById('pickup-lat').value) || 28.6139;
    const lngVal = parseFloat(document.getElementById('pickup-lng').value) || 77.2090;

    if (!apartment || !locality || !landmark) {
        showToast("Please enter all address details: PG/Apartment Name, Locality, and Landmark!", "danger");
        return;
    }

    let customerName, customerPhone, customerEmail;
    if (currentUser) {
        customerName = currentUser.name;
        customerPhone = normalizePhoneNumber(currentUser.phone);
        customerEmail = currentUser.email;
    } else {
        customerName = document.getElementById('booking-guest-name').value.trim();
        const rawPhone = document.getElementById('booking-guest-phone').value.trim();
        customerEmail = document.getElementById('booking-guest-email').value.trim();

        if (!customerName || !rawPhone || !customerEmail) {
            showToast("Please enter your guest details: Name, Mobile, and Email!", "danger");
            return;
        }

        if (!isValidEmail(customerEmail)) {
            showToast("Invalid guest email address format. Must be user@domain.com.", "danger");
            return;
        }

        if (!isValidIndianPhoneNumber(rawPhone)) {
            showToast("Invalid guest phone number. Please enter a valid 10-digit Indian mobile number.", "danger");
            return;
        }

        customerPhone = normalizePhoneNumber(rawPhone);
    }

    const address = `${apartment}, ${locality} (Landmark: ${landmark})`;

    let totalWeight = 0;
    let totalPrice = 0;
    let itemsCount = 0;

    currentBasket.forEach(item => {
        totalWeight += item.totalWeight;
        totalPrice += item.totalPrice;
        itemsCount += item.qty;
    });

    // Apply active coupon discount to order total
    let discountAmount = 0;
    if (activeCoupon) {
        if (activeCoupon.type === 'percent') {
            discountAmount = totalPrice * (activeCoupon.value / 100);
        } else if (activeCoupon.type === 'flat') {
            discountAmount = activeCoupon.value;
        }
        totalPrice = Math.max(0, totalPrice - discountAmount);
    }

    let orderId = `LX-${Math.floor(10000 + Math.random() * 90000)}`;
    if (!useLocalFallback) {
        try {
            const nextRes = await fetch(`${API_BASE}/orders/next-id`);
            if (nextRes.ok) {
                const nextData = await nextRes.json();
                if (nextData.orderId) {
                    orderId = nextData.orderId;
                }
            }
        } catch (e) {
            console.warn("Could not fetch sequential ID from server:", e);
        }
    } else {
        let maxSeq = 0;
        orders.forEach(o => {
            if (o.orderId && o.orderId.startsWith('LX-')) {
                const part = o.orderId.substring(3);
                const num = parseInt(part, 10);
                if (!isNaN(num) && num > maxSeq) {
                    maxSeq = num;
                }
            }
        });
        const nextNum = maxSeq + 1;
        orderId = `LX-${String(nextNum).padStart(3, '0')}`;
    }

    const newOrder = {
        orderId: orderId,
        customerName: customerName,
        customerPhone: customerPhone,
        customerEmail: customerEmail,
        date: date,
        slot: slot,
        address: address,
        addressType: activeAddressType,
        payment: payment,
        weight: parseFloat(totalWeight.toFixed(2)),
        itemsCount: itemsCount,
        amount: totalPrice,
        status: 'pending',
        timestamp: new Date().toLocaleTimeString(),
        latitude: latVal,
        longitude: lngVal,
        items: [...currentBasket]
    };

    if (!useLocalFallback) {
        try {
            const res = await fetch(`${API_BASE}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newOrder)
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
        } catch (err) {
            console.error("Booking API error:", err);
            showToast("Server connection error. Storing order locally.", "warning");
        }
    }

    orders.unshift(newOrder);
    activeOrder = newOrder;

    // Save address for later if checkbox is checked (requires user to be logged in)
    const saveAddressCheckbox = document.getElementById('save-address-checkbox');
    if (currentUser && saveAddressCheckbox && saveAddressCheckbox.checked && !useLocalFallback) {
        try {
            await fetch(`${API_BASE}/users/addresses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: currentUser.phone,
                    type: activeAddressType,
                    address_line: address
                })
            });
            showToast("Address saved to profile for later!", "success");
        } catch (err) {
            console.error("Error saving address for later:", err);
        }
    }

    currentBasket = [];
    if (activeCoupon) {
        // Expire the coupon since it was used in placing this order
        availableCoupons = availableCoupons.filter(c => c.code !== activeCoupon.code);
        saveCouponsToStorage();
        if (typeof renderAdminCouponsTable === 'function') {
            renderAdminCouponsTable();
        }
    }
    activeCoupon = null;
    const coupInp = document.getElementById('coupon-code-input');
    if (coupInp) coupInp.value = '';
    renderBasket();
    document.getElementById('pickup-address-apartment').value = '';
    document.getElementById('pickup-address-locality').value = '';
    document.getElementById('pickup-address-landmark').value = '';

    if (currentUser) {
        switchCustomerPanel('track');
        renderActiveOrderTracking();
        updateCustomerActiveBadge();
    } else {
        document.getElementById('landing-track-id').value = newOrder.orderId;
        trackLandingOrder(newOrder);
        setTimeout(() => {
            const trackSec = document.getElementById('landing-tracking-section');
            if (trackSec) {
                trackSec.scrollIntoView({ behavior: 'smooth' });
                trackSec.style.boxShadow = '0 0 15px var(--color-coral-pulse)';
                setTimeout(() => { trackSec.style.boxShadow = ''; }, 1500);
            }
        }, 300);
    }

    await syncAppData();

    triggerWhatsAppAPI(newOrder, 'order_confirmation');
    showToast(`Order #${newOrder.orderId} placed! Tracking details updated.`, 'success');
    playCompletionBeeps();
}

// CUSTOMER SUB PANEL SWITCHER
function switchCustomerPanel(panelName) {
    activeCustomerPanel = panelName;
    
    // Switch active state for buttons inside customer dashboard ONLY
    document.querySelectorAll('#customer-dashboard .portal-nav-btn').forEach(btn => {
        const isTarget = btn.id === `cust-tab-btn-${panelName}`;
        btn.classList.toggle('active', isTarget);
    });

    document.querySelectorAll('.customer-sub-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `cust-panel-${panelName}`);
    });

    // Highlight the corresponding sidebar item if matched
    document.querySelectorAll('.nav-menu .nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === `customer-${panelName}`);
    });

    if (panelName === 'track') {
        renderActiveOrderTracking();
    } else if (panelName === 'history') {
        renderHistory();
    } else if (panelName === 'book') {
        setTimeout(() => {
            initBookingMap();
            if (bookingMap) {
                bookingMap.invalidateSize();
            }
        }, 100);
    }
}

function updateCustomerActiveBadge() {
    const badge = document.getElementById('active-order-badge');
    if (!badge) return;
    if (activeOrder && activeOrder.status !== 'delivered' && activeOrder.status !== 'cancelled') {
        badge.style.display = 'block';
        badge.innerText = '1';
    } else {
        badge.style.display = 'none';
    }
}

function renderActiveOrderTracking() {
    const noOrderCard = document.getElementById('no-active-order');
    const trackCard = document.getElementById('active-order-tracking');
    const activeOrdersBadge = document.getElementById('customer-active-orders-badge');

    if (!activeOrder || activeOrder.status === 'delivered' || activeOrder.status === 'cancelled') {
        if (noOrderCard) noOrderCard.style.display = 'block';
        if (trackCard) trackCard.style.display = 'none';
        if (activeOrdersBadge) activeOrdersBadge.style.display = 'none';
        return;
    }

    if (noOrderCard) noOrderCard.style.display = 'none';
    if (trackCard) trackCard.style.display = 'block';
    if (activeOrdersBadge) {
        activeOrdersBadge.style.display = 'inline-block';
        activeOrdersBadge.innerText = '1 in Progress';
    }

    const isWeight = activeOrder.items.some(i => i.serviceCode.includes('wash_fold') || i.serviceCode.includes('wash_iron'));
    const isPendingWeigh = isWeight && activeOrder.weight === 0;

    document.getElementById('track-order-id').innerText = `Order #${activeOrder.orderId}`;
    document.getElementById('track-order-date').innerText = `Booked on ${activeOrder.date}`;
    document.getElementById('track-weight').innerText = isPendingWeigh ? "Pending Weigh-in" : `${activeOrder.weight} kg`;
    document.getElementById('track-items-count').innerText = `${activeOrder.itemsCount} items`;
    document.getElementById('track-price').innerText = isPendingWeigh ? "Pending Weigh-in" : `₹${activeOrder.amount.toFixed(2)}`;
    document.getElementById('track-slot').innerText = activeOrder.slot;
    document.getElementById('track-address-type').innerText = activeOrder.addressType;

    const badge = document.getElementById('track-status-badge');
    badge.innerText = activeOrder.status.replace('_', ' ');
    badge.className = `status-pill status-${activeOrder.status}`;

    const statuses = ['pending', 'pickup_scheduled', 'picked_up', 'processing', 'ready', 'out_for_delivery', 'delivered'];
    const currentIdx = statuses.indexOf(activeOrder.status);

    statuses.forEach((status, idx) => {
        const element = document.getElementById(`step-${status}`);
        if (!element) return;

        element.classList.remove('active', 'completed');
        
        if (idx < currentIdx) {
            element.classList.add('completed');
        } else if (idx === currentIdx) {
            element.classList.add('active');
        }
    });

    drawMockQRCode('qrcode-canvas', activeOrder.orderId);
}

let landingWasher = null;

async function trackLandingOrder(optOrder) {
    let order = optOrder;
    const resultDiv = document.getElementById('landing-track-result');
    if (!resultDiv) return;

    if (!order) {
        const orderId = document.getElementById('landing-track-id').value.trim();
        if (!orderId) {
            showToast("Please enter an Order ID first!", "danger");
            return;
        }
        
        // Try to fetch from API
        if (!useLocalFallback) {
            try {
                const res = await fetch(`${API_BASE}/orders/${orderId}`);
                if (res.ok) {
                    order = await res.json();
                }
            } catch (e) {
                console.error("Error fetching order status:", e);
            }
        }
        
        // Fallback to local memory search
        if (!order) {
            order = orders.find(o => o.orderId === orderId);
        }
    }

    if (!order) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--color-ink-black);">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; color: var(--color-coral-pulse); margin-bottom: 10px;"></i>
                <h4 style="margin: 0 0 5px 0;">Order Not Found</h4>
                <p style="margin: 0; font-size: 14px; opacity: 0.8;">Double check the reference code (e.g. LX-12345) and try again.</p>
            </div>
        `;
        return;
    }

    // Order found! Render tracking view
    resultDiv.style.display = 'block';

    const isWeight = order.items.some(i => i.serviceCode.includes('wash_fold') || i.serviceCode.includes('wash_iron'));
    const isPendingWeigh = isWeight && order.weight === 0;
    const weightText = isPendingWeigh ? "Pending Weigh-in" : `${order.weight} kg`;
    const amountText = isPendingWeigh ? "Pending Weigh-in" : `₹${order.amount.toFixed(2)}`;

    // Generate stepper HTML
    const statuses = ['pending', 'pickup_scheduled', 'picked_up', 'processing', 'ready', 'out_for_delivery', 'delivered'];
    const stepLabels = {
        'pending': 'Scheduled',
        'pickup_scheduled': 'Valet Assigned',
        'picked_up': 'Picked Up',
        'processing': 'Washing',
        'ready': 'Ready',
        'out_for_delivery': 'Delivering',
        'delivered': 'Delivered'
    };
    const stepIcons = {
        'pending': 'calendar-check',
        'pickup_scheduled': 'user-tag',
        'picked_up': 'truck-pickup',
        'processing': 'soap',
        'ready': 'checkroom',
        'out_for_delivery': 'truck',
        'delivered': 'circle-check'
    };

    const currentIdx = statuses.indexOf(order.status);

    let stepperHtml = '';
    statuses.forEach((status, idx) => {
        let className = 'step-item';
        if (idx < currentIdx) className += ' completed';
        else if (idx === currentIdx) className += ' active';
        else className += ' disabled';

        stepperHtml += `
            <div class="${className}" style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; flex: 1; min-width: 70px;">
                <div class="step-icon-circle" style="width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--color-ink-black); background: ${idx <= currentIdx ? 'var(--color-sand-beige)' : '#fff'}; color: var(--color-ink-black); position: relative;">
                    <i class="fa-solid fa-${stepIcons[status]}" style="${idx === currentIdx ? 'color: var(--color-coral-pulse); font-size: 16px;' : 'font-size: 14px;'}"></i>
                    ${idx < currentIdx ? '<i class="fa-solid fa-circle-check" style="position: absolute; right: -4px; bottom: -4px; color: #10b981; font-size: 12px; background: #fff; border-radius: 50%;"></i>' : ''}
                </div>
                <span style="font-size: 11px; font-weight: ${idx === currentIdx ? 'bold' : 'normal'}; color: var(--color-ink-black);">${stepLabels[status]}</span>
            </div>
        `;
    });

    // Render tracking info layout
    resultDiv.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 20px;">
            <!-- Header Row: Reference ID, Status, and QR Ticket -->
            <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 20px; background: var(--color-warm-canvas); padding: 20px; border-radius: var(--radius-cards); border: 1px solid var(--color-ink-black);">
                <div>
                    <span style="font-size: 11px; opacity: 0.7; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 4px;">Order Status Tracker</span>
                    <h4 style="margin: 0; font-family: var(--font-supreme-ll-tt); font-size: 20px; font-weight: 800; color: var(--color-ink-black);">Reference: ${order.orderId}</h4>
                    <span class="status-pill status-${order.status}" style="font-size: 10px; font-weight: bold; background: #fff; border: 1.5px solid var(--color-ink-black); padding: 2px 8px; border-radius: var(--radius-pills); text-transform: uppercase; display: inline-block; margin-top: 6px;">
                        ${order.status.replace('_', ' ')}
                    </span>
                </div>
                <!-- Receipt QR Code Card -->
                <div style="display: flex; align-items: center; gap: 15px; background: #fff; padding: 12px; border-radius: 12px; border: 1px solid rgba(0,23,38,0.15); max-width: 320px;">
                    <div id="landing-qrcode-canvas" style="width: 60px; height: 60px; display: flex; align-items: center; justify-content: center;"></div>
                    <div>
                        <h5 style="margin: 0 0 2px 0; font-size: 12px; font-weight: bold; color: var(--color-ink-black);">Secure Digital Ticket</h5>
                        <p style="margin: 0; font-size: 10px; opacity: 0.8; color: var(--color-ink-black); line-height: 1.3;">Present QR code at pickup/drop-off for valet verification.</p>
                    </div>
                </div>
            </div>

            <!-- Details Grid (2 Columns: Slot, Weight, Payment, Amount) -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px;">
                <div style="background: var(--color-pristine-surface); border: 1px solid var(--color-ink-black); padding: 15px; border-radius: var(--radius-cards);">
                    <span style="font-size: 10px; opacity: 0.6; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 2px;">Pickup Details</span>
                    <p style="margin: 0; font-size: 14px; font-weight: bold; color: var(--color-ink-black);">${order.date} • ${order.slot}</p>
                </div>
                <div style="background: var(--color-pristine-surface); border: 1px solid var(--color-ink-black); padding: 15px; border-radius: var(--radius-cards);">
                    <span style="font-size: 10px; opacity: 0.6; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 2px;">Payment Status</span>
                    <p style="margin: 0; font-size: 14px; font-weight: bold; color: var(--color-ink-black);">${order.payment.toUpperCase()}</p>
                </div>
                <div style="background: var(--color-pristine-surface); border: 1px solid var(--color-ink-black); padding: 15px; border-radius: var(--radius-cards);">
                    <span style="font-size: 10px; opacity: 0.6; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 2px;">Total Weight</span>
                    <p style="margin: 0; font-size: 14px; font-weight: bold; color: var(--color-ink-black);">${weightText}</p>
                </div>
                <div style="background: var(--color-pristine-surface); border: 1px solid var(--color-ink-black); padding: 15px; border-radius: var(--radius-cards);">
                    <span style="font-size: 10px; opacity: 0.6; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 2px;">Total Amount</span>
                    <p style="margin: 0; font-size: 16px; font-weight: 800; color: var(--color-coral-pulse);">${amountText}</p>
                </div>
            </div>

            <!-- Full Width Timeline Stepper -->
            <div style="background: #fff; padding: 20px; border-radius: var(--radius-cards); border: 1px solid var(--color-ink-black);">
                <span style="font-size: 11px; opacity: 0.7; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 12px;">Order Stepper Timeline</span>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; overflow-x: auto; padding-bottom: 8px;">
                    ${stepperHtml}
                </div>
            </div>
        </div>
    `;

    // Render QR Code
    setTimeout(() => {
        drawMockQRCode('landing-qrcode-canvas', order.orderId);
        initLandingWashSimulator(order.status);
    }, 150);
}

function initLandingWashSimulator(status) {
    return;
}

function quickSelectService(serviceCode) {
    const select = document.getElementById('laundry-service-select');
    if (!select) return;
    
    select.value = serviceCode;
    onServiceSelectChange();
    
    const container = document.getElementById('landing-booking-container');
    if (container) {
        container.scrollIntoView({ behavior: 'smooth' });
        container.style.boxShadow = '0 0 15px var(--color-coral-pulse)';
        setTimeout(() => { container.style.boxShadow = ''; }, 1500);
    }
}

window.trackLandingOrder = trackLandingOrder;
window.quickSelectService = quickSelectService;

function renderHistory() {
    const container = document.getElementById('history-items-container');
    if (!container) return;
    container.innerHTML = '';

    const historical = orders.filter(o => 
        (o.customerPhone === currentUser?.phone) && 
        (o.status === 'delivered' || o.status === 'cancelled')
    );

    if (historical.length === 0) {
        container.innerHTML = `
            <div class="text-center p-4 text-muted">
                <i class="fa-solid fa-folder-open mb-2" style="font-size: 2rem;"></i>
                <p>No past orders found.</p>
            </div>`;
        return;
    }

    historical.forEach(order => {
        const card = document.createElement('div');
        card.className = 'history-item';
        card.innerHTML = `
            <div class="history-item-left">
                <h5>Order #${order.orderId}</h5>
                <p class="date">${order.date} | ${order.itemsCount} items (${order.weight}kg)</p>
            </div>
            <div class="history-item-right">
                <span class="history-price">₹${order.amount.toFixed(2)}</span>
                <span class="status-pill status-${order.status}" style="font-size: 0.6rem; padding: 0.15rem 0.5rem;">${order.status}</span>
                <button class="btn btn-secondary btn-sm" style="padding: 0.15rem 0.5rem;" onclick="reorderItems('${order.orderId}')">
                    <i class="fa-solid fa-rotate-left"></i> Reorder
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

function reorderItems(orderId) {
    const oldOrder = orders.find(o => o.orderId === orderId);
    if (!oldOrder) return;
    
    currentBasket = oldOrder.items.map(item => ({
        ...item,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5)
    }));
    
    renderBasket();
    switchCustomerPanel('book');
    showToast("Reloaded items into basket!", "success");
    playBeep(523.25, 0.1, 0); 
}

async function cancelActiveOrder() {
    if (!activeOrder) return;
    if (activeOrder.status !== 'pending' && activeOrder.status !== 'pickup_scheduled') {
        showToast("Cannot cancel order once pickup has been confirmed.", "danger");
        return;
    }

    if (confirm("Are you sure you want to cancel this order?")) {
        const orderId = activeOrder.orderId;

        if (!useLocalFallback) {
            try {
                const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
                    method: 'PUT'
                });
                if (!res.ok) throw new Error();
                const data = await res.json();
                if (!data.success) throw new Error(data.error);
            } catch (err) {
                console.error("Cancel API error:", err);
                showToast("Server connection error. Cancelling order locally.", "warning");
            }
        }

        activeOrder.status = 'cancelled';
        
        const systemOrder = orders.find(o => o.orderId === orderId);
        if (systemOrder) systemOrder.status = 'cancelled';
        
        showToast(`Order #${orderId} has been cancelled.`, 'warning');
        triggerWhatsAppAPI(activeOrder, 'order_cancelled');
        
        activeOrder = null;
        updateCustomerActiveBadge();
        switchCustomerPanel('history');
        
        await syncAppData();
        playBeep(220, 0.3, 0); 
    }
}


// ADMIN DASHBOARD LOGIC (MODIFIED FOR EXPRESS WEIGH-IN INPUTS AT ANY ACTIVE STAGE)
function renderAdminOrdersTable() {
    const tbody = document.getElementById('admin-orders-tbody');
    if (!tbody) return;

    // Save user typing states and focus before clearing the table
    const activeElementId = document.activeElement ? document.activeElement.id : null;
    const savedValues = {};
    const inputs = tbody.querySelectorAll('input');
    inputs.forEach(input => {
        if (input.value !== '') {
            savedValues[input.id] = input.value;
        }
    });

    tbody.innerHTML = '';

    const searchInput = document.getElementById('admin-search-input');
    const statusFilter = document.getElementById('admin-filter-status');

    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const statusVal = statusFilter ? statusFilter.value : 'all';

    let displayedOrders = orders.filter(order => {
        // Status filter
        if (statusVal !== 'all' && order.status !== statusVal) {
            return false;
        }
        // Search filter
        if (query) {
            const nameMatch = order.customerName.toLowerCase().includes(query);
            const phoneMatch = order.customerPhone.toLowerCase().includes(query);
            const idMatch = order.orderId.toLowerCase().includes(query);
            if (!nameMatch && !phoneMatch && !idMatch) {
                return false;
            }
        }
        return true;
    });

    if (displayedOrders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-gray-400 p-8">
                    No matching orders found.
                </td>
            </tr>`;
        return;
    }

    displayedOrders.forEach(order => {
        let actionBtnHtml = '';
        
        switch (order.status) {
            case 'pending':
            case 'pickup_scheduled':
            case 'picked_up':
                // Check if order has weight-based items
                const hasWeightItem = order.items.some(item => {
                    return item.serviceCode.includes('wash_fold') || item.serviceCode.includes('wash_iron');
                });
                
                let stepBtnHtml = '';
                if (order.status === 'pending') {
                    stepBtnHtml = `<button class="w-full mt-1.5 px-3 py-1 bg-primary hover:bg-primary-container text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors" onclick="advanceOrderStatus('${order.orderId}')"><i class="fa-solid fa-truck-pickup"></i> Confirm Pickup</button>`;
                } else if (order.status === 'pickup_scheduled') {
                    stepBtnHtml = `<button class="w-full mt-1.5 px-3 py-1 bg-primary hover:bg-primary-container text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors" onclick="advanceOrderStatus('${order.orderId}')"><i class="fa-solid fa-warehouse"></i> Confirm Arrival</button>`;
                } else if (order.status === 'picked_up') {
                    const stepLabel = hasWeightItem ? 'Start Wash' : 'Confirm Wash';
                    stepBtnHtml = `<button class="w-full mt-1.5 px-3 py-1 bg-primary hover:bg-primary-container text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors" onclick="advanceOrderStatus('${order.orderId}')"><i class="fa-solid fa-soap"></i> ${stepLabel}</button>`;
                }

                if (hasWeightItem) {
                    actionBtnHtml = `
                        <div class="flex flex-col gap-1.5 items-end justify-end">
                            <div class="flex items-center gap-2">
                                <input type="number" step="0.1" min="0.1" id="admin-weight-${order.orderId}" placeholder="Wt (kg)" class="border border-gray-200 focus:ring-primary rounded-lg py-1 px-2 text-xs text-primary font-medium w-20 text-center bg-gray-50 focus:bg-white" required>
                                <button class="px-3 py-1 bg-secondary hover:bg-opacity-95 text-white text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap" onclick="weighAndProcessOrder('${order.orderId}')">Weigh & Wash</button>
                            </div>
                            ${stepBtnHtml}
                        </div>
                    `;
                } else {
                    actionBtnHtml = `
                        <div class="flex flex-col gap-1.5 items-end justify-end">
                            <div class="flex items-center gap-2">
                                <input type="number" min="1" id="admin-qty-${order.orderId}" value="${order.itemsCount}" class="border border-gray-200 focus:ring-primary rounded-lg py-1 px-2 text-xs text-primary font-medium w-20 text-center bg-gray-50 focus:bg-white" required>
                                <button class="px-3 py-1 bg-secondary hover:bg-opacity-95 text-white text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap" onclick="weighAndProcessOrder('${order.orderId}')">Start Wash</button>
                            </div>
                            ${stepBtnHtml}
                        </div>
                    `;
                }
                break;
            case 'processing':
                actionBtnHtml = `
                    <div class="flex flex-col sm:flex-row gap-2 justify-end">
                        <button class="px-3 py-1.5 bg-secondary hover:bg-opacity-95 text-white text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap" onclick="advanceOrderStatus('${order.orderId}')">Mark Pressing Finished</button>
                        <button class="px-3 py-1.5 border border-[#16a34a] hover:bg-green-50 text-[#16a34a] text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-colors" onclick="sendAdminPaymentReminder('${order.orderId}')"><i class="fa-solid fa-bell"></i> Send Bill</button>
                    </div>
                `;
                break;
            case 'ready':
                actionBtnHtml = `
                    <div class="flex flex-col sm:flex-row gap-2 justify-end">
                        <button class="px-3 py-1.5 bg-primary hover:bg-primary-container text-white text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap" onclick="advanceOrderStatus('${order.orderId}')">Dispatch Delivery</button>
                        <button class="px-3 py-1.5 border border-[#16a34a] hover:bg-green-50 text-[#16a34a] text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-colors" onclick="sendAdminPaymentReminder('${order.orderId}')"><i class="fa-solid fa-bell"></i> Send Bill</button>
                    </div>
                `;
                break;
            case 'out_for_delivery':
                actionBtnHtml = `
                    <div class="flex flex-col sm:flex-row gap-2 justify-end">
                        <button class="px-3 py-1.5 bg-primary hover:bg-primary-container text-white text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap" onclick="advanceOrderStatus('${order.orderId}')">Deliver</button>
                        <button class="px-3 py-1.5 border border-[#16a34a] hover:bg-green-50 text-[#16a34a] text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-colors" onclick="sendAdminPaymentReminder('${order.orderId}')"><i class="fa-solid fa-bell"></i> Send Bill</button>
                    </div>
                `;
                break;
            default:
                actionBtnHtml = `<span class="text-gray-400 text-xs italic">Completed</span>`;
                break;
        }

        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-100 hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-4 align-top">
                <span class="admin-order-num font-bold text-secondary text-sm">${order.orderId}</span>
                <div class="mt-2">
                    <span class="status-pill status-${order.status} font-bold text-[9px] tracking-wide px-2.5 py-0.5 rounded-full uppercase border border-current">
                        ${order.status.replace('_',' ')}
                    </span>
                </div>
            </td>
            <td class="px-6 py-4 align-top">
                <div class="flex flex-col text-sm">
                    <span class="font-bold text-primary">${order.customerName}</span>
                    <span class="text-xs text-gray-500 mt-0.5">${order.customerPhone}</span>
                    <span class="text-[11px] text-gray-400 mt-1 max-w-[200px] overflow-hidden text-overflow-ellipsis whitespace-nowrap block" title="${order.address}">${order.address}</span>
                    
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${order.latitude && order.latitude !== 0 ? order.latitude + ',' + order.longitude : encodeURIComponent(order.address)}" 
                       target="_blank" 
                       class="mt-2.5 px-3 py-1 bg-white hover:bg-gray-50 text-primary border border-gray-200 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5 w-fit transition-all shadow-sm">
                        <i class="fa-solid fa-map-location-dot text-secondary"></i> Route Valet
                    </a>
                </div>
            </td>
            <td class="px-6 py-4 align-top">
                <div class="text-sm">
                    <div class="font-semibold text-primary">${order.date}</div>
                    <div class="text-gray-400 text-[11px] mt-0.5">${order.slot}</div>
                </div>
            </td>
            <td class="px-6 py-4 align-top">
                <div class="text-sm font-semibold text-primary">
                    ${order.weight > 0 ? order.weight + ' kg' : '<span class="text-gray-400 italic font-normal">Weigh Pending</span>'}
                </div>
                <div class="text-sm font-bold text-secondary mt-1">
                    ${order.amount > 0 ? `₹${order.amount.toFixed(2)}` : '<span class="text-gray-400 italic font-normal font-bold">Weigh Pending</span>'}
                </div>
                <div class="text-[11px] text-gray-400 mt-1">(${order.itemsCount} items)</div>
            </td>
            <td class="px-6 py-4 align-top text-right">${actionBtnHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    // Restore typing values and caret focus
    for (const [id, value] of Object.entries(savedValues)) {
        const input = document.getElementById(id);
        if (input) {
            input.value = value;
        }
    }
    if (activeElementId) {
        const activeInput = document.getElementById(activeElementId);
        if (activeInput && (activeElementId.startsWith('admin-weight-') || activeElementId.startsWith('admin-qty-'))) {
            activeInput.focus();
            const val = activeInput.value;
            activeInput.value = '';
            activeInput.value = val;
        }
    }
}

// ADMIN WEIGH-IN SUBMIT FUNCTION
async function weighAndProcessOrder(orderId) {
    const order = orders.find(o => o.orderId === orderId);
    if (!order) return;

    let payload = {};
    const weightInput = document.getElementById(`admin-weight-${orderId}`);
    const qtyInput = document.getElementById(`admin-qty-${orderId}`);

    if (weightInput) {
        const weightVal = parseFloat(weightInput.value);
        if (isNaN(weightVal) || weightVal <= 0) {
            showToast("Please enter a valid weight in kg!", "danger");
            return;
        }
        payload.weight = weightVal;
    }

    if (qtyInput) {
        const qtyVal = parseInt(qtyInput.value);
        if (isNaN(qtyVal) || qtyVal <= 0) {
            showToast("Please enter a valid quantity!", "danger");
            return;
        }
        payload.items_count = qtyVal;
    }

    if (!useLocalFallback) {
        try {
            const res = await fetch(`${API_BASE}/orders/${orderId}/metrics`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
        } catch (err) {
            console.error("Weigh API error:", err);
            showToast("Server connection error. Setting metrics locally.", "warning");
        }
    }

    if (useLocalFallback || !order) {
        let simulatedAmount = 0;
        let simulatedWeight = 0;
        let simulatedItemsCount = 0;

        order.items.forEach(item => {
            const catalogItem = priceCatalog[item.serviceCode];
            if (!catalogItem) return;

            if (catalogItem.unit === 'kg') {
                if (payload.weight !== undefined) {
                    item.totalWeight = payload.weight;
                }
                item.totalPrice = item.totalWeight * catalogItem.price;
            } else {
                if (payload.items_count !== undefined) {
                    item.qty = payload.items_count;
                }
                item.totalPrice = item.qty * catalogItem.price;
            }

            simulatedAmount += item.totalPrice;
            simulatedWeight += item.totalWeight;
            simulatedItemsCount += item.qty;
        });

        order.weight = parseFloat(simulatedWeight.toFixed(2));
        order.itemsCount = simulatedItemsCount;
        order.amount = simulatedAmount;
        order.status = 'picked_up';
    }

    if (activeOrder && activeOrder.orderId === orderId) {
        if (useLocalFallback) {
            activeOrder.weight = order.weight;
            activeOrder.itemsCount = order.itemsCount;
            activeOrder.amount = order.amount;
        }
        activeOrder.status = 'picked_up';
        renderActiveOrderTracking();
        updateCustomerActiveBadge();
    }

    showToast(`Order #${orderId} metrics updated! Pickup confirmed.`, "success");
    sync3DWasherWithOrder('picked_up');

    if (!useLocalFallback) {
        await syncAppData();
        await syncEmailLogs();
    } else {
        renderAdminOrdersTable();
        updateAdminStats();
    }

    const updatedOrder = orders.find(o => o.orderId === orderId);
    triggerWhatsAppAPI(updatedOrder, 'picked_up');
}

async function advanceOrderStatus(orderId) {
    const order = orders.find(o => o.orderId === orderId);
    if (!order) return;

    const stages = ['pending', 'pickup_scheduled', 'picked_up', 'processing', 'ready', 'out_for_delivery', 'delivered'];
    const idx = stages.indexOf(order.status);
    if (idx === -1 || idx === stages.length - 1) return;

    const oldStatus = order.status;
    const nextStatus = stages[idx + 1];

    if (!useLocalFallback) {
        try {
            const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus })
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
        } catch (err) {
            console.error("Advance status API error:", err);
            showToast("Server connection error. Updating status locally.", "warning");
        }
    }

    order.status = nextStatus;

    if (activeOrder && activeOrder.orderId === orderId) {
        activeOrder.status = nextStatus;
        renderActiveOrderTracking();
        updateCustomerActiveBadge();
    }

    renderAdminOrdersTable();
    updateAdminStats();

    sync3DWasherWithOrder(nextStatus);
    triggerWhatsAppAPI(order, getTemplateTypeForStatus(nextStatus));
    showToast(`Order #${orderId} advanced from ${oldStatus} to ${nextStatus}`, 'success');

    if (!useLocalFallback) {
        await syncEmailLogs();
    }
}

function getTemplateTypeForStatus(status) {
    switch (status) {
        case 'pickup_scheduled': return 'pickup_scheduled';
        case 'picked_up': return 'picked_up';
        case 'processing': return 'processing';
        case 'ready': return 'ready';
        case 'out_for_delivery': return 'out_for_delivery';
        case 'delivered': return 'delivered';
        default: return 'whatsapp';
    }
}

function sync3DWasherWithOrder(status) {
    if (!washer3D) return; 

    if (status === 'processing') {
        washer3D.setPower(true);
        update3DPanelOverlayState(true);
        
        washer3D.openDrawer(true);
        setTimeout(() => {
            let level = 0;
            const soapTimer = setInterval(() => {
                level += 10;
                washer3D.setSoapLevel(level);
                const text = document.getElementById('soap-level-text');
                const slider = document.getElementById('washer-soap-slider');
                if (text) text.innerText = `${level}%`;
                if (slider) slider.value = level;
                if (level >= 80) {
                    clearInterval(soapTimer);
                    
                    setTimeout(() => {
                        washer3D.openDrawer(false);
                        
                        setTimeout(() => {
                            washer3D.setPhase('washing');
                            triggerWasherAudioLoop();
                            startWasherConsoleTimer(120); 
                        }, 800);
                    }, 500);
                }
            }, 100);
        }, 800);
    } else if (status === 'ready' || status === 'delivered') {
        washer3D.setPhase('completed');
        playCompletionBeeps();
        
        setTimeout(() => {
            if (washer3D && washer3D.currentPhase === 'completed') {
                washer3D.setPower(false);
                update3DPanelOverlayState(false);
            }
        }, 5000);
    }
}

function updateAdminStats() {
    const totalEl = document.getElementById('admin-stat-total');
    if (!totalEl) return;
    totalEl.innerText = orders.length;
    
    const activeCount = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length;
    document.getElementById('admin-stat-active').innerText = activeCount;

    const deliveredCount = orders.filter(o => o.status === 'delivered').length;
    document.getElementById('admin-stat-delivered').innerText = deliveredCount;

    let totalEarnings = 0;
    orders.forEach(o => {
        if (o.status === 'delivered') totalEarnings += o.amount;
    });
    document.getElementById('admin-stat-revenue').innerText = `₹${totalEarnings.toFixed(2)}`;

    updateRevenueChartData();
}

async function seedSampleOrders() {
    if (!useLocalFallback) {
        showToast("Historical data is already seeded in SQLite db.", "info");
        await syncAppData();
        return;
    }

    const phones = ["+91 99999 88888", "+91 98230 45678", "+91 88390 12345", "+91 77382 99221", "+91 92837 11223"];
    const day = 24 * 60 * 60 * 1000;
    const today = new Date();

    const historical = [
        {
            orderId: "CF-38291",
            customerName: "Priya Nair",
            customerPhone: phones[2],
            date: new Date(today.getTime() - 4 * day).toISOString().split('T')[0],
            slot: "09:00 - 11:00",
            address: "Villa 22, Green Valley Estate, Road 12",
            addressType: "home",
            payment: "online",
            weight: 4.0,
            itemsCount: 1,
            amount: 180,
            status: "delivered",
            timestamp: "10:30 AM",
            items: [{ name: "Wash & Fold (Organic)", qty: 1, totalWeight: 4.0, serviceCode: "wash_fold_organic", serviceLabel: "Wash & Fold (Organic)", unitPrice: 45, totalPrice: 180 }]
        },
        {
            orderId: "CF-82947",
            customerName: "Amit Patel",
            customerPhone: phones[1],
            date: new Date(today.getTime() - 3 * day).toISOString().split('T')[0],
            slot: "14:00 - 16:00",
            address: "Office 402, Trade Tower, Phase 2",
            addressType: "work",
            payment: "wallet",
            weight: 0.0,
            itemsCount: 2,
            amount: 20,
            status: "delivered",
            timestamp: "03:15 PM",
            items: [{ name: "Only Iron", qty: 2, totalWeight: 0, serviceCode: "only_iron", serviceLabel: "Only Iron", unitPrice: 10, totalPrice: 20 }]
        },
        {
            orderId: "CF-92049",
            customerName: "Vikram Singh",
            customerPhone: phones[3],
            date: new Date(today.getTime() - 2 * day).toISOString().split('T')[0],
            slot: "11:00 - 13:00",
            address: "A-502, Sky High Heights, Sector 15",
            addressType: "home",
            payment: "cash",
            weight: 0.0,
            itemsCount: 3,
            amount: 300,
            status: "delivered",
            timestamp: "12:00 PM",
            items: [{ name: "Dry Cleaning (Basic)", qty: 3, totalWeight: 0, serviceCode: "dry_cleaning_basic", serviceLabel: "Dry Cleaning (Basic)", unitPrice: 100, totalPrice: 300 }]
        },
        {
            orderId: "CF-10294",
            customerName: "Rahul Sharma",
            customerPhone: phones[0],
            date: new Date(today.getTime() - 1 * day).toISOString().split('T')[0],
            slot: "18:00 - 20:00",
            address: "Flat 402, Seawood Towers, Sector 45",
            addressType: "home",
            payment: "online",
            weight: 5.0,
            itemsCount: 1,
            amount: 225,
            status: "delivered",
            timestamp: "07:22 PM",
            items: [{ name: "Wash & Iron (Normal)", qty: 1, totalWeight: 5.0, serviceCode: "wash_iron_normal", serviceLabel: "Wash & Iron (Normal)", unitPrice: 45, totalPrice: 225 }]
        }
    ];

    orders = [...historical, ...orders];
    renderAdminOrdersTable();
    updateAdminStats();
    showToast("Mock historical records seeded in memory.", "success");
}

// LOG DRAWERS TOGGLERS & RENDERERS
function toggleLogPanel(tab) {
    activeLogTab = tab;
    
    // Toggle tab header styles
    document.getElementById('log-tab-wa').classList.toggle('active', tab === 'wa');
    document.getElementById('log-tab-email').classList.toggle('active', tab === 'email');

    // Toggle drawers
    document.getElementById('whatsapp-logs-container').style.display = tab === 'wa' ? 'block' : 'none';
    document.getElementById('email-logs-container').style.display = tab === 'email' ? 'block' : 'none';

    if (tab === 'email') {
        syncEmailLogs();
    }
}

async function syncEmailLogs() {
    if (useLocalFallback) return;

    try {
        const res = await fetch(`${API_BASE}/email/logs`);
        const logs = await res.json();
        renderEmailLogs(logs);
    } catch (e) {
        console.warn("Could not sync email logs:", e);
    }
}

function renderEmailLogs(logs) {
    const container = document.getElementById('email-logs-container');
    if (!container) return;
    container.innerHTML = '';

    if (!logs || logs.length === 0) {
        container.innerHTML = `<div class="whatsapp-log-empty">Waiting for email SMTP events...</div>`;
        return;
    }

    logs.forEach(log => {
        const card = document.createElement('div');
        card.className = 'email-msg-card';
        card.onclick = () => showEmailModal(log.subject, log.body);
        card.innerHTML = `
            <div class="email-msg-meta">
                <span>SMTP API Server Node</span>
                <span>${log.timestamp.split(', ')[1] || log.timestamp}</span>
            </div>
            <div class="email-msg-subject"><i class="fa-solid fa-envelope-open-text"></i> ${log.subject}</div>
            <div class="email-msg-recipient">To: ${log.recipient}</div>
        `;
        container.appendChild(card);
    });
}

// EMAIL PREVIEW MODALS
function showEmailModal(subject, htmlBody) {
    const modal = document.getElementById('email-modal');
    const container = document.getElementById('email-modal-body-container');
    
    if (container) container.innerHTML = htmlBody;
    if (modal) modal.style.display = 'flex';
    playBeep(659.25, 0.05, 0); 
}

function closeEmailModal() {
    const modal = document.getElementById('email-modal');
    if (modal) modal.style.display = 'none';
    playBeep(440, 0.05, 0);
}

// MANUALLY TRIGGER INVOICE REMINDER EMAIL
async function sendAdminPaymentReminder(orderId) {
    if (useLocalFallback) {
        showToast("Payment reminder notification triggered locally.", "success");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/orders/${orderId}/payment-reminder`, {
            method: 'POST'
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(`Invoice email sent successfully for Order #${orderId}!`, 'success');
            await syncEmailLogs();
        } else {
            showToast("Could not trigger notification reminder.", "danger");
        }
    } catch (e) {
        console.error("Payment reminder trigger error:", e);
        showToast("Server connection error sending reminder.", "danger");
    }
}


// TWILIO WHATSAPP API LOGGER SIMULATOR
function triggerWhatsAppAPI(order, templateType) {
    if (!order) return;
    
    const logsContainer = document.getElementById('whatsapp-logs-container');
    if (!logsContainer) return;
    const emptyLogMsg = logsContainer.querySelector('.whatsapp-log-empty');
    if (emptyLogMsg) emptyLogMsg.remove();

    const timestamp = new Date().toLocaleTimeString();
    let messageText = '';

    const billString = order.amount > 0 ? `*₹${order.amount.toFixed(2)}*` : `_Awaiting Weighed Input_`;

    switch (templateType) {
        case 'order_confirmation':
            messageText = `*369 Laundry Confirmation*\nHi ${order.customerName}, your laundry pickup is confirmed!\nOrder ID: *${order.orderId}*\nDate: ${order.date}\nSlot: ${order.slot}\nTotal Bill: ${billString}\n\nTrack order here: https://369laundry.app/track/${order.orderId}`;
            break;
        case 'pickup_scheduled':
            messageText = `*369 Laundry Update*\nValet assigned to pick up your laundry for Order *${order.orderId}*.\nDriver Contact: +91 90000 11111.\nEnsure clothes are sorted in the bag.`;
            break;
        case 'picked_up':
            messageText = `*369 Laundry Alert*\nYour laundry has arrived at our state-of-the-art washing facility.\nOrder ID: *${order.orderId}*\nWe are currently weighing and inspecting your clothes. Bill details will follow instantly!`;
            break;
        case 'processing':
            messageText = `*369 Laundry Weigh-In Complete!*\nWashing cycles have started for your order *${order.orderId}*.\nWeight: *${order.weight} kg*\nFinal Bill: *₹${order.amount.toFixed(2)}*\nYour clothes are tumbling nicely in the drum! Watch it live in the dashboard.`;
            break;
        case 'ready':
            messageText = `*369 Laundry Finished*\nOrder *${order.orderId}* is clean, ironed, and packaged.\nReady for dispatch. Delivery scheduled soon.`;
            break;
        case 'out_for_delivery':
            messageText = `*369 Laundry Out For Delivery*\nHi ${order.customerName}, your laundry is on the way!\nOrder ID: *${order.orderId}*\nTotal Due: *₹${order.amount.toFixed(2)}*\nHave your digital QR code ready for verification.`;
            break;
        case 'delivered':
            messageText = `*369 Laundry Transaction Completed*\nThank you for using 369 Laundry, ${order.customerName}.\nOrder *${order.orderId}* has been successfully delivered and paid.\nRate us: https://369laundry.app/feedback`;
            break;
        case 'order_cancelled':
            messageText = `*369 Laundry Cancellation Alert*\nHi ${order.customerName}, your order *${order.orderId}* has been successfully cancelled.\nRefund will be initiated if already charged.`;
            break;
    }

    const msgCard = document.createElement('div');
    msgCard.className = 'whatsapp-msg-card';
    msgCard.innerHTML = `
        <div class="whatsapp-msg-meta">
            <span>To: ${order.customerPhone} (Twilio WhatsApp API Node)</span>
            <span>${timestamp}</span>
        </div>
        <div class="whatsapp-msg-body">${messageText}</div>
    `;
    logsContainer.appendChild(msgCard);
    
    logsContainer.scrollTop = logsContainer.scrollHeight;
    showToast(`WhatsApp Template API Fired: [${templateType.replace('_', ' ')}]`, 'whatsapp');
}

// MOCK QR CODE GENERATION DRAWING ON CANVAS
function drawMockQRCode(canvasId, text) {
    const canvas = document.createElement('canvas');
    canvas.width = 90;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 90, 90);
    ctx.fillStyle = '#000000';
    
    ctx.fillRect(0, 0, 25, 25);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, 5, 15, 15);
    ctx.fillStyle = '#000000';
    ctx.fillRect(8, 8, 9, 9);
    
    ctx.fillRect(65, 0, 25, 25);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(70, 5, 15, 15);
    ctx.fillStyle = '#000000';
    ctx.fillRect(73, 8, 9, 9);
    
    ctx.fillRect(0, 65, 25, 25);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, 70, 15, 15);
    ctx.fillStyle = '#000000';
    ctx.fillRect(8, 73, 9, 9);
    
    ctx.fillStyle = '#000000';
    let seed = 0;
    for(let i=0; i<text.length; i++) seed += text.charCodeAt(i);
    for(let x = 0; x < 90; x += 5) {
        for(let y = 0; y < 90; y += 5) {
            if(x < 30 && y < 30) continue;
            if(x > 60 && y < 30) continue;
            if(x < 30 && y > 60) continue;
            
            const rand = Math.sin(seed + x * 12.9898 + y * 78.233) * 43758.5453;
            if((rand - Math.floor(rand)) > 0.55) {
                ctx.fillRect(x, y, 5, 5);
            }
        }
    }
    const container = document.getElementById(canvasId);
    if (container) {
        container.innerHTML = '';
        container.appendChild(canvas);
    }
}

// FLOATING TOASTS
function showToast(msg, type = 'success') {
    // Disabled all toast notifications entirely across the website
    return;
}

// 3D WASHER PANEL MANUAL OVERLAYS
let consoleTimerInterval = null;

function update3DPanelOverlayState(power) {
    const btnPower = document.getElementById('btn-washer-power');
    if (!btnPower) return; 
    
    btnPower.classList.toggle('on', power);
    document.getElementById('led-state-text').innerText = power ? "READY" : "OFFLINE";
    document.getElementById('led-state-text').style.color = power ? "#34d399" : "#fb7185";
    document.getElementById('led-state-text').classList.toggle('active', power);
    document.getElementById('led-temp-text').innerText = power ? "30°C" : "--°C";
    document.getElementById('led-rpm-text').innerText = power ? "0" : "0";
    document.getElementById('led-time-text').innerText = power ? "00:00" : "00:00";

    document.getElementById('btn-washer-door').disabled = !power;
    document.getElementById('btn-washer-start').disabled = !power;
    document.getElementById('washer-cycle-select').disabled = !power;
    document.getElementById('washer-soap-slider').disabled = !power;
}

function toggleWasherPower() {
    if (!washer3D) return;
    initAudio(); 
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    const isCurrentlyOn = document.getElementById('btn-washer-power').classList.contains('on');
    const targetState = !isCurrentlyOn;
    
    washer3D.setPower(targetState);
    update3DPanelOverlayState(targetState);

    if (targetState) {
        showToast("Washing machine powered ON", "success");
        playBeep(440, 0.1, 0); 
        playBeep(880, 0.15, 0.08);
    } else {
        showToast("Washing machine powered OFF", "warning");
        playBeep(880, 0.1, 0);
        playBeep(440, 0.15, 0.08);
        clearInterval(consoleTimerInterval);
        document.getElementById('washer-status-bar').style.display = 'none';
    }
}

function toggleWasherDoor() {
    if (!washer3D || !washer3D.isPowered) return;
    
    if (washer3D.currentPhase !== 'idle' && washer3D.currentPhase !== 'completed') {
        showToast("Safety Lock: Cannot open door during cycle!", "danger");
        playBeep(180, 0.3, 0); 
        return;
    }

    const nextDoorState = !washer3D.isDoorOpen;
    washer3D.openDoor(nextDoorState);
    
    const button = document.getElementById('btn-washer-door');
    button.classList.toggle('active', nextDoorState);
    button.innerHTML = nextDoorState ? `<i class="fa-solid fa-door-closed"></i> Close Door` : `<i class="fa-solid fa-door-open"></i> Open Door`;
    
    showToast(nextDoorState ? "Drum door OPENED" : "Drum door CLOSED", "info");
    playBeep(330, 0.08, 0);
}

// Global SOAP Slider Set
function updateWasherSoap(val) {
    if (!washer3D || !washer3D.isPowered) return;
    washer3D.setSoapLevel(val);
    document.getElementById('soap-level-text').innerText = `${val}%`;
}

function changeWasherCycle() {
    if (!washer3D || !washer3D.isPowered) return;
    const cycle = document.getElementById('washer-cycle-select').value;
    playBeep(659.25, 0.05, 0);

    const ledTime = document.getElementById('led-time-text');
    if (cycle === 'daily') ledTime.innerText = "02:00";
    else if (cycle === 'delicates') ledTime.innerText = "01:30";
    else if (cycle === 'heavy') ledTime.innerText = "03:00";
    else if (cycle === 'spin') ledTime.innerText = "00:45";
}

function toggleWasherStart() {
    if (!washer3D || !washer3D.isPowered) return;
    
    if (washer3D.isDoorOpen) {
        showToast("Close door before starting cycle!", "danger");
        playBeep(180, 0.3, 0);
        return;
    }

    if (washer3D.currentPhase === 'idle' || washer3D.currentPhase === 'completed') {
        const cycle = document.getElementById('washer-cycle-select').value;
        let durationSec = 120;
        if (cycle === 'delicates') durationSec = 90;
        else if (cycle === 'heavy') durationSec = 180;
        else if (cycle === 'spin') durationSec = 45;

        if (cycle === 'spin') {
            washer3D.setPhase('spinning');
        } else {
            washer3D.setPhase('filling');
        }

        showToast(`Starting cycle: [${cycle.toUpperCase()}]`, 'success');
        playBeep(523, 0.1, 0);
        playBeep(659, 0.1, 0.08);

        startWasherConsoleTimer(durationSec);
        triggerWasherAudioLoop();
    } else {
        washer3D.setPhase('idle');
        clearInterval(consoleTimerInterval);
        document.getElementById('led-state-text').innerText = "PAUSED";
        document.getElementById('led-state-text').style.color = "#f59e0b";
        document.getElementById('btn-washer-start').innerHTML = `<i class="fa-solid fa-play"></i> Start`;
        showToast("Cycle paused", "warning");
        playBeep(330, 0.2, 0);
    }
}

function triggerWasherAudioLoop() {
    if (!washer3D) return;
    if (washer3D.audioInterval) clearInterval(washer3D.audioInterval);
    
    washer3D.audioInterval = setInterval(() => {
        if (!washer3D || !washer3D.isPowered) {
            if (washer3D) clearInterval(washer3D.audioInterval);
            if (audioCtx) {
                motorGain.gain.setValueAtTime(0, audioCtx.currentTime);
                waterGain.gain.setValueAtTime(0, audioCtx.currentTime);
            }
            return;
        }

        const rpmEl = document.getElementById('led-rpm-text');
        if (rpmEl) rpmEl.innerText = Math.round(washer3D.rpm);
        updateSynthSound(washer3D.rpm, washer3D.currentPhase);
    }, 150);
}

function startWasherConsoleTimer(totalSeconds) {
    if (!washer3D) return;
    clearInterval(consoleTimerInterval);
    
    const startText = document.getElementById('btn-washer-start');
    if (startText) startText.innerHTML = `<i class="fa-solid fa-pause"></i> Pause`;
    
    const stateText = document.getElementById('led-state-text');
    if (stateText) {
        stateText.innerText = washer3D.currentPhase.toUpperCase();
        stateText.style.color = "#34d399";
    }
    
    const bar = document.getElementById('washer-status-bar');
    if (bar) bar.style.display = 'block';

    let elapsed = 0;
    const initialPhase = washer3D.currentPhase;

    consoleTimerInterval = setInterval(() => {
        elapsed++;
        const remaining = totalSeconds - elapsed;
        const progress = (elapsed / totalSeconds) * 100;
        
        const progressFill = document.getElementById('washer-progress-fill');
        if (progressFill) progressFill.style.width = `${progress}%`;

        const m = Math.floor(remaining / 60).toString().padStart(2, '0');
        const s = (remaining % 60).toString().padStart(2, '0');
        const timeText = document.getElementById('led-time-text');
        if (timeText) timeText.innerText = `${m}:${s}`;

        if (washer3D && initialPhase !== 'spinning') {
            const fraction = elapsed / totalSeconds;
            if (fraction > 0.15 && fraction <= 0.65 && washer3D.currentPhase !== 'washing') {
                washer3D.setPhase('washing');
                if (stateText) stateText.innerText = "WASHING";
                const tempText = document.getElementById('led-temp-text');
                if (tempText) tempText.innerText = "40°C";
            } else if (fraction > 0.65 && fraction <= 0.85 && washer3D.currentPhase !== 'rinsing') {
                washer3D.setPhase('rinsing');
                if (stateText) stateText.innerText = "RINSING";
                const tempText = document.getElementById('led-temp-text');
                if (tempText) tempText.innerText = "30°C";
            } else if (fraction > 0.85 && fraction <= 0.98 && washer3D.currentPhase !== 'spinning') {
                washer3D.setPhase('spinning');
                if (stateText) stateText.innerText = "SPIN-DRY";
                const tempText = document.getElementById('led-temp-text');
                if (tempText) tempText.innerText = "20°C";
            }
        }

        if (remaining <= 0) {
            clearInterval(consoleTimerInterval);
            
            if (washer3D) washer3D.setPhase('completed');
            if (stateText) stateText.innerText = "COMPLETED";
            const timeText = document.getElementById('led-time-text');
            if (timeText) timeText.innerText = "00:00";
            const rpmText = document.getElementById('led-rpm-text');
            if (rpmText) rpmText.innerText = "0";
            const tempText = document.getElementById('led-temp-text');
            if (tempText) tempText.innerText = "30°C";
            
            if (startText) startText.innerHTML = `<i class="fa-solid fa-play"></i> Start`;
            if (bar) bar.style.display = 'none';

            showToast("Laundry cycle COMPLETED!", "success");
            playCompletionBeeps();
        }
    }, 1000);
}


// CHART MANAGEMENT (Admin Panel)
function initAdminChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 9 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 9 } }
                }
            }
        }
    });
}

function updateRevenueChartData() {
    if (!chartInstance) return;

    const weeklyLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const baseWeeklyData = [1200, 1850, 950, 1400, 2200, 3100, 1800]; 
    
    let liveDeliveredTotal = 0;
    orders.forEach(o => {
        if (o.status === 'delivered' && !o.orderId.match(/CF-(38291|82947|92049|10294)/)) {
            liveDeliveredTotal += o.amount;
        }
    });

    baseWeeklyData[6] += liveDeliveredTotal; // add to Sunday
    
    chartInstance.data = {
        labels: weeklyLabels,
        datasets: [{
            label: 'Earnings (₹)',
            data: baseWeeklyData,
            backgroundColor: 'rgba(6, 182, 212, 0.45)',
            borderColor: 'rgba(6, 182, 212, 0.85)',
            borderWidth: 1.5,
            borderRadius: 4
        }]
    };
    chartInstance.update();
}

function adjustQty(change) {
    const input = document.getElementById('item-qty');
    if (!input) return;
    let val = parseInt(input.value) || 1;
    val += change;
    if (val < 1) val = 1;
    if (val > 50) val = 50;
    input.value = val;
    playBeep(523.25, 0.05, 0); 
}

function initBookingMap() {
    const mapDiv = document.getElementById('booking-map');
    if (!mapDiv || bookingMap) return;

    // Initial Coordinates: New Delhi (28.6139, 77.2090)
    const defaultLat = 28.6139;
    const defaultLng = 77.2090;

    try {
        bookingMap = L.map('booking-map').setView([defaultLat, defaultLng], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(bookingMap);

        bookingMarker = L.marker([defaultLat, defaultLng], {
            draggable: true
        }).addTo(bookingMap);

        bookingMarker.on('dragend', function () {
            const position = bookingMarker.getLatLng();
            updateLocationFields(position.lat, position.lng);
        });

        bookingMap.on('click', function (e) {
            bookingMarker.setLatLng(e.latlng);
            updateLocationFields(e.latlng.lat, e.latlng.lng);
        });
    } catch(err) {
        console.warn("Leaflet map initialization failed:", err);
    }
}

async function updateLocationFields(lat, lng) {
    const latEl = document.getElementById('pickup-lat');
    const lngEl = document.getElementById('pickup-lng');
    if (latEl) latEl.value = lat.toFixed(6);
    if (lngEl) lngEl.value = lng.toFixed(6);
    
    const aptEl = document.getElementById('pickup-address-apartment');
    const locEl = document.getElementById('pickup-address-locality');
    const lndEl = document.getElementById('pickup-address-landmark');

    if (locEl) locEl.value = "Locating address details...";

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            
            // Extract location tags
            const house = addr.house_number || addr.building || "";
            const road = addr.road || addr.suburb || "";
            const building = addr.amenity || addr.hotel || addr.shop || addr.office || "";
            const locality = addr.neighbourhood || addr.suburb || addr.residential || addr.city_district || addr.city || "Pinned Area";
            const landmark = addr.amenity || addr.landmark || addr.state || "GPS Coordinates";
            
            const apartmentStr = [house, building].filter(Boolean).join(', ') || `Block Lat: ${lat.toFixed(4)}`;
            
            if (aptEl) aptEl.value = apartmentStr;
            if (locEl) locEl.value = locality;
            if (lndEl) lndEl.value = landmark;
        } else {
            throw new Error();
        }
    } catch (err) {
        console.warn("Reverse geocoding failed, using coordinates fallback:", err);
        if (locEl) locEl.value = `Pinned Area (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`;
        if (aptEl && aptEl.value === "") aptEl.value = `Apartment Coordinates`;
        if (lndEl && lndEl.value === "") lndEl.value = `GPS Marker`;
    }
}

function locateUserGPS() {
    if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser.", "warning");
        return;
    }

    showToast("Requesting GPS location permissions...", "info");
    
    const successCallback = (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        if (bookingMap) {
            bookingMap.setView([lat, lng], 16);
            bookingMarker.setLatLng([lat, lng]);
            updateLocationFields(lat, lng);
            showToast("GPS position acquired successfully!", "success");
        }
    };

    const errorCallback = (error) => {
        console.warn("High accuracy geolocation failed. Trying standard accuracy...", error);
        
        // Fallback to standard accuracy (which resolves via IP/WiFi databases on desktops)
        navigator.geolocation.getCurrentPosition(
            successCallback,
            (lowAccError) => {
                console.warn("Standard accuracy geolocation also failed:", lowAccError);
                showToast("Could not retrieve GPS coordinates. Pin manually on map.", "warning");
            },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
    };

    navigator.geolocation.getCurrentPosition(
        successCallback,
        errorCallback,
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    );
}

// Global scope links
window.switchTab = switchTab;
window.showAuthMode = showAuthMode;
window.handleSignInSubmit = handleSignInSubmit;
window.handleSignUpSubmit = handleSignUpSubmit;
window.handleAdminLoginSubmit = handleAdminLoginSubmit;
window.handleLogout = handleLogout;
window.onServiceSelectChange = onServiceSelectChange;
window.adjustQty = adjustQty;
window.addItemToBasket = addItemToBasket;
window.removeBasketItem = removeBasketItem;
window.selectAddressType = selectAddressType;
window.handleNewBooking = handleNewBooking;
window.switchCustomerPanel = switchCustomerPanel;
window.reorderItems = reorderItems;
window.cancelActiveOrder = cancelActiveOrder;
window.seedSampleOrders = seedSampleOrders;
window.advanceOrderStatus = advanceOrderStatus;
window.weighAndProcessOrder = weighAndProcessOrder;
window.toggleWasherPower = toggleWasherPower;
window.toggleWasherDoor = toggleWasherDoor;
window.updateWasherSoap = updateWasherSoap;
window.changeWasherCycle = changeWasherCycle;
window.toggleWasherStart = toggleWasherStart;
window.toggleLogPanel = toggleLogPanel;
window.closeEmailModal = closeEmailModal;
window.showEmailModal = showEmailModal;
window.sendAdminPaymentReminder = sendAdminPaymentReminder;
window.initBookingMap = initBookingMap;
window.updateLocationFields = updateLocationFields;
window.locateUserGPS = locateUserGPS;

function handleAdminFilterChange() {
    renderAdminOrdersTable();
}
window.handleAdminFilterChange = handleAdminFilterChange;

// QR Code Scanning and Status updates workflow
let html5QrScanner = null;
let currentWeighInOrder = null;
let currentDeliveryOrder = null;

function openQRScannerModal() {
    const modal = document.getElementById('admin-qr-scanner-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
    
    const statusDiv = document.getElementById('admin-qr-status');
    if (statusDiv) statusDiv.innerHTML = 'Scanner status: Ready';
    
    const placeholder = document.getElementById('admin-qr-camera-placeholder');
    if (placeholder) placeholder.style.display = 'flex';

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    if (typeof Html5Qrcode !== 'undefined') {
        html5QrScanner = new Html5Qrcode("admin-qr-reader");
        Html5Qrcode.getCameras().then(devices => {
            if (devices && devices.length > 0) {
                if (placeholder) placeholder.style.display = 'none';
                
                html5QrScanner.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText, decodedResult) => {
                        console.log("QR Scan Success:", decodedText);
                        playBeep(880, 0.15, 0);
                        if (statusDiv) statusDiv.innerHTML = `<span class="text-green-600">Scanned: ${decodedText}</span>`;
                        handleQRScanResult(decodedText.trim());
                    },
                    (errorMessage) => {}
                ).catch(err => {
                    console.error("Camera start error:", err);
                    if (placeholder) placeholder.style.display = 'flex';
                    if (statusDiv) statusDiv.innerText = "Error accessing camera. Use Simulator.";
                });
            } else {
                console.warn("No camera devices found.");
                if (placeholder) placeholder.style.display = 'flex';
            }
        }).catch(err => {
            console.error("Get cameras error:", err);
            if (placeholder) placeholder.style.display = 'flex';
        });
    } else {
        console.error("Html5Qrcode library not loaded.");
    }
}

function closeQRScannerModal() {
    const modal = document.getElementById('admin-qr-scanner-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
    
    if (html5QrScanner) {
        let stopPromise;
        try {
            stopPromise = html5QrScanner.stop();
        } catch (e) {
            html5QrScanner = null;
        }
        if (stopPromise) {
            stopPromise.then(() => {
                console.log("QR Camera stopped.");
                html5QrScanner = null;
            }).catch(err => {
                console.error("QR Camera stop failed:", err);
                html5QrScanner = null;
            });
        }
    }
    
    const simInput = document.getElementById('admin-qr-sim-input');
    if (simInput) simInput.value = '';
}

function triggerQRScanSimulation() {
    const simInput = document.getElementById('admin-qr-sim-input');
    if (!simInput) return;
    const value = simInput.value.trim();
    if (!value) {
        showToast("Please enter an Order ID for simulation!", "danger");
        return;
    }
    
    const statusDiv = document.getElementById('admin-qr-status');
    if (statusDiv) statusDiv.innerHTML = `<span class="text-green-600">Simulated Scan: ${value}</span>`;
    
    playBeep(880, 0.1, 0);
    closeQRScannerModal();
    handleQRScanResult(value);
}

async function handleQRScanResult(orderId) {
    const order = orders.find(o => o.orderId === orderId || o.orderId.toLowerCase() === orderId.toLowerCase());
    if (!order) {
        showToast(`Order #${orderId} not found in database!`, "danger");
        return;
    }
    
    const status = order.status;
    console.log(`Processing scanned Order #${order.orderId} (Status: ${status})`);
    
    const hasWeightItem = order.items.some(item => {
        const catalogCode = item.service_code || item.serviceCode;
        return catalogCode.includes('wash_fold') || catalogCode.includes('wash_iron');
    });

    if (status === 'pending' || status === 'pickup_scheduled') {
        if (hasWeightItem) {
            openQRWeighInModal(order);
        } else {
            await updateQROrderStatus(order.orderId, 'picked_up', `Order #${order.orderId} quantity verified. Status updated to Picked Up.`);
        }
    } else if (status === 'ready' || status === 'out_for_delivery') {
        openQRDeliveryModal(order);
    } else if (status === 'picked_up' || status === 'processing') {
        showToast(`Order #${order.orderId} has already been picked up (Current status: ${status.replace('_', ' ')}).`, "info");
    } else if (status === 'delivered') {
        showToast(`Order #${order.orderId} has already been delivered.`, "info");
    } else if (status === 'cancelled') {
        showToast(`Order #${order.orderId} was cancelled.`, "danger");
    }
}

async function updateQROrderStatus(orderId, nextStatus, successMessage) {
    if (!useLocalFallback) {
        try {
            const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus })
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
        } catch (err) {
            console.error("Update status API error:", err);
            showToast("Server connection error. Updating status locally.", "warning");
        }
    }
    
    const order = orders.find(o => o.orderId === orderId);
    if (order) {
        order.status = nextStatus;
        
        if (activeOrder && activeOrder.orderId === orderId) {
            activeOrder.status = nextStatus;
            renderActiveOrderTracking();
            updateCustomerActiveBadge();
        }
        
        triggerWhatsAppAPI(order, getTemplateTypeForStatus(nextStatus));
    }
    
    renderAdminOrdersTable();
    updateAdminStats();
    
    playBeep(523.25, 0.1, 0);
    playBeep(659.25, 0.15, 0.08);
    
    console.log(successMessage);
    
    if (!useLocalFallback) {
        await syncAppData();
        await syncEmailLogs();
    }
}

function openQRWeighInModal(order) {
    currentWeighInOrder = order;
    
    const modal = document.getElementById('admin-qr-weigh-in-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
    
    document.getElementById('qr-weigh-order-id').innerText = `#${order.orderId}`;
    document.getElementById('qr-weigh-cust-name').innerText = order.customerName;
    document.getElementById('qr-weigh-cust-phone').innerText = order.customerPhone;
    document.getElementById('qr-weigh-address').innerText = order.address;
    
    const list = document.getElementById('qr-weigh-items-list');
    if (list) {
        list.innerHTML = '';
        order.items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center text-xs p-1.5 bg-gray-50 rounded';
            div.innerHTML = `
                <span class="font-medium text-primary">${item.name || item.service_label || item.serviceLabel}</span>
                <span class="text-secondary font-bold">${item.weight > 0 ? item.weight + ' kg' : 'Weigh Pending'}</span>
            `;
            list.appendChild(div);
        });
    }
    
    const weightInput = document.getElementById('qr-weigh-weight-input');
    if (weightInput) {
        weightInput.value = '';
        weightInput.focus();
    }
}

function closeQRWeighInModal() {
    const modal = document.getElementById('admin-qr-weigh-in-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
    currentWeighInOrder = null;
}

function openQRDeliveryModal(order) {
    currentDeliveryOrder = order;
    
    const modal = document.getElementById('admin-qr-delivery-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
    
    document.getElementById('qr-deliver-order-id').innerText = `#${order.orderId}`;
    document.getElementById('qr-deliver-cust-name').innerText = order.customerName;
    document.getElementById('qr-deliver-cust-phone').innerText = order.customerPhone;
    document.getElementById('qr-deliver-address').innerText = order.address;
    
    const amount = order.amount || 0;
    document.getElementById('qr-deliver-amount').innerText = `Amount: ₹${amount.toFixed(2)}`;
    
    const badge = document.getElementById('qr-deliver-payment-badge');
    if (badge) {
        badge.innerText = (order.payment || 'cash').toUpperCase();
    }
    
    const cashContainer = document.getElementById('qr-deliver-cash-container');
    const paidContainer = document.getElementById('qr-deliver-paid-container');
    const cashCheckbox = document.getElementById('qr-deliver-cash-collected');
    const cashLabel = document.getElementById('qr-deliver-cash-label');
    
    if (order.payment === 'cash') {
        if (cashContainer) cashContainer.classList.remove('hidden');
        if (paidContainer) paidContainer.classList.add('hidden');
        if (cashCheckbox) cashCheckbox.checked = false;
        if (cashLabel) cashLabel.innerText = `Cash collected of ₹${amount.toFixed(2)}`;
    } else {
        if (cashContainer) cashContainer.classList.add('hidden');
        if (paidContainer) paidContainer.classList.remove('hidden');
        const methodLabel = order.payment === 'wallet' ? 'Wallet Balance' : 'Online Payment';
        document.getElementById('qr-deliver-paid-msg').innerHTML = `This order is pre-paid via <strong>${methodLabel}</strong>. No cash collection is necessary.`;
    }
}
window.openQRDeliveryModal = openQRDeliveryModal;

function closeQRDeliveryModal() {
    const modal = document.getElementById('admin-qr-delivery-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
    currentDeliveryOrder = null;
}
window.closeQRDeliveryModal = closeQRDeliveryModal;

async function submitQRDelivery(event) {
    event.preventDefault();
    if (!currentDeliveryOrder) return;
    
    const orderId = currentDeliveryOrder.orderId;
    const paymentMethod = currentDeliveryOrder.payment;
    
    if (paymentMethod === 'cash') {
        const cashCheckbox = document.getElementById('qr-deliver-cash-collected');
        if (!cashCheckbox || !cashCheckbox.checked) {
            alert("Please collect the cash payment and check the box to confirm delivery!");
            return;
        }
    }
    
    closeQRDeliveryModal();
    
    await updateQROrderStatus(orderId, 'delivered', `Order #${orderId} delivery verified. Status updated to Delivered.`);
}
window.submitQRDelivery = submitQRDelivery;

async function submitQRWeighIn(event) {
    event.preventDefault();
    if (!currentWeighInOrder) return;
    
    const orderId = currentWeighInOrder.orderId;
    const weightInput = document.getElementById('qr-weigh-weight-input');
    if (!weightInput) return;
    
    const weightVal = parseFloat(weightInput.value);
    if (isNaN(weightVal) || weightVal <= 0) {
        alert("Please enter a valid weight in kg!");
        return;
    }
    
    closeQRWeighInModal();
    
    let payload = { weight: weightVal };
    
    if (!useLocalFallback) {
        try {
            const res = await fetch(`${API_BASE}/orders/${orderId}/metrics`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
        } catch (err) {
            console.error("Weigh API error:", err);
        }
    }
    
    const order = orders.find(o => o.orderId === orderId);
    if (order) {
        let simulatedAmount = 0;
        let simulatedWeight = 0;
        let simulatedItemsCount = 0;

        order.items.forEach(item => {
            const catalogItem = priceCatalog[item.serviceCode || item.service_code];
            if (!catalogItem) return;

            if (catalogItem.unit === 'kg') {
                item.totalWeight = weightVal;
                item.weight = weightVal;
                item.totalPrice = weightVal * catalogItem.price;
                item.total_price = weightVal * catalogItem.price;
            }
            simulatedAmount += item.totalPrice || item.total_price || 0;
            simulatedWeight += item.totalWeight || item.weight || 0;
            simulatedItemsCount += item.qty || 1;
        });

        order.weight = parseFloat(simulatedWeight.toFixed(2));
        order.amount = simulatedAmount;
        order.status = 'picked_up';
        
        if (activeOrder && activeOrder.orderId === orderId) {
            activeOrder.weight = order.weight;
            activeOrder.amount = order.amount;
            activeOrder.status = 'picked_up';
            renderActiveOrderTracking();
            updateCustomerActiveBadge();
        }
        
        triggerWhatsAppAPI(order, getTemplateTypeForStatus('picked_up'));
    }
    
    renderAdminOrdersTable();
    updateAdminStats();
    
    playBeep(523.25, 0.1, 0);
    playBeep(659.25, 0.15, 0.08);
    
    if (!useLocalFallback) {
        await syncAppData();
        await syncEmailLogs();
    }
}

// Bind QR functions to global scope
window.openQRScannerModal = openQRScannerModal;
window.closeQRScannerModal = closeQRScannerModal;
window.triggerQRScanSimulation = triggerQRScanSimulation;
window.closeQRWeighInModal = closeQRWeighInModal;
window.submitQRWeighIn = submitQRWeighIn;

function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const iconSpan = btnEl.querySelector('.material-symbols-outlined');
    if (input.type === 'password') {
        input.type = 'text';
        if (iconSpan) iconSpan.innerText = 'visibility_off';
    } else {
        input.type = 'password';
        if (iconSpan) iconSpan.innerText = 'visibility';
    }
}
window.togglePasswordVisibility = togglePasswordVisibility;

async function syncCustomersData() {
    if (useLocalFallback) {
        renderAdminCustomersTable([]);
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/admin/users`);
        if (!res.ok) throw new Error("Users fetch failed");
        const users = await res.json();
        
        if (Array.isArray(users)) {
            renderAdminCustomersTable(users);
        }
    } catch (e) {
        console.warn("Sync customers failed:", e.message);
    }
}
window.syncCustomersData = syncCustomersData;

function renderAdminCustomersTable(usersList) {
    const tbody = document.getElementById('admin-customers-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    let list = usersList;
    if (list.length === 0) {
        const seen = new Set();
        const extracted = [];
        orders.forEach(o => {
            if (!seen.has(o.customerPhone)) {
                seen.add(o.customerPhone);
                extracted.push({
                    name: o.customerName,
                    phone: o.customerPhone,
                    email: o.customerEmail,
                    role: 'customer'
                });
            }
        });
        list = extracted;
    }

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center text-gray-400 p-4">
                    No customers found in database.
                </td>
            </tr>`;
        return;
    }

    list.forEach(cust => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-100 hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-4 py-3 align-middle font-bold text-primary">${cust.name}</td>
            <td class="px-4 py-3 align-middle">
                <div class="flex flex-col text-[11px] text-gray-500 font-sans">
                    <span class="font-medium text-gray-700">${cust.phone}</span>
                    <span>${cust.email}</span>
                </div>
            </td>
            <td class="px-4 py-3 align-middle">
                <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${cust.role === 'admin' ? 'bg-secondary/15 text-secondary' : 'bg-primary/10 text-primary'} uppercase">
                    ${cust.role}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
window.renderAdminCustomersTable = renderAdminCustomersTable;

// ADMIN SUBTAB SWITCHER (Customers / Valets)
let activeAdminSubTab = 'customers';
function switchAdminSubTab(tab) {
    activeAdminSubTab = tab;
    
    // Toggle buttons class
    const btnCust = document.getElementById('admin-subtab-btn-customers');
    const btnVal = document.getElementById('admin-subtab-btn-valets');
    const btnCoup = document.getElementById('admin-subtab-btn-coupons');
    
    if (btnCust && btnVal && btnCoup) {
        btnCust.classList.toggle('bg-white', tab === 'customers');
        btnCust.classList.toggle('text-primary', tab === 'customers');
        btnCust.classList.toggle('shadow-sm', tab === 'customers');
        btnCust.classList.toggle('text-gray-500', tab !== 'customers');
        
        btnVal.classList.toggle('bg-white', tab === 'valets');
        btnVal.classList.toggle('text-primary', tab === 'valets');
        btnVal.classList.toggle('shadow-sm', tab === 'valets');
        btnVal.classList.toggle('text-gray-500', tab !== 'valets');

        btnCoup.classList.toggle('bg-white', tab === 'coupons');
        btnCoup.classList.toggle('text-primary', tab === 'coupons');
        btnCoup.classList.toggle('shadow-sm', tab === 'coupons');
        btnCoup.classList.toggle('text-gray-500', tab !== 'coupons');
    }
    
    // Toggle subpanels display
    const panelCust = document.getElementById('admin-subpanel-customers');
    const panelVal = document.getElementById('admin-subpanel-valets');
    const panelCoup = document.getElementById('admin-subpanel-coupons');
    
    if (panelCust && panelVal && panelCoup) {
        panelCust.classList.toggle('hidden', tab !== 'customers');
        panelCust.classList.toggle('active', tab === 'customers');
        
        panelVal.classList.toggle('hidden', tab !== 'valets');
        panelVal.classList.toggle('active', tab === 'valets');

        panelCoup.classList.toggle('hidden', tab !== 'coupons');
        panelCoup.classList.toggle('active', tab === 'coupons');
    }

    if (tab === 'valets') {
        syncValetsData();
    } else if (tab === 'coupons') {
        renderAdminCouponsTable();
    } else {
        syncCustomersData();
    }
}
window.switchAdminSubTab = switchAdminSubTab;

async function syncValetsData() {
    if (useLocalFallback) {
        renderAdminValetsTable([]);
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/admin/valets`);
        if (!res.ok) throw new Error();
        const valets = await res.json();
        if (Array.isArray(valets)) {
            renderAdminValetsTable(valets);
        }
    } catch (e) {
        console.warn("Sync valets failed:", e.message);
        renderAdminValetsTable([]);
    }
}
window.syncValetsData = syncValetsData;

function renderAdminValetsTable(valetsList) {
    const tbody = document.getElementById('admin-valets-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    let list = valetsList;
    if (list.length === 0) {
        // Mock offline valets
        list = [
            { id: 1, name: "Rahul Valet", phone: "+91 99000 11111", vehicle_num: "DL-3C-5555", status: "active" },
            { id: 2, name: "Amit Valet", phone: "+91 99000 22222", vehicle_num: "DL-3C-6666", status: "active" }
        ];
    }

    list.forEach(valet => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-100 hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-4 py-2 align-middle font-bold text-secondary">V-${valet.id}</td>
            <td class="px-4 py-2 align-middle font-bold text-primary">${valet.name}</td>
            <td class="px-4 py-2 align-middle font-medium text-gray-700">${valet.phone}</td>
            <td class="px-4 py-2 align-middle font-semibold text-gray-500">${valet.vehicle_num || 'No Vehicle'}</td>
            <td class="px-4 py-2 align-middle">
                <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-700 uppercase">
                    ${valet.status}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
window.renderAdminValetsTable = renderAdminValetsTable;

async function handleAddValetSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('new-valet-name').value.trim();
    const rawPhone = document.getElementById('new-valet-phone').value.trim();
    const vehicle = document.getElementById('new-valet-vehicle').value.trim();
    const password = document.getElementById('new-valet-password').value;

    if (!name || !rawPhone || !password) {
        showToast("Name, Mobile, and Login Password are required to create a valet.", "danger");
        return;
    }

    if (!isValidIndianPhoneNumber(rawPhone)) {
        showToast("Invalid valet phone number. Please enter a valid 10-digit Indian mobile number.", "danger");
        return;
    }

    const phone = normalizePhoneNumber(rawPhone);

    if (password.length < 6) {
        showToast("Valet login password must be at least 6 characters long.", "danger");
        return;
    }

    if (!useLocalFallback) {
        try {
            const res = await fetch(`${API_BASE}/admin/valets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, vehicle_num: vehicle, password })
            });
            if (res.ok) {
                showToast(`Valet staff ${name} registered successfully!`, "success");
            } else {
                const data = await res.json();
                throw new Error(data.error);
            }
        } catch (err) {
            console.error("Add valet error:", err);
            showToast(err.message || "Failed to register valet.", "danger");
            return;
        }
    } else {
        showToast(`Valet staff ${name} registered (Simulated offline memory)!`, "success");
    }

    // Reset inputs
    document.getElementById('new-valet-name').value = '';
    document.getElementById('new-valet-phone').value = '';
    document.getElementById('new-valet-vehicle').value = '';
    document.getElementById('new-valet-password').value = '';

    await syncValetsData();
    playBeep(880, 0.15, 0);
}
window.handleAddValetSubmit = handleAddValetSubmit;

function routeToDashboard() {
    if (currentUser) {
        if (currentUser.role === 'admin' || currentUser.role === 'valet') {
            switchTab('admin');
        } else {
            switchTab('customer');
        }
    }
}
window.routeToDashboard = routeToDashboard;

function toggleMobileAuth() {
    if (currentUser) {
        handleLogout();
    } else {
        showAuthMode('signin');
    }
}
window.toggleMobileAuth = toggleMobileAuth;

function applyCoupon() {
    const code = document.getElementById('coupon-code-input').value.trim().toUpperCase();
    if (!code) {
        showToast("Please enter a coupon code first.", "warning");
        return;
    }

    if (currentBasket.length === 0) {
        showToast("Add services to basket before applying coupons.", "warning");
        return;
    }

    const found = availableCoupons.find(c => c.code === code);

    if (found) {
        activeCoupon = found;
        renderBasket();
        showToast(`Coupon ${code} applied successfully!`, "success");
        playBeep(660, 0.15, 0);
    } else {
        showToast("Invalid coupon code. Please try again.", "danger");
        playBeep(220, 0.25, 0);
    }
}
window.applyCoupon = applyCoupon;

function renderAdminCouponsTable() {
    const tbody = document.getElementById('admin-coupons-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    availableCoupons.forEach((coupon, index) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-100 hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-4 py-3 align-middle font-bold text-primary">${coupon.code}</td>
            <td class="px-4 py-3 align-middle font-semibold text-gray-600">${coupon.type === 'percent' ? 'Percentage OFF (%)' : 'Flat Discount (₹)'}</td>
            <td class="px-4 py-3 align-middle font-bold text-secondary">${coupon.type === 'percent' ? coupon.value + '%' : '₹' + coupon.value}</td>
            <td class="px-4 py-3 align-middle text-right space-x-2">
                <button type="button" onclick="editCoupon(${index})" class="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded text-[10px] font-bold text-primary transition-colors">Edit</button>
                <button type="button" onclick="deleteCoupon(${index})" class="px-2.5 py-1 bg-red-50 hover:bg-red-100 rounded text-[10px] font-bold text-red-600 transition-colors">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
window.renderAdminCouponsTable = renderAdminCouponsTable;

function editCoupon(index) {
    const coupon = availableCoupons[index];
    document.getElementById('coupon-edit-index').value = index;
    document.getElementById('admin-coupon-code').value = coupon.code;
    document.getElementById('admin-coupon-type').value = coupon.type;
    document.getElementById('admin-coupon-value').value = coupon.value;
}
window.editCoupon = editCoupon;

function deleteCoupon(index) {
    if (confirm(`Are you sure you want to delete coupon ${availableCoupons[index].code}?`)) {
        availableCoupons.splice(index, 1);
        saveCouponsToStorage();
        renderAdminCouponsTable();
        showToast("Coupon deleted successfully.", "success");
    }
}
window.deleteCoupon = deleteCoupon;

function resetCouponForm() {
    document.getElementById('coupon-edit-index').value = "-1";
    document.getElementById('admin-coupon-code').value = "";
    document.getElementById('admin-coupon-type').value = "percent";
    document.getElementById('admin-coupon-value').value = "";
}
window.resetCouponForm = resetCouponForm;

function handleSaveCoupon(e) {
    e.preventDefault();
    const index = parseInt(document.getElementById('coupon-edit-index').value, 10);
    const code = document.getElementById('admin-coupon-code').value.trim().toUpperCase();
    const type = document.getElementById('admin-coupon-type').value;
    const value = parseFloat(document.getElementById('admin-coupon-value').value);

    if (!code || isNaN(value) || value <= 0) return;

    if (index === -1) {
        // Add new coupon
        if (availableCoupons.some(c => c.code === code)) {
            showToast("A coupon with this code already exists.", "danger");
            return;
        }
        availableCoupons.push({ code, type, value });
        saveCouponsToStorage();
        showToast(`Coupon ${code} created successfully!`, "success");
    } else {
        // Update coupon
        availableCoupons[index] = { code, type, value };
        saveCouponsToStorage();
        showToast(`Coupon ${code} updated successfully!`, "success");
    }

    resetCouponForm();
    renderAdminCouponsTable();
    playBeep(880, 0.15, 0);
}
window.handleSaveCoupon = handleSaveCoupon;

// --- Forgot & Reset Password Functions ---
function showForgotPasswordForm() {
    showAuthMode('forgot');
}
window.showForgotPasswordForm = showForgotPasswordForm;

async function handleForgotPasswordSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    if (!email) return;

    if (!isValidEmail(email)) {
        showToast("Invalid email address format.", "danger");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast("Verification code has been sent to your email!", "success");
            const resetEmail = document.getElementById('reset-email');
            if (resetEmail) resetEmail.value = email;
            showAuthMode('reset');
        } else {
            showToast(data.error || "Password recovery request failed.", "danger");
        }
    } catch (err) {
        console.error("Forgot password error:", err);
        showToast("Server error connecting to database.", "danger");
    }
}
window.handleForgotPasswordSubmit = handleForgotPasswordSubmit;

async function handleResetPasswordSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('reset-email').value.trim();
    const token = document.getElementById('reset-token').value.trim();
    const password = document.getElementById('reset-new-password').value;
    const confirmPassword = document.getElementById('reset-confirm-password').value;

    if (!email || !token || !password || !confirmPassword) {
        showToast("Please fill in all reset password fields.", "danger");
        return;
    }

    if (password.length < 6) {
        showToast("Password must be at least 6 characters long.", "danger");
        return;
    }

    if (password !== confirmPassword) {
        showToast("Confirm password does not match the new password.", "danger");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token, password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast("Password updated successfully! Please sign in.", "success");
            showAuthMode('signin');
            
            // Clear fields
            document.getElementById('reset-email').value = '';
            document.getElementById('reset-token').value = '';
            document.getElementById('reset-new-password').value = '';
            document.getElementById('reset-confirm-password').value = '';
        } else {
            showToast(data.error || "Password reset failed.", "danger");
        }
    } catch (err) {
        console.error("Reset password error:", err);
        showToast("Server connection error during reset.", "danger");
    }
}
window.handleResetPasswordSubmit = handleResetPasswordSubmit;
