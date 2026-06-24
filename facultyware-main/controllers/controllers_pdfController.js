/**
 * controllers/pdfController.js
 * Fitur 4, 8, 11, 12 (Ekspor Dokumen PDF Cetak Cetak Terintegrasi)
 */
const db = require('../config/database');

const downloadReceipt = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.execute(
            `SELECT b.*, r.nama_ruangan, u.nama_lengkap FROM bookings b
             JOIN rooms r ON b.room_id = r.room_id
             JOIN users u ON b.user_id = u.user_id WHERE b.booking_id = ?`, [id]
        );
        if (rows.length === 0) return res.send('Dokumen tidak ditemukan.');

        const data = rows[0];
        res.setHeader('Content-Type', 'text/html');
        return res.send(`
            <div style="font-family: Arial; padding: 30px; border: 2px solid #333;">
                <h1 style="text-align:center;">BUKTI PENGAJUAN AWAL PEMINJAMAN RUANGAN</h1>
                <hr/>
                <p><b>ID Booking:</b> ${data.booking_id}</p>
                <p><b>Peminjam:</b> ${data.nama_lengkap}</p>
                <p><b>Ruangan:</b> ${data.nama_ruangan}</p>
                <p><b>Waktu Pelaksanaan:</b> ${data.tanggal_pinjam} (${data.jam_mulai} - ${data.jam_selesai})</p>
                <p><b>Keperluan:</b> ${data.keperluan}</p>
                <p><b>Status Saat Ini:</b> ${data.status.toUpperCase()}</p>
                <hr/>
                <p style="text-align:right;">Dicetak secara otomatis oleh Sistem FacultyWare FTI</p>
                <script>window.print();</script>
            </div>
        `);
    } catch (err) {
        return res.send('Gagal mengunduh berkas berkas PDF.');
    }
};

module.exports = {
    downloadReceipt
};
