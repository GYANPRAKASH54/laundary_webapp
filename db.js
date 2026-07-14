require('dotenv').config();
const path = require('path');

const isPostgres = !!process.env.DATABASE_URL;
let pgPool = null;

if (isPostgres) {
    const { Pool } = require('pg');
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        },
        max: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
    });
    pgPool.on('error', (err) => {
        console.error('Unexpected error on idle PostgreSQL client:', err.message);
    });
    console.log("Supabase/PostgreSQL database pool initialized with serverless limits.");
}

let sqlite3;
let db = null;
let sqliteError = null;

if (!isPostgres) {
    try {
        sqlite3 = require('sqlite3').verbose();
    } catch (err) {
        sqliteError = err;
        console.error("Failed to load sqlite3 native binary. Database queries will be disabled:", err.message);
    }

    // Vercel serverless functions have a read-only filesystem except /tmp
    const dbFile = process.env.DB_FILE || (process.env.VERCEL ? '/tmp/cleanflow.db' : 'cleanflow.db');
    const dbPath = path.isAbsolute(dbFile) ? dbFile : path.resolve(__dirname, dbFile);

    if (sqlite3) {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening SQLite database:', err.message);
            } else {
                console.log('Connected to the SQLite database at:', dbPath);
            }
        });
    } else {
        console.warn("Running in memory-only backend mode (SQLite failed to initialize).");
    }
}

