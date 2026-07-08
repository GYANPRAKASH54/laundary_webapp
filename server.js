require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { exec } = require('child_process');
const { initDb, dbRun, dbAll, dbGet } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(bodyParser.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

// 1. AUTHENTICATION: SIGN UP
app.post('/api/auth/signup', async (req, res) => {
    const { name, phone, email, password } = req.body;
    if (!phone || !name || !email || !password) {
        return res.status(400).json({ error: 'All fields (name, phone, email, password) are required.' });
    }

    try {
        const existing = await dbGet('SELECT * FROM users WHERE phone = ? OR email = ?', [phone, email]);
        if (existing) {
            return res.status(400).json({ error: 'User with this mobile number or email already exists.' });
        }

        await dbRun(
            'INSERT INTO users (name, phone, email, password, role) VALUES (?, ?, ?, ?, ?)',
            [name, phone, email, password, 'customer']
        );
        const newUser = await dbGet('SELECT id, name, phone, email, role FROM users WHERE phone = ?', [phone]);
        console.log(`Registered new user: ${name} (${phone})`);
        res.json({ success: true, user: newUser });
    } catch (err) {
        console.error('Signup error:', err.message);
        res.status(500).json({ error: 'Database error occurred during registration' });
    }
});

// 2. AUTHENTICATION: LOGIN
app.post('/api/auth/login', async (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) {
        return res.status(400).json({ error: 'Phone number and password are required.' });
    }

    try {
        const user = await dbGet('SELECT * FROM users WHERE phone = ?', [phone]);
        
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Invalid phone number or password.' });
        }

        console.log(`Logged in: ${user.name} (${user.role})`);
        const safeUser = { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role };
        res.json({ success: true, user: safeUser });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Database error occurred during login' });
    }
});

