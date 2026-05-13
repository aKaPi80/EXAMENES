export const SUPABASE_URL = 'https://zipfwmmwcawfbqofhwmc.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_j1dhehxot0jJ98uUNblN4A_c3ujTqn6';

export const grades = [
  ['5kyu', '5 KYU (Blanco - Minarai)'],
  ['4kyu', '4 KYU (Amarillo)'],
  ['3kyu', '3 KYU (Naranja)'],
  ['2kyu', '2 KYU (Verde)'],
  ['1kyu', '1 KYU (Azul)'],
  ['shodan', 'SHODAN (1º Dan)'],
  ['nidan', 'NIDAN (2º Dan)'],
  ['sandan', 'SANDAN (3º Dan)'],
  ['yondan', 'YONDAN (4º Dan)'],
  ['godan', 'GODAN (5º Dan)'],
];

export const syllabusData = {
  '5kyu': {
    Goho: ['Uchi uke zuki (ura)', 'Tenshin geri', 'Uwa uke zuki (ura)', 'Uwa uke geri'],
    Juho: ['Yori nuki (katate)', 'Kote nuki', 'Gyaku gote mae yubi gatame', 'Ude juji'],
    'Tai gamae': ['Chudan gamae', 'Ichiji gamae', 'Hiraki gamae'],
    Keimyaku: ['Suigetsu', 'Mikazuki'],
    'Umpo ho': ['Chidori ashi', 'Kani ashi', 'Kumo ashi', 'Sashi komi ashi'],
    Ukemi: ['Daisharin', 'Yoko ukemi'],
    'Kata tan-en': ['Tenchiken dai ichi', 'Ryuo ken dai ichi'],
  },
  '4kyu': {
    Goho: ['Mae ryusui geri', 'Shita uke geri', 'Tsuki ten ichi', 'Juji uke geri', 'Uwa uke zuki'],
    Juho: ['Maki nuki', 'Ryote yori nuki', 'Johaku nuki', 'Sode nuki'],
    'Tai gamae': ['Gedan gamae', 'Gyaku gedan gamae', 'Hasso gamae'],
    Keimyaku: ['Mae zanmai', 'Yoko zanmai'],
    'Umpo ho': ['Sashi kae ashi', 'Fumi komi ashi'],
    Ukemi: ['Ushiro ukemi'],
    'Kata tan-en': ['Giwa ken dai ichi'],
  },
  '3kyu': {
    Goho: ['Soto uke zuki', 'Tsubame gaeshi', 'Ushiro ryusui geri', 'Uchi uke geri'],
    Juho: ['Katate okuri gote', 'Kiri nuki', 'Tsuki nuki'],
    'Tai gamae': ['Taiki gamae'],
    Keimyaku: ['Sango', 'Yongo'],
    'Kata tan-en': ['Tenchi ken dai ni'],
  },
  '2kyu': {
    Goho: ['Uchi age zuki', 'Soto uke geri', 'Kinteki geri'],
    Juho: ['Ude juji', 'Ryote maki nuki', 'Johaku maki'],
    'Tai gamae': ['Midare gamae'],
    Keimyaku: ['Sunmyaku', 'San inko'],
    Ukemi: ['Tobi komi mae ukemi'],
    'Kata tan-en': ['Tenchi ken dai san & yon', 'Giwa ken dai ni'],
  },
  '1kyu': {
    Goho: ['Kusshin zuki', 'Tenshin geri', 'Han tenshin geri'],
    Juho: ['Oshi kiri nuki', 'Kiri kaeshi nuki', 'Eri juji'],
    'Tai gamae': ['Tate muso gamae'],
    Keimyaku: ['Kekkai', 'Matsukaze'],
    Ukemi: ['Tobi ukemi'],
    'Kata sotai': ['Tenchi ken dai ni'],
  },
  shodan: {
    Goho: ['Tai ten ichi', 'Gyaku ten ichi', 'Keri ten ichi'],
    Juho: ['Gyaku hiki tembin', 'Soto maki tembin', 'Morote wa nuki'],
    Keimyaku: ['Kisha', 'Bukkotsu'],
  },
  nidan: {
    Goho: ['Tai ten ichi', 'Gyaku ten ichi (ura & omote)', 'Kon ten ichi', 'Jun geri chi ichi'],
    Juho: ['Morote gyaku gote', 'Morote okuri gote', 'Okuri dori', 'Okuri hiji zeme'],
  },
  sandan: {
    Goho: ['Machi geri', 'Dan geri sambo uke', 'Sokuto geri hiki ashi', 'Mikazuki gaeshi'],
    Juho: ['Sode maki gaeshi', 'Sode guchi dori', 'Kiri kaeshi gote', 'Kiri kaeshi nage'],
  },
  yondan: {
    Goho: ['Bukkotsu nage', 'Harai bukkotsu nage', 'Kubi jime shuho', 'Kubi jime nage'],
    Juho: ['Shikake techniques', 'Ura techniques'],
  },
  godan: {
    Goho: ['Kannuki katate nage', 'Katate kannuki nage', 'Ryote kannuki nage', 'Tekubi dori'],
    Bo: ['Randori (foam bo)'],
  },
};

