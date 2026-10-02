// API integration tests for InDeKos v2 (seed data, APP_TODAY=2026-09-27).
// Run via `npm test` (test/run.mjs boots a server on a temporary database).
const BASE = `http://localhost:${process.argv[2]}/api`;
let pass = 0; let fail = 0;
const ok = (cond, msg, extra = '') => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra); } };

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

// 1x1 JPEG
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

console.log('— Auth');
let r = await call('GET', '/dashboard');
ok(r.status === 401, 'protected route rejects anonymous', r.status);
r = await call('POST', '/auth/login', { username: 'pemilik', password: 'salah' });
ok(r.status === 401, 'wrong password rejected');
r = await call('POST', '/auth/login', { username: 'pemilik', password: 'pemilik123' });
ok(r.status === 200 && r.data.token, 'pemilik login');
const P = r.data.token;
r = await call('POST', '/auth/login', { username: 'admin', password: 'admin123' });
const A = r.data.token;
ok(r.data.user.role === 'admin', 'admin login');
r = await call('PUT', '/settings', { namaKos: 'X' }, A);
ok(r.status === 403, 'admin cannot change settings');
r = await call('GET', '/settings', null, P);
ok(r.status === 200 && !('waToken' in r.data) && r.data.waTokenSet === false, 'secrets masked in settings');
r = await call('GET', '/public/info');
ok(r.status === 200 && r.data.roomTypes.length === 2 && !('qrisString' in r.data), 'public info (no secrets) + room types');

console.log('— Rooms (colors/status)');
r = await call('GET', '/rooms', null, A);
const byNum = Object.fromEntries(r.data.map((x) => [x.number, x]));
ok(byNum['101'].status === 'oc' && byNum['104'].status === 'av' && byNum['116'].status === 'mn', 'occupied/empty/maintenance statuses');
ok(byNum['118'].typeName === 'Premium AC' && byNum['118'].facilities.includes('AC'), 'room type + facilities');

console.log('— Billing');
r = await call('GET', '/residents', null, A);
const budi = r.data.find((x) => x.room === '103');
const maya = r.data.find((x) => x.room === '115');
const daffa = r.data.find((x) => x.room === '101');
ok(budi.payStatus === 'tunggak' && budi.outstanding > 0, `Budi tunggak (outstanding ${budi?.outstanding})`);
ok(maya.payStatus === 'ditangguhkan', `Maya deferred (${maya?.payStatus})`);
ok(daffa.payStatus === 'lunas', `Daffa lunas (${daffa?.payStatus})`);
r = await call('GET', `/residents/${budi.id}`, null, A);
const sewaBudi = r.data.invoices.filter((i) => i.kind === 'sewa');
ok(sewaBudi.length >= 9, `Budi has one sewa invoice per month (${sewaBudi.length})`);
ok(r.data.invoices.some((i) => i.kind === 'denda'), 'separate denda invoice exists');
const putri = (await call('GET', '/residents', null, A)).data.find((x) => x.room === '118');
const putriInv = (await call('GET', `/residents/${putri.id}`, null, A)).data.invoices;
ok(putriInv.length > 0, `Putri (masuk 15 Jul, dueDay 15) invoices: ${putriInv.length}`);

// New resident mid-month with daily rate → pro-rata first period
r = await call('POST', '/residents', { name: 'Tes Harian', room: '104', masuk: '2026-09-20', dueDay: 1, dailyRateEnabled: true, dailyRate: 40000, wa: '0811111111' }, A);
ok(r.status === 201, 'create resident with daily rate', JSON.stringify(r.data));
const tes = r.data;
const prorata = tes.invoices.find((i) => i.description.includes('pro-rata'));
ok(prorata && prorata.amount === 11 * 40000, `pro-rata 20–30 Sep = 11 hari × 40k (${prorata?.amount})`);
r = await call('POST', '/residents', { name: 'Dobel', room: '104' }, A);
ok(r.status === 409, 'cannot place 2 residents in same room');
r = await call('POST', '/residents', { name: 'Rusak', room: '116' }, A);
ok(r.status === 409, 'cannot place resident in maintenance room');

console.log('— Promo');
r = await call('GET', '/promos', null, A);
const promo = r.data[0];
ok(promo.open, 'promo 6+1 open');
r = await call('POST', `/residents/${daffa.id}/apply-promo`, { promoId: promo.id }, A);
ok(r.status === 200 && r.data.amount === 1300000 * 6, `promo invoice = 6 × rent (${r.data?.amount})`, JSON.stringify(r.data));
const daffaInv = (await call('GET', `/residents/${daffa.id}`, null, A)).data.invoices;
const promoInv = daffaInv.find((i) => i.promoId);
ok(promoInv && promoInv.periodStart === '2026-10-01' && promoInv.periodEnd === '2027-04-30', `promo covers 7 periods (${promoInv?.periodStart}..${promoInv?.periodEnd})`);
ok(!daffaInv.some((i) => i.kind === 'sewa' && i.status === 'unpaid' && i.periodStart === '2026-10-01' && !i.promoId), 'regular Oct invoice voided/replaced');
await call('PUT', `/promos/${promo.id}`, { ...promo, active: false }, P);
r = await call('POST', `/residents/${budi.id}/apply-promo`, { promoId: promo.id }, A);
ok(r.status === 400, 'inactive promo cannot be applied');

console.log('— Charges');
r = await call('POST', '/charges', { residentId: tes.id, kind: 'charge', name: 'Watt berlebih (heater)', amount: 75000, recurring: true, billDay: 25, startDate: '2026-09-25' }, A);
ok(r.status === 201, 'add recurring charge mid-way');
const tesInv = (await call('GET', `/residents/${tes.id}`, null, A)).data.invoices;
ok(tesInv.some((i) => i.kind === 'charge' && i.amount === 75000 && i.dueDate === '2026-09-25'), 'separate charge invoice on custom bill day');

