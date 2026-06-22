const express = require('express');
const router = express.Router();
const db = require('../lib/database');

// --- SATPAM MIDDLEWARE ---
router.use((req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
});

// 1. Tampilkan Daftar Peminjaman
router.get('/', async (req, res, next) => {
    try {
        let sql = '';
        let params = [];

        if (req.session.user.role === 'penanggung_jawab') {
            sql = `SELECT room_loans.*, rooms.name AS room_name, 
                   users.name AS borrower_name 
                   FROM room_loans 
                   JOIN rooms ON room_loans.room_id = rooms.id 
                   LEFT JOIN users ON users.id = room_loans.user_id
                   ORDER BY room_loans.created_at DESC`;
        } else {
            sql = `SELECT room_loans.*, rooms.name AS room_name 
                   FROM room_loans 
                   JOIN rooms ON room_loans.room_id = rooms.id 
                   WHERE room_loans.user_id = ? 
                   ORDER BY room_loans.created_at DESC`;
            params = [req.session.user.id];
        }

        const [bookings] = await db.query(sql, params);
        res.render('booking-list', { title: 'Daftar Peminjaman Ruangan', bookings: bookings });
    } catch (err) {
        next(err);
    }
});

// 2. Tampilkan Form Tambah
router.get('/add', async (req, res, next) => {
    try {
        const [rooms] = await db.query('SELECT * FROM rooms');
        res.render('add-booking', { title: 'Buat Pengajuan Baru', rooms: rooms });
    } catch (err) {
        next(err);
    }
});

// 3. Proses Simpan Data Form
router.post('/add', async (req, res, next) => {
    try {
        const { room_id, tanggal, jam_mulai, jam_selesai, purpose } = req.body;
        const start_time = `${tanggal} ${jam_mulai}:00`;
        const end_time = `${tanggal} ${jam_selesai}:00`;
        const user_id = req.session.user.id;

        // 1. CEK APAKAH RUANGAN SEDANG DIPAKAI (BENTROK)
        const checkSql = 'SELECT * FROM room_loans WHERE room_id = ? AND status = \'approved\' AND ((? BETWEEN start_time AND end_time) OR (? BETWEEN start_time AND end_time) OR (start_time BETWEEN ? AND ?))';
        const [bentrok] = await db.query(checkSql, [room_id, start_time, end_time, start_time, end_time]);

        if (bentrok && bentrok.length > 0) {
            return res.status(400).send("Gagal: Ruangan sudah dipesan pada jam tersebut.");
        }

        // 2. JIKA AMAN, LANJUT PROSES SIMPAN
        const sql = `INSERT INTO room_loans (room_id, user_id, start_time, end_time, purpose, status, approved_by_id, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, 'requested', 1, NOW(), NOW())`;

        await db.execute(sql, [room_id, user_id, start_time, end_time, purpose]);
        res.redirect('/bookings');
    } catch (err) {
        next(err);
    }
});

/// FITUR 11 - Halaman Laporan Bulanan (Fazira)
router.get('/laporan/bulanan', async (req, res, next) => {
    try {
        if (req.session.user.role !== 'penanggung_jawab') {
            return res.status(403).send('Akses ditolak!');
        }

        const bulan = req.query.bulan || new Date().getMonth() + 1;
        const tahun = req.query.tahun || new Date().getFullYear();

        const [bookings] = await db.query(`
            SELECT room_loans.*, rooms.name AS room_name, 
            users.name AS borrower_name
            FROM room_loans 
            JOIN rooms ON room_loans.room_id = rooms.id
            LEFT JOIN users ON users.id = room_loans.user_id
            WHERE MONTH(room_loans.start_time) = ? AND YEAR(room_loans.start_time) = ?
            ORDER BY room_loans.start_time ASC
        `, [bulan, tahun]);

        res.render('laporan-bulanan', {
            title: 'Laporan Bulanan',
            bookings: bookings,
            bulan: bulan,
            tahun: tahun
        });
    } catch (err) {
        next(err);
    }
});

