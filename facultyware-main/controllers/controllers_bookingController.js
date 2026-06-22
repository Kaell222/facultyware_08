/**
 * controllers/bookingController.js
 * Modul Pengguna: Fitur 2, 3, 4 & Modul Laporan: Fitur 9
 */
const db = require('../config/database');

// Tampilkan form pengajuan (Fitur 2)
const showFormBooking = async (req, res) => {
    const { room_id } = req.query;
    try {
        const [rooms] = await db.execute('SELECT * FROM rooms WHERE room_id = ? LIMIT 1', [room_id]);
        if (rooms.length === 0) {
            req.session.flashError = 'Ruangan tidak ditemukan.';
            return res.redirect('/rooms');
        }
        return res.render('booking_form', { room: rooms[0], error: null });
    } catch (err) {
        return res.status(500).render('error', { statusCode: 500, message: 'Gagal memuat form pengajuan.' });
    }
};

// Simpan pengajuan baru (Fitur 2)
const createBooking = async (req, res) => {
    const { room_id, tanggal_pinjam, jam_mulai, jam_selesai, keperluan } = req.body;
    const user_id = req.session.user.id;

    if (!room_id || !tanggal_pinjam || !jam_mulai || !jam_selesai || !keperluan) {
        return res.render('booking_form', { room: { room_id }, error: 'Semua bidang wajib diisi.' });
    }

    try {
        // Cek bentrokan jadwal (overlap)
        const [clash] = await db.execute(
            `SELECT * FROM bookings 
             WHERE room_id = ? AND tanggal_pinjam = ? AND status IN ('pending', 'disetujui')
             AND ((jam_mulai <= ? AND jam_selesai > ?) OR (jam_mulai < ? AND jam_selesai >= ?))`,
            [room_id, tanggal_pinjam, jam_mulai, jam_mulai, jam_selesai, jam_selesai]
        );

        if (clash.length > 0) {
            const [rooms] = await db.execute('SELECT * FROM rooms WHERE room_id = ? LIMIT 1', [room_id]);
            return res.render('booking_form', { room: rooms[0], error: 'Jadwal bentrok dengan peminjaman lain!' });
        }

        const newBookingId = 'BKG-' + Date.now();
        // Berkas surat_izin dikosongkan dulu atau opsional string dummy untuk tahap ini
        const surat_izin = req.file ? req.file.filename : 'default_ktm.pdf'; 

        await db.execute(
            `INSERT INTO bookings (booking_id, user_id, room_id, tanggal_pinjam, jam_mulai, jam_selesai, keperluan, surat_izin, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [newBookingId, user_id, room_id, tanggal_pinjam, jam_mulai, jam_selesai, keperluan, surat_izin]
        );

        req.session.flashSuccess = 'Pengajuan peminjaman berhasil diajukan!';
        return res.redirect('/bookings/history');
    } catch (err) {
        console.error(err);
        return res.status(500).render('error', { statusCode: 500, message: 'Server error saat menyimpan booking.' });
    }
};

// Lihat riwayat pengajuan (Fitur 3)
const viewHistory = async (req, res) => {
    const user_id = req.session.user.id;
    try {
        const [history] = await db.execute(
            `SELECT b.*, r.nama_ruangan FROM bookings b
             JOIN rooms r ON b.room_id = r.room_id
             WHERE b.user_id = ? ORDER BY b.created_at DESC`,
            [user_id]
        );
        return res.render('booking_history', { history });
    } catch (err) {
        return res.status(500).render('error', { statusCode: 500, message: 'Gagal memuat riwayat pengajuan.' });
    }
};

// Tandai Selesai Digunakan (Fitur 9 - Modul Laporan)
const completeBooking = async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute(
            "UPDATE bookings SET status = 'selesai' WHERE booking_id = ? AND status = 'disetujui'",
            [id]
        );
        req.session.flashSuccess = 'Ruangan telah selesai dilaporkan digunakan.';
        return res.redirect('/bookings/history');
    } catch (err) {
        return res.status(500).render('error', { statusCode: 500, message: 'Gagal memperbarui status.' });
    }
};

module.exports = {
    showFormBooking,
    createBooking,
    viewHistory,
    completeBooking
};
