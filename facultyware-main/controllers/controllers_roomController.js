/**
 * controllers/roomController.js
 * Modul Pengguna: Fitur 1 (Melihat ketersediaan ruangan)
 */
const db = require('../config/database');

const listRooms = async (req, res) => {
    try {
        // Tarik data semua ruangan aktif
        const [rooms] = await db.execute(
            'SELECT * FROM rooms WHERE status_aktif = TRUE ORDER BY nama_ruangan ASC'
        );

        // Render ke halaman catalog ruangan
        return res.render('rooms', { 
            rooms, 
            error: null,
            success: req.session.flashSuccess || null
        });
    } catch (err) {
        console.error('[roomController.listRooms] Error:', err);
        return res.status(500).render('error', { statusCode: 500, message: 'Gagal memuat ketersediaan ruangan.' });
    }
};

module.exports = {
    listRooms
};
