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
        }
    });
    console.log("Supabase/PostgreSQL database pool initialized.");
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
            if (sql.includes("FROM users WHERE phone = ?") && params[0] === 'admin') {
                resolve({ name: 'Admin Manager', phone: 'admin', email: 'admin@luxeclean.com', password: 'ADMIN123', role: 'admin' });
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
                    valet_id INTEGER REFERENCES valets(id) ON DELETE SET NULL
                )
            `);

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
                longitude REAL DEFAULT 0.0
            )
        `);

        // Migrate existing databases safely if columns do not exist
        try {
            await dbRun("ALTER TABLE orders ADD COLUMN latitude REAL DEFAULT 0.0");
        } catch(e) {}
        try {
            await dbRun("ALTER TABLE orders ADD COLUMN longitude REAL DEFAULT 0.0");
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

        console.log('Database tables verified/created successfully.');
        await seedMockData();
    });
};

// Seeding function for initial metrics with updated price catalog services
const seedMockData = async () => {
    try {
        const orderCount = await dbGet("SELECT COUNT(*) as count FROM orders");
        
        const adminName = process.env.ADMIN_NAME || 'Admin Manager';
        const adminPhone = process.env.ADMIN_PHONE || 'admin';
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@luxeclean.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'ADMIN123';

        // Always seed/verify default Admin account
        const adminUser = await dbGet("SELECT * FROM users WHERE phone = ?", [adminPhone]);
        if (!adminUser) {
            await dbRun(
                'INSERT INTO users (name, phone, email, password, role) VALUES (?, ?, ?, ?, ?)',
                [adminName, adminPhone, adminEmail, adminPassword, 'admin']
            );
            console.log(`Seeded default Administrator account (${adminPhone}/${adminPassword})`);
        }

        if (orderCount.count === 0) {
            console.log("No orders found. Seeding historical metrics with new services...");
            
            // Seed Customer Users
            const seedCustomers = [
                { name: "Priya Nair", phone: "+91 88390 12345", email: "priya@email.com", password: "password", role: "customer" },
                { name: "Amit Patel", phone: "+91 98230 45678", email: "amit@email.com", password: "password", role: "customer" },
                { name: "Vikram Singh", phone: "+91 77382 99221", email: "vikram@email.com", password: "password", role: "customer" },
                { name: "Rahul Sharma", phone: "+91 99999 88888", email: "rahul@email.com", password: "password", role: "customer" }
            ];

            for (const cust of seedCustomers) {
                await dbRun(
                    'INSERT OR IGNORE INTO users (name, phone, email, password, role) VALUES (?, ?, ?, ?, ?)',
                    [cust.name, cust.phone, cust.email, cust.password, cust.role]
                );
            }

            const today = new Date();
            const day = 24 * 60 * 60 * 1000;
            
            const seedOrders = [
                {
                    order_id: "CF-38291",
                    customer_name: "Priya Nair",
                    customer_phone: "+91 88390 12345",
                    customer_email: "priya@email.com",
                    date: new Date(today.getTime() - 4 * day).toISOString().split('T')[0],
                    slot: "09:00 - 11:00",
                    address: "Villa 22, Green Valley Estate, Road 12",
                    address_type: "home",
                    payment: "online",
                    weight: 4.0,
                    items_count: 1,
                    amount: 180.0,
                    status: "delivered",
                    timestamp: "10:30 AM",
                    items: [
                        { name: "Wash & Fold (Organic)", qty: 1, weight: 4.0, service_code: "wash_fold_organic", service_label: "Wash & Fold (Organic)", unit_price: 45, total_price: 180 }
                    ]
                },
                {
                    order_id: "CF-82947",
                    customer_name: "Amit Patel",
                    customer_phone: "+91 98230 45678",
                    customer_email: "amit@email.com",
                    date: new Date(today.getTime() - 3 * day).toISOString().split('T')[0],
                    slot: "14:00 - 16:00",
                    address: "Office 402, Trade Tower, Phase 2",
                    address_type: "work",
                    payment: "wallet",
                    weight: 1.0,
                    items_count: 2,
                    amount: 20.0,
                    status: "delivered",
                    timestamp: "03:15 PM",
                    items: [
                        { name: "Only Iron", qty: 2, weight: 1.0, service_code: "only_iron", service_label: "Only Iron", unit_price: 10, total_price: 20 }
                    ]
                },
                {
                    order_id: "CF-92049",
                    customer_name: "Vikram Singh",
                    customer_phone: "+91 77382 99221",
                    customer_email: "vikram@email.com",
                    date: new Date(today.getTime() - 2 * day).toISOString().split('T')[0],
                    slot: "11:00 - 13:00",
                    address: "A-502, Sky High Heights, Sector 15",
                    address_type: "home",
                    payment: "cash",
                    weight: 1.0,
                    items_count: 3,
                    amount: 300.0,
                    status: "delivered",
                    timestamp: "12:00 PM",
                    items: [
                        { name: "Dry Cleaning (Basic)", qty: 3, weight: 1.0, service_code: "dry_cleaning_basic", service_label: "Dry Cleaning (Basic)", unit_price: 100, total_price: 300 }
                    ]
                },
                {
                    order_id: "CF-10294",
                    customer_name: "Rahul Sharma",
                    customer_phone: "+91 99999 88888",
                    customer_email: "rahul@email.com",
                    date: new Date(today.getTime() - 1 * day).toISOString().split('T')[0],
                    slot: "18:00 - 20:00",
                    address: "Flat 402, Seawood Towers, Sector 45",
                    address_type: "home",
                    payment: "online",
                    weight: 5.0,
                    items_count: 1,
                    amount: 225.0,
                    status: "delivered",
                    timestamp: "07:22 PM",
                    items: [
                        { name: "Wash & Iron (Normal)", qty: 1, weight: 5.0, service_code: "wash_iron_normal", service_label: "Wash & Iron (Normal)", unit_price: 45, total_price: 225 }
                    ]
                }
            ];

            for (const order of seedOrders) {
                const lat = order.latitude || 28.6139;
                const lng = order.longitude || 77.2090;
                await dbRun(`
                    INSERT INTO orders (
                        order_id, customer_name, customer_phone, customer_email, date, slot, address, address_type, payment, weight, items_count, amount, status, timestamp, latitude, longitude
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    order.order_id, order.customer_name, order.customer_phone, order.customer_email, order.date, order.slot, order.address, order.address_type,
                    order.payment, order.weight, order.items_count, order.amount, order.status, order.timestamp, lat, lng
                ]);

                for (const item of order.items) {
                    await dbRun(`
                        INSERT INTO order_items (
                            order_id, name, qty, weight, service_code, service_label, unit_price, total_price
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        order.order_id, item.name, item.qty, item.weight, item.service_code, item.service_label, item.unit_price, item.total_price
                    ]);
                }
            }
            
            console.log("Database seeded successfully with new catalog records.");
        }
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