console.log('— Payments (public flow)');
const openBudi = (await call('GET', `/public/bills?name=budi&room=103`)).data;
ok(openBudi.invoices.length >= 2, `public bills lists multiple open invoices (${openBudi.invoices?.length})`);
r = await call('GET', `/public/bills?name=xx&room=103`);
ok(r.status === 400, 'short name rejected');
r = await call('GET', `/public/bills?name=salah&room=103`);
ok(r.status === 404, 'wrong name rejected');
const pub = openBudi.invoices[0].publicId;
r = await call('GET', `/public/invoice/${pub}`);
ok(r.status === 200 && r.data.total === r.data.amount + r.data.uniqueCode, 'public invoice w/ unique code');
r = await call('POST', `/public/invoice/${pub}/confirm`, { method: 'QRIS', note: 'tf' });
ok(r.status === 200, 'tenant confirms payment');
const pending = (await call('GET', '/invoices?state=menunggu', null, A)).data;
ok(pending.length === 1, 'admin sees 1 pending');
r = await call('POST', `/invoices/${pending[0].id}/pay`, { method: 'QRIS' }, A);
ok(r.data.status === 'paid', 'admin verifies → paid');

console.log('— Exit form');
r = await call('POST', '/public/exit-requests', { name: 'siti', room: '105', exitDate: '2026-10-10', reason: 'Lulus', rating: 5 });
ok(r.status === 201, 'tenant submits exit request');
r = await call('POST', '/public/exit-requests', { name: 'siti', room: '105', exitDate: '2026-10-10' });
ok(r.status === 409, 'duplicate exit request blocked');
const ex = (await call('GET', '/exit-requests?status=pending', null, A)).data[0];
r = await call('POST', `/exit-requests/${ex.id}/approve`, {}, A);
ok(r.status === 200 && r.data.keluar === '2026-10-10', 'admin approves exit → checkout');
r = await call('GET', '/rooms', null, A);
ok(r.data.find((x) => x.number === '105').status === 'av', 'room 105 now empty (red)');
r = await call('GET', '/mantan', null, A);
ok(r.data.some((m) => m.name === 'Siti Rahayu'), 'Siti archived to mantan');

console.log('— Violations');
const cats = (await call('GET', '/violation-categories', null, A)).data;
r = await call('POST', '/violation-categories', { name: 'Parkir sembarangan', severity: 'ringan' }, A);
ok(r.status === 201, 'custom violation category added');
r = await call('POST', '/violations', { residentId: budi.id, categoryId: cats[0].id, description: 'uji' }, A);
ok(r.status === 201, 'violation with category');
r = await call('GET', '/violations', null, A);
ok(r.data[0].expiresOn && r.data[0].categoryName, `retention date shown (${r.data[0].expiresOn})`);

console.log('— Application with photos');
r = await call('POST', '/public/applications', { name: 'Calon', wa: '0812', wali: 'Ayah', waWali: '0813', emergency2Name: 'Kak', emergency2Wa: '0814', ktpPhoto: JPG, selfiePhoto: JPG, faceScore: 0.82, faceMatch: true, masuk: '2026-10-05', stayMonths: 12 });
ok(r.status === 201, 'application with KTP + selfie accepted', JSON.stringify(r.data));
r = await call('POST', '/public/applications', { name: 'TanpaSkor', wa: '0812', wali: 'A', waWali: '1', emergency2Name: 'B', emergency2Wa: '2', ktpPhoto: JPG, selfiePhoto: JPG, faceScore: null, faceMatch: null });
const tanpa = (await call('GET', '/applications?status=pending', null, A)).data.find((a) => a.name === 'TanpaSkor');
ok(tanpa && tanpa.faceScore === null && tanpa.faceMatch === null, 'unverified face stays null (not 0%)', JSON.stringify({ s: tanpa?.faceScore, m: tanpa?.faceMatch }));
r = await call('POST', '/public/applications', { name: 'NoPhoto', wa: '0812', wali: 'A', waWali: '1', emergency2Name: 'B', emergency2Wa: '2' });
ok(r.status === 400, 'application without photos rejected');
r = await call('POST', '/public/applications', { name: 'Bad', wa: '0812', wali: 'A', waWali: '1', emergency2Name: 'B', emergency2Wa: '2', ktpPhoto: 'data:image/jpeg;base64,SGVsbG8=', selfiePhoto: JPG });
ok(r.status === 400, 'non-image upload rejected by magic bytes');
const apps = (await call('GET', '/applications?status=pending', null, A)).data;
const calon = apps.find((a) => a.name === 'Calon');
ok(calon && calon.ktpPhoto && calon.faceMatch === true, 'photos + face result stored');
const f = await fetch(`${BASE}/files/${calon.ktpPhoto}`);
ok(f.status === 401, 'upload not public');
const f2 = await fetch(`${BASE}/files/${calon.ktpPhoto}?token=${A}`);
ok(f2.status === 200, 'upload served to staff via token');
const mayaNow = (await call('GET', `/residents/${maya.id}`, null, A)).data;
ok(mayaNow.stayMonths === 6 && mayaNow.stayStart === '2026-09-01' && mayaNow.stayEnd === '2027-03-01' && mayaNow.stayDaysLeft > 0,
  'penghuni lama → 6 bulan per siklus sejak masuk (Maya masuk 1 Mar: siklus 1 Sep 2026 – 1 Mar 2027, tidak lewat)', JSON.stringify({ m: mayaNow.stayMonths, s: mayaNow.stayStart, e: mayaNow.stayEnd }));
