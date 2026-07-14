require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { exec } = require('child_process');
const { initDb, dbRun, dbAll, dbGet } = require('./db');

const compression = require('compression');

const crypto = require('crypto');

// Generate static secret key based on env or generate a persistent fallback
const TOKEN_SECRET = process.env.TOKEN_SECRET || "1cd9723ef97f0a39ffd9b711ae3d38d7be79b74f001726a55b66d8b220000000"; // 64 chars hex

// Cryptographic token encryption/decryption (AES-256-CBC)
function createToken(payload) {
    try {
        const key = Buffer.from(TOKEN_SECRET.substring(0, 64), 'hex').slice(0, 32); // 32 bytes
        const iv = Buffer.from(TOKEN_SECRET.substring(0, 32), 'hex').slice(0, 16);  // 16 bytes
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch(e) {
        console.error("Token creation failed:", e.message);
        return null;
    }
}

function verifyToken(token) {
    if (!token) return null;
    try {
        const key = Buffer.from(TOKEN_SECRET.substring(0, 64), 'hex').slice(0, 32); // 32 bytes
        const iv = Buffer.from(TOKEN_SECRET.substring(0, 32), 'hex').slice(0, 16);  // 16 bytes
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(token, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (err) {
        return null;
    }
}

// Password hashing helper (PBKDF2-SHA512 + Salt)
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
    if (!storedPassword) return false;
    // Fallback support for older plaintext accounts
    if (!storedPassword.includes(':')) {
        return password === storedPassword;
    }
    const [salt, originalHash] = storedPassword.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === originalHash;
}

// Request authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied: Authentication token required.' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(403).json({ error: 'Access denied: Invalid or expired token.' });
    }
    
    req.user = decoded;
    next();
}

// Role restriction middleware
function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied: Insufficient permissions.' });
        }
        next();
    };
}

// Input XSS sanitization helper
function sanitizeInput(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(bodyParser.json());

// Enable Brotli/Gzip compression middleware for optimized asset transmission
app.use(compression());

// Register strict browser security headers (CSP, X-Frame-Options, no-sniff, referrer-policy)
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self' http://localhost:3000 https://*.vercel.app; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https://api.qrserver.com https://*.tile.openstreetmap.org https://unpkg.com; connect-src 'self' http://localhost:3000 https://*.vercel.app https://unpkg.com https://cdn.jsdelivr.net; media-src 'self';");
    next();
});

// Development-only API Response Time Monitor
app.use((req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const duration = process.hrtime(start);
        const durationMs = (duration[0] * 1000 + duration[1] / 1e6).toFixed(2);
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[API Monitor] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${durationMs}ms`);
        }
    });
    next();
});

// Serve static frontend files with premium Cache-Control policies (immutable for assets, stale-check for HTML)
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: 31536000000, // 1 year in ms
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Custom favicon handler serving the premium brand logo
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'components', 'Brand_Logo.PNG'));
});

// Lightweight ping endpoint to warm serverless function
app.get('/api/ping', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        await dbGet('SELECT 1');
        res.status(200).json({ status: 'ok', database: 'connected' });
    } catch (err) {
        console.error('Health check failed:', err.message);
        res.status(500).json({ status: 'error', message: 'Database connection failed: ' + err.message });
    }
});

// Initialize SQLite database
initDb();

// 30-item Premium Price Catalog
const servicePrices = {
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

// Validation Helper Functions
function isValidIndianPhoneNumber(phone) {
    if (!phone) return false;
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
        clean = clean.substring(1);
    }
    if (clean.length === 12 && clean.startsWith('91')) {
        clean = clean.substring(2);
    }
    return clean.length === 10 && /^[6-9]\d{9}$/.test(clean);
}

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
        clean = clean.substring(1);
    }
    if (clean.length === 12 && clean.startsWith('91')) {
        clean = clean.substring(2);
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

// 1. AUTHENTICATION: SIGN UP
app.post('/api/auth/signup', async (req, res) => {
    const { name, phone: rawPhone, email, password } = req.body;
    if (!rawPhone || !name || !email || !password) {
        return res.status(400).json({ error: 'All fields (name, phone, email, password) are required.' });
    }

    const cleanEmail = sanitizeInput(email).toLowerCase().trim();
    if (!isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: 'Invalid email address format. Must be user@domain.com' });
    }

    if (!isValidIndianPhoneNumber(rawPhone)) {
        return res.status(400).json({ error: 'Invalid Indian phone number. Please enter a valid 10-digit mobile number.' });
    }

    const phone = normalizePhoneNumber(rawPhone);
    const cleanName = sanitizeInput(name);
    const hashedPassword = hashPassword(password);

    try {
        const existingPhone = await dbGet('SELECT * FROM users WHERE phone = ?', [phone]);
        if (existingPhone) {
            return res.status(400).json({ error: 'This phone number has already been registered.' });
        }

        const existingEmail = await dbGet('SELECT * FROM users WHERE email = ?', [cleanEmail]);
        if (existingEmail) {
            return res.status(400).json({ error: 'This email address has already been registered.' });
        }

        await dbRun(
            'INSERT INTO users (name, phone, email, password, role) VALUES (?, ?, ?, ?, ?)',
            [cleanName, phone, cleanEmail, hashedPassword, 'customer']
        );
        const newUser = await dbGet('SELECT id, name, phone, email, role FROM users WHERE phone = ?', [phone]);
        console.log(`Registered new user: ${cleanName} (${phone})`);
        
        const token = createToken(newUser);
        res.json({ success: true, user: newUser, token });
    } catch (err) {
        console.error('Signup error:', err.message);
        res.status(500).json({ error: 'Database error occurred during registration' });
    }
});

// 2. AUTHENTICATION: LOGIN
app.post('/api/auth/login', async (req, res) => {
    const { phone: rawPhone, password } = req.body;
    if (!rawPhone || !password) {
        return res.status(400).json({ error: 'Phone number and password are required.' });
    }

    const phone = normalizePhoneNumber(rawPhone);

    try {
        const user = await dbGet('SELECT * FROM users WHERE phone = ?', [phone]);

        if (!user || !verifyPassword(password, user.password)) {
            return res.status(401).json({ error: 'Invalid phone number or password.' });
        }

        console.log(`Logged in: ${user.name} (${user.role})`);
        const safeUser = { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role };
        const token = createToken(safeUser);
        res.json({ success: true, user: safeUser, token });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Database error occurred during login' });
    }
});

// 2.1 AUTHENTICATION: FORGOT PASSWORD
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email address is required.' });
    }

    try {
        const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(400).json({ error: 'No user registered with this email address.' });
        }

        // Generate a 6-digit verification code
        const token = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry

        // Store reset token
        await dbRun(`
            INSERT INTO password_resets (email, token, expires_at)
            VALUES (?, ?, ?)
            ON CONFLICT (email) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
        `, [email, token, expiresAt]);

        const origin = req.headers.origin || 'http://localhost:3000';
        const resetLink = `${origin}/?resetToken=${token}&email=${encodeURIComponent(email)}`;

        const emailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #c2c7cd; border-radius: 12px; background-color: #ffffff; color: #001726;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #001726; margin: 0;">369 Laundry</h2>
                </div>
                <hr style="border: 0; border-top: 1px solid #e1e4e8; margin: 20px 0;" />
                <h3 style="color: #001726;">Password Reset Request</h3>
                <p>Hello ${user.name},</p>
                <p>We received a request to reset your password. You can set a new password by clicking the link below:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}" style="background-color: #005a9c; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Reset Password Link</a>
                </div>
                <p>Alternatively, you can manually enter the following 6-digit verification code on the reset page:</p>
                <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; color: #005a9c; margin: 15px 0;">${token}</p>
                <p style="font-size: 11px; color: #72787e;">This code and link will expire in 15 minutes. If you did not request this, please ignore this email.</p>
            </div>
        `;

        triggerEmailAsync(email, "Reset Your 369 Laundry Password", emailHtml);
        res.json({ success: true, message: 'Password reset link and code sent to your email.' });
    } catch (err) {
        console.error('Forgot password error:', err.message);
        res.status(500).json({ error: 'Database error occurred during reset request.' });
    }
});

