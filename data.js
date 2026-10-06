/* ============================================================
   LEAN TRAINER — Data jadwal & pustaka gerakan
   Jadwal: Senin–Kamis, fokus tampilan lean/atletis
   ============================================================ */

const WEEK_DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis'];

/* Target volume mingguan (set) per bagian otot */
const MUSCLE_TARGETS = {
  'Dada': 13,
  'Lats': 9,
  'Mid-back': 6,
  'Side Delts': 8,
  'Rear Delts': 3,
  'Biceps': 12,
  'Triceps': 9
};

const MUSCLE_COLOR = {
  'Dada': '#ff7a45',
  'Lats': '#4da3ff',
  'Mid-back': '#7c8cff',
  'Side Delts': '#ffd24d',
  'Rear Delts': '#4de0c0',
  'Biceps': '#ff5d8f',
  'Triceps': '#b98cff'
};

/* Pustaka gerakan — bisa dipilih/diganti/ditambah dari dalam aplikasi */
const EXERCISE_LIB = [
  // ---------------- DADA ----------------
  { id: 'bench',       name: 'Barbell Bench Press',        muscle: 'Dada',       tag: 'mid',    type: 'compound', sets: 4, reps: [8, 12],  rest: 150 },
  { id: 'db_bench',    name: 'Dumbbell Bench Press',       muscle: 'Dada',       tag: 'mid',    type: 'compound', sets: 3, reps: [8, 12],  rest: 150 },
  { id: 'incline_db',  name: 'Incline Dumbbell Press',     muscle: 'Dada',       tag: 'upper',  type: 'compound', sets: 3, reps: [8, 12],  rest: 150 },
  { id: 'incline_bar', name: 'Incline Barbell Press',      muscle: 'Dada',       tag: 'upper',  type: 'compound', sets: 3, reps: [8, 12],  rest: 150 },
  { id: 'cable_fly',   name: 'Cable Fly (mid)',            muscle: 'Dada',       tag: 'mid',    type: 'isolasi',  sets: 3, reps: [12, 15], rest: 75 },
  { id: 'pec_deck',    name: 'Pec Deck / Machine Fly',     muscle: 'Dada',       tag: 'mid',    type: 'isolasi',  sets: 3, reps: [12, 15], rest: 75 },
  { id: 'low_cable',   name: 'Low-to-High Cable Fly',      muscle: 'Dada',       tag: 'upper',  type: 'isolasi',  sets: 3, reps: [12, 15], rest: 75 },
  { id: 'dip_chest',   name: 'Chest Dip',                  muscle: 'Dada',       tag: 'lower',  type: 'compound', sets: 3, reps: [8, 12],  rest: 120 },
  { id: 'pushup',      name: 'Push-up',                    muscle: 'Dada',       tag: 'mid',    type: 'compound', sets: 3, reps: [12, 20], rest: 75 },

  // ---------------- LATS ----------------
  { id: 'pullup',      name: 'Pull-up (wide grip)',        muscle: 'Lats',       tag: 'lebar',  type: 'compound', sets: 3, reps: [6, 12],  rest: 150 },
  { id: 'latpulldown', name: 'Lat Pulldown (wide)',        muscle: 'Lats',       tag: 'lebar',  type: 'compound', sets: 3, reps: [8, 12],  rest: 120 },
  { id: 'pullover',    name: 'Straight-arm Pulldown',      muscle: 'Lats',       tag: 'lebar',  type: 'isolasi',  sets: 3, reps: [12, 15], rest: 75 },
  { id: 'db_pullover', name: 'Dumbbell Pullover',          muscle: 'Lats',       tag: 'lebar',  type: 'isolasi',  sets: 3, reps: [10, 15], rest: 90 },
  { id: 'mg_row',      name: 'Machine Row (close grip)',   muscle: 'Lats',       tag: 'tebal',  type: 'compound', sets: 3, reps: [8, 12],  rest: 120 },
  { id: 'db_row_1arm', name: 'One-arm Dumbbell Row',       muscle: 'Lats',       tag: 'tebal',  type: 'compound', sets: 3, reps: [8, 12],  rest: 120 },

  // ---------------- MID-BACK ----------------
  { id: 'cable_row',   name: 'Seated Cable Row',           muscle: 'Mid-back',   tag: '',       type: 'compound', sets: 3, reps: [8, 12],  rest: 120 },
  { id: 'chest_row',   name: 'Chest-supported Row',        muscle: 'Mid-back',   tag: '',       type: 'compound', sets: 3, reps: [8, 12],  rest: 120 },
  { id: 'face_pull',   name: 'Face Pull (rope)',           muscle: 'Mid-back',   tag: '',       type: 'isolasi',  sets: 3, reps: [12, 15], rest: 75 },
  { id: 'rev_fly_db',  name: 'Dumbbell Reverse Fly',       muscle: 'Mid-back',   tag: '',       type: 'isolasi',  sets: 3, reps: [12, 15], rest: 75 },

  // ---------------- SIDE DELTS ----------------
  { id: 'db_lat_raise',name: 'Dumbbell Lateral Raise',     muscle: 'Side Delts', tag: '',       type: 'isolasi',  sets: 4, reps: [12, 20], rest: 60 },
  { id: 'cable_lat',   name: 'Cable Lateral Raise',        muscle: 'Side Delts', tag: '',       type: 'isolasi',  sets: 3, reps: [12, 20], rest: 60 },
  { id: 'mach_lat',    name: 'Machine Lateral Raise',      muscle: 'Side Delts', tag: '',       type: 'isolasi',  sets: 3, reps: [12, 20], rest: 60 },
  { id: 'y_raise',     name: 'Leaning Cable Y-Raise',      muscle: 'Side Delts', tag: '',       type: 'isolasi',  sets: 3, reps: [12, 20], rest: 60 },

  // ---------------- REAR DELTS ----------------
  { id: 'rev_pec',     name: 'Reverse Pec Deck',           muscle: 'Rear Delts', tag: '',       type: 'isolasi',  sets: 3, reps: [12, 15], rest: 60 },
  { id: 'cable_rdl',   name: 'Cable Reverse Fly',          muscle: 'Rear Delts', tag: '',       type: 'isolasi',  sets: 3, reps: [12, 15], rest: 60 },
  { id: 'band_pull',   name: 'Band Pull-apart',            muscle: 'Rear Delts', tag: '',       type: 'isolasi',  sets: 3, reps: [15, 25], rest: 45 },

  // ---------------- BICEPS ----------------
  { id: 'db_curl',     name: 'Dumbbell Curl',              muscle: 'Biceps',     tag: '',       type: 'isolasi',  sets: 3, reps: [8, 12],  rest: 90 },
  { id: 'incline_curl',name: 'Incline Dumbbell Curl',      muscle: 'Biceps',     tag: '',       type: 'isolasi',  sets: 3, reps: [10, 12], rest: 90 },
  { id: 'preacher',    name: 'Preacher Curl',              muscle: 'Biceps',     tag: '',       type: 'isolasi',  sets: 3, reps: [10, 12], rest: 90 },
  { id: 'hammer',      name: 'Hammer Curl',                muscle: 'Biceps',     tag: '',       type: 'isolasi',  sets: 3, reps: [10, 15], rest: 75 },
  { id: 'barbell_curl',name: 'Barbell / EZ Curl',          muscle: 'Biceps',     tag: '',       type: 'isolasi',  sets: 3, reps: [8, 12],  rest: 90 },
  { id: 'cable_curl',  name: 'Cable Curl (rope)',          muscle: 'Biceps',     tag: '',       type: 'isolasi',  sets: 3, reps: [12, 15], rest: 75 },

  // ---------------- TRICEPS ----------------
  { id: 'rope_push',   name: 'Rope Pushdown',              muscle: 'Triceps',    tag: '',       type: 'isolasi',  sets: 3, reps: [10, 15], rest: 75 },
  { id: 'bar_push',    name: 'Straight-bar Pushdown',      muscle: 'Triceps',    tag: '',       type: 'isolasi',  sets: 3, reps: [10, 15], rest: 75 },
  { id: 'skullcrush',  name: 'Skullcrusher (EZ)',          muscle: 'Triceps',    tag: '',       type: 'compound', sets: 3, reps: [8, 12],  rest: 120 },
  { id: 'oh_ext_db',   name: 'Overhead Dumbbell Extension',muscle: 'Triceps',    tag: '',       type: 'isolasi',  sets: 3, reps: [10, 15], rest: 75 },
  { id: 'oh_cable',    name: 'Overhead Cable Extension',   muscle: 'Triceps',    tag: '',       type: 'isolasi',  sets: 3, reps: [12, 15], rest: 75 },
  { id: 'kickback',    name: 'Cable Kickback',             muscle: 'Triceps',    tag: '',       type: 'isolasi',  sets: 3, reps: [12, 15], rest: 60 }
];