const fitri = (await call('GET', '/residents', null, A)).data.find((x) => x.name === 'Fitri Handayani');
ok(fitri.stayMonths === 6 && fitri.stayStart === '2026-07-01' && fitri.stayEnd === '2027-01-01', 'Fitri masuk 1 Jan → siklus 1 Jul 2026 – 1 Jan 2027 (tanggal selesai = tanggal masuk)', JSON.stringify({ s: fitri.stayStart, e: fitri.stayEnd }));
const budiNow = (await call('GET', `/residents/${budi.id}`, null, A)).data;
ok(budiNow.stayMonths === 12 && budiNow.stayStart === budiNow.masuk, 'rencana yang sudah diisi (Budi 12 bln) tidak diubah migrasi');
const gilang = (await call('GET', '/residents', null, A)).data.find((x) => x.name === 'Gilang Ramadhan');
ok(gilang.stayMonths === 1 && gilang.stayStart === gilang.masuk, 'rencana yang sudah diisi tetap dihitung dari tanggal masuk');
const noPlan = (await call('GET', '/residents', null, A)).data.filter((x) => !x.stayMonths).map((x) => x.name);
ok(noPlan.length === 1 && noPlan[0] === tes.name, 'semua penghuni lama punya rencana; penghuni baru (dibuat setelah migrasi) tidak ikut diubah', JSON.stringify(noPlan));
ok(calon.stayMonths === 12 && tanpa.stayMonths === null, 'rencana tinggal dari formulir tersimpan (12 bln; kosong = belum pasti)');
r = await call('POST', '/public/applications', { name: 'Aneh', wa: '0812', wali: 'A', waWali: '1', emergency2Name: 'B', emergency2Wa: '2', ktpPhoto: JPG, selfiePhoto: JPG, stayMonths: 999 });
ok((await call('GET', '/applications?status=pending', null, A)).data.find((a) => a.name === 'Aneh').stayMonths === null, 'rencana tinggal tidak wajar (999) → belum pasti');
r = await call('POST', `/applications/${calon.id}/approve`, { room: '107' }, A);
ok(r.status === 200 && r.data.resident.dueDay === 5, 'approve → resident with dueDay = tanggal masuk (5)');
ok(r.data.resident.stayMonths === 12 && r.data.resident.stayEnd === '2027-10-05', 'rencana tinggal ikut ke penghuni + tanggal selesai (5 Okt 2027)', JSON.stringify({ m: r.data.resident.stayMonths, e: r.data.resident.stayEnd }));
const calonRes = r.data.resident;
r = await call('PUT', `/residents/${calonRes.id}`, { stayMonths: 6 }, A);
ok(r.status === 200 && r.data.stayMonths === 6 && r.data.stayEnd === '2027-04-05' && typeof r.data.stayDaysLeft === 'number', 'ubah rencana tinggal → tanggal selesai & sisa hari dihitung ulang');
r = await call('PUT', `/residents/${calonRes.id}`, { stayMonths: null }, A);
ok(r.data.stayMonths === null && r.data.stayEnd === '' && r.data.stayFrom === '', 'rencana tinggal bisa dikosongkan (belum pasti)');
r = await call('PUT', `/residents/${maya.id}`, { stayMonths: 12 }, A);
ok(r.data.stayStart === '2026-09-01' && r.data.stayEnd === '2027-09-01', 'perpanjang penghuni lama → tetap dihitung dari awal siklusnya');
const aneh = (await call('GET', '/applications?status=pending', null, A)).data.find((a) => a.name === 'Aneh');
r = await call('POST', `/applications/${aneh.id}/approve`, { room: '112', stayMonths: 24 }, A);
ok(r.data.resident.stayMonths === 24, 'admin bisa menetapkan rencana tinggal saat verifikasi');

console.log('— Expenses, finance, calendar, integrations');
r = await call('POST', '/expenses', { description: 'Beli lampu', amount: 'Rp 85.000', cat: 'Perawatan', source: 'scan', merchant: 'Toko Listrik', receiptPhoto: JPG }, A);
ok(r.status === 201 && r.data.amount === 85000 && r.data.source === 'scan', 'scanned expense saved');
r = await call('GET', '/finance', null, A);
ok(r.data.income > 0 && r.data.expCats.length > 0, `finance computed (income ${r.data.income})`);
r = await call('GET', '/calendar?month=2026-10', null, A);
ok(r.status === 200 && r.data.invoices.length > 0 && r.data.gcal.configured === false, `billing calendar Oct (${r.data.invoices.length} tagihan)`);
r = await call('GET', '/gcal/auth-url', null, P);
ok(r.status === 503, 'gcal auth-url explains missing client id');
r = await call('POST', '/notifications/run', null, A);
ok(r.data.reminders.skipped === true, 'reminders skipped until gateway configured');
r = await call('POST', `/invoices/${pending[0].id}/send`, null, A);
ok(r.status === 200 && r.data.via === 'link', 'manual send falls back to wa.me link');

