const express = require('express');
const router = express.Router();
const db = require('../lib/database');

// Middleware to check authentication for API
const apiAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized: Harap login terlebih dahulu.' });
    }
    next();
};

router.use(apiAuth);

// Endpoint untuk daftar ruangan
router.get('/rooms', async (req, res) => {
    try {
        const [rooms] = await db.query('SELECT id, name, code, floor, capacity FROM rooms');
        res.json({ success: true, data: rooms });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint untuk daftar peminjaman user saat ini (atau semua peminjaman jika penanggung_jawab)
router.get('/bookings', async (req, res) => {
    try {
        const user = req.session.user;
        let query = `
            SELECT rl.*, r.name AS room_name, u.name AS borrower_name 
            FROM room_loans rl
            JOIN rooms r ON rl.room_id = r.id
            JOIN users u ON rl.employee_id = u.id
        `;
        let params = [];

        if (user.role !== 'penanggung_jawab') {
            query += " WHERE rl.employee_id = ?";
            params.push(user.id);
        }

        query += " ORDER BY rl.start_time DESC";
        const [bookings] = await db.query(query, params);
        res.json({ success: true, data: bookings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