/* ============================================================
   JADWAL DEFAULT (Senin–Kamis)
   blocks = bagian otot + target set/rep/rest
   picks  = gerakan default (id dari EXERCISE_LIB) — bisa diganti
   ============================================================ */
const DEFAULT_PLAN = [
  {
    id: 'senin', label: 'Senin', accent: '#4ade80', emoji: '🟢',
    title: 'Dada + Triceps + Side Delts',
    blocks: [
      { muscle: 'Dada',       targetSets: 4, reps: [8, 12],  rest: [120, 180], note: 'mid & upper — 1 compound mid, 1 upper', picks: ['bench', 'incline_db'] },
      { muscle: 'Dada',       targetSets: 3, reps: [12, 15], rest: [60, 90],   note: 'isolasi — squeeze & stretch',            picks: ['cable_fly'] },
      { muscle: 'Triceps',    targetSets: 6, reps: [10, 15], rest: [60, 90],   note: '2 gerakan @3 set',                       picks: ['rope_push', 'oh_ext_db'] },
      { muscle: 'Side Delts', targetSets: 3, reps: [12, 20], rest: [60, 60],   note: 'pump, kontrol, jangan ayun',             picks: ['db_lat_raise'] }
    ]
  },
  {
    id: 'selasa', label: 'Selasa', accent: '#60a5fa', emoji: '🔵',
    title: 'Lats + Mid-back + Biceps',
    blocks: [
      { muscle: 'Lats',     targetSets: 3, reps: [6, 12],  rest: [120, 150], note: 'vertical pull → lebar punggung', picks: ['pullup'] },
      { muscle: 'Lats',     targetSets: 3, reps: [8, 12],  rest: [120, 120], note: 'horizontal pull → tebal lats',   picks: ['db_row_1arm'] },
      { muscle: 'Mid-back', targetSets: 3, reps: [8, 12],  rest: [120, 120], note: 'detail, jangan berlebihan',      picks: ['chest_row'] },
      { muscle: 'Biceps',   targetSets: 6, reps: [8, 12],  rest: [90, 90],   note: '2 gerakan @3 set',               picks: ['db_curl', 'hammer'] }
    ]
  },
  {
    id: 'rabu', label: 'Rabu', accent: '#facc15', emoji: '🟡',
    title: 'Shoulder (Side & Rear) + Dada + Triceps',
    blocks: [
      { muscle: 'Side Delts', targetSets: 3, reps: [12, 20], rest: [60, 60], note: 'volume tinggi, beban ringan-sedang', picks: ['db_lat_raise'] },
      { muscle: 'Side Delts', targetSets: 2, reps: [12, 20], rest: [60, 60], note: 'variasi sudut (cable/machine)',      picks: ['cable_lat'] },
      { muscle: 'Rear Delts', targetSets: 3, reps: [12, 15], rest: [60, 60], note: 'bahu 3D, postur',                    picks: ['rev_pec'] },
      { muscle: 'Dada',       targetSets: 3, reps: [12, 15], rest: [60, 90], note: 'upper chest — isolasi/ringan',       picks: ['low_cable'] },
      { muscle: 'Triceps',    targetSets: 3, reps: [8, 12],  rest: [120, 120],note: '1 compound berat',                  picks: ['skullcrush'] }
    ]
  },
  {
    id: 'kamis', label: 'Kamis', accent: '#c084fc', emoji: '🟣',
    title: 'Lats + Mid-back + Biceps + Dada',
    blocks: [
      { muscle: 'Lats',     targetSets: 3, reps: [8, 12],  rest: [120, 120], note: 'vertical pull',                picks: ['latpulldown'] },
      { muscle: 'Mid-back', targetSets: 3, reps: [8, 12],  rest: [120, 120], note: 'row — jaga siku dekat badan',  picks: ['cable_row'] },
      { muscle: 'Biceps',   targetSets: 6, reps: [10, 12], rest: [90, 90],   note: '2 gerakan @3 set, fokus puncak', picks: ['incline_curl', 'cable_curl'] },
      { muscle: 'Dada',     targetSets: 3, reps: [8, 12],  rest: [120, 180], note: 'mid/lower — compound penutup', picks: ['db_bench'] }
    ]
  }
];