console.log('— Susunan kamar (jumlah, lantai, format nomor)');
{
  let x = await call('GET', '/rooms/layout', null, P);
  ok(x.status === 200 && x.data.total === 20 && x.data.floors === 2 && x.data.mode === 'urut' && x.data.start === 101 && x.data.matches, 'susunan saat ini terdeteksi (20 kamar, 2 lantai, urut dari 101)', JSON.stringify(x.data));
  ok((await call('GET', '/rooms/layout', null, A)).status === 403, 'susunan kamar khusus pemilik');
  const roomsNow = (await call('GET', '/rooms', null, P)).data;
  const occ = new Set(roomsNow.filter((r) => r.status === 'oc').map((r) => r.number));
  x = await call('POST', '/rooms/layout/preview', { total: 24, floors: 2, mode: 'urut', start: 101 }, P);
  ok(x.data.add.map((a) => a.number).join() === '121,122,123,124' && x.data.add.every((a) => a.floor === 2) && !x.data.remove.length && x.data.resultTotal === 24, 'pratinjau 24 kamar → tambah 121–124 di lantai 2');
  ok((await call('GET', '/rooms', null, P)).data.length === 20, 'pratinjau tidak mengubah data');
  x = await call('POST', '/rooms/layout/preview', { total: 18, floors: 2, mode: 'urut', start: 101 }, P);
  const extra = ['119', '120'];
  ok(JSON.stringify(x.data.remove) === JSON.stringify(extra.filter((n) => !occ.has(n))) && JSON.stringify(x.data.blocked) === JSON.stringify(extra.filter((n) => occ.has(n))),
    `kurangi ke 18 → hapus kamar kosong, kamar berpenghuni tidak dihapus (hapus ${x.data.remove.join(',') || '-'}, tertahan ${x.data.blocked.join(',') || '-'})`);
  x = await call('POST', '/rooms/layout/preview', { total: 20, floors: 2, mode: 'lantai', removeExtra: false }, P);
  ok(x.data.add[0].number === '101' ? false : x.data.add.some((a) => a.number === '201') && !x.data.remove.length && x.data.kept.length > 0, 'format per lantai (201…) + "jangan hapus kamar lain" → hanya menambah');
  for (const [body, msg] of [[{ total: 0, floors: 1 }, 'jumlah 0'], [{ total: 5, floors: 6 }, 'lantai > kamar'], [{ total: 5, floors: 1, prefix: 'TERLALU' }, 'prefiks panjang']]) {
    ok((await call('POST', '/rooms/layout/preview', body, P)).status === 400, `validasi: ${msg} ditolak`);
  }
  const prem = (await call('GET', '/room-types', null, P)).data.find((t) => t.name.includes('Premium'));
  x = await call('POST', '/rooms/layout/apply', { total: 22, floors: 2, mode: 'urut', start: 101, typeId: prem.id }, P);
  const after = (await call('GET', '/rooms', null, P)).data;
  ok(x.data.applied && after.length === 22 && after.find((r) => r.number === '122')?.typeId === prem.id, 'terapkan 22 kamar → 121 & 122 dibuat dengan tipe default Premium');
  ok((await call('GET', '/rooms/layout', null, P)).data.total === 22, 'susunan tersimpan');
}

console.log('— Upgrade / downgrade tipe kamar');
{
  const types = (await call('GET', '/room-types', null, P)).data;
  const std = types.find((t) => t.name === 'Standar'); const prem = types.find((t) => t.name.includes('Premium'));
  // Penghuni Standar (harga ikut tipe) yang punya invoice sewa mendatang berharga penuh.
  let target = null; let invs = [];
  for (const r of (await call('GET', '/residents', null, P)).data.filter((x) => x.roomType === 'Standar' && !x.rent)) {
    const list = (await call('GET', `/residents/${r.id}`, null, P)).data.invoices;
    if (list.some((i) => i.kind === 'sewa' && i.status === 'unpaid' && i.amount === std.price && !i.promoId && i.periodStart > process.env.APP_TODAY)) { target = r; invs = list; break; }
  }
  ok(Boolean(target), `ada penghuni dengan invoice mendatang untuk diuji (kamar ${target?.room})`);
  let x = await call('POST', '/rooms/change-type/preview', { numbers: [target.room], typeId: prem.id, effective: 'next', updateInvoices: true }, P);
  const it = x.data.items[0];
  ok(x.status === 200 && it.direction === 'upgrade' && it.from.price === std.price && it.to.price === prem.price && it.resident.name === target.name, `pratinjau upgrade kamar ${target.room}: Standar → Premium`);
  const upcoming = invs.filter((i) => i.kind === 'sewa' && i.status === 'unpaid' && i.amount === std.price && !i.promoId && i.periodStart > process.env.APP_TODAY);
  ok(upcoming.length > 0 && it.invoices.length === upcoming.length, `"mulai periode berikutnya" → ${upcoming.length} invoice mendatang ikut diperbarui`);
  const nowPrev = await call('POST', '/rooms/change-type/preview', { numbers: [target.room], typeId: prem.id, effective: 'now' }, P);
  ok(nowPrev.data.items[0].invoices.length >= it.invoices.length, '"mulai sekarang" juga mencakup periode berjalan yang belum dibayar');
  ok((await call('GET', '/rooms', null, P)).data.find((r) => r.number === target.room).typeId === std.id, 'pratinjau tidak mengubah tipe');
  ok((await call('POST', '/rooms/change-type', { numbers: [target.room], typeId: prem.id }, A)).status === 403, 'admin tidak bisa mengubah tipe');
  x = await call('POST', '/rooms/change-type', { numbers: [target.room], typeId: prem.id, effective: 'next', updateInvoices: true, note: 'Pasang AC' }, P);
  ok(x.data.applied && (await call('GET', '/rooms', null, P)).data.find((r) => r.number === target.room).typeId === prem.id, 'upgrade diterapkan');
  const after = (await call('GET', `/residents/${target.id}`, null, P)).data;
  ok(after.rentAmount === prem.price && upcoming.every((u) => after.invoices.find((i) => i.id === u.id).amount === prem.price), 'sewa & invoice mendatang ikut harga Premium');
  const pastUnpaid = invs.find((i) => i.kind === 'sewa' && i.status === 'unpaid' && i.periodStart <= process.env.APP_TODAY);
  ok(!pastUnpaid || after.invoices.find((i) => i.id === pastUnpaid.id).amount === pastUnpaid.amount, 'invoice periode lama tidak berubah');
  let hist = (await call('GET', `/rooms/${target.room}/history`, null, A)).data;
  ok(hist[0]?.direction === 'upgrade' && hist[0].fromName === 'Standar' && hist[0].note === 'Pasang AC' && hist[0].invoicesUpdated === upcoming.length && hist[0].residentName === target.name, 'riwayat perubahan tercatat');
  x = await call('POST', '/rooms/change-type', { numbers: [target.room], typeId: std.id, effective: 'next' }, P);
  ok(x.data.items[0].direction === 'downgrade' && (await call('GET', `/rooms/${target.room}/history`, null, A)).data.length === 2, 'downgrade kembali ke Standar tercatat');
  // Harga khusus penghuni tidak ikut berubah.
  const custom = (await call('GET', '/residents', null, P)).data.find((r) => r.roomType === 'Standar' && r.id !== target.id && r.room !== '115');
  await call('PUT', `/residents/${custom.id}`, { rent: 1000000 }, P);
  x = await call('POST', '/rooms/change-type/preview', { numbers: [custom.room], typeId: prem.id }, P);
  ok(x.data.customRent[0]?.rent === 1000000 && x.data.items[0].invoices.length === 0, 'penghuni harga khusus: diperingatkan & invoice tidak diubah');
  // Banyak kamar sekaligus.
  x = await call('POST', '/rooms/change-type', { numbers: ['121', '122', '104'], typeId: std.id }, P);
  const rs = (await call('GET', '/rooms', null, P)).data;
  ok(x.data.changed >= 2 && ['121', '122', '104'].every((n) => rs.find((r) => r.number === n).typeId === std.id), 'ubah tipe banyak kamar sekaligus');
  await call('PUT', '/rooms/121', { typeId: prem.id }, P);
  hist = (await call('GET', '/rooms/121/history', null, A)).data;
  ok(hist[0]?.toTypeId === prem.id, 'ubah tipe lewat detail kamar juga tercatat di riwayat');
  ok((await call('POST', '/rooms/change-type/preview', { numbers: ['999'], typeId: std.id }, P)).status === 404, 'kamar tak dikenal → 404');
}