// 3. ADDRESS BOOK: GET ADDRESSES
app.get('/api/users/addresses', async (req, res) => {
    const { phone } = req.query;
    if (!phone) {
        return res.status(400).json({ error: 'User phone is required' });
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
app.post('/api/users/addresses', async (req, res) => {
    const { phone, type, address_line } = req.body;
    if (!phone || !type || !address_line) {
        return res.status(400).json({ error: 'Phone, type, and address_line are required' });
    }

    try {
        const existing = await dbGet(
            'SELECT * FROM addresses WHERE user_phone = ? AND type = ? AND address_line = ?',
            [phone, type, address_line]
        );

        if (!existing) {
            await dbRun('INSERT INTO addresses (user_phone, type, address_line) VALUES (?, ?, ?)', [phone, type, address_line]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Add address error:', err.message);
        res.status(500).json({ error: 'Database error adding address' });
    }
});

// 5. ORDERS: GET ORDERS (Admin or specific Customer - MAPPED TO CAMELCASE)
app.get('/api/orders', async (req, res) => {
    const { phone, role } = req.query;

    try {
        let dbRows = [];
        if (role === 'admin') {
            dbRows = await dbAll('SELECT * FROM orders ORDER BY rowid DESC');
        } else if (phone) {
            dbRows = await dbAll('SELECT * FROM orders WHERE customer_phone = ? ORDER BY rowid DESC', [phone]);
        } else {
            return res.status(400).json({ error: 'Please supply phone or role query parameter' });
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
            longitude: order.longitude || 0
        }));

        for (let order of mappedOrders) {
            const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [order.orderId]);
            order.items = items.map(item => ({
                id: item.id.toString(),
                name: item.name,
                qty: item.qty,
                totalWeight: item.weight,
                serviceCode: item.service_code,
                serviceLabel: item.service_label,
                unitPrice: item.unit_price,
                totalPrice: item.total_price
            }));
        }

        res.json(mappedOrders);
    } catch (err) {
        console.error('Fetch orders error:', err.message);
        res.status(500).json({ error: 'Database error fetching orders' });
    }
});

// 5.6 ADMIN: GET ALL REGISTERED USERS
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await dbAll('SELECT name, phone, email, role FROM users ORDER BY name ASC');
        res.json(users);
    } catch (err) {
        console.error('Fetch users error:', err.message);
        res.status(500).json({ error: 'Database error fetching users' });
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
app.post('/api/admin/valets', async (req, res) => {
    const { name, phone, vehicle_num, password } = req.body;
    if (!name || !phone || !password) {
        return res.status(400).json({ error: 'Name, Phone, and Password are required' });
    }
    try {
        await dbRun(
            'INSERT INTO valets (name, phone, vehicle_num, status) VALUES (?, ?, ?, ?)',
            [name, phone, vehicle_num || '', 'active']
        );
        // Also register in users table with role 'valet' so they can log in
        await dbRun(
            'INSERT INTO users (name, phone, email, password, role) VALUES (?, ?, ?, ?, ?)',
            [name, phone, `${phone.replace(/\s+/g, '')}@luxeclean.com`, password, 'valet']
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
            longitude: order.longitude || 0
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
app.post('/api/orders', async (req, res) => {
    const {
        orderId, customerName, customerPhone, customerEmail, date, slot, address, addressType, payment, weight, itemsCount, amount, status, timestamp, items, latitude, longitude
    } = req.body;

    if (!orderId || !customerPhone || !items || items.length === 0) {
        return res.status(400).json({ error: 'Incomplete order details or empty basket' });
    }

    try {
        await dbRun(`
            INSERT INTO orders (
                order_id, customer_name, customer_phone, customer_email, date, slot, address, address_type, payment, weight, items_count, amount, status, timestamp, latitude, longitude
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            orderId, customerName, customerPhone, customerEmail, date, slot, address, addressType, payment, weight, itemsCount, amount, status, timestamp, parseFloat(latitude || 0), parseFloat(longitude || 0)
        ]);

        for (const item of items) {
            await dbRun(`
                INSERT INTO order_items (
                    order_id, name, qty, weight, service_code, service_label, unit_price, total_price
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                orderId, item.name, item.qty, item.totalWeight, item.serviceCode, item.serviceLabel, item.unitPrice, item.totalPrice
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
        await sendMockEmail(order, 'order_placed');

        res.status(201).json({ success: true, orderId });
    } catch (err) {
        console.error('Place order error:', err.message);
        res.status(500).json({ error: 'Database error placing order' });
    }
});

// 7. ORDERS: UPDATE WEIGHT & CALC PRICE (Admin weighing)
app.put('/api/orders/:orderId/metrics', async (req, res) => {
    const { orderId } = req.params;
    const { weight, items_count } = req.body;

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

        await dbRun(
            'UPDATE orders SET weight = ?, items_count = ?, amount = ?, status = ? WHERE order_id = ?',
            [parseFloat(finalWeight.toFixed(2)), finalItemsCount, finalAmount, 'picked_up', orderId]
        );

        console.log(`Weighed order ${orderId}: Weight = ${finalWeight}kg, Count = ${finalItemsCount}, Amount = ₹${finalAmount}`);
        
        const updatedOrder = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        updatedOrder.items = items;
        await sendMockEmail(updatedOrder, 'weighed_processing');

        res.json({ success: true, orderId, weight: finalWeight, amount: finalAmount, status: 'processing' });
    } catch (err) {
        console.error('Update order metrics error:', err.message);
        res.status(500).json({ error: 'Database error updating metrics' });
    }
});

// 8. ORDERS: UPDATE STATUS (Admin)
app.put('/api/orders/:orderId/status', async (req, res) => {
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

        await dbRun('UPDATE orders SET status = ? WHERE order_id = ?', [status, orderId]);
        console.log(`Updated order ${orderId} status to ${status}`);

        const updatedOrder = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        updatedOrder.items = items;
        await sendMockEmail(updatedOrder, status);

        res.json({ success: true, orderId, status });
    } catch (err) {
        console.error('Update status error:', err.message);
        res.status(500).json({ error: 'Database error updating status' });
    }
});

// 9. ORDERS: CANCEL ORDER (Customer)
app.put('/api/orders/:orderId/cancel', async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.status !== 'pending' && order.status !== 'pickup_scheduled') {
            return res.status(400).json({ error: 'Order cannot be cancelled once pickup has been confirmed.' });
        }

        await dbRun("UPDATE orders SET status = 'cancelled' WHERE order_id = ?", [orderId]);
        console.log(`Cancelled order ${orderId}`);

        const updatedOrder = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        updatedOrder.items = items;
        await sendMockEmail(updatedOrder, 'cancelled');

        res.json({ success: true, orderId, status: 'cancelled' });
    } catch (err) {
        console.error('Cancel order error:', err.message);
        res.status(500).json({ error: 'Database error cancelling order' });
    }
});

// 10. GET EMAIL LOGS (Admin view)
app.get('/api/email/logs', async (req, res) => {
    try {
        const logs = await dbAll('SELECT * FROM email_logs ORDER BY id DESC');
        res.json(logs);
    } catch (err) {
        console.error('Fetch email logs error:', err.message);
        res.status(500).json({ error: 'Database error fetching email logs' });
    }
});

// 11. POST PAYMENT REMINDER (Admin manual trigger notification)
app.post('/api/orders/:orderId/payment-reminder', async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await dbGet('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        order.items = items;
        
        await sendMockEmail(order, 'payment_reminder');
        
        console.log(`Payment Reminder notification triggered manually for Order ${orderId}`);
        res.json({ success: true, orderId });
    } catch (err) {
        console.error('Payment reminder trigger error:', err.message);
        res.status(500).json({ error: 'Database error triggering notification' });
    }
});


// MOCK SMTP EMAIL SENDER & LOG PERSISTER
async function sendMockEmail(order, type) {
    const timestamp = new Date().toLocaleString();
    let subject = '';
    let body = '';

    const orderAmount = order.amount !== undefined ? order.amount : order.amount;
    const orderWeight = order.weight !== undefined ? order.weight : order.weight;
    const orderId = order.order_id || order.orderId;
    const customerName = order.customer_name || order.customerName;
    const customerEmail = order.customer_email || order.customerEmail;
    const orderPayment = order.payment;

    const billString = orderAmount > 0 ? `₹${orderAmount.toFixed(2)}` : 'Awaiting weight measurement at facility';
    const weightString = orderWeight > 0 ? `${orderWeight} kg` : 'Awaiting weigh-in';

    // Build styled HTML Email Template
    const emailHeader = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #c2c7cd; border-radius: 12px; background-color: #ffffff; color: #001726;">
            <div style="text-align: center; border-bottom: 2px solid #7b5800; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #001726; font-size: 24px; letter-spacing: -0.5px;">LuxeClean Fabric Care</h2>
                <p style="margin: 5px 0 0 0; font-size: 12px; color: #72787e;">Order Status Update & Delivery Receipt</p>
            </div>
    `;

    const emailFooter = `
            <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #c2c7cd; text-align: center; font-size: 11px; color: #72787e;">
                <p style="margin: 0;">LuxeClean Automated Mailer. Please do not reply directly to this email.</p>
                <p style="margin: 5px 0 0 0;">© 2026 LuxeClean.in Inc. All rights reserved.</p>
            </div>
        </div>
    `;

    switch (type) {
        case 'order_placed':
            subject = `Order Placed Successfully! (Ref: ${orderId})`;
            body = `
                ${emailHeader}
                <p>Hello <strong>${customerName}</strong>,</p>
                <p>Thank you for choosing LuxeClean. We have received your booking and a valet will arrive at your scheduled time slot.</p>
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
            subject = `LuxeClean Weigh-In Complete: Order #${orderId}`;
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
                ${emailFooter}
            `;
            break;
        case 'delivered':
            subject = `LuxeClean Transaction Receipt: Order #${orderId}`;
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
            subject = `LuxeClean Invoice: Payment Reminder (Ref: ${orderId})`;
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
                <p>Please have this amount ready at the time of delivery drop-off. You can pay via Cash or UPI Scan. Thank you!</p>
                ${emailFooter}
            `;
            break;
    }

    try {
        if (subject && body && customerEmail) {
            await dbRun(
                'INSERT INTO email_logs (order_id, recipient, subject, body, timestamp) VALUES (?, ?, ?, ?, ?)',
                [orderId, customerEmail, subject, body, timestamp]
            );
            console.log(`Mock Email sent to ${customerEmail}: "${subject}"`);
        }
    } catch (e) {
        console.error('Error writing mock email log:', e.message);
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
        console.log(`LuxeClean backend server is listening on port ${PORT}`);
        console.log(`Web application is live at http://localhost:${PORT}`);
        openBrowser(`http://localhost:${PORT}`);
    });
}

// Export Express app for Vercel Serverless runtime compatibility
module.exports = app;