/* Aturan latihan (ditampilkan di dalam aplikasi) */
const RULES = [
  { icon: '🎚️', t: 'Rep', d: '8–12 untuk compound, 12–20 untuk isolasi.' },
  { icon: '🔥', t: 'Intensitas', d: 'Sisakan 1–3 rep sebelum failure (RIR 1–3). Set terakhir boleh sampai failure.' },
  { icon: '⏱️', t: 'Rest', d: '2–3 menit untuk compound, 60–90 detik untuk isolasi.' },
  { icon: '📈', t: 'Progressive overload', d: 'Naikkan beban atau rep tiap minggu. Kalau sudah tembus batas atas rep 2 minggu berturut-turut → tambah beban 2,5–5%.' },
  { icon: '🦵', t: 'Kaki', d: 'Tidak masuk jadwal ini. Kalau mau seimbang, tambah leg press / squat 2x seminggu di luar jadwal.' }
];

const NUTRITION = [
  { icon: '🥩', t: 'Protein', d: '100–130 g/hari' },
  { icon: '🔻', t: 'Kalori', d: 'Defisit 300–500 kkal/hari' },
  { icon: '💊', t: 'Kreatin', d: '5 g/hari' },
  { icon: '💧', t: 'Air', d: '3–4 liter/hari' },
  { icon: '😴', t: 'Tidur', d: '7–9 jam' }
];

const WHY = [
  { m: 'Lats', d: 'Punggung lebar, V-taper, pinggang terlihat kecil.' },
  { m: 'Mid-back', d: 'Detail punggung, tapi jangan berlebihan biar tidak tebal.' },
  { m: 'Dada', d: 'Dada bidang, postur lebih baik.' },
  { m: 'Side Delts', d: 'Bahu lebar, lengan terlihat penuh.' },
  { m: 'Rear Delts', d: 'Bahu belakang, bikin lengan 3D.' },
  { m: 'Biceps & Triceps', d: 'Lengan berisi, estetik.' },
  { m: 'Upper back / trap', d: 'Dihindari — bikin badan terlihat tebal dan kurang lean.', avoid: true }
];