// SQL Query and Parameters translator for PostgreSQL/Supabase
function translateSqlAndParams(sql, params) {
    if (!isPostgres) return { sql, params };

    let pgSql = sql;
    
    // Replace ? placeholders with $1, $2, $3...
    let index = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${index++}`);

    // Map SQLite "INSERT OR IGNORE INTO users" to PostgreSQL "INSERT INTO users ... ON CONFLICT (phone) DO NOTHING"
    if (pgSql.includes("INSERT OR IGNORE INTO users")) {
        pgSql = pgSql.replace("INSERT OR IGNORE INTO users", "INSERT INTO users") + " ON CONFLICT (phone) DO NOTHING";
    }

    // Map SQLite "INSERT OR IGNORE INTO addresses" to PostgreSQL "INSERT INTO addresses ... ON CONFLICT DO NOTHING"
    if (pgSql.includes("INSERT OR IGNORE INTO addresses")) {
        pgSql = pgSql.replace("INSERT OR IGNORE INTO addresses", "INSERT INTO addresses") + " ON CONFLICT DO NOTHING";
    }

    // Map auto-increment logic
    pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, "SERIAL PRIMARY KEY");

    // Translate SQLite ORDER BY rowid DESC to Postgres compatible sorting
    pgSql = pgSql.replace(/ORDER BY rowid DESC/gi, "ORDER BY date DESC, order_id DESC");

    // For INSERT queries on PostgreSQL, append "RETURNING id" if it doesn't already have RETURNING
    if (pgSql.trim().toLowerCase().startsWith("insert into")) {
        if (!pgSql.toLowerCase().includes("returning")) {
            pgSql += " RETURNING *";
        }
    }

    return { sql: pgSql, params };
}

// Helper functions wrapping database execution in Promises
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        if (isPostgres) {
            const { sql: pgSql, params: pgParams } = translateSqlAndParams(sql, params);
            pgPool.query(pgSql, pgParams, (err, result) => {
                if (err) {
                    console.error("Postgres dbRun Error:", err.message, "SQL:", pgSql);
                    reject(err);
                } else {
                    const lastRow = result.rows[0];
                    resolve({ 
                        id: lastRow ? lastRow.id : null, 
                        changes: result.rowCount 
                    });
                }
            });
            return;
        }

        if (!db) {
            resolve({ id: 1, changes: 1 });
            return;
        }
        db.run(sql, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve({ id: this.lastID, changes: this.changes });
            }
        });
    });
};

const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        if (isPostgres) {
            const { sql: pgSql, params: pgParams } = translateSqlAndParams(sql, params);
            pgPool.query(pgSql, pgParams, (err, result) => {
                if (err) {
                    console.error("Postgres dbAll Error:", err.message, "SQL:", pgSql);
                    reject(err);
                } else {
                    resolve(result.rows);
                }
            });
            return;
        }

        if (!db) {
            resolve([]);
            return;
        }
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        if (isPostgres) {
            const { sql: pgSql, params: pgParams } = translateSqlAndParams(sql, params);
            pgPool.query(pgSql, pgParams, (err, result) => {
                if (err) {
                    console.error("Postgres dbGet Error:", err.message, "SQL:", pgSql);
                    reject(err);
                } else {
                    resolve(result.rows[0] || null);
                }
            });
            return;
        }

        if (!db) {
            if (sql.includes("FROM users WHERE phone = ?") && (params[0] === 'admin' || params[0] === '8699013959' || params[0] === '+918699013959')) {
                resolve({ name: 'Admin Manager Partner', phone: '+918699013959', email: 'admin@369laundry.com', password: 'ADMIN123', role: 'admin' });
            } else {
                resolve(null);
            }
            return;
        }
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

// Initialize schema
const initDb = async () => {
    if (isPostgres) {
        try {
            await dbRun(`
                CREATE TABLE IF NOT EXISTS services (
                    service_code VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    price REAL NOT NULL,
                    unit VARCHAR(20) NOT NULL,
                    category VARCHAR(50) NOT NULL,
                    description TEXT
                )
            `);

            await dbRun(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    phone VARCHAR(20) UNIQUE NOT NULL,
                    email VARCHAR(100) NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    role VARCHAR(20) DEFAULT 'customer'
                )
            `);

            await dbRun(`
                CREATE TABLE IF NOT EXISTS addresses (
                    id SERIAL PRIMARY KEY,
                    user_phone VARCHAR(20) NOT NULL REFERENCES users(phone) ON UPDATE CASCADE ON DELETE CASCADE,
                    type VARCHAR(20) NOT NULL,
                    address_line TEXT NOT NULL
                )
            `);

            await dbRun(`
                CREATE TABLE IF NOT EXISTS valets (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    phone VARCHAR(20) UNIQUE NOT NULL,
                    vehicle_num VARCHAR(20),
                    status VARCHAR(20) DEFAULT 'active'
                )
            `);

            await dbRun(`
                CREATE TABLE IF NOT EXISTS orders (
                    order_id VARCHAR(50) PRIMARY KEY,
                    customer_name VARCHAR(100) NOT NULL,
                    customer_phone VARCHAR(20) NOT NULL REFERENCES users(phone) ON UPDATE CASCADE ON DELETE CASCADE,
                    customer_email VARCHAR(100) NOT NULL,
                    date DATE NOT NULL,
                    slot VARCHAR(50) NOT NULL,
                    address TEXT NOT NULL,
                    address_type VARCHAR(20) NOT NULL,
                    payment VARCHAR(20) NOT NULL,
                    weight REAL NOT NULL DEFAULT 0.0,
                    items_count INTEGER NOT NULL DEFAULT 0,
                    amount REAL NOT NULL DEFAULT 0.0,
                    status VARCHAR(50) NOT NULL,
                    timestamp VARCHAR(50) NOT NULL,
                    latitude REAL DEFAULT 0.0,
                    longitude REAL DEFAULT 0.0,
                    valet_id INTEGER REFERENCES valets(id) ON DELETE SET NULL,
                    is_express BOOLEAN DEFAULT FALSE,
                    payment_status VARCHAR(50) DEFAULT 'pending'
                )
            `);

            try {
                await dbRun("ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_express BOOLEAN DEFAULT FALSE");
            } catch(e) {
                console.warn("is_express column check failed:", e.message);
            }

            try {
                await dbRun("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending'");
            } catch(e) {
                console.warn("payment_status column check failed:", e.message);
            }

            await dbRun(`
                CREATE TABLE IF NOT EXISTS order_items (
                    id SERIAL PRIMARY KEY,
                    order_id VARCHAR(50) NOT NULL REFERENCES orders(order_id) ON UPDATE CASCADE ON DELETE CASCADE,
                    name VARCHAR(100) NOT NULL,
                    qty INTEGER NOT NULL DEFAULT 1,
                    weight REAL NOT NULL DEFAULT 0.0,
                    service_code VARCHAR(50) REFERENCES services(service_code) ON UPDATE CASCADE,
                    service_label VARCHAR(100) NOT NULL,
                    unit_price REAL NOT NULL,
                    total_price REAL NOT NULL
                )
            `);

            await dbRun(`
                CREATE TABLE IF NOT EXISTS email_logs (
                    id SERIAL PRIMARY KEY,
                    order_id VARCHAR(50) NOT NULL,
                    recipient VARCHAR(100) NOT NULL,
                    subject VARCHAR(200) NOT NULL,
                    body TEXT NOT NULL,
                    timestamp VARCHAR(50) NOT NULL
                )
            `);

            await dbRun(`
                CREATE TABLE IF NOT EXISTS whatsapp_logs (
                    id SERIAL PRIMARY KEY,
                    order_id VARCHAR(50) NOT NULL,
                    recipient_phone VARCHAR(20) NOT NULL,
                    template_name VARCHAR(50) NOT NULL,
                    status VARCHAR(20) DEFAULT 'delivered',
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await dbRun(`
                CREATE TABLE IF NOT EXISTS admin_settings (
                    key VARCHAR(50) PRIMARY KEY,
                    value TEXT NOT NULL,
                    description TEXT
                )
            `);

            await dbRun(`
                CREATE TABLE IF NOT EXISTS password_resets (
                    email VARCHAR(100) PRIMARY KEY,
                    token VARCHAR(100) NOT NULL,
                    expires_at TIMESTAMP NOT NULL
                )
            `);

            console.log('PostgreSQL database tables verified/created successfully.');
            await seedMockData();
        } catch (e) {
            console.error("Failed to initialize PostgreSQL tables:", e.message);
        }
        return;
    }

    if (!db) {
        console.warn("Database initialization skipped (No active SQLite connection).");
        return;
    }
    db.serialize(async () => {
        // 1. Users Table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT UNIQUE NOT NULL,
                email TEXT NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'customer'
            )
        `);

        // 2. Addresses Table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS addresses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_phone TEXT NOT NULL,
                type TEXT NOT NULL,
                address_line TEXT NOT NULL
            )
        `);

        // 3. Orders Table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS orders (
                order_id TEXT PRIMARY KEY,
                customer_name TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                customer_email TEXT NOT NULL,
                date TEXT NOT NULL,
                slot TEXT NOT NULL,
                address TEXT NOT NULL,
                address_type TEXT NOT NULL,
                payment TEXT NOT NULL,
                weight REAL NOT NULL,
                items_count INTEGER NOT NULL,
                amount REAL NOT NULL,
                status TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                latitude REAL DEFAULT 0.0,
                longitude REAL DEFAULT 0.0,
                payment_status TEXT DEFAULT 'pending'
            )
        `);

        // Migrate existing databases safely if columns do not exist
        try {
            await dbRun("ALTER TABLE orders ADD COLUMN latitude REAL DEFAULT 0.0");
        } catch(e) {}
        try {
            await dbRun("ALTER TABLE orders ADD COLUMN longitude REAL DEFAULT 0.0");
        } catch(e) {}
        try {
            await dbRun("ALTER TABLE orders ADD COLUMN is_express INTEGER DEFAULT 0");
        } catch(e) {}
        try {
            await dbRun("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending'");
        } catch(e) {}

        // 4. Order Items Table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT NOT NULL,
                name TEXT NOT NULL,
                qty INTEGER NOT NULL,
                weight REAL NOT NULL,
                service_code TEXT NOT NULL,
                service_label TEXT NOT NULL,
                unit_price REAL NOT NULL,
                total_price REAL NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE
            )
        `);

        // 5. Simulated Email Logs Table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS email_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT NOT NULL,
                recipient TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS password_resets (
                email TEXT PRIMARY KEY,
                token TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
        `);

        console.log('Database tables verified/created successfully.');
        await seedMockData();
    });
};

