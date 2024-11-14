const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");  // Menambahkan require cors

const app = express();
app.use(bodyParser.json());

// Menambahkan middleware CORS untuk mengizinkan akses dari semua domain
app.use(cors());  // Mengizinkan semua domain untuk mengakses API

// Host	d6q8diwwdmy5c9k9.cbetxkdyhwsb.us-east-1.rds.amazonaws.com	
// Username	eqohutq5hjlo9cv3	
// Password	cytqv4uh3xkpv0wk	
// Port	3306	
// Database	kfgy6rttnmne0moz

// Konfigurasi koneksi MySQL
const db = mysql.createConnection({
  host: "d6q8diwwdmy5c9k9.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
  user: "eqohutq5hjlo9cv3",       
  password: "cytqv4uh3xkpv0wk",       
  database: "kfgy6rttnmne0moz"  
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    return;
  }
  console.log("Connected to MySQL database");
});

const bobotNilai = {
  'A': 4.0,
  'B+': 3.5,
  'B': 3.0,
  'C+': 2.5,
  'C': 2.0,
  'D': 1.0,
  'E': 0.0,
};

// Fungsi untuk menghitung IPS per semester
function hitungIpsPerSemester(mahasiswaId, callback) {
    const query = `
      SELECT krs.semester, krs.nilai, krs.nilai_huruf, matakuliah.nama AS nama_matakuliah, matakuliah.sks
      FROM krs
      JOIN matakuliah ON krs.mata_kuliah_id = matakuliah.id
      WHERE krs.mahasiswa_id = ?
      ORDER BY krs.semester
    `;
  
    db.query(query, [mahasiswaId], (err, results) => {
      if (err) {
        return callback(err);
      }
  
      const krsPerSemester = results.reduce((acc, item) => {
        if (!acc[item.semester]) acc[item.semester] = [];
        acc[item.semester].push(item);
        return acc;
      }, {});
  
      const ips = {};
      const daftarMatakuliah = {};
  
      for (const semester in krsPerSemester) {
        let nilaiIps = 0;
        let sksTotal = 0;
        let matakuliahList = [];
  
        krsPerSemester[semester].forEach((item) => {
          const bobot = bobotNilai[item.nilai_huruf] || 0;
          if (item.sks > 0) {
            matakuliahList.push({
              nama_matakuliah: item.nama_matakuliah,
              sks: item.sks,
              nilai: item.nilai,
            });
            nilaiIps += bobot * item.sks;
            sksTotal += item.sks;
          }
        });
  
        ips[semester] = sksTotal > 0 ? nilaiIps / sksTotal : 0;
        daftarMatakuliah[semester] = matakuliahList;
      }
  
      callback(null, { ips, matakuliah: daftarMatakuliah });
    });
}

// Fungsi untuk menghitung IPK berdasarkan IPS per semester
function hitungIpkIPS(ipsPerSemester) {
    const totalIps = Object.values(ipsPerSemester).reduce((acc, ips) => acc + ips, 0);
    const jumlahSemester = Object.keys(ipsPerSemester).length;
  
    return jumlahSemester > 0 ? totalIps / jumlahSemester : 0;
}

app.get("/", (req,res) => {
    res.send("SELAMAT DATANG");
});

// Endpoint untuk menampilkan daftar seluruh mahasiswa
app.get("/mahasiswa", (req, res) => {
  db.query(`SELECT * FROM mahasiswa`, (err, results) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(results);
    }
  });
});

// Endpoint untuk menghitung IPK dan menampilkan data IPK mahasiswa
app.get("/ipk/:nim", (req, res) => {
    const nim = req.params.nim;
  
    // Cari mahasiswa berdasarkan NIM
    const queryMahasiswa = `SELECT * FROM mahasiswa WHERE nim = ?`;
    db.query(queryMahasiswa, [nim], (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
  
      const mahasiswa = result[0];
      if (!mahasiswa) {
        return res.status(404).json({ message: "NIM tidak ditemukan" });
      }
  
      // Hitung IPS per semester dan IPK
      hitungIpsPerSemester(mahasiswa.id, (err, ipsPerSemester) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
  
        const ipk = hitungIpkIPS(ipsPerSemester.ips);
  
        // Cek IPK di database
        const queryIpk = `SELECT * FROM ipk WHERE mahasiswa_id = ? ORDER BY id DESC LIMIT 1`;
        db.query(queryIpk, [mahasiswa.id], (err, existingIpkResult) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
  
          const existingIpk = existingIpkResult[0];
  
          if (existingIpk) {
            if (existingIpk.ipk === ipk) {
              return res.json({
                nim: mahasiswa.nim,
                nama: mahasiswa.nama,
                ips: ipsPerSemester,
                ipk: ipk,
                message: "IPK sudah diperbarui sebelumnya dan tidak perlu diupdate.",
              });
            }
  
            // Update IPK jika berbeda
            const updateIpkQuery = `UPDATE ipk SET ipk = ? WHERE id = ?`;
            db.query(updateIpkQuery, [ipk, existingIpk.id], (err) => {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
  
              res.json({
                nim: mahasiswa.nim,
                nama: mahasiswa.nama,
                ips: ipsPerSemester,
                ipk: ipk,
                message: "IPK berhasil diupdate.",
              });
            });
          } else {
            // Tambahkan IPK jika belum ada
            const insertIpkQuery = `INSERT INTO ipk (mahasiswa_id, ipk) VALUES (?, ?)`;
            db.query(insertIpkQuery, [mahasiswa.id, ipk], (err) => {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
  
              res.json({
                nim: mahasiswa.nim,
                nama: mahasiswa.nama,
                ips: ipsPerSemester,
                ipk: ipk,
                message: "IPK berhasil disimpan.",
              });
            });
          }
        });
      });
    });
});

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
