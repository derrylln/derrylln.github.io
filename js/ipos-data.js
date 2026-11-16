/* ------------------------------------------------------------
   The IPO pipeline shown on the Markets page
   ------------------------------------------------------------
   Hand-curated, because no free feed hands over what this page
   promises: the price range, what the filing itself reports, and
   the gap between them. Free calendars give a date, a range and a
   deal size and nothing else; the financials only exist inside the
   prospectus.

   RULES FOR ADDING A DEAL
   1. Public filing (S-1 / F-1) or a priced deal only. Rumour-stage
      names are not listed here: there is nothing to check.
   2. Every number needs a `sources` entry, and `asOf` says when it
      was checked. A figure that is a week old should look a week old.
   3. `unknown` is not optional. An entry that cannot say what is
      still unsettled is advertising, not research.
   4. Prose is written twice, `en` and `id`, like the rest of the site.
   ------------------------------------------------------------ */

const IPO_DEALS = [
  {
    id: 'ant',
    ticker: 'ANT',
    name: 'Anthropic, PBC',
    exchange: 'Nasdaq Global Select',
    sector: { en: 'AI software', id: 'Perangkat lunak AI' },
    status: 'pricing',
    date: '2026-11-19',
    asOf: '2026-11-13',
    summary: {
      en: 'Filed a public S-1 on 26 October 2026 and set terms on 10 November: $70–78 for 825m Class A shares. The biggest US listing of the year and the first real test of what public investors will pay for a frontier AI lab.',
      id: 'Mendaftar S-1 publik pada 26 Oktober 2026 dan menetapkan ketentuan pada 10 November: $70–78 untuk 825 juta saham Kelas A. Pencatatan terbesar di AS tahun ini dan ujian pertama berapa yang mau dibayar investor publik untuk laboratorium AI terdepan.',
    },
    terms: {
      range: '$70.00 – $78.00',
      shares: { en: '825,000,000 Class A shares', id: '825.000.000 saham Kelas A' },
      dealSize: '$64.35B at the top of the range, about $61.05B at the $74 midpoint',
      expected: {
        en: 'Pricing on or about 18 November 2026; first trade expected 19 November',
        id: 'Penetapan harga sekitar 18 November 2026; perdagangan pertama diperkirakan 19 November',
      },
    },
    valuation: [
      {
        label: { en: 'Market cap, shares outstanding', id: 'Kapitalisasi, saham beredar' },
        value: '~$968B',
        note: {
          en: 'At the $74 midpoint against the cover-page share count. Reuters uses this basis and gets about $1.02tn at the top of the range.',
          id: 'Pada titik tengah $74 dengan jumlah saham di halaman sampul. Reuters memakai dasar ini dan menghasilkan sekitar $1,02 triliun di batas atas.',
        },
      },
      {
        label: { en: 'Fully diluted', id: 'Setelah dilusi penuh' },
        value: '~$1.3–1.4T',
        note: {
          en: 'WSJ and AP put it near $1.3tn, CNBC and TechCrunch near $1.4tn, because they count different securities. The filing states no valuation of its own.',
          id: 'WSJ dan AP menyebut sekitar $1,3 triliun, CNBC dan TechCrunch sekitar $1,4 triliun, karena menghitung surat berharga yang berbeda. Berkasnya sendiri tidak menyebut valuasi.',
        },
      },
      {
        label: { en: 'Price ÷ October run-rate', id: 'Harga ÷ run-rate Oktober' },
        value: '~16–17×',
        note: {
          en: 'The range divided by the ~$81bn annualised revenue the amended filing reports for 31 October 2026.',
          id: 'Kisaran harga dibagi pendapatan tahunan ~$81 miliar yang dilaporkan berkas amandemen per 31 Oktober 2026.',
        },
      },
      {
        label: { en: 'Last private round', id: 'Putaran privat terakhir' },
        value: '$965B',
        note: {
          en: 'May 2026 funding round, for comparison with the public range.',
          id: 'Putaran pendanaan Mei 2026, sebagai pembanding kisaran publik.',
        },
      },
    ],
    financials: [
      {
        label: { en: 'Revenue, H1 2026', id: 'Pendapatan, semester I 2026' },
        value: '$16.3B',
        note: {
          en: 'Six months to 30 June 2026, against $1.2bn in the same half a year earlier.',
          id: 'Enam bulan sampai 30 Juni 2026, dibanding $1,2 miliar pada periode yang sama tahun sebelumnya.',
        },
      },
      {
        label: { en: 'Operating loss, H1 2026', id: 'Rugi operasi, semester I 2026' },
        value: '$693M',
        note: {
          en: 'Loss from operations — the running-the-business number, before the items below.',
          id: 'Rugi dari operasi — angka menjalankan bisnis, sebelum pos-pos di bawah.',
        },
      },
      {
        label: { en: 'Net loss, H1 2026', id: 'Rugi bersih, semester I 2026' },
        value: '$80.7B',
        note: {
          en: 'About $72.4bn of that is fair-value moves on convertible notes, derivatives and SAFEs: accounting, not cash leaving the company.',
          id: 'Sekitar $72,4 miliar di antaranya adalah perubahan nilai wajar surat utang konversi, derivatif dan SAFE: akuntansi, bukan kas yang keluar.',
        },
      },
      {
        label: { en: 'Run-rate revenue', id: 'Pendapatan run-rate' },
        value: '~$81B',
        note: {
          en: 'As of 31 October 2026, up about $10bn from 30 September. A company-defined annualisation of the latest month, not a forecast.',
          id: 'Per 31 Oktober 2026, naik sekitar $10 miliar dari 30 September. Annualisasi bulan terakhir menurut definisi perusahaan, bukan proyeksi.',
        },
      },
      {
        label: { en: 'Commitments', id: 'Komitmen' },
        value: '~$900.9B',
        note: {
          en: 'Substantially compute and infrastructure. About $451.6bn falls due before 31 December 2030 and about $70.7bn within the 12 months after 30 September 2026.',
          id: 'Sebagian besar komputasi dan infrastruktur. Sekitar $451,6 miliar jatuh tempo sebelum 31 Desember 2030 dan sekitar $70,7 miliar dalam 12 bulan setelah 30 September 2026.',
        },
      },
    ],
    bull: [
      {
        en: 'Revenue went from $1.2bn to $16.3bn in a year while the operating loss stayed under $1bn.',
        id: 'Pendapatan naik dari $1,2 miliar ke $16,3 miliar dalam setahun sementara rugi operasi tetap di bawah $1 miliar.',
      },
      {
        en: 'The $80.7bn net loss is mostly non-cash fair-value accounting on convertible instruments, not money leaving the business.',
        id: 'Rugi bersih $80,7 miliar sebagian besar adalah akuntansi nilai wajar non-kas pada instrumen konversi, bukan uang yang keluar dari bisnis.',
      },
      {
        en: 'Run-rate revenue rose about $10bn in a single month — that growth is what the 16–17× multiple is being asked to justify.',
        id: 'Pendapatan run-rate naik sekitar $10 miliar dalam satu bulan — pertumbuhan itulah yang harus dibenarkan oleh kelipatan 16–17×.',
      },
    ],
    bear: [
      {
        en: '~$900bn of signed compute and infrastructure commitments against ~$81bn of annualised revenue is the central risk: the obligations are contracted, the revenue is not.',
        id: 'Komitmen komputasi dan infrastruktur ~$900 miliar yang sudah ditandatangani berbanding pendapatan tahunan ~$81 miliar adalah risiko utamanya: kewajibannya sudah dikontrak, pendapatannya belum.',
      },
      {
        en: 'About $70.7bn of those commitments fall due within a year of 30 September 2026.',
        id: 'Sekitar $70,7 miliar dari komitmen itu jatuh tempo dalam setahun setelah 30 September 2026.',
      },
      {
        en: 'The three published valuations differ by hundreds of billions because each counts a different share base, so "the" valuation is a choice, not a fact.',
        id: 'Tiga valuasi yang beredar berbeda ratusan miliar karena masing-masing menghitung dasar saham berbeda, jadi "valuasi" itu pilihan, bukan fakta.',
      },
      {
        en: 'Bankers reportedly expect to price above the range, so $78 may not be the price you get.',
        id: 'Menurut laporan, para penjamin memperkirakan harga di atas kisaran, jadi $78 mungkin bukan harga yang Anda dapat.',
      },
    ],
    unknown: [
      {
        en: 'Final offer price: pricing is expected on or about 18 November 2026 and can move above $78.',
        id: 'Harga penawaran final: penetapan diperkirakan sekitar 18 November 2026 dan bisa bergerak di atas $78.',
      },
      {
        en: 'First trading day: 19 November is expected, not confirmed by Nasdaq.',
        id: 'Hari perdagangan pertama: 19 November baru perkiraan, belum dikonfirmasi Nasdaq.',
      },
      {
        en: 'Lock-up length and the shares it covers sit in the prospectus and are not summarised on this card.',
        id: 'Lama lock-up dan saham yang tercakup ada di prospektus dan tidak diringkas di kartu ini.',
      },
      {
        en: 'Which diluted share count the market settles on — the published figures span about $100bn.',
        id: 'Dasar saham terdilusi mana yang dipakai pasar — angka yang beredar berselisih sekitar $100 miliar.',
      },
    ],
    sources: [
      { label: 'SEC Form S-1 (26 Oct 2026)', url: 'https://www.sec.gov/Archives/edgar/data/2130357/000162828026067168/anthropicpbc-sx1.htm' },
      { label: 'FT, 10 Nov 2026 — valuation target', url: 'https://www.ft.com/content/5654e210-4be3-4550-b975-129c9a2e7fe5' },
      { label: 'CNBC, 10 Nov 2026 — run-rate revenue', url: 'https://www.cnbc.com/2026/11/10/anthropic-ipo-revenue-growth-cramer.html' },
      { label: 'tastytrade — filing and timeline', url: 'https://tastytrade.com/learn/markets/industry/anthropic-ipo/' },
      { label: 'StockAnalysis — IPO calendar', url: 'https://stockanalysis.com/ipos/calendar' },
    ],
  },
  {
    id: 'rzra',
    ticker: 'RZRA',
    name: 'Rezera Inc.',
    exchange: 'Nasdaq',
    sector: null,
    status: 'registration',
    date: null,
    asOf: '2026-11-13',
    summary: {
      en: 'Amended S-1 dated 9 November 2026 sets 16,666,667 shares at $11–13. No pricing date has been set, so there is no market valuation yet.',
      id: 'S-1 amandemen tertanggal 9 November 2026 menetapkan 16.666.667 saham pada $11–13. Tanggal penetapan harga belum ada, jadi belum ada valuasi pasar.',
    },
    terms: {
      range: '$11.00 – $13.00',
      shares: { en: '16,666,667 shares', id: '16.666.667 saham' },
      dealSize: '~$200M at the $12 midpoint',
      expected: { en: 'No pricing date set', id: 'Tanggal penetapan belum ada' },
    },
    valuation: [],
    financials: [],
    bull: [],
    bear: [],
    unknown: [
      {
        en: 'Everything below the cover page: this card tracks the filing, and its financials have not been summarised here yet.',
        id: 'Semua isi di balik halaman sampul: kartu ini hanya melacak berkasnya, dan laporan keuangannya belum diringkas di sini.',
      },
    ],
    sources: [{ label: 'Breakaway IPO calendar, 9 Nov 2026 amendment', url: 'https://getbreakaway.com/ipo' }],
  },
  {
    id: 'clouddepots',
    ticker: null,
    name: 'CloudDepots',
    exchange: '—',
    sector: null,
    status: 'registration',
    date: null,
    asOf: '2026-11-13',
    summary: {
      en: 'Form S-1 filed 13 November 2026 for 3,000,000 shares at $5–6. An early-stage filing: no ticker, no exchange, no date.',
      id: 'Formulir S-1 diajukan 13 November 2026 untuk 3.000.000 saham pada $5–6. Pendaftaran tahap awal: belum ada ticker, bursa, maupun tanggal.',
    },
    terms: {
      range: '$5.00 – $6.00',
      shares: { en: '3,000,000 shares', id: '3.000.000 saham' },
      dealSize: '~$16.5M at the $5.50 midpoint',
      expected: { en: 'No pricing date set', id: 'Tanggal penetapan belum ada' },
    },
    valuation: [],
    financials: [],
    bull: [],
    bear: [],
    unknown: [
      {
        en: 'Exchange and ticker are not assigned yet, and the financials are not summarised on this card.',
        id: 'Bursa dan ticker belum ditetapkan, dan laporan keuangannya belum diringkas di kartu ini.',
      },
    ],
    sources: [{ label: 'Breakaway IPO calendar, Form S-1 of 13 Nov 2026', url: 'https://getbreakaway.com/ipo' }],
  },
];
