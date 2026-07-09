// 369 Laundry Professional Database Migration & Seeding Script
require('dotenv').config();
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || databaseUrl.includes("[YOUR-PASSWORD]") || databaseUrl.includes("[YOUR-PROJECT-REF]")) {
    console.error("❌ ERROR: DATABASE_URL is not configured in .env!");
    console.log("Please edit your `.env` file, uncomment DATABASE_URL, and replace [YOUR-PASSWORD] with your actual Supabase DB password.");
    process.exit(1);
}

const client = new Client({
    connectionString: databaseUrl,
    ssl: {
        rejectUnauthorized: false
    }
});

const schemaSql = `
-- 1. Services Table
CREATE TABLE IF NOT EXISTS services (
    service_code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price REAL NOT NULL,
    unit VARCHAR(20) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'customer'
);

-- 3. Addresses Table
CREATE TABLE IF NOT EXISTS addresses (
    id SERIAL PRIMARY KEY,
    user_phone VARCHAR(20) NOT NULL REFERENCES users(phone) ON UPDATE CASCADE ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    address_line TEXT NOT NULL
);

-- 4. Valets Table
CREATE TABLE IF NOT EXISTS valets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    vehicle_num VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active'
);

-- 5. Orders Table
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
);

-- 6. Order Items Table
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
);

-- 7. Email Logs Table
CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    recipient VARCHAR(100) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    timestamp VARCHAR(50) NOT NULL
);

-- 8. WhatsApp Logs Table
CREATE TABLE IF NOT EXISTS whatsapp_logs (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    recipient_phone VARCHAR(20) NOT NULL,
    template_name VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'delivered',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Admin Settings Table
CREATE TABLE IF NOT EXISTS admin_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT
);
`;

const seedSql = `
-- Seed default Admin account if it doesn't exist
INSERT INTO users (name, phone, email, password, role) 
VALUES ('Admin Manager', 'admin', 'admin@369laundry.com', 'ADMIN123', 'admin')
ON CONFLICT (phone) DO NOTHING;

-- Seed default Customer accounts
INSERT INTO users (name, phone, email, password, role) VALUES 
('Priya Nair', '+91 88390 12345', 'priya@email.com', 'password', 'customer'),
('Amit Patel', '+91 98230 45678', 'amit@email.com', 'password', 'customer'),
('Vikram Singh', '+91 77382 99221', 'vikram@email.com', 'password', 'customer'),
('Rahul Sharma', '+91 99999 88888', 'rahul@email.com', 'password', 'customer')
ON CONFLICT (phone) DO NOTHING;

-- Seed default Settings
INSERT INTO admin_settings (key, value, description) VALUES
('business_name', '369 Laundry Valet', 'Official Laundry business title'),
('min_free_delivery', '500', 'Minimum order amount for free valet pickup (INR)')
ON CONFLICT (key) DO NOTHING;
`;