// FITUR 11 - Download PDF Laporan Bulanan (Fazira)
router.get('/laporan/bulanan/download', async (req, res, next) => {
    try {
        if (req.session.user.role !== 'penanggung_jawab') {
            return res.status(403).send('Akses ditolak!');
        }

        const bulan = req.query.bulan || new Date().getMonth() + 1;
        const tahun = req.query.tahun || new Date().getFullYear();

        const [data] = await db.query(`
            SELECT room_loans.*, rooms.name AS room_name, 
            users.name AS borrower_name
            FROM room_loans 
            JOIN rooms ON room_loans.room_id = rooms.id
            LEFT JOIN users ON users.id = room_loans.user_id
            WHERE MONTH(room_loans.start_time) = ? AND YEAR(room_loans.start_time) = ?
            ORDER BY room_loans.start_time ASC
        `, [bulan, tahun]);

        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=laporan-bulanan-${bulan}-${tahun}.pdf`);

        doc.pipe(res);

        doc.fontSize(18).font('Helvetica-Bold').text('LAPORAN PEMINJAMAN RUANGAN', { align: 'center' });
        doc.fontSize(12).font('Helvetica').text(`Bulan: ${bulan} / Tahun: ${tahun}`, { align: 'center' });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        if (data.length === 0) {
            doc.text('Tidak ada data peminjaman pada bulan ini.', { align: 'center' });
        } else {
            doc.font('Helvetica-Bold').fontSize(10);
            doc.text('No', 50, doc.y, { width: 30 });
            doc.text('Peminjam', 80, doc.y - 12, { width: 120 });
            doc.text('Ruangan', 200, doc.y - 12, { width: 100 });
            doc.text('Tanggal', 300, doc.y - 12, { width: 100 });
            doc.text('Status', 400, doc.y - 12, { width: 80 });
            doc.moveDown();
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(0.5);

            doc.font('Helvetica').fontSize(9);
            data.forEach((item, index) => {
                const y = doc.y;
                doc.text(index + 1, 50, y, { width: 30 });
                doc.text(item.borrower_name || '-', 80, y, { width: 120 });
                doc.text(item.room_name || '-', 200, y, { width: 100 });
                doc.text(new Date(item.start_time).toLocaleDateString('id-ID'), 300, y, { width: 100 });
                doc.text(item.status, 400, y, { width: 80 });
                doc.moveDown();
            });
        }

        doc.moveDown();
        doc.fontSize(10).text(`Total: ${data.length} peminjaman`, { align: 'right' });
        doc.end();

    } catch (err) {
        next(err);
    }
});

// 4. Proses ACC / Tolak (Farrel)
router.post('/:id/action', async (req, res, next) => {
    try {
        if (req.session.user.role !== 'penanggung_jawab') {
            return res.status(403).send("Hanya Penanggung Jawab yang boleh melakukan aksi ini.");
        }

        const bookingId = req.params.id;
        const { action_status } = req.body;

        const sql = `UPDATE room_loans SET status = ?, updated_at = NOW() WHERE id = ?`;
        await db.execute(sql, [action_status, bookingId]);

        res.redirect('/bookings');
    } catch (err) {
        next(err);
    }
});
const PDFDocument = require('pdfkit');

router.get('/:id/download', async (req, res, next) => {
    try {
        const [booking] = await db.query(`
            SELECT rl.*, r.name AS room_name, u.name AS borrower_name 
            FROM room_loans rl 
            JOIN rooms r ON rl.room_id = r.id 
            JOIN users u ON rl.user_id = u.id
            WHERE rl.id = ?`, [req.params.id]);

        if (booking.length === 0) return res.status(404).send("Data tidak ditemukan");

        const data = booking[0];
        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Bukti_Peminjaman_${data.id}.pdf`);
        doc.pipe(res);

        // 1. Header/Kop Surat
        doc.fontSize(18).font('Helvetica-Bold').text('UNIVERSITAS ANDALAS', { align: 'center' });
        doc.fontSize(12).font('Helvetica').text('Sistem Peminjaman Ruangan - Facultyware', { align: 'center' });
        doc.moveDown();
        doc.moveTo(50, 110).lineTo(550, 110).stroke(); // Garis pembatas

        // 2. Judul Dokumen
        doc.moveDown(2);
        doc.fontSize(16).font('Helvetica-Bold').text('BUKTI PENGAJUAN PEMINJAMAN', { align: 'center' });
        doc.moveDown();

        // 3. Detail Data dengan format tabel sederhana
        const startY = 180;
        const drawRow = (label, value, y) => {
            doc.fontSize(12).font('Helvetica-Bold').text(label, 50, y);
            doc.font('Helvetica').text(`: ${value}`, 200, y);
        };

        drawRow('ID Peminjaman', data.id, startY);
        drawRow('Nama Peminjam', data.borrower_name, startY + 25);
        drawRow('Ruangan', data.room_name, startY + 50);
        drawRow('Tanggal', new Date(data.start_time).toLocaleDateString('id-ID'), startY + 75);
        drawRow('Jam Mulai', new Date(data.start_time).toLocaleTimeString('id-ID'), startY + 100);
        drawRow('Jam Selesai', new Date(data.end_time).toLocaleTimeString('id-ID'), startY + 125);
        drawRow('Status', data.status.toUpperCase(), startY + 150);

        // 4. Bagian Keperluan
        doc.moveDown(8);
        doc.fontSize(12).font('Helvetica-Bold').text('Keperluan Peminjaman:');
        doc.font('Helvetica').text(data.purpose, { width: 450, align: 'justify' });

        // 5. Footer / Tanda Tangan
        doc.moveDown(5);
        doc.text('Padang, ' + new Date().toLocaleDateString('id-ID'), { align: 'right' });
        doc.moveDown(3);
        doc.text('Penanggung Jawab', { align: 'right' });

        doc.end();
    } catch (err) {
        next(err);
    }
});

