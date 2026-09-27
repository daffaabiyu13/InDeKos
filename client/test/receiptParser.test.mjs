// Unit tests for the receipt OCR text parser (no browser needed).
import { parseReceipt, parseAmount, parseDate } from '../src/receiptParser.js';

let pass = 0; let fail = 0;
const eq = (got, want, msg) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log('✗', msg, '→ got', got, 'want', want); }
};

eq(parseAmount('Rp 1.450.000'), 1450000, 'dots');
eq(parseAmount('1,450,000'), 1450000, 'commas');
eq(parseAmount('85.000,00'), 85000, 'IDR cents');
eq(parseAmount('1,450,000.00'), 1450000, 'US cents');
eq(parseDate('Tgl: 12/09/2026 14:02'), '2026-09-12', 'dd/mm/yyyy');
eq(parseDate('2026-09-05'), '2026-09-05', 'iso');
eq(parseDate('07-09-26'), '2026-09-07', 'dd-mm-yy');
eq(parseDate('Kamis, 3 Sep 2026'), '2026-09-03', 'named month');

eq(parseReceipt(`INDOMARET
Jl. Soekarno Hatta No 5 Malang
Telp 0341-123456
12.09.2026-14:22 2.1.45 K1/ANDI
SUNLIGHT 755ML      2   18.900   37.800
WIPOL KARBOL 800    1   21.500   21.500
KANTONG SAMPAH      1   12.000   12.000
SUBTOTAL                          71.300
TOTAL                             71.300
TUNAI                            100.000
KEMBALI                           28.700`), { amount: 71300, date: '2026-09-12', merchant: 'INDOMARET', cat: 'Kebersihan' }, 'minimarket receipt (ignores TUNAI/KEMBALI)');

eq(parseReceipt(`TB SUMBER MAKMUR
Jl. Veteran 21
Nota: 0087    Tgl 05/09/2026
Cat tembok 5kg        1   185.000
Kuas 3 inch           2    15.000
Grand Total
Rp 215.000
Bayar Tunai Rp 250.000`), { amount: 215000, date: '2026-09-05', merchant: 'TB SUMBER MAKMUR', cat: 'Perawatan' }, 'total on the next line');

const pln = parseReceipt(`PLN Pascabayar
IDPEL 5123456789
Tagihan : Rp1.450.000
Admin   : Rp2.500
Total Bayar : Rp1.452.500`);
eq(pln.amount, 1452500, 'PLN total bayar');
eq(pln.cat, 'Utilitas', 'PLN category');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