// 2.2 AUTHENTICATION: RESET PASSWORD
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, token, password } = req.body;
    if (!email || !token || !password) {
        return res.status(400).json({ error: 'Email, verification code, and new password are required.' });
    }

    try {
        const resetRecord = await dbGet('SELECT * FROM password_resets WHERE email = ?', [email]);
        if (!resetRecord) {
            return res.status(400).json({ error: 'Invalid reset request. Please request a new code.' });
        }

        if (resetRecord.token !== token) {
            return res.status(400).json({ error: 'Incorrect verification code.' });
        }

        const now = new Date();
        const expiresAt = new Date(resetRecord.expires_at);
        if (now > expiresAt) {
            return res.status(400).json({ error: 'Verification code has expired.' });
        }

        // Update the user's password in the users table with standard PBKDF2 hash
        const hashedPassword = hashPassword(password);
        await dbRun('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

        // Clean up password resets
        await dbRun('DELETE FROM password_resets WHERE email = ?', [email]);

        res.json({ success: true, message: 'Password reset completed successfully.' });
    } catch (err) {
        console.error('Reset password error:', err.message);
        res.status(500).json({ error: 'Database error occurred during password reset.' });
    }
});

// 3. ADDRESS BOOK: GET ADDRESSES
app.get('/api/users/addresses', authenticateToken, async (req, res) => {
    const { phone: rawPhone } = req.query;
    if (!rawPhone) {
        return res.status(400).json({ error: 'User phone is required' });
    }

    const phone = normalizePhoneNumber(rawPhone);

    // Customers can only view their own address book
    if (req.user.role === 'customer' && normalizePhoneNumber(req.user.phone) !== phone) {
        return res.status(403).json({ error: 'Access denied: You cannot view addresses for another user.' });
    }

    try {
        const addresses = await dbAll('SELECT * FROM addresses WHERE user_phone = ?', [phone]);
        res.json(addresses);
    } catch (err) {
        console.error('Fetch addresses error:', err.message);
        res.status(500).json({ error: 'Database error fetching addresses' });
    }
});