console.log('— Pindah kamar');
{
  const TODAY = process.env.APP_TODAY;
  const plusDays = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const types = (await call('GET', '/room-types', null, P)).data;
  const std = types.find((t) => t.name === 'Standar'); const prem = types.find((t) => t.name.includes('Premium'));
  const freeRooms = async () => (await call('GET', '/rooms', null, P)).data.filter((r) => r.status === 'av' && !r.reserved);
  // Penghuni Standar harga normal dengan invoice sewa mendatang (untuk cek penyesuaian invoice).
  let mover = null;
  for (const r of (await call('GET', '/residents', null, P)).data.filter((x) => x.roomType === 'Standar' && !x.rent)) {
    const inv = (await call('GET', `/residents/${r.id}`, null, P)).data.invoices;
    if (inv.some((i) => i.kind === 'sewa' && i.status === 'unpaid' && i.amount === std.price && !i.promoId && i.periodStart > TODAY)) { mover = r; break; }
  }
  const first = mover.name.split(' ')[0].toLowerCase();

  let x = await call('GET', `/public/transfer?name=${first}&room=${mover.room}`);
  ok(x.status === 200 && x.data.room === mover.room && x.data.rooms.length > 0 && x.data.rooms.every((r) => typeof r.diff === 'number'), 'publik: cek identitas → daftar kamar kosong + selisih harga');
  ok((await call('GET', `/public/transfer?name=salah&room=${mover.room}`)).status === 404, 'publik: nama tidak cocok → 404');
  const premRoom = (await freeRooms()).find((r) => r.typeId === prem.id);
  ok(Boolean(premRoom), `ada kamar Premium kosong untuk tujuan (${premRoom?.number})`);
  const occupiedRoom = (await call('GET', '/rooms', null, P)).data.find((r) => r.status === 'oc' && r.number !== mover.room).number;
  for (const [body, msg] of [
    [{ toRoom: premRoom.number, moveDate: plusDays(-1) }, 'tanggal lampau'],
    [{ toRoom: mover.room, moveDate: TODAY }, 'kamar tujuan = kamar sekarang'],
    [{ toRoom: occupiedRoom, moveDate: TODAY }, 'kamar tujuan terisi'],
    [{ moveDate: TODAY }, 'tanpa kamar/tipe tujuan'],
  ]) ok([400, 409].includes((await call('POST', '/public/transfer', { name: first, room: mover.room, ...body })).status), `publik: ${msg} ditolak`);
  x = await call('POST', '/public/transfer', { name: first, room: mover.room, toRoom: premRoom.number, moveDate: TODAY, reason: 'Ingin AC' });
  ok(x.status === 201 && x.data.toRoom === premRoom.number, 'publik: pengajuan pindah terkirim');
  ok((await call('POST', '/public/transfer', { name: first, room: mover.room, toRoom: premRoom.number, moveDate: TODAY })).status === 409, 'pengajuan ganda ditolak');
  ok((await call('GET', '/dashboard', null, A)).data.stats.pendingTransfers >= 1, 'dashboard menghitung pengajuan pindah');
  const t = (await call('GET', '/transfers?status=pending', null, A)).data.find((r) => r.residentId === mover.id);
  ok(t && t.stillActive && t.fromPrice === std.price && t.toPrice === prem.price, 'admin melihat pengajuan (harga lama & baru)');
  x = await call('POST', `/transfers/${t.id}/preview`, {}, A);
  ok(x.status === 200 && x.data.immediate && x.data.oldPrice === std.price && x.data.newPrice === prem.price && x.data.futureInvoices.length > 0, 'pratinjau: langsung, harga baru, invoice mendatang disesuaikan');
  const prorata = x.data.prorata;
  const before = (await call('GET', `/residents/${mover.id}`, null, A)).data;
  const futureIds = x.data.futureInvoices.map((i) => i.id);
  x = await call('POST', `/transfers/${t.id}/approve`, {}, A);
  ok(x.status === 200 && x.data.status === 'done', 'setujui (tanggal hari ini) → langsung dieksekusi');
  const after = (await call('GET', `/residents/${mover.id}`, null, A)).data;
  const roomsNow = (await call('GET', '/rooms', null, A)).data;
  ok(after.room === premRoom.number && after.rentAmount === prem.price, `penghuni kini di kamar ${premRoom.number} dengan sewa Premium`);
  ok(roomsNow.find((r) => r.number === before.room).status === 'av' && roomsNow.find((r) => r.number === premRoom.number).status === 'oc', 'kamar lama jadi kosong, kamar baru terisi');
  ok(futureIds.every((id) => { const i = after.invoices.find((v) => v.id === id); return i.amount === prem.price && i.room === premRoom.number; }), 'invoice sewa mendatang ikut kamar & harga baru');
  const charge = after.invoices.find((i) => i.kind === 'charge' && /Selisih pindah kamar/.test(i.description));
  ok(!prorata || prorata.diff <= 0 || (charge && charge.amount === prorata.diff), `selisih periode berjalan ditagih pro-rata (${prorata ? `${prorata.days}/${prorata.periodDays} hari = ${prorata.diff}` : 'tidak ada'})`);
  ok(before.invoices.filter((i) => i.periodStart < TODAY && i.kind === 'sewa').every((i) => after.invoices.find((v) => v.id === i.id).room === before.room), 'invoice periode lama tetap kamar lama');

  // Dijadwalkan (tanggal mendatang) → kamar dipesan.
  const mover2 = (await call('GET', '/residents', null, P)).data.find((r) => r.id !== mover.id && r.roomType === 'Standar' && !r.rent);
  const target2 = (await freeRooms()).find((r) => r.number !== before.room);
  x = await call('POST', `/residents/${mover2.id}/transfer`, { toRoom: target2.number, moveDate: plusDays(10), note: 'Renovasi' }, P);
  ok(x.status === 200 && x.data.status === 'approved' && x.data.scheduled && x.data.source === 'admin', 'admin pindahkan langsung (tanggal mendatang) → dijadwalkan');
  const reservedRoom = (await call('GET', '/rooms', null, A)).data.find((r) => r.number === target2.number);
  ok(reservedRoom.status === 'av' && reservedRoom.reserved?.name === mover2.name, 'kamar tujuan ditandai "dipesan"');
  ok((await call('POST', '/residents', { name: 'Penyerobot', room: target2.number, masuk: TODAY, wa: '0812' }, A)).status === 409, 'kamar dipesan tidak bisa diisi penghuni baru');
  ok(!(await call('GET', `/public/transfer?name=${first}&room=${premRoom.number}`)).data.rooms.some((r) => r.number === target2.number), 'kamar dipesan tidak muncul untuk penghuni lain');
  ok((await call('DELETE', `/rooms/${target2.number}`, null, P)).status === 409, 'kamar dipesan tidak bisa dihapus');
  ok((await call('POST', `/residents/${mover.id}/transfer`, { toRoom: target2.number, moveDate: TODAY }, P)).status === 409, 'penghuni lain tidak bisa pindah ke kamar yang dipesan');
  const sched = (await call('GET', '/transfers?status=approved', null, A)).data.find((r) => r.residentId === mover2.id);
  x = await call('POST', `/transfers/${sched.id}/reject`, { reason: 'Batal' }, A);
  ok(x.data.status === 'cancelled' && !(await call('GET', '/rooms', null, A)).data.find((r) => r.number === target2.number).reserved, 'batalkan jadwal → kamar dilepas');
  ok((await call('GET', `/residents/${mover2.id}`, null, A)).data.room === mover2.room, 'penghuni tetap di kamar lama setelah dibatalkan');

  // Pengajuan berdasarkan tipe saja → admin memilih kamar.
  const m2first = mover2.name.split(' ')[0].toLowerCase();
  x = await call('POST', '/public/transfer', { name: m2first, room: mover2.room, toTypeId: std.id, moveDate: TODAY });
  const t3 = (await call('GET', '/transfers?status=pending', null, A)).data.find((r) => r.residentId === mover2.id);
  ok(x.status === 201 && t3 && !t3.toRoom && t3.toTypeName === 'Standar', 'pengajuan hanya tipe (tanpa nomor kamar)');
  ok((await call('POST', `/transfers/${t3.id}/approve`, {}, A)).status === 400, 'setujui tanpa memilih kamar ditolak');
  const stdRoom = (await freeRooms()).find((r) => r.typeId === std.id);
  x = await call('POST', `/transfers/${t3.id}/approve`, { toRoom: stdRoom.number, keepCustomRent: false }, A);
  ok(x.data.status === 'done' && (await call('GET', `/residents/${mover2.id}`, null, A)).data.room === stdRoom.number, `admin memilih kamar ${stdRoom.number} → selesai (harga tetap Standar)`);
  ok(!x.data.result.prorata, 'pindah ke tipe setara → tanpa selisih pro-rata');
  const hist = (await call('GET', '/transfers', null, A)).data;
  ok(hist.filter((r) => r.status === 'done').length >= 2, 'riwayat pindah kamar tersimpan');
  const h1 = hist.find((r) => r.id === t.id);
  ok(h1.fromPrice === std.price && h1.toPrice === prem.price && h1.fromTypeName === 'Standar' && h1.toTypeNameNow.includes('Premium'), 'riwayat memakai harga & tipe saat pindah (bukan kondisi sekarang)', JSON.stringify(h1));
}