// Seeding function for initial metrics with updated price catalog services
const seedMockData = async () => {
    try {
        const orderCount = await dbGet("SELECT COUNT(*) as count FROM orders");
        
        const adminName = process.env.ADMIN_NAME || 'Admin Manager';
        const adminPhone = '+918699013959';
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@369laundry.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'ADMIN123';

        // Always seed/verify default Admin account
        const adminUser = await dbGet("SELECT * FROM users WHERE phone = ?", [adminPhone]);
        if (!adminUser) {
            await dbRun(
                'INSERT INTO users (name, phone, email, password, role) VALUES (?, ?, ?, ?, ?)',
                [adminName, adminPhone, adminEmail, adminPassword, 'admin']
            );
            console.log(`Seeded default Administrator account (${adminPhone}/${adminPassword})`);
        } else if (adminUser.role !== 'admin') {
            await dbRun("UPDATE users SET role = 'admin' WHERE phone = ?", [adminPhone]);
            console.log(`Promoted user ${adminPhone} to Administrator.`);
        }

        // Clean up other default admin accounts
        await dbRun("DELETE FROM users WHERE phone = 'admin'");
        await dbRun("DELETE FROM users WHERE role = 'admin' AND phone NOT IN ('+918699013959', '8699013959')");

        // Clean up historical default mock customer accounts if they exist
        await dbRun(`
            DELETE FROM users WHERE phone IN (
                '+91 88390 12345', '+91 98230 45678', '+91 77382 99221', '+91 99999 88888',
                '+918839012345', '+919823045678', '+917738299221', '+919999988888'
            )
        `);
    } catch (e) {
        console.error("Error seeding mock data:", e.message);
    }
};

module.exports = {
    initDb,
    dbRun,
    dbAll,
    dbGet
};