// 4. ADDRESS BOOK: ADD ADDRESS
app.post('/api/users/addresses', authenticateToken, async (req, res) => {
    const { phone: rawPhone, type, address_line } = req.body;
    if (!rawPhone || !type || !address_line) {
        return res.status(400).json({ error: 'Phone, type, and address_line are required' });
    }

    const phone = normalizePhoneNumber(rawPhone);

    // Customers can only append to their own address book
    if (req.user.role === 'customer' && normalizePhoneNumber(req.user.phone) !== phone) {
        return res.status(403).json({ error: 'Access denied: You cannot modify addresses for another user.' });
    }

    const cleanType = sanitizeInput(type);
    const cleanAddressLine = sanitizeInput(address_line);

    try {
        const existing = await dbGet(
            'SELECT * FROM addresses WHERE user_phone = ? AND type = ? AND address_line = ?',
            [phone, cleanType, cleanAddressLine]
        );

        if (!existing) {
            await dbRun('INSERT INTO addresses (user_phone, type, address_line) VALUES (?, ?, ?)', [phone, cleanType, cleanAddressLine]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Add address error:', err.message);
        res.status(500).json({ error: 'Database error adding address' });
    }
});

// 5. ORDERS: GET ORDERS (Admin or specific Customer - MAPPED TO CAMELCASE)
app.get('/api/orders', authenticateToken, async (req, res) => {
    const { phone } = req.query;

    // Verify ownership and roles
    if (req.user.role === 'customer') {
        const queryPhone = normalizePhoneNumber(phone || req.user.phone);
        if (normalizePhoneNumber(req.user.phone) !== queryPhone) {
            return res.status(403).json({ error: 'Access denied: You can only query your own orders.' });
        }
    } else if (req.user.role !== 'admin' && req.user.role !== 'valet') {
        return res.status(403).json({ error: 'Access denied: Insufficient permissions.' });
    }

    try {
        let dbRows = [];
        if (req.user.role === 'admin' || req.user.role === 'valet') {
            dbRows = await dbAll('SELECT * FROM orders ORDER BY date DESC, order_id DESC');
        } else {
            const queryPhone = normalizePhoneNumber(phone || req.user.phone);
            dbRows = await dbAll('SELECT * FROM orders WHERE customer_phone = ? ORDER BY date DESC, order_id DESC', [queryPhone]);
        }

        const mappedOrders = dbRows.map(order => ({
            orderId: order.order_id,
            customerName: order.customer_name,
            customerPhone: order.customer_phone,
            customerEmail: order.customer_email,
            date: order.date,
            slot: order.slot,
            address: order.address,
            addressType: order.address_type,
            payment: order.payment,
            weight: order.weight,
            itemsCount: order.items_count,
            amount: order.amount,
            status: order.status,
            timestamp: order.timestamp,
            latitude: order.latitude || 0,
            longitude: order.longitude || 0,
            isExpress: order.is_express === 1 || order.is_express === true || order.is_express === 'true' || order.is_express === '1',
            paymentStatus: order.payment_status || 'pending'
        }));

        if (mappedOrders.length > 0) {
            const orderIds = mappedOrders.map(o => o.orderId);
            const placeholders = orderIds.map(() => '?').join(',');
            const allItems = await dbAll(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);

            const itemsByOrderId = {};
            for (const item of allItems) {
                const oId = item.order_id;
                if (!itemsByOrderId[oId]) {
                    itemsByOrderId[oId] = [];
                }
                itemsByOrderId[oId].push({
                    id: item.id.toString(),
                    name: item.name,
                    qty: item.qty,
                    totalWeight: item.weight,
                    serviceCode: item.service_code,
                    serviceLabel: item.service_label,
                    unitPrice: item.unit_price,
                    totalPrice: item.total_price
                });
            }

            for (let order of mappedOrders) {
                order.items = itemsByOrderId[order.orderId] || [];
            }
        }

        res.json(mappedOrders);
    } catch (err) {
        console.error('Fetch orders error:', err.message);
        res.status(500).json({ error: 'Database error fetching orders', message: err.message });
    }
});

// 5.6 ADMIN: GET ALL REGISTERED USERS
app.get('/api/admin/users', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const users = await dbAll('SELECT name, phone, email, role FROM users ORDER BY name ASC');
        res.json(users);
    } catch (err) {
        console.error('Fetch users error:', err.message);
        res.status(500).json({ error: 'Database error fetching users' });
    }
});