console.log('— Foto pengesahan kamar');
{
  const TODAY = process.env.APP_TODAY;
  const appBody = (name) => ({ name, wa: '081299990000', wali: 'Ibu', waWali: '081200000001', emergency2Name: 'Kakak', emergency2Wa: '081200000002', ktpPhoto: JPG, selfiePhoto: JPG });
  await call('POST', '/public/applications', appBody('Dina Pengesahan'));
  await call('POST', '/public/applications', appBody('Eko Fotogagal'));
  await call('POST', '/public/applications', appBody('Fajar Kebanyakan'));
  const pend = (await call('GET', '/applications?status=pending', null, A)).data;
  const freeRooms = async () => (await call('GET', '/rooms', null, A)).data.filter((x) => x.status === 'av' && !x.reserved);
  const dina = pend.find((a) => a.name === 'Dina Pengesahan');
  const fajar = pend.find((a) => a.name === 'Fajar Kebanyakan');
  let x = await call('POST', `/applications/${fajar.id}/approve`, { room: (await freeRooms())[0].number, handoverPhotos: Array.from({ length: 13 }, () => ({ data: JPG })) }, A);
  ok(x.status === 400 && (await call('GET', '/applications?status=pending', null, A)).data.some((a) => a.id === fajar.id), 'lebih dari 12 foto → ditolak, pendaftaran tetap menunggu');
  const roomD = (await freeRooms())[0].number;
  x = await call('POST', `/applications/${dina.id}/approve`, { room: roomD, handoverPhotos: [{ data: JPG, caption: 'Kasur' }, { data: JPG, caption: 'Lemari' }] }, A);
  ok(x.status === 200 && x.data.photos === 2 && !x.data.photoError, 'ACC pendaftar + 2 foto pengesahan');
  const dinaId = x.data.resident.id;
  let det = (await call('GET', `/residents/${dinaId}`, null, A)).data;
  ok(det.handoverPhotos.length === 2 && det.handoverPhotos[0].caption === 'Kasur' && det.handoverPhotos[0].room === roomD && det.handoverPhotos[0].takenAt === TODAY && det.handoverPhotos[0].createdBy,
    'foto tampil di profil penghuni (keterangan, kamar, tanggal, pencatat)', JSON.stringify(det.handoverPhotos[0]));
  const file = det.handoverPhotos[0].file;
  ok((await fetch(`${BASE}/files/${file}`)).status === 401 && (await fetch(`${BASE}/files/${file}?token=${A}`)).status === 200, 'foto hanya untuk staf');
  const eko = pend.find((a) => a.name === 'Eko Fotogagal');
  x = await call('POST', `/applications/${eko.id}/approve`, { room: (await freeRooms())[0].number, handoverPhotos: [{ data: 'data:image/jpeg;base64,SGVsbG8=' }] }, A);
  ok(x.status === 200 && x.data.resident && x.data.photos === 0 && x.data.photoError, 'foto tidak valid → pendaftar tetap di-ACC, ada pesan foto gagal');
  ok((await call('POST', `/residents/${dinaId}/handover-photos`, { photos: [] }, A)).status === 400, 'tambah foto tanpa foto → ditolak');
  ok((await call('POST', `/residents/${dinaId}/handover-photos`, { photos: [{ data: 'data:image/png;base64,AAAA' }] }, A)).status === 400, 'file bukan gambar → ditolak');
  x = await call('POST', `/residents/${dinaId}/handover-photos`, { photos: [{ data: JPG, caption: 'Kamar mandi' }] }, A);
  ok(x.status === 201 && x.data.length === 3, 'admin menambah foto susulan');
  ok((await call('POST', `/residents/${dinaId}/handover-photos`, { photos: Array.from({ length: 10 }, () => ({ data: JPG })) }, A)).status === 400, 'batas 12 foto per penghuni');
  const one = x.data[2];
  ok((await call('DELETE', `/handover-photos/${one.id}`, null, A)).status === 403, 'admin tidak bisa menghapus foto pengesahan');
  ok((await call('DELETE', `/handover-photos/${one.id}`, null, P)).status === 200 && (await fetch(`${BASE}/files/${one.file}?token=${P}`)).status === 404, 'pemilik menghapus foto (file ikut terhapus)');
  ok((await call('GET', `/residents/${dinaId}/handover-photos`, null, A)).data.length === 2, 'daftar foto pengesahan per penghuni');
}