const priceCatalog = {
    "wash_fold_normal": { name: "Wash & Fold (Normal)", price: 35, unit: "kg", cat: "wash_fold" },
    "wash_fold_organic": { name: "Wash & Fold (Organic)", price: 45, unit: "kg", cat: "wash_fold" },
    "wash_fold_organic_ezee": { name: "Wash & Fold (Organic Ezee)", price: 55, unit: "kg", cat: "wash_fold" },
    "wash_fold_ezee": { name: "Wash & Fold (Ezee)", price: 45, unit: "kg", cat: "wash_fold" },
    "wash_fold_whites": { name: "Wash & Fold (Whites)", price: 60, unit: "kg", cat: "wash_fold" },
    "wash_iron_normal": { name: "Wash & Iron (Normal)", price: 45, unit: "kg", cat: "wash_iron" },
    "wash_iron_organic": { name: "Wash & Iron (Organic)", price: 55, unit: "kg", cat: "wash_iron" },
    "wash_iron_organic_ezee": { name: "Wash & Iron (Organic Ezee)", price: 65, unit: "kg", cat: "wash_iron" },
    "wash_iron_ezee": { name: "Wash & Iron (Ezee)", price: 55, unit: "kg", cat: "wash_iron" },
    "wash_iron_whites": { name: "Wash & Iron (Whites)", price: 70, unit: "kg", cat: "wash_iron" },
    "shoe_cleaning_machine": { name: "Shoe Cleaning (Machine)", price: 70, unit: "pair", cat: "shoe_cleaning" },
    "shoe_cleaning_hand_wash": { name: "Shoe Cleaning (Hand Wash)", price: 100, unit: "pair", cat: "shoe_cleaning" },
    "shoe_cleaning_deep_clean": { name: "Shoe Cleaning (Deep Clean)", price: 150, unit: "pair", cat: "shoe_cleaning" },
    "bag_cleaning_machine": { name: "Bag Cleaning (Machine)", price: 70, unit: "pcs", cat: "bag_cleaning" },
    "bag_cleaning_hand_wash": { name: "Bag Cleaning (Hand Wash)", price: 100, unit: "pcs", cat: "bag_cleaning" },
    "bag_cleaning_deep_clean": { name: "Bag Cleaning (Deep Clean)", price: 150, unit: "pcs", cat: "bag_cleaning" },
    "soft_toy_cleaning_machine": { name: "Soft Toy Cleaning (Machine)", price: 70, unit: "pcs", cat: "soft_toy_cleaning" },
    "soft_toy_cleaning_hand_wash": { name: "Soft Toy Cleaning (Hand Wash)", price: 100, unit: "pcs", cat: "soft_toy_cleaning" },
    "soft_toy_cleaning_deep_clean": { name: "Soft Toy Cleaning (Deep Clean)", price: 150, unit: "pcs", cat: "soft_toy_cleaning" },
    "stain_treatment_white": { name: "Stain Treatment (White Clothes)", price: 70, unit: "pcs", cat: "stain_treatment" },
    "stain_treatment_colored": { name: "Stain Treatment (Colored Clothes)", price: 100, unit: "pcs", cat: "stain_treatment" },
    "color_dye_basic": { name: "Color Dye (Basic)", price: 150, unit: "pcs", cat: "color_dye" },
    "color_dye_premium": { name: "Color Dye (Premium)", price: 250, unit: "pcs", cat: "color_dye" },
    "dry_cleaning_basic": { name: "Dry Cleaning (Basic)", price: 100, unit: "pcs", cat: "dry_cleaning" },
    "dry_cleaning_premium": { name: "Dry Cleaning (Premium)", price: 150, unit: "pcs", cat: "dry_cleaning" },
    "blanket_cleaning_single": { name: "Blanket Cleaning (Single)", price: 300, unit: "pcs", cat: "blanket_cleaning" },
    "blanket_cleaning_double": { name: "Blanket Cleaning (Double)", price: 450, unit: "pcs", cat: "blanket_cleaning" },
    "blanket_dry_cleaning_single": { name: "Blanket Dry Cleaning (Single)", price: 400, unit: "pcs", cat: "blanket_cleaning" },
    "blanket_dry_cleaning_double": { name: "Blanket Dry Cleaning (Double)", price: 600, unit: "pcs", cat: "blanket_cleaning" },
    "only_iron": { name: "Only Iron", price: 10, unit: "pcs", cat: "only_iron" }
};

async function migrate() {
    try {
        console.log("Connecting to Supabase PostgreSQL database...");
        await client.connect();
        console.log("Connected successfully. Running professional schema creation...");
        
        await client.query(schemaSql);
        console.log("✅ Core and relational tables created/verified successfully.");

        console.log("Running seed script for default settings and credentials...");
        await client.query(seedSql);
        console.log("✅ Seed parameters completed.");

        console.log("Seeding service price catalog...");
        for (const [code, info] of Object.entries(priceCatalog)) {
            await client.query(
                `INSERT INTO services (service_code, name, price, unit, category) 
                 VALUES ($1, $2, $3, $4, $5) 
                 ON CONFLICT (service_code) DO UPDATE SET price = EXCLUDED.price`,
                [code, info.name, info.price, info.unit, info.cat]
            );
        }
        console.log("✅ Loaded 30-item service price catalog into services table.");

        console.log("\n🎉 Supabase Enterprise Database Setup Completed Successfully!");
    } catch (err) {
        console.error("❌ Migration failed with error:", err.message);
    } finally {
        await client.end();
    }
}

migrate();