// 5.6.1 ADMIN: UPDATE USER ROLE
app.put('/api/admin/users/:phone/role', authenticateToken, requireRole(['admin']), async (req, res) => {
    const { phone: rawPhone } = req.params;
    const { role } = req.body;

    if (!role || !['customer', 'valet', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Valid role (customer, valet, admin) is required.' });
    }

    const phone = normalizePhoneNumber(rawPhone);

    try {
        const user = await dbGet('SELECT * FROM users WHERE phone = ?', [phone]);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        await dbRun('UPDATE users SET role = ? WHERE phone = ?', [role, phone]);

        // Sync valet table membership
        if (role === 'valet') {
            const existingValet = await dbGet('SELECT * FROM valets WHERE phone = ?', [phone]);
            if (!existingValet) {
                await dbRun('INSERT INTO valets (name, phone, vehicle_num, status) VALUES (?, ?, ?, ?)', [user.name, phone, '', 'active']);
            }
        } else {
            await dbRun('DELETE FROM valets WHERE phone = ?', [phone]);
        }

        console.log(`Updated user ${phone} role to ${role}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Update user role error:', err.message);
        res.status(500).json({ error: 'Database error updating user role' });
    }
});

// 5.6.2 ADMIN: DELETE USER PROFILE
app.delete('/api/admin/users/:phone', async (req, res) => {
    const { phone: rawPhone } = req.params;
    const phone = normalizePhoneNumber(rawPhone);

    try {
        const user = await dbGet('SELECT * FROM users WHERE phone = ?', [phone]);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        await dbRun('DELETE FROM users WHERE phone = ?', [phone]);
        await dbRun('DELETE FROM valets WHERE phone = ?', [phone]);
        await dbRun('DELETE FROM addresses WHERE user_phone = ?', [phone]);

        console.log(`Deleted user profile: ${phone}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete user error:', err.message);
        res.status(500).json({ error: 'Database error deleting user profile' });
    }
});

// 5.6.5 ADMIN: LOOKUP CUSTOMER BY PHONE
app.get('/api/users/lookup', authenticateToken, requireRole(['admin']), async (req, res) => {
    const { phone: rawPhone } = req.query;
    if (!rawPhone) {
        return res.status(400).json({ error: 'Phone number is required.' });
    }
    const phone = normalizePhoneNumber(rawPhone);
    try {
        const user = await dbGet('SELECT id, name, phone, email, role FROM users WHERE phone = ?', [phone]);
        if (user) {
            res.json({ exists: true, user });
        } else {
            res.json({ exists: false });
        }
    } catch(err) {
        console.error('Lookup user error:', err.message);
        res.status(500).json({ error: 'Database error looking up user.' });
    }
});

// 5.6.6 ADMIN: CREATE WALK-IN ORDER & BILL
app.post('/api/admin/orders/walk-in', authenticateToken, requireRole(['admin']), async (req, res) => {
    const {
        phone: rawPhone,
        name,
        email,
        items,
        paymentMethod,
        paymentStatus,
        amount
    } = req.body;

    if (!rawPhone || !name || !items || !Array.isArray(items) || items.length === 0 || !amount) {
        return res.status(400).json({ error: 'Missing required walk-in order fields or empty items list.' });
    }

    const phone = normalizePhoneNumber(rawPhone);
    const cleanName = sanitizeInput(name);
    const cleanEmail = email ? sanitizeInput(email).toLowerCase().trim() : `${phone.replace(/\+/g, '')}@369laundry.com`;
    const cleanPayMethod = sanitizeInput(paymentMethod || 'Cash');
    const cleanPayStatus = sanitizeInput(paymentStatus || 'pending');

    try {
        // 1. Check/Create User Profile
        let user = await dbGet('SELECT * FROM users WHERE phone = ?', [phone]);
        if (!user) {
            const defaultPassword = hashPassword(phone.replace('+', ''));
            await dbRun(
                'INSERT INTO users (name, phone, email, password, role) VALUES (?, ?, ?, ?, ?)',
                [cleanName, phone, cleanEmail, defaultPassword, 'customer']
            );
            user = await dbGet('SELECT * FROM users WHERE phone = ?', [phone]);
            console.log(`Auto-created customer profile for walk-in: ${cleanName} (${phone})`);
        }

        // 2. Generate Sequential Order ID
        let orderId = '';
        try {
            const rows = await dbAll("SELECT order_id FROM orders WHERE order_id LIKE 'LX-%'");
            let maxSeq = 0;
            rows.forEach(r => {
                const part = r.order_id.substring(3);
                const num = parseInt(part, 10);
                if (!isNaN(num) && num > maxSeq) {
                    maxSeq = num;
                }
            });
            const nextNum = maxSeq + 1;
            const padded = String(nextNum).padStart(3, '0');
            orderId = `LX-${padded}`;
        } catch (e) {
            const orderNum = Math.floor(10000 + Math.random() * 90000);
            orderId = `LX-${orderNum}`;
        }

        const date = new Date().toISOString().split('T')[0];
        const slot = 'Walk-In (In-Shop)';
        const address = 'Walk-In (Over-The-Counter)';
        const addressType = 'other';
        const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        let totalItemsCount = 0;
        let totalWeight = 0;
        let isExpressAny = 0;

        // Verify items and calculate statistics
        for (const item of items) {
            const catalog = servicePrices[item.serviceCode];
            if (!catalog) {
                return res.status(400).json({ error: `Invalid service code: ${item.serviceCode}` });
            }
            if (catalog.unit === 'kg') {
                totalWeight += parseFloat(item.weight || 0);
                totalItemsCount += 1;
            } else {
                totalItemsCount += parseInt(item.qty || 1);
            }
            if (item.isExpress) {
                isExpressAny = 1;
            }
        }

        // 3. Insert order
        await dbRun(`
            INSERT INTO orders (
                order_id, customer_name, customer_phone, customer_email, date, slot, address, address_type, payment, weight, items_count, amount, status, timestamp, latitude, longitude, is_express, payment_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
        `, [
            orderId, cleanName, phone, cleanEmail, date, slot, address, addressType, cleanPayMethod, totalWeight, totalItemsCount, parseFloat(amount), 'processing', timestamp, isExpressAny, cleanPayStatus
        ]);

        // 4. Insert items
        for (const item of items) {
            const catalog = servicePrices[item.serviceCode];
            const cleanSvcCode = sanitizeInput(item.serviceCode);
            const itemsCount = catalog.unit === 'kg' ? 1 : parseInt(item.qty || 1);
            const finalWeight = catalog.unit === 'kg' ? parseFloat(item.weight || 1.0) : 0;
            const finalItemPrice = parseFloat(item.price || 0);

            const serviceLabel = catalog.unit === 'kg' 
                ? `${catalog.name} (${finalWeight.toFixed(2)} kg)` 
                : `${catalog.name} (Qty: ${itemsCount})`;

            await dbRun(`
                INSERT INTO order_items (
                    order_id, name, qty, weight, service_code, service_label, unit_price, total_price
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                orderId, catalog.name, itemsCount, finalWeight, cleanSvcCode, serviceLabel, catalog.price, finalItemPrice
            ]);
        }

        console.log(`Multi-item Walk-In order ${orderId} created successfully for ${cleanName}`);
        
        const createdOrder = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        const createdItems = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        createdOrder.items = createdItems;

        // Async Email confirmation
        triggerEmailAsync(createdOrder, 'processing');

        res.status(201).json({ success: true, orderId, user: { name: cleanName, phone, email: cleanEmail } });
    } catch (err) {
        console.error('Walk-in order creation failed:', err.message);
        res.status(500).json({ error: 'Database error creating walk-in order.' });
    }
});

// 5.7 ADMIN: GET ALL VALETS
app.get('/api/admin/valets', async (req, res) => {
    try {
        const valets = await dbAll('SELECT * FROM valets ORDER BY id ASC');
        res.json(valets);
    } catch (err) {
        console.error('Fetch valets error:', err.message);
        res.status(500).json({ error: 'Database error fetching valets' });
    }
});

// 5.8 ADMIN: CREATE NEW STAFF VALET
app.post('/api/admin/valets', authenticateToken, requireRole(['admin']), async (req, res) => {
    const { name, phone: rawPhone, vehicle_num, password } = req.body;
    if (!name || !rawPhone || !password) {
        return res.status(400).json({ error: 'Name, Phone, and Password are required' });
    }
    if (!isValidIndianPhoneNumber(rawPhone)) {
        return res.status(400).json({ error: 'Invalid Indian phone number for valet. Please enter a valid 10-digit mobile number.' });
    }
    const phone = normalizePhoneNumber(rawPhone);
    const cleanName = sanitizeInput(name);
    const cleanVehicleNum = sanitizeInput(vehicle_num || '');
    const hashedPassword = hashPassword(password);

    try {
        await dbRun(
            'INSERT INTO valets (name, phone, vehicle_num, status) VALUES (?, ?, ?, ?)',
            [cleanName, phone, cleanVehicleNum, 'active']
        );
        await dbRun(
            'INSERT INTO users (name, phone, email, password, role) VALUES (?, ?, ?, ?, ?)',
            [cleanName, phone, `${phone.replace(/\s+/g, '')}@369laundry.com`, hashedPassword, 'valet']
        );
        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Create valet error:', err.message);
        res.status(500).json({ error: 'Database error creating valet (phone might already exist)' });
    }
});

// 5.5 ORDERS: GET SINGLE ORDER BY ID (Public lookup for landing page tracking)
app.get('/api/orders/:orderId', async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const mappedOrder = {
            orderId: order.order_id,
            customerName: order.customer_name,
            customerPhone: order.customer_phone,
            customerEmail: order.customer_email,
            date: order.date,
            slot: order.slot,
            address: order.address,
            addressType: order.address_type,
            payment: order.payment,
            weight: order.weight,
            itemsCount: order.items_count,
            amount: order.amount,
            status: order.status,
            timestamp: order.timestamp,
            latitude: order.latitude || 0,
            longitude: order.longitude || 0,
            isExpress: order.is_express === 1 || order.is_express === true || order.is_express === 'true' || order.is_express === '1',
            paymentStatus: order.payment_status || 'pending'
        };

        const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        mappedOrder.items = items.map(item => ({
            id: item.id.toString(),
            name: item.name,
            qty: item.qty,
            totalWeight: item.weight,
            serviceCode: item.service_code,
            serviceLabel: item.service_label,
            unitPrice: item.unit_price,
            totalPrice: item.total_price
        }));

        res.json(mappedOrder);
    } catch (err) {
        console.error('Fetch order by ID error:', err.message);
        res.status(500).json({ error: 'Database error fetching order' });
    }
});

// 5.9 ORDERS: GET NEXT SEQUENTIAL ORDER ID
app.get('/api/orders/next-id', async (req, res) => {
    try {
        const rows = await dbAll("SELECT order_id FROM orders WHERE order_id LIKE 'LX-%'");
        let maxSeq = 0;
        rows.forEach(r => {
            const part = r.order_id.substring(3); // Remove 'LX-'
            const num = parseInt(part, 10);
            if (!isNaN(num) && num > maxSeq) {
                maxSeq = num;
            }
        });
        const nextNum = maxSeq + 1;
        const padded = String(nextNum).padStart(3, '0');
        res.json({ orderId: `LX-${padded}` });
    } catch (err) {
        console.error("Error generating next sequential order ID:", err.message);
        // Fallback to safe random value
        const orderNum = Math.floor(10000 + Math.random() * 90000);
        res.json({ orderId: `LX-${orderNum}` });
    }
});

// 6. ORDERS: PLACE ORDER
app.post('/api/orders', authenticateToken, async (req, res) => {
    const {
        orderId, customerName, customerPhone: rawPhone, customerEmail, date, slot, address, addressType, payment, weight, itemsCount, amount, status, timestamp, items, latitude, longitude, isExpress
    } = req.body;

    if (!orderId || !rawPhone || !items || items.length === 0) {
        return res.status(400).json({ error: 'Incomplete order details or empty basket' });
    }

    const customerPhone = normalizePhoneNumber(rawPhone);

    // Verify ownership
    if (req.user.role === 'customer' && normalizePhoneNumber(req.user.phone) !== customerPhone) {
        return res.status(403).json({ error: 'Access denied: You cannot place orders on behalf of another phone number.' });
    }

    const cleanEmail = sanitizeInput(customerEmail);
    if (cleanEmail && !isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: 'Invalid customer email address.' });
    }

    if (!isValidIndianPhoneNumber(rawPhone)) {
        return res.status(400).json({ error: 'Invalid customer phone number. Must be a valid 10-digit Indian mobile.' });
    }

    // Business Logic Validations
    if (parseFloat(amount) < 0) {
        return res.status(400).json({ error: 'Invalid order amount.' });
    }
    if (parseFloat(weight) < 0) {
        return res.status(400).json({ error: 'Invalid order weight.' });
    }
    if (parseInt(itemsCount) <= 0) {
        return res.status(400).json({ error: 'Invalid items count.' });
    }

    const cleanName = sanitizeInput(customerName);
    const cleanAddress = sanitizeInput(address);
    const cleanAddressType = sanitizeInput(addressType);
    const cleanSlot = sanitizeInput(slot);
    const cleanDate = sanitizeInput(date);
    const cleanStatus = sanitizeInput(status || 'pending');

    try {
        await dbRun(`
            INSERT INTO orders (
                order_id, customer_name, customer_phone, customer_email, date, slot, address, address_type, payment, weight, items_count, amount, status, timestamp, latitude, longitude, is_express
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            orderId, cleanName, customerPhone, cleanEmail, cleanDate, cleanSlot, cleanAddress, cleanAddressType, payment, parseFloat(weight), parseInt(itemsCount), parseFloat(amount), cleanStatus, timestamp, parseFloat(latitude || 0), parseFloat(longitude || 0), isExpress ? 1 : 0
        ]);

        for (const item of items) {
            if (parseInt(item.qty) <= 0 || parseFloat(item.totalWeight) < 0 || parseFloat(item.unitPrice) < 0 || parseFloat(item.totalPrice) < 0) {
                return res.status(400).json({ error: 'Invalid item values detected.' });
            }

            const cleanItemName = sanitizeInput(item.name);
            const cleanServiceLabel = sanitizeInput(item.serviceLabel);
            const cleanServiceCode = sanitizeInput(item.serviceCode);

            await dbRun(`
                INSERT INTO order_items (
                    order_id, name, qty, weight, service_code, service_label, unit_price, total_price
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                orderId, cleanItemName, parseInt(item.qty), parseFloat(item.totalWeight), cleanServiceCode, cleanServiceLabel, parseFloat(item.unitPrice), parseFloat(item.totalPrice)
            ]);
        }

        const existingAddr = await dbGet(
            'SELECT * FROM addresses WHERE user_phone = ? AND type = ? AND address_line = ?',
            [customerPhone, addressType, address]
        );
        if (!existingAddr) {
            await dbRun('INSERT INTO addresses (user_phone, type, address_line) VALUES (?, ?, ?)', [customerPhone, addressType, address]);
        }

        console.log(`Stored order ${orderId} in database for user ${customerPhone}`);

        const order = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        order.items = items;
        triggerEmailAsync(order, 'order_placed');

        res.status(201).json({ success: true, orderId });
    } catch (err) {
        console.error('Place order error:', err.message);
        res.status(500).json({ error: 'Database error placing order' });
    }
});

// 7. ORDERS: UPDATE WEIGHT & CALC PRICE (Admin weighing)
app.put('/api/orders/:orderId/metrics', authenticateToken, requireRole(['admin', 'valet']), async (req, res) => {
    const { orderId } = req.params;
    const { weight, items_count } = req.body;

    if (weight !== undefined && weight !== null && parseFloat(weight) < 0) {
        return res.status(400).json({ error: 'Weight cannot be negative' });
    }
    if (items_count !== undefined && items_count !== null && parseInt(items_count) < 0) {
        return res.status(400).json({ error: 'Items count cannot be negative' });
    }

    try {
        const order = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

        let finalAmount = 0;
        let finalWeight = 0;
        let finalItemsCount = 0;

        for (const item of items) {
            const catalog = servicePrices[item.service_code];
            if (!catalog) continue;

            let itemWeight = item.weight;
            let itemQty = item.qty;

            if (catalog.unit === 'kg') {
                if (weight !== undefined && weight !== null) {
                    itemWeight = parseFloat(weight);
                }
                item.total_price = itemWeight * catalog.price;
                item.weight = itemWeight;
            } else {
                if (items_count !== undefined && items_count !== null) {
                    itemQty = parseInt(items_count);
                }
                item.total_price = itemQty * catalog.price;
                item.qty = itemQty;
            }

            finalAmount += item.total_price;
            finalWeight += item.weight;
            finalItemsCount += item.qty;

            await dbRun(
                'UPDATE order_items SET weight = ?, qty = ?, total_price = ? WHERE id = ?',
                [item.weight, item.qty, item.total_price, item.id]
            );
        }

        if (order.is_express === 1 || order.is_express === true || order.is_express === 'true' || order.is_express === '1') {
            finalAmount = finalAmount * 1.25;
        }

        await dbRun(
            'UPDATE orders SET weight = ?, items_count = ?, amount = ?, status = ? WHERE order_id = ?',
            [parseFloat(finalWeight.toFixed(2)), finalItemsCount, finalAmount, 'picked_up', orderId]
        );

        console.log(`Weighed order ${orderId}: Weight = ${finalWeight}kg, Count = ${finalItemsCount}, Amount = ₹${finalAmount}`);

        const updatedOrder = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        updatedOrder.items = items;
        triggerEmailAsync(updatedOrder, 'weighed_processing');

        res.json({ success: true, orderId, weight: finalWeight, amount: finalAmount, status: 'processing' });
    } catch (err) {
        console.error('Update order metrics error:', err.message);
        res.status(500).json({ error: 'Database error updating metrics' });
    }
});

// 8. ORDERS: UPDATE STATUS (Admin/Valet)
app.put('/api/orders/:orderId/status', authenticateToken, requireRole(['admin', 'valet']), async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        const order = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const cleanStatus = sanitizeInput(status);
        await dbRun('UPDATE orders SET status = ? WHERE order_id = ?', [cleanStatus, orderId]);
        console.log(`Updated order ${orderId} status to ${cleanStatus}`);

        const updatedOrder = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        updatedOrder.items = items;
        triggerEmailAsync(updatedOrder, cleanStatus);

        res.json({ success: true, orderId, status: cleanStatus });
    } catch (err) {
        console.error('Update status error:', err.message);
        res.status(500).json({ error: 'Database error updating status' });
    }
});

// 9. ORDERS: CANCEL ORDER (Customer/Admin)
app.put('/api/orders/:orderId/cancel', authenticateToken, async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Customer can only cancel their own orders
        if (req.user.role === 'customer' && normalizePhoneNumber(req.user.phone) !== normalizePhoneNumber(order.customer_phone)) {
            return res.status(403).json({ error: 'Access denied: You can only cancel your own orders.' });
        }

        if (order.status !== 'pending' && order.status !== 'pickup_scheduled') {
            return res.status(400).json({ error: 'Order cannot be cancelled once pickup has been confirmed.' });
        }

        await dbRun("UPDATE orders SET status = 'cancelled' WHERE order_id = ?", [orderId]);
        console.log(`Cancelled order ${orderId}`);

        const updatedOrder = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        updatedOrder.items = items;
        triggerEmailAsync(updatedOrder, 'cancelled');

        res.json({ success: true, orderId, status: 'cancelled' });
    } catch (err) {
        console.error('Cancel order error:', err.message);
        res.status(500).json({ error: 'Database error cancelling order' });
    }
});

// 9.5 ORDERS: UPDATE PAYMENT STATUS (Customer/Valet/Admin)
app.put('/api/orders/:orderId/payment-status', authenticateToken, async (req, res) => {
    const { orderId } = req.params;
    const { paymentStatus } = req.body;

    if (!paymentStatus || !['pending', 'paid'].includes(paymentStatus)) {
        return res.status(400).json({ error: 'Valid paymentStatus (pending, paid) is required.' });
    }

    try {
        const order = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Customer can only mark their own order as paid
        if (req.user.role === 'customer' && normalizePhoneNumber(req.user.phone) !== normalizePhoneNumber(order.customer_phone)) {
            return res.status(403).json({ error: 'Access denied: You can only update payment status of your own orders.' });
        }

        await dbRun('UPDATE orders SET payment_status = ? WHERE order_id = ?', [paymentStatus, orderId]);
        console.log(`Updated payment status of order ${orderId} to ${paymentStatus}`);

        res.json({ success: true, orderId, paymentStatus });
    } catch (err) {
        console.error('Update payment status error:', err.message);
        res.status(500).json({ error: 'Database error updating payment status' });
    }
});

// 10. GET EMAIL LOGS (Admin view)
app.get('/api/email/logs', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const logs = await dbAll('SELECT * FROM email_logs ORDER BY id DESC');
        res.json(logs);
    } catch (err) {
        console.error('Fetch email logs error:', err.message);
        res.status(500).json({ error: 'Database error fetching email logs' });
    }
});

// 11. POST PAYMENT REMINDER (Admin/Valet manual trigger notification)
app.post('/api/orders/:orderId/payment-reminder', authenticateToken, requireRole(['admin', 'valet']), async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        order.items = items;

        triggerEmailAsync(order, 'payment_reminder');

        console.log(`Payment Reminder notification triggered manually for Order ${orderId}`);
        res.json({ success: true, orderId });
    } catch (err) {
        console.error('Payment reminder trigger error:', err.message);
        res.status(500).json({ error: 'Database error triggering notification' });
    }
});


// Run email sending asynchronously in the background without blocking the HTTP response
function triggerEmailAsync(order, type, bodyOverride) {
    sendMockEmail(order, type, bodyOverride).catch(err => {
        console.error(`[Background Email Error] Failed to send ${type} email:`, err.message);
    });
}

// MOCK SMTP EMAIL SENDER & LOG PERSISTER
async function sendMockEmail(order, type) {
    const timestamp = new Date().toLocaleString();
    let subject = '';
    let body = '';

    let customerEmail = '';
    let orderId = '';
    let customerName = 'Customer';
    let orderAmount = 0;
    let orderWeight = 0;
    let orderPayment = 'cash';
    let orderPaymentStatus = 'pending';

    if (typeof order === 'string') {
        customerEmail = order;
        subject = type;
        body = arguments[2] || '';
        orderId = 'SYSTEM';
    } else if (order) {
        orderAmount = order.amount !== undefined ? order.amount : 0;
        orderWeight = order.weight !== undefined ? order.weight : 0;
        orderId = order.order_id || order.orderId;
        customerName = order.customer_name || order.customerName;
        customerEmail = order.customer_email || order.customerEmail;
        orderPayment = order.payment || 'cash';
        orderPaymentStatus = order.payment_status || order.paymentStatus || 'pending';
    }

    const billString = orderAmount > 0 ? `₹${orderAmount.toFixed(2)}` : 'Awaiting weight measurement at facility';
    const weightString = orderWeight > 0 ? `${orderWeight} kg` : 'Awaiting weigh-in';

    // Generate dynamic UPI Scan-to-Pay QR code block if billing is active (regardless of selected payment option)
    let qrSectionHtml = '';
    if (orderAmount > 0 && orderPaymentStatus === 'pending') {
        const upiUrl = `upi://pay?pa=bharatpe09917234203@yesbankltd&pn=369%20Laundry&am=${orderAmount.toFixed(2)}&cu=INR&tn=Order-${orderId}`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiUrl)}`;

        qrSectionHtml = `
            <div style="margin: 25px 0; padding: 20px; border: 2px dashed #7b5800; border-radius: 12px; background-color: #faf9f6; text-align: center; font-family: sans-serif;">
                <h4 style="margin: 0 0 8px 0; color: #001726; font-size: 15px; font-weight: bold;">Scan to Pay with UPI (Hassle-Free Online Payment)</h4>
                <p style="margin: 0 0 15px 0; font-size: 11px; color: #72787e;">Scan this code using BHIM, Google Pay, PhonePe, Paytm, or any banking app to pay online instantly.</p>
                <div style="display: inline-block; padding: 10px; background-color: #ffffff; border: 1px solid #c2c7cd; border-radius: 8px;">
                    <img src="${qrApiUrl}" alt="UPI Payment QR" style="display: block; width: 160px; height: 160px;" />
                </div>
                <p style="margin: 15px 0 0 0; font-size: 14px; font-weight: bold; color: #001726;">Amount Due: ₹${orderAmount.toFixed(2)}</p>
                <p style="margin: 4px 0 0 0; font-size: 10px; color: #72787e;">Note: Order #${orderId}</p>
            </div>
        `;
    }

    // Build styled HTML Email Template
    const emailHeader = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #c2c7cd; border-radius: 12px; background-color: #ffffff; color: #001726;">
            <div style="text-align: center; border-bottom: 2px solid #7b5800; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #001726; font-size: 24px; letter-spacing: -0.5px;">369 Laundry</h2>
                <p style="margin: 5px 0 0 0; font-size: 12px; color: #72787e;">Order Status Update & Delivery Receipt</p>
            </div>
    `;

    const emailFooter = `
            <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #c2c7cd; text-align: center; font-size: 11px; color: #72787e;">
                <p style="margin: 0;">369 Laundry Automated Mailer. Please do not reply directly to this email.</p>
                <p style="margin: 5px 0 0 0;">© 2026 369laundry.com Inc. All rights reserved.</p>
            </div>
        </div>
    `;

    switch (type) {
        case 'order_placed':
            subject = `Order Placed Successfully! (Ref: ${orderId})`;
            body = `
                ${emailHeader}
                <p>Hello <strong>${customerName}</strong>,</p>
                <p>Thank you for choosing 369 Laundry. We have received your booking and a valet will arrive at your scheduled time slot.</p>
                <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #0f172a; font-size: 14px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 5px;">Booking Details</h3>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Order Reference:</strong> ${orderId}</p>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Scheduled Slot:</strong> ${order.date} (${order.slot})</p>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Pickup Address:</strong> ${order.address} (${order.address_type})</p>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Initial Bill Status:</strong> ${billString}</p>
                </div>
                <p>Our agent will weigh your laundry on arrival at our facilities, and your final invoice balance will update instantly in your dashboard.</p>
                ${emailFooter}
            `;
            break;
        case 'weighed_processing':
        case 'processing':
            subject = `369 Laundry Weigh-In Complete: Order #${orderId}`;
            body = `
                ${emailHeader}
                <p>Hello <strong>${customerName}</strong>,</p>
                <p>Your laundry has been weighed and sorted at our facility. We have started our premium washing and processing cycles.</p>
                <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #0f172a; font-size: 14px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 5px;">Weigh-In Invoice</h3>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Order ID:</strong> ${orderId}</p>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Total Measured Weight:</strong> ${weightString}</p>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Total Billing Due:</strong> <span style="color: #10b981; font-weight: bold;">${billString}</span></p>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Payment Method:</strong> ${orderPayment}</p>
                </div>
                ${qrSectionHtml}
                <p>You can monitor your order tracking live on your interactive dashboard portal.</p>
                ${emailFooter}
            `;
            break;
        case 'ready':
            subject = `Your Laundry is Ready! (Order #${orderId})`;
            body = `
                ${emailHeader}
                <p>Hello <strong>${customerName}</strong>,</p>
                <p>Good news! Your clothes have been washed, dried, ironed, and packaged. We are preparing the shipment for delivery dispatch.</p>
                <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 13px; color: #065f46;"><strong>Status:</strong> Package ready for delivery valet pickup.</p>
                    <p style="margin: 5px 0 0 0; font-size: 13px; color: #065f46;"><strong>Invoice Total:</strong> ${billString}</p>
                </div>
                ${qrSectionHtml}
                ${emailFooter}
            `;
            break;
        case 'out_for_delivery':
            subject = `Laundry Dispatched: Delivery Valet En Route (Order #${orderId})`;
            body = `
                ${emailHeader}
                <p>Hello <strong>${customerName}</strong>,</p>
                <p>Our delivery valet has left our facility and is on their way to drop off your fresh, clean clothes.</p>
                <p>Please make sure you have your digital QR Code receipt ready on your phone dashboard so our valet can verify your collection.</p>
                <p><strong>Total Amount to Pay:</strong> ${billString}</p>
                ${qrSectionHtml}
                ${emailFooter}
            `;
            break;
        case 'delivered':
            subject = `369 Laundry Transaction Receipt: Order #${orderId}`;
            body = `
                ${emailHeader}
                <p>Hello <strong>${customerName}</strong>,</p>
                <p>Your laundry has been successfully delivered, and the payment transaction is completed.</p>
                <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; margin: 20px 0; border: 1px solid #cbd5e1;">
                    <h3 style="margin-top: 0; color: #0f172a; font-size: 14px;">Official Receipt</h3>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Order ID:</strong> ${orderId}</p>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Total Amount Paid:</strong> ${billString}</p>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Weight:</strong> ${weightString}</p>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>Date:</strong> ${timestamp}</p>
                </div>
                <p>We look forward to washing for you again! Let us know how we did by dropping a review.</p>
                ${emailFooter}
            `;
            break;
        case 'cancelled':
            subject = `Order Cancelled: Reference #${orderId}`;
            body = `
                ${emailHeader}
                <p>Hello <strong>${customerName}</strong>,</p>
                <p>This email confirms that your order <strong>${orderId}</strong> has been cancelled.</p>
                <p>If you have already paid online, the refund will be credited back to your account within 3-5 business days.</p>
                ${emailFooter}
            `;
            break;
        case 'payment_reminder':
            subject = `369 Laundry Invoice: Payment Reminder (Ref: ${orderId})`;
            body = `
                ${emailHeader}
                <p>Hello <strong>${customerName}</strong>,</p>
                <p>This is a friendly reminder that the payment transaction for your order <strong>${orderId}</strong> is pending collection.</p>
                <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #b45309; font-size: 14px; border-bottom: 1px dashed #fcd34d; padding-bottom: 5px;">Invoice Balance Reminder</h3>
                    <p style="margin: 5px 0; font-size: 13px; color: #78350f;"><strong>Order Reference ID:</strong> ${orderId}</p>
                    <p style="margin: 5px 0; font-size: 13px; color: #78350f;"><strong>Measured Weight:</strong> ${weightString}</p>
                    <p style="margin: 5px 0; font-size: 13px; color: #78350f;"><strong>Total Invoice Amount:</strong> <span style="font-weight: bold; color: #d97706;">${billString}</span></p>
                    <p style="margin: 5px 0; font-size: 13px; color: #78350f;"><strong>Payment Status:</strong> Pending Collection (${orderPayment})</p>
                </div>
                ${qrSectionHtml}
                <p>Please have this amount ready at the time of delivery drop-off. You can pay via Cash or UPI Scan. Thank you!</p>
                ${emailFooter}
            `;
            break;
    }

    try {
        if (subject && body && customerEmail) {
            // Write database log first
            await dbRun(
                'INSERT INTO email_logs (order_id, recipient, subject, body, timestamp) VALUES (?, ?, ?, ?, ?)',
                [orderId, customerEmail, subject, body, timestamp]
            );
            console.log(`Email log written in database for ${customerEmail}: "${subject}"`);

            // Dispatch live email via Resend API if API Key is configured
            const apiKey = process.env.RESEND_API_KEY;
            if (apiKey && apiKey !== '' && !apiKey.includes('[YOUR')) {
                const resendResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: '369 Laundry <onboarding@resend.dev>', // Standard onboarding sandbox sender
                        to: customerEmail,
                        subject: subject,
                        html: body
                    })
                });

                if (resendResponse.ok) {
                    const resendData = await resendResponse.json();
                    console.log(`✅ Transactional email successfully dispatched via Resend to ${customerEmail}. Message ID: ${resendData.id}`);
                } else {
                    const errText = await resendResponse.text();
                    console.warn(`⚠️ Resend API responded with an error status ${resendResponse.status}:`, errText);
                }
            } else {
                console.log(`ℹ️ Resend API Key is not set in environment. Running in simulated mailer mode.`);
            }
        }
    } catch (e) {
        console.error('Error dispatching transactional email:', e.message);
    }
}

// Helper function to open browser automatically
function openBrowser(url) {
    const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${startCmd} ${url}`, (err) => {
        if (err) console.log('Could not open browser automatically, please navigate to:', url);
    });
}

// Start listening conditionally (avoid listening in serverless Vercel environment)
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`369 Laundry backend server is listening on port ${PORT}`);
        console.log(`Web application is live at http://localhost:${PORT}`);
        openBrowser(`http://localhost:${PORT}`);
    });
}

// Global Express Error Handler Middleware
app.use((err, req, res, next) => {
    console.error("❌ Unhandled Express Error:", err);
    res.status(500).json({
        error: "Internal Server Error",
        message: err.message,
        stack: process.env.VERCEL ? undefined : err.stack
    });
});

// Export Express app for Vercel Serverless runtime compatibility
module.exports = app;