// FITUR 9 - Tandai Ruangan Selesai (Fazira)
router.post('/:id/selesai', async (req, res, next) => {
    try {
        const bookingId = req.params.id;
        const userId = req.session.user.id;

        const [booking] = await db.query(
            'SELECT * FROM room_loans WHERE id = ? AND user_id = ?',
            [bookingId, userId]
        );

        if (booking.length === 0) {
            return res.status(403).render('error', {
                title: 'Akses Ditolak',
                message: 'Peminjaman tidak ditemukan atau bukan milik Anda.'
            });
        }

        if (booking[0].status !== 'approved') {
            return res.status(400).render('error', {
                title: 'Gagal',
                message: 'Hanya peminjaman yang disetujui yang bisa ditandai selesai.'
            });
        }

        await db.execute(
            'UPDATE room_loans SET status = ?, updated_at = NOW() WHERE id = ?',
            ['completed', bookingId]
        );

        res.redirect('/bookings');
    } catch (err) {
        next(err);
    }
});

// FITUR 12 - Halaman Export Riwayat (Fazira)
router.get('/export/riwayat', async (req, res, next) => {
    try {
        if (req.session.user.role !== 'penanggung_jawab') {
            return res.status(403).send('Akses ditolak!');
        }

        const status = req.query.status || '';
        const tgl_mulai = req.query.tgl_mulai || '';
        const tgl_selesai = req.query.tgl_selesai || '';

        let sql = `SELECT room_loans.*, rooms.name AS room_name, 
                   users.name AS borrower_name
                   FROM room_loans 
                   JOIN rooms ON room_loans.room_id = rooms.id
                   LEFT JOIN users ON users.id = room_loans.user_id
                   WHERE 1=1`;
        let params = [];

        if (status) {
            sql += ` AND room_loans.status = ?`;
            params.push(status);
        }
        if (tgl_mulai) {
            sql += ` AND DATE(room_loans.start_time) >= ?`;
            params.push(tgl_mulai);
        }
        if (tgl_selesai) {
            sql += ` AND DATE(room_loans.start_time) <= ?`;
            params.push(tgl_selesai);
        }

        sql += ` ORDER BY room_loans.start_time DESC`;

        const [bookings] = await db.query(sql, params);

        res.render('export-riwayat', {
            title: 'Ekspor Riwayat Peminjaman',
            bookings: bookings,
            status: status,
            tgl_mulai: tgl_mulai,
            tgl_selesai: tgl_selesai
        });
    } catch (err) {
        next(err);
    }
});

// FITUR 12 - Download PDF Export Riwayat (Fazira)
router.get('/export/riwayat/download', async (req, res, next) => {
    try {
        if (req.session.user.role !== 'penanggung_jawab') {
            return res.status(403).send('Akses ditolak!');
        }

        const status = req.query.status || '';
        const tgl_mulai = req.query.tgl_mulai || '';
        const tgl_selesai = req.query.tgl_selesai || '';

        let sql = `SELECT room_loans.*, rooms.name AS room_name, 
                   users.name AS borrower_name
                   FROM room_loans 
                   JOIN rooms ON room_loans.room_id = rooms.id
                   LEFT JOIN users ON users.id = room_loans.user_id
                   WHERE 1=1`;
        let params = [];

        if (status) {
            sql += ` AND room_loans.status = ?`;
            params.push(status);
        }
        if (tgl_mulai) {
            sql += ` AND DATE(room_loans.start_time) >= ?`;
            params.push(tgl_mulai);
        }
        if (tgl_selesai) {
            sql += ` AND DATE(room_loans.start_time) <= ?`;
            params.push(tgl_selesai);
        }

        sql += ` ORDER BY room_loans.start_time DESC`;

        const [data] = await db.query(sql, params);

        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=riwayat-peminjaman.pdf`);

        doc.pipe(res);

        doc.fontSize(18).font('Helvetica-Bold').text('RIWAYAT PEMINJAMAN RUANGAN', { align: 'center' });
        doc.fontSize(10).font('Helvetica').text(`Filter: Status=${status || 'Semua'} | Dari=${tgl_mulai || '-'} | Sampai=${tgl_selesai || '-'}`, { align: 'center' });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        if (data.length === 0) {
            doc.text('Tidak ada data yang sesuai filter.', { align: 'center' });
        } else {
            doc.font('Helvetica-Bold').fontSize(10);
            doc.text('No', 50, doc.y, { width: 30 });
            doc.text('Peminjam', 80, doc.y - 12, { width: 120 });
            doc.text('Ruangan', 200, doc.y - 12, { width: 100 });
            doc.text('Tanggal', 300, doc.y - 12, { width: 100 });
            doc.text('Status', 400, doc.y - 12, { width: 80 });
            doc.moveDown();
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(0.5);

            doc.font('Helvetica').fontSize(9);
            data.forEach((item, index) => {
                const y = doc.y;
                doc.text(index + 1, 50, y, { width: 30 });
                doc.text(item.borrower_name || '-', 80, y, { width: 120 });
                doc.text(item.room_name || '-', 200, y, { width: 100 });
                doc.text(new Date(item.start_time).toLocaleDateString('id-ID'), 300, y, { width: 100 });
                doc.text(item.status, 400, y, { width: 80 });
                doc.moveDown();
            });
        }

        doc.moveDown();
        doc.fontSize(10).text(`Total: ${data.length} data`, { align: 'right' });
        doc.end();

    } catch (err) {
        next(err);
    }
});

module.exports = router;