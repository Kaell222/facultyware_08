/**
 * controllers/adminController.js
 * Modul Validasi (King Haikal) & Modul Statistik (Fazira Naysa)
 */
const db = require('../config/database');

// Dashboard Statistik Utama (Fitur 10)
const showDashboard = async (req, res) => {
    try {
        const [pendingCount] = await db.execute("SELECT COUNT(*) as total FROM bookings WHERE status = 'pending'");
        const [approvedCount] = await db.execute("SELECT COUNT(*) as total FROM bookings WHERE status = 'disetujui'");
        const [roomCount] = await db.execute("SELECT COUNT(*) as total FROM rooms WHERE status_aktif = TRUE");
        const [recentBookings] = await db.execute(
            `SELECT b.*, r.nama_ruangan, u.nama_lengkap FROM bookings b
             JOIN rooms r ON b.room_id = r.room_id
             JOIN users u ON b.user_id = u.user_id
             ORDER BY b.created_at DESC LIMIT 5`
        );

        return res.render('admin/dashboard', {
            stats: {
                pending: pendingCount[0].total,
                approved: approvedCount[0].total,
                rooms: roomCount[0].total
            },
            recentBookings
        });
    } catch (err) {
        console.error(err);
        return res.status(500).render('error', { statusCode: 500, message: 'Gagal memuat dashboard admin.' });
    }
};

// List Pengajuan Masuk (Fitur 5)
const listBookings = async (req, res) => {
    try {
        const [bookings] = await db.execute(
            `SELECT b.*, r.nama_ruangan, u.nama_lengkap, u.email FROM bookings b
             JOIN rooms r ON b.room_id = r.room_id
             JOIN users u ON b.user_id = u.user_id
             ORDER BY b.status ASC, b.tanggal_pinjam ASC`
        );
        return res.render('admin/bookings', { bookings });
    } catch (err) {
        return res.status(500).render('error', { statusCode: 500, message: 'Gagal menarik berkas pengajuan.' });
    }
};

// Validasi Persetujuan / Penolakan (Fitur 5 & 6)
const updateStatus = async (req, res) => {
    const { id } = req.params;
    const { status, catatan_penolakan } = req.body; // status: 'disetujui' atau 'ditolak'

    try {
        await db.execute(
            'UPDATE bookings SET status = ?, catatan_penolakan = ? WHERE booking_id = ?',
            [status, catatan_penolakan || null, id]
        );
        return res.redirect('/admin/bookings');
    } catch (err) {
        return res.status(500).render('error', { statusCode: 500, message: 'Gagal memperbarui validasi berkas.' });
    }
};

module.exports = {
    showDashboard,
    listBookings,
    updateStatus
};
