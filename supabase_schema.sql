-- LuxeClean Professional Enterprise-Grade Database Schema
-- Copy-paste this SQL into your Supabase SQL Editor to create/upgrade the tables.

-- 1. Create Services & Price Catalog Table
CREATE TABLE IF NOT EXISTS services (
    service_code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price REAL NOT NULL,
    unit VARCHAR(20) NOT NULL, -- 'kg', 'pair', 'pcs'
    category VARCHAR(50) NOT NULL, -- 'wash_fold', 'shoe_cleaning', 'dry_cleaning', etc.
    description TEXT
);

-- 2. Create Users & Roles Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'customer' -- 'customer', 'valet', 'admin'
);

-- 3. Create Addresses Table
CREATE TABLE IF NOT EXISTS addresses (
    id SERIAL PRIMARY KEY,
    user_phone VARCHAR(20) NOT NULL REFERENCES users(phone) ON UPDATE CASCADE ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- 'home', 'work', 'other'
    address_line TEXT NOT NULL
);

-- 4. Create Valets/Drivers Table (Tracks staff responsible for logistics)
CREATE TABLE IF NOT EXISTS valets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    vehicle_num VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active' -- 'active', 'inactive'
);

-- 5. Create Orders Table
CREATE TABLE IF NOT EXISTS orders (
    order_id VARCHAR(50) PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL REFERENCES users(phone) ON UPDATE CASCADE ON DELETE CASCADE,
    customer_email VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    slot VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    address_type VARCHAR(20) NOT NULL,
    payment VARCHAR(20) NOT NULL, -- 'cod', 'card', 'upi', 'online'
    weight REAL NOT NULL DEFAULT 0.0,
    items_count INTEGER NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0.0,
    status VARCHAR(50) NOT NULL, -- 'pending', 'pickup_scheduled', 'picked_up', etc.
    timestamp VARCHAR(50) NOT NULL,
    latitude REAL DEFAULT 0.0,
    longitude REAL DEFAULT 0.0,
    valet_id INTEGER REFERENCES valets(id) ON DELETE SET NULL
);

-- 6. Create Order Items Table
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

-- 7. Create Email Log Table
CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    recipient VARCHAR(100) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    timestamp VARCHAR(50) NOT NULL
);

-- 8. Create WhatsApp Log Table
CREATE TABLE IF NOT EXISTS whatsapp_logs (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    recipient_phone VARCHAR(20) NOT NULL,
    template_name VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'delivered',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Create Admin Settings Table
CREATE TABLE IF NOT EXISTS admin_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT
);