export function gradeLabel(value) {
  return grades.find(([id]) => id === value)?.[1] ?? value;
}

export function techniqueName(item) {
  return typeof item === 'string' ? item : item?.name || item?.technique_name || '';
}

export function techniqueSection(item) {
  return typeof item === 'string' ? '' : item?.section || '';
}

export function getOrderedTechniqueItems(grade) {
  const blocks = syllabusData[grade] || {};
  const ordered = [];
  const consumed = new Set();

  const addBlock = (sectionName) => {
    const techniques = blocks[sectionName];
    if (!techniques) return;
    consumed.add(sectionName);
    techniques.forEach((name) => ordered.push({ section: sectionName, name }));
  };

  addBlock('Tai gamae');
  addBlock('Umpo ho');
  addBlock('Ukemi');

  Object.keys(blocks)
    .filter((sectionName) => sectionName.toLowerCase().startsWith('kata'))
    .forEach(addBlock);

  addBlock('Keimyaku');

  const goho = blocks.Goho || [];
  const juho = blocks.Juho || [];
  consumed.add('Goho');
  consumed.add('Juho');
  const maxPairs = Math.max(goho.length, juho.length);
  for (let index = 0; index < maxPairs; index += 1) {
    if (goho[index]) ordered.push({ section: 'Goho', name: goho[index] });
    if (juho[index]) ordered.push({ section: 'Juho', name: juho[index] });
  }

  Object.entries(blocks)
    .filter(([sectionName]) => !consumed.has(sectionName))
    .forEach(([sectionName, techniques]) => {
      techniques.forEach((name) => ordered.push({ section: sectionName, name }));
    });

  ordered.push({ section: 'Gakka', name: 'Gakka' });
  ordered.push({ section: 'Embu', name: 'Embu' });

  return ordered;
}

export function normalizeToken(bytes = 16) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint8Array(bytes);
    cryptoApi.getRandomValues(values);
    return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
  }
  return Array.from({ length: bytes * 2 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function calculateEvaluationSummary(techniqueEvaluations, passPercentage) {
  const evaluated = techniqueEvaluations.filter((item) => !item.skipped && Number.isFinite(Number(item.score)));
  const totalScore = evaluated.reduce((sum, item) => sum + Number(item.score || 0), 0);
  const maxScore = evaluated.length * 10;
  const percentage = maxScore ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;

  return {
    totalScore,
    maxScore,
    percentage,
    passed: percentage >= Number(passPercentage || 0),
  };
}

export function buildPrintableEvaluation({
  clubName,
  examTitle,
  grade,
  studentName,
  beltColor,
  examinerName,
  passPercentage,
  techniqueEvaluations,
  submittedAt,
}) {
  const items = techniqueEvaluations || [];
  const summary = calculateEvaluationSummary(items, passPercentage);
  const skippedCount = items.filter((item) => item.skipped).length;

  return {
    clubName,
    examTitle,
    grade,
    gradeLabel: gradeLabel(grade),
    studentName,
    beltColor,
    examinerName,
    passPercentage: Number(passPercentage || 0),
    submittedAt,
    techniqueEvaluations: items,
    summary,
    skippedCount,
    evaluatedCount: items.length - skippedCount,
  };
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export function validateExamDraft({ title, grade, techniques, students, examiners }) {
  const errors = [];

  if (!String(title || '').trim()) errors.push('El título del examen es obligatorio.');
  if (!grade || !syllabusData[grade]) errors.push('Selecciona un grado válido.');
  if (!Array.isArray(techniques) || techniques.length === 0) errors.push('Selecciona al menos una técnica.');
  if (!Array.isArray(students) || students.filter((student) => student.student_name?.trim()).length === 0) {
    errors.push('Agrega al menos un estudiante.');
  }
  if (!Array.isArray(examiners) || examiners.filter((examiner) => examiner.name?.trim() && validateEmail(examiner.email)).length === 0) {
    errors.push('Agrega al menos un examinador con email válido.');
  }

  return { valid: errors.length === 0, errors };
}

export function getSelectedTechniques(form) {
  return [...form.querySelectorAll('[data-technique]:checked')].map((input) => ({
    section: input.dataset.section || '',
    name: input.value,
  }));
}