console.log('— Log perbaikan kamar');
{
  const TODAY = process.env.APP_TODAY;
  let rooms = (await call('GET', '/rooms', null, A)).data;
  const migrated = (await call('GET', '/repairs?room=116', null, A)).data;
  ok(migrated.length === 1 && migrated[0].title === 'Perbaikan plafon bocor' && migrated[0].status === 'dikerjakan' && migrated[0].blockRoom, 'catatan perbaikan lama (kamar 116) dipindah ke log');
  const empty = rooms.find((x) => x.status === 'av' && !x.reserved);
  const occ = rooms.find((x) => x.status === 'oc');
  ok((await call('POST', '/repairs', { room: empty.number }, A)).status === 400, 'tanpa masalah → ditolak');
  ok((await call('POST', '/repairs', { room: 'ZZZ', title: 'x' }, A)).status === 404, 'kamar tidak ada → 404');
  ok((await call('POST', '/repairs', { room: empty.number, title: 'x', date: TODAY, status: 'selesai', doneDate: '2020-01-01' }, A)).status === 400, 'tanggal selesai sebelum lapor → ditolak');
  let x = await call('POST', '/repairs', { room: empty.number, title: 'AC tidak dingin', category: 'AC / Kipas', cost: '250.000', vendor: 'Pak Slamet', blockRoom: true, recordExpense: true, photosBefore: [JPG, JPG] }, A);
  ok(x.status === 201 && x.data.status === 'dilaporkan' && x.data.cost === 250000 && x.data.photosBefore.length === 2 && x.data.expenseId && x.data.createdBy, 'perbaikan dicatat (biaya, vendor, 2 foto sebelum)');
  const rep1 = x.data;
  let room = (await call('GET', '/rooms', null, A)).data.find((r) => r.number === empty.number);
  ok(room.status === 'mn', 'kamar otomatis berstatus Perbaikan');
  let exp = (await call('GET', '/expenses', null, A)).data.find((e) => e.id === rep1.expenseId);
  ok(exp && exp.cat === 'Perawatan' && exp.amount === 250000 && exp.source === 'perbaikan' && exp.description.includes(empty.number) && exp.merchant === 'Pak Slamet', 'biaya tercatat di Pengeluaran (Perawatan)');
  x = await call('POST', '/repairs', { room: empty.number, title: 'Cat dinding', blockRoom: true }, A);
  const rep2 = x.data;
  x = await call('PUT', `/repairs/${rep1.id}`, { status: 'selesai', cost: 300000, addPhotosAfter: [JPG], removePhotos: [rep1.photosBefore[0]] }, A);
  ok(x.status === 200 && x.data.status === 'selesai' && x.data.doneDate === TODAY && x.data.photosAfter.length === 1 && x.data.photosBefore.length === 1, 'tandai selesai + foto sesudah, hapus 1 foto sebelum');
  ok((await fetch(`${BASE}/files/${rep1.photosBefore[0]}?token=${A}`)).status === 404, 'foto yang dihapus ikut terhapus dari disk');
  exp = (await call('GET', '/expenses', null, A)).data.find((e) => e.id === rep1.expenseId);
  ok(exp.amount === 300000, 'perubahan biaya ikut memperbarui pengeluaran');
  room = (await call('GET', '/rooms', null, A)).data.find((r) => r.number === empty.number);
  ok(room.status === 'mn', 'masih ada perbaikan lain yang memblokir → kamar tetap Perbaikan');
  await call('PUT', `/repairs/${rep2.id}`, { status: 'selesai' }, A);
  room = (await call('GET', '/rooms', null, A)).data.find((r) => r.number === empty.number);
  ok(room.status === 'av', 'semua perbaikan selesai → kamar kembali Kosong');
  x = await call('POST', '/repairs', { room: occ.number, title: 'Keran bocor', category: 'Air & Pipa', blockRoom: false, cost: 50000, recordExpense: false }, A);
  room = (await call('GET', '/rooms', null, A)).data.find((r) => r.number === occ.number);
  ok(x.data.residentName === occ.resident.name && !x.data.expenseId && room.status === 'oc', 'kamar berpenghuni: penghuni tercatat, status tetap Terisi, biaya tidak dicatat');
  const rep3 = x.data;
  x = await call('PUT', `/repairs/${rep3.id}`, { recordExpense: true }, A);
  ok(x.data.expenseId, 'mengaktifkan "catat ke pengeluaran" belakangan');
  const exp3 = x.data.expenseId;
  x = await call('PUT', `/repairs/${rep3.id}`, { recordExpense: false }, A);
  ok(!x.data.expenseId && !(await call('GET', '/expenses', null, A)).data.some((e) => e.id === exp3), 'menonaktifkan → pengeluaran dihapus');
  const open = (await call('GET', '/repairs?status=open', null, A)).data;
  const done = (await call('GET', '/repairs?status=done', null, A)).data;
  ok(open.every((r) => r.status !== 'selesai') && open.some((r) => r.id === rep3.id) && done.some((r) => r.id === rep1.id) && !open.some((r) => r.id === rep1.id), 'filter belum selesai / selesai');
  const sum = (await call('GET', '/repairs/summary', null, A)).data;
  ok(sum.open === open.length && sum.yearCost >= 350000 && sum.categories.includes('Listrik'), 'ringkasan: belum selesai & biaya tahun ini', JSON.stringify(sum));
  ok((await call('GET', `/repairs?room=${empty.number}`, null, A)).data.length === 2, 'riwayat per kamar');
  const ins = (await call('GET', '/ai/insights?scope=kamar', null, A)).data.insights;
  ok(ins.some((i) => /perbaikan belum selesai/.test(i.title) && /Keran bocor/.test(i.text)) && ins.some((i) => /sering diperbaiki/.test(i.title) && new RegExp(empty.number).test(i.text)), 'AI kamar: perbaikan berjalan & kamar sering diperbaiki');
  ok((await call('DELETE', `/repairs/${rep1.id}`, null, A)).status === 403, 'admin tidak bisa menghapus log');
  ok((await call('DELETE', `/repairs/${rep1.id}`, null, P)).status === 200 && !(await call('GET', '/expenses', null, A)).data.some((e) => e.id === rep1.expenseId), 'pemilik menghapus log (pengeluaran terkait ikut terhapus)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
