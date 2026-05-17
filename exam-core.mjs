﻿export const SUPABASE_URL = 'https://zipfwmmwcawfbqofhwmc.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_j1dhehxot0jJ98uUNblN4A_c3ujTqn6';
export const EXAM_SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbx98IPpe_HyJ_adVswhTxhsmaaL9Y-ZqPBS2ckhG5Tu4yhe9HMPjawyoGy8SXaDvhI/exec';

export const grades = [
  ['5kyu', '5 KYU (Amarillo)'],
  ['4kyu', '4 KYU (Naranja)'],
  ['3kyu', '3 KYU (Verde)'],
  ['2kyu', '2 KYU (Azul)'],
  ['1kyu', '1 KYU (Marron)'],
  ['shodan', 'SHODAN (1º Dan)'],
  ['nidan', 'NIDAN (2º Dan)'],
  ['sandan', 'SANDAN (3º Dan)'],
  ['yondan', 'YONDAN (4º Dan)'],
  ['godan', 'GODAN (5º Dan)'],
];

export const examPrograms = [
  ['adultos', 'Adultos'],
  ['ninos', 'Niños'],
];

export const childrenGrades = [
  ['children_blanco_amarillo', 'BLANCO-AMARILLO'],
  ['children_5kyu', '5 KYU'],
  ['children_amarillo_naranja', 'AMARILLO-NARANJA'],
  ['children_4kyu', '4 KYU'],
  ['children_naranja_verde', 'NARANJA-VERDE'],
  ['children_3kyu', '3 KYU'],
  ['children_verde_azul', 'VERDE-AZUL'],
  ['children_2kyu', '2 KYU'],
  ['children_azul_marron', 'AZUL-MARRON'],
  ['children_1kyu', '1 KYU'],
];

export const childrenSourceGrades = {
  children_blanco_amarillo: '5kyu',
  children_5kyu: '5kyu',
  children_amarillo_naranja: '4kyu',
  children_4kyu: '4kyu',
  children_naranja_verde: '3kyu',
  children_3kyu: '3kyu',
  children_verde_azul: '2kyu',
  children_2kyu: '2kyu',
  children_azul_marron: '1kyu',
  children_1kyu: '1kyu',
};

export const childrenCurrentGrades = {
  children_blanco_amarillo: 'MINARAI',
  children_5kyu: 'BLANCO-AMARILLO',
  children_amarillo_naranja: '5 KYU',
  children_4kyu: 'AMARILLO-NARANJA',
  children_naranja_verde: '4 KYU',
  children_3kyu: 'NARANJA-VERDE',
  children_verde_azul: '3 KYU',
  children_2kyu: 'VERDE-AZUL',
  children_azul_marron: '2 KYU',
  children_1kyu: 'AZUL-MARRON',
};

export function gradeOptionsForProgram(programType) {
  return programType === 'ninos' ? childrenGrades : grades;
}

export function sourceGradeForExamGrade(grade, programType = 'adultos') {
  if (programType === 'ninos') return childrenSourceGrades[grade] || grade;
  return grade;
}

export function isValidExamGrade(grade, programType = 'adultos') {
  return gradeOptionsForProgram(programType).some(([id]) => id === grade);
}

export const syllabusData = {
  '5kyu': {
    Goho: ['Uchi uke zuki (ura)', 'Tenshin geri', 'Uwa uke zuki (ura)', 'Uwa uke geri'],
    Juho: ['Yori nuki (katate)', 'Kote nuki', 'Gyaku gote, mae yubi gatame', 'Ude juji (katame to renko)'],
    'Tai gamae': ['Chudan gamae', 'Ichiji gamae', 'Hiraki gamae'],
    Keimyaku: ['Suigetsu', 'Mikazuki', 'Hakusetsu'],
    'Umpo ho': ['Chidori ashi', 'Kani ashi', 'Kumo ashi', 'Juji ashi', 'Sashi komi ashi', 'Zen tenkan', 'Han tenkan'],
    Ukemi: ['Daisharin', 'Yoko ukemi'],
    'Kata tan-en': ['Tenchiken dai ichi', 'Ryuo ken dai ichi'],
    Randori: ['Gentei goho (single attacks)'],
    Gakka: ['Dokun (recitar Seiku y Seigan)', 'Cómo comportarse en el dojo', 'Cómo sentarse y respirar durante zazen', 'Lista de vocabulario 1'],
  },
  '4kyu': {
    Goho: ['Mae ryusui geri', 'Shita uke geri', 'Tsuki ten ichi', 'Juji uke geri (omote)', 'Uwa uke zuki (omote) renhanko'],
    Juho: ['Maki nuki (katate)', 'Ryote yori nuki', 'Johaku nuki (katate & ryote)', 'Johaku dori (katate & ryote)', 'Sode nuki (katate & ryote)'],
    'Tai gamae': ['Gedan gamae', 'Gyaku gedan gamae', 'Hasso gamae'],
    Keimyaku: ['Mae zanmai', 'Yoko zanmai', 'Shin-e', 'Hyaku-e'],
    'Umpo ho': ['Sashi kae ashi', 'Fumi komi ashi', 'Zen tenkan & han tenkan from kesshu gamae'],
    Ukemi: ['Ushiro ukemi'],
    'Kata tan-en': ['Giwa ken dai ichi'],
    'Kata sotai': ['Tenchi ken dai ichi', 'Ryuo ken dai ichi'],
    Randori: ['Gentei goho (combinations)', 'Gentei juho (single grabs)'],
    Gakka: ['Dokun (recitar Shinjo)', 'Elementos básicos para principiantes', 'La naturaleza única del Shorinji Kempo', 'Lista de vocabulario 2'],
    Embu: ['Kumi embu list 1: select option A or B and perform with a partner, following taikai rules'],
  },
  '3kyu': {
    Goho: ['Soto uke zuki (ura) renhanko', 'Soto uke zuki (omote) renhanko', 'Tsubame gaeshi renhanko', 'Ushiro ryusui geri', 'Shita uke jun geri', 'Uchi uke geri (ura)', 'Uchi uke geri (omote)'],
    Juho: ['Katate okuri gote', 'Okuri maki tembin', 'Kiri nuki (uchi)', 'Kiri nuki (soto)', 'Tsuki nuki (soto)', 'Tsuki nuki (uchi)', 'Ryote tsuki nuki', 'Juji nuki (katate & ryote)'],
    'Tai gamae': ['Taiki gamae'],
    Keimyaku: ['Sango', 'Yongo', 'Tenchu', 'Amon'],
    Ukemi: ['Mae ukemi'],
    'Kata tan-en': ['Tenchi ken dai ni'],
    Randori: ['Gentei goho (combination attacks)', 'Gentei juho (grabs with strikes)'],
    Gakka: ['Doshin So y la fundación del Shorinji Kempo', 'Sobre Chinkon', 'El Dokun', 'Qué es el Budo y por qué lo practicamos', 'Gyo: la disciplina del Shorinji Kempo', 'Mitad para tu propia felicidad, mitad para la de los demás'],
    Embu: ['Kumi embu list 2: select option A or B and perform with a partner, following taikai rules'],
  },
  '2kyu': {
    Goho: ['Uchi age zuki (ura & omote)', 'Uchi age geri (ura & omote)', 'Soto uke geri (ura & omote)', 'Soto oshi uke zuki', 'Uchi oshi uke zuki', 'Chidori gaeshi kari ashi', 'Kinteki (gyaku) geri hiza uke nami gaeshi'],
    Juho: ['Ude juji, tate gassho gatame', 'Ryote maki nuki', 'Ryote okuri gote, ura gatame', 'Johaku maki', 'Juji gote (katate & ryote)', 'Nidan nuki', 'Morote tsuki nuki', 'Gassho nuki', 'Gyaku gote ura gaeshi nage'],
    'Tai gamae': ['Midare gamae'],
    Keimyaku: ['Sunmyaku', 'San inko', 'Fushi'],
    Ukemi: ['Tobi komi mae ukemi (to clear obstacle)'],
    'Kata tan-en': ['Tenchi ken dai san & yon', 'Giwa ken dai ni'],
    'Kata sotai': ['Giwa ken dai ichi'],
    Randori: ['Goho free randori', 'Gentei juho randori'],
    Gakka: ['Establécete a ti mismo y vive en armonía con los demás', 'Ken Zen Ichi Nyo', 'Riki Ai Funi', 'Pautas para un entrenamiento eficaz', 'La mentalidad de crecimiento', 'Ars Longa, Vita Brevis'],
    Embu: ['Kumi embu list 3: construct an embu using any six listed sequences, following taikai rules'],
  },
  '1kyu': {
    Goho: ['Kusshin zuki', 'Kusshin geri', 'Kusshin zuki geri', 'Han tenshin geri', 'Yoko tenshin geri', 'Uchi uke zuki (omote)', 'Furi ten ni', 'Tsuki ten ni'],
    Juho: ['Oshi kiri nuki', 'Kiri kaeshi nuki (katate)', 'Kiri kaeshi nuki (morote)', 'Kiri gote (katate & morote)', 'Sankaku nuki', 'Sode dori', 'Sode maki', 'Sode maki tembin', 'Eri nuki', 'Ude maki', 'Eri juji', 'Kata muna otoshi', 'Ryaku juji gote', 'Maki juji gote', 'Oshi gote (katate & ryote)'],
    'Tai gamae': ['Tate muso gamae', 'Yoko muso gamae'],
    Keimyaku: ['Kekkai', 'Matsukaze', 'Rinkyu', 'Danchu'],
    Ukemi: ['Tobi ukemi from nage waza (gyaku gote)'],
    'Kata sotai': ['Tenchi ken dai ni'],
    Randori: ['Goho free randori', 'Gentei juho randori'],
    Gakka: ['Shushu Koju', 'Fusatsu Katsujin', 'Go Ju Ittai', 'Kumite Shutai', 'Fuhai Shoju', 'Los tres niveles de dominio de un arte (Gi, Jutsu, Ryaku)', 'Las tres etapas del aprendizaje de una habilidad (Shu, Ha, Ri)'],
    Embu: ['Kumi embu list 4: construct a six-sequence embu using techniques from the list and perform with a partner, following taikai rules'],
  },
  shodan: {
    Goho: ['Harai uke geri', 'Gedan gaeshi', 'Gyaku tenshin geri', 'Shita uke zuki (ura & omote)', 'Keri ten san (omote)', 'Keri ten san (ura)', 'Kaishin zuki (ura & omote)', 'Tsuki ten san (ura)', 'Tsuki ten san (omote)', 'Uchi oshi uke geri (ura & omote)', 'Soto oshi uke geri', 'Mawashi geri sambo uke nami gaeshi'],
    Juho: ['Uchi nuki (katate & ryote)', 'Gyaku tembin', 'Morote oshi nuki', 'Hiki otoshi', 'Morote hiki nuki', 'Katate maki gote', 'Ude gyaku dori to morote maki gote', 'Morote juji nuki', 'Morote juji gote', 'Shita uke geri kote nage', 'Kiri kaeshi tembin (katate & morote)', 'Kiri kaeshi maki tembin', 'Katate oshi nuki', 'Kote maki gaeshi'],
    'Tai gamae': ['Nio gamae'],
    Ukemi: ['Ippon se nage'],
    'Kata tan-en': ['Tenchi ken dai go & roku', 'Byakuren ken dai ichi'],
    Randori: ['Goho free randori with protectors', 'Gentei juho randori'],
    Keimyaku: ['Kisha', 'Bukkotsu', 'Chuin', 'Nichigetsu'],
    Gakka: ['Entrega previa: ¿Qué es la verdadera fuerza?', 'Entrega previa: tus motivos para empezar Shorinji Kempo y tu estado mental actual', 'Las enseñanzas clave del Shorinji Kempo', 'Pautas para un entrenamiento eficaz', 'Los tres niveles de dominio de un arte', 'Las tres etapas del aprendizaje de una habilidad', 'Tipos de entrenamiento', 'Los cinco elementos del atemi', 'Sen', "Ma'ai"],
    Embu: ['Self-constructed kumi embu, following taikai rules'],
  },
  nidan: {
    Goho: ['Tai ten ichi', 'Gyaku ten ichi (ura & omote)', 'Kon ten ichi', 'Jun geri chi ichi', 'Gyaku geri chi ichi', 'Harai uke chi ni', 'Jun geri chi san', 'Gyaku geri chi san', 'Hangetsu geri', 'Keri ten ichi sukui kubi nage', 'Tanto furi age ryusui geri', 'Tanto tsuki komi shita uke uchi otoshi geri', 'Tanto tsuki komi shita uke geri kote nage'],
    Juho: ['Gyakute nage, gyakute gatame', 'Ryu nage, ryu gatame', 'Soto maki tembin', 'Uwa uke nage', 'Uwa uke gyakute nage', 'Hiki tembin', 'Gyaku hiki tembin', 'Gassho hiki tembin', 'Morote maki nuki', 'Morote wa nuki', 'Morote gyaku gote', 'Morote okuri gote, baku ho ichi', 'Okuri tembin dori (two types)', 'Okuri dori', 'Okuri hiji zeme', 'Hiji nuki mae tembin', 'Tsuri otoshi', 'Tsuri age dori', 'Hiki muna otoshi', 'Ryo muna otoshi', 'Maki otoshi', 'Soto maki otoshi', 'Nuki uchi oshi gote', 'Ninin nuki'],
    'Kata tan-en': ['Tenchi ken dai ichi - dai roku (migi & hidari)', 'Giwa ken dai ichi - dai ni', 'Byakuren ken dai ichi', 'Ko manji ken'],
    'Kata sotai': ['Giwa ken dai ichi', 'Tenchi ken dai ni'],
    Randori: ['Goho free randori with protectors', 'Gentei juho randori'],
    Shakujo: ['Shakujo kihon furi', 'Tenchi ken dai ichi - dai san', 'Giwa ken dai ichi - dai ni'],
    Gakka: ['Entrega previa: mitad para tu propia felicidad, mitad para la de los demás', 'Entrega previa: sobre la defensa personal', 'En el examen: establécete a ti mismo y vive en armonía con los demás', 'En el examen: el poder del Ki', 'En el examen: Bodhidharma, el Zen y el templo Shaolin', 'En el examen: 3 recipientes, 3 sistemas, 25 grupos', 'En el examen: graduaciones y rangos en Shorinji Kempo', 'En el examen: historia de la BSKF', 'En el examen: el Manji y el significado del logo de la BSKF'],
    Embu: ['Kumi embu autoconstruido, siguiendo las reglas de taikai'],
  },
  sandan: {
    Goho: ['Machi geri', 'Dan geri sambo uke dan geri gaeshi', 'Sokuto geri hiki ashi nami gaeshi', 'Mikazuki gaeshi kari ashi', 'Suigetsu gaeshi oshi taoshi', 'Hangetsu gaeshi sukui kubi nage', 'Chudan gaeshi ren han ko', 'Fukko chi ni', 'Soto uke dan zuki', 'Uchi age dan zuki', 'Shita uke dan zuki', 'Harai uke dan zuki', 'Uwa uke zuki with nyoi'],
    Juho: ['Age nuki', 'Idori okuri gote', 'Idori gyaku gote', 'Idori oshi gote', 'Katate nage', 'Gyaku katate nage', 'Okuri katate nage', 'Gassho katate nage', 'Ryote katate nage', 'Morote katate nage', 'Sode maki gaeshi', 'Sode guchi dori', 'Sode guchi maki', 'Kiri kaeshi gote', 'Kiri kaeshi nage', 'Morote kiri kaeshi nage', 'Uwa uke se nage', 'Furi sute omote nage', 'Morote okuri gote nage', 'Okuri tsuki taoshi', 'Koshi kujiki', 'Konoha okuri', 'Konoha gaeshi', 'Okuri yubi gaeshi', 'Okuri shishi dori', 'Gassho okuri dori', 'Nigiri gaeshi'],
    'Kata tan-en': ['Ko manji ken (2nd section ryuo ken dai ichi, 4th section ryu no kata)'],
    Randori: ['Goho free randori with protectors', 'Gentei juho randori', 'Gentei go-ju randori (single attack)'],
    Shakujo: ['Tenchi ken dai yon - dai roku', 'Byakuren ken dai ichi (2 versions)', 'Ido enren dai ichi - dai ni'],
    Gakka: ['Entrega previa: Doshin So y la fundación del Shorinji Kempo', 'Entrega previa: Gyo, la disciplina del Shorinji Kempo', 'En el examen: el Dokun', 'En el examen: sobre Kongo Zen', 'En el examen: los elementos clave de la enseñanza de Buda', 'En el examen: Dharma', 'En el examen: destino y libre albedrío', 'En el examen: karma y destino', 'En el examen: el Camino Medio'],
    Embu: ['Kumi embu autoconstruido, siguiendo las reglas de taikai'],
  },
  yondan: {
    Juho: ['Bukkotsu nage', 'Harai bukkotsu nage', 'Ushiro bukkotsu nage', 'Kubi jime shuho juji nage', 'Kubi jime nage', 'Kenjime dori', 'Tembin nage', 'Katate kumade gaeshi', 'Ryote kumade gaeshi', 'Okuri gassho (two types)', 'Kannuki okuri dori', 'Kannuki soto tembin', 'Gassho gyaku gote', 'Gyaku gassho nage (two types)', 'Gyaku sode dori', 'Gyaku sode maki', 'Hangetsu kubi nage', 'Osae kannuki nage soto', 'Osae kannuki nage uchi', 'Omote nage', 'Ura nage', 'Maki uchi kubi nage', 'Katate nage kiri kaeshi', 'Okuri kannuki gote', 'Maki komi gote', 'Okuri eri dori', 'Ushiro eri dori', 'Yahazu nage', 'Ushiro kubi nage', 'Ushiro sode maki (dori)', 'Oshi uke nage', 'Oshi uke maki nage', 'Gassho choji', 'Gassho tsuki otoshi', 'Ashi nuki (two types)'],
    Goho: ['Chudan gaeshi to uchi uke zuki', 'Gedan gaeshi to tobi ni ren geri'],
    'Kata tan-en': ['All (hidari and migi)'],
    'Kata sotai': ['All (hidari and migi)'],
    Randori: ['Goho free randori with protectors', 'Gentei juho randori', 'Gentei go-ju randori'],
    Shakujo: ['Tenchi ken dai ichi - dai roku (hidari & migi)', 'Ko manji ken', 'Ido enren dai san - dai roku'],
    Appo: ['Oyayubi zeme', 'Yongo zeme', 'Sango zeme', 'Bukkotsu zeme'],
    Gakka: ['Entrega previa: sobre el liderazgo en Shorinji Kempo', 'Entrega previa: las Cuatro Nobles Verdades', 'Entrega previa: el Noble Óctuple Sendero', 'Entrega previa: vacuidad y no-yo', 'Entrega previa: budismo y moralidad', 'Entrega previa: budismo y ciencia', 'En el examen: no requerido'],
    Embu: ['Kumi embu autoconstruido, siguiendo las reglas de taikai'],
  },
  godan: {
    Juho: ['Kannuki katate nage', 'Katate kannuki nage', 'Ryote kannuki nage', 'Kannuki nai tembin', 'Tekubi dori', 'Choji dori', 'Mae gami dori', 'Sode juji', 'Shikumi koshi nage', 'Shikumi nai tembin', 'Obi dori', 'Kata uchi nage', 'Tora daoshi (2 types)', 'Fukko daoshi (3 types)', 'Hasami daoshi (2 types)', 'Hagai jime to shuho', 'Sode dori nai tembin', 'Sode maki gaeshi ura', 'Okuri eri dori omote', 'Kubi jime nage omote', 'Choji nage', 'Okuri gassho konoha nage', 'Konoha choji', 'Gyaku konoha gaeshi', 'Omote kumade gaeshi', 'Okuri hiji zeme omote', 'Uchi gyakute dori', 'Soto gyakute dori', 'Kote nage from jo chu ni ren zuki'],
    'Kata tan-en': ['All (hidari and migi)'],
    'Kata sotai': ['All (hidari and migi)'],
    Randori: ['Goho free randori with protectors', 'Gentei juho randori', 'Gentei go-ju randori', 'Randori (foam bo)'],
    'Shakujo tan-en': ['Tenchi ken dai ichi - dai roku (hidari & migi)', 'Giwaken dai ichi - dai ni', 'Byakuren ken dai ichi', 'Ko manji ken (migi & hidari)', 'Ido enren dai ichi - dai ju (hidari & migi)'],
    'Shakujo sotai': ['Uwa uke uchi otoshi', 'Yoko uke shigoki zuki', 'Tenchi ken dai ichi', 'Byakuren ken dai ichi'],
    Appo: ['Tsurigane zeme', 'Sunmyaku zeme', 'Gokoku zeme', 'Shikoku zeme', 'Yako zeme'],
    Gakka: ['Requisitos para Daikenshi: se examinan por separado'],
  },
};

export function gradeLabel(value) {
  return childrenGrades.find(([id]) => id === value)?.[1] ?? grades.find(([id]) => id === value)?.[1] ?? value;
}

export function gradeSheetLabel(value) {
  const labels = {
    '5kyu': '5 KYU',
    '4kyu': '4 KYU',
    '3kyu': '3 KYU',
    '2kyu': '2 KYU',
    '1kyu': '1 KYU',
    shodan: '1 DAN',
    nidan: '2 DAN',
    sandan: '3 DAN',
    yondan: '4 DAN',
    godan: '5 DAN',
    children_blanco_amarillo: 'BLANCO-AMARILLO',
    children_5kyu: '5 KYU',
    children_amarillo_naranja: 'AMARILLO-NARANJA',
    children_4kyu: '4 KYU',
    children_naranja_verde: 'NARANJA-VERDE',
    children_3kyu: '3 KYU',
    children_verde_azul: 'VERDE-AZUL',
    children_2kyu: '2 KYU',
    children_azul_marron: 'AZUL-MARRON',
    children_1kyu: '1 KYU',
  };
  return labels[value] || String(value || '').toUpperCase();
}

export function toDateOnly(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function buildExamSheetPayload({
  studentName,
  studentRef,
  studentSourceId,
  programType = 'adultos',
  grade,
  sourceGrade,
  examinerName,
  submittedAt,
  registeredBy,
  token,
}) {
  return {
    accion: 'REGISTRAR_EXAMEN_WEB',
    alumno: studentName || '',
    alumnoRef: studentRef || '',
    alumnoId: studentSourceId || '',
    programa: programType,
    grado: gradeSheetLabel(grade),
    gradoFuente: sourceGrade ? gradeSheetLabel(sourceGrade) : '',
    examinador: examinerName || '',
    fechaExamen: toDateOnly(submittedAt),
    registradoPor: registeredBy || 'Sistema exámenes SKBC',
    token,
  };
}

export function techniqueName(item) {
  return typeof item === 'string' ? item : item?.name || item?.technique_name || '';
}

export function techniqueSection(item) {
  return typeof item === 'string' ? '' : item?.section || '';
}

export function techniqueWeight(item) {
  const weight = Number(typeof item === 'string' ? 1 : item?.weight ?? 1);
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

const techniqueSummaries = {
  'Ura Uchi age geri': 'Tai (ura). A: jodan jun zuki. D: jun uchi age, jun geri.',
  'Omote Uchi age geri': 'Hiraki (omote). A: jodan jun zuki. D: jun uchi age, jun geri.',
};

export function techniqueSummary(item) {
  const explicitSummary = typeof item === 'string' ? '' : item?.summary || item?.technique_summary || '';
  const originalName = typeof item === 'string' ? '' : item?.original_name || '';
  return explicitSummary || techniqueSummaries[techniqueName(item)] || techniqueSummaries[originalName] || '';
}

function expandTechniqueVariants(name) {
  const value = String(name || '').trim();
  const variantMatch = value.match(/\((katate|ryote|morote|ura|omote)\s*(?:&|\/)\s*(katate|ryote|morote|ura|omote)\)/i);

  if (!variantMatch) return [value];

  const baseName = value.replace(variantMatch[0], '').replace(/\s+/g, ' ').trim();
  const labels = {
    katate: 'Katate',
    ryote: 'Ryote',
    morote: 'Morote',
    ura: 'Ura',
    omote: 'Omote',
  };

  return [variantMatch[1], variantMatch[2]].map((variant) => `${labels[variant.toLowerCase()] || variant} ${baseName}`);
}

export function getOrderedTechniqueItems(grade, programType = 'adultos') {
  const sourceGrade = sourceGradeForExamGrade(grade, programType);
  const blocks = syllabusData[sourceGrade] || {};
  const ordered = [];
  const consumed = new Set();

  const addBlock = (sectionName) => {
    const techniques = blocks[sectionName];
    if (!techniques) return;
    consumed.add(sectionName);
    techniques.forEach((name) => {
      expandTechniqueVariants(name).forEach((expandedName) => ordered.push({ section: sectionName, name: expandedName }));
    });
  };

  addBlock('Tai gamae');
  addBlock('Umpo ho');
  addBlock('Ukemi');

  Object.keys(blocks)
    .filter((sectionName) => sectionName.toLowerCase().startsWith('kata'))
    .forEach(addBlock);

  addBlock('Keimyaku');
  consumed.add('Gakka');
  consumed.add('Embu');

  const goho = blocks.Goho || [];
  const juho = blocks.Juho || [];
  consumed.add('Goho');
  consumed.add('Juho');
  const maxPairs = Math.max(goho.length, juho.length);
  for (let index = 0; index < maxPairs; index += 1) {
    if (goho[index]) {
      expandTechniqueVariants(goho[index]).forEach((name) => ordered.push({ section: 'Goho', name }));
    }
    if (juho[index]) {
      expandTechniqueVariants(juho[index]).forEach((name) => ordered.push({ section: 'Juho', name }));
    }
  }

  Object.entries(blocks)
    .filter(([sectionName]) => !consumed.has(sectionName))
    .forEach(([sectionName, techniques]) => {
      techniques.forEach((name) => {
        expandTechniqueVariants(name).forEach((expandedName) => ordered.push({ section: sectionName, name: expandedName }));
      });
    });

  addBlock('Gakka');
  addBlock('Embu');

  return ordered;
}

export function getPreviousGohoJuhoTechniqueItems(grade, programType = 'adultos') {
  const sourceGrade = sourceGradeForExamGrade(grade, programType);
  const gradeIndex = grades.findIndex(([id]) => id === sourceGrade);
  if (gradeIndex <= 0) return [];

  return grades.slice(0, gradeIndex).flatMap(([previousGrade, previousGradeLabel]) => {
    const blocks = syllabusData[previousGrade] || {};
    return ['Goho', 'Juho'].flatMap((sectionName) => {
      const techniques = blocks[sectionName] || [];
      return techniques.flatMap((name) =>
        expandTechniqueVariants(name).map((expandedName) => ({
          grade: previousGrade,
          gradeLabel: previousGradeLabel,
          section: sectionName,
          name: expandedName,
        }))
      );
    });
  });
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

export function calculateEvaluationSummary(techniqueEvaluations, passPercentage, adjustmentPoints = 0) {
  const evaluated = techniqueEvaluations.filter((item) => !item.skipped && Number.isFinite(Number(item.score)));
  const baseScore = evaluated.reduce((sum, item) => sum + (Number(item.score || 0) * techniqueWeight(item)), 0);
  const maxScore = evaluated.reduce((sum, item) => sum + (10 * techniqueWeight(item)), 0);
  const adjustedScore = baseScore + Number(adjustmentPoints || 0);
  const totalScore = maxScore ? Math.min(maxScore, Math.max(0, adjustedScore)) : 0;
  const percentage = maxScore ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;

  return {
    totalScore,
    baseScore,
    adjustmentPoints: Number(adjustmentPoints || 0),
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
  adjustmentPoints = 0,
  submittedAt,
}) {
  const items = techniqueEvaluations || [];
  const summary = calculateEvaluationSummary(items, passPercentage, adjustmentPoints);
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

export function validateExamDraft({ title, grade, sourceGrade, programType = 'adultos', techniques, students, examiners }) {
  const errors = [];
  const resolvedSourceGrade = sourceGrade || sourceGradeForExamGrade(grade, programType);

  if (!String(title || '').trim()) errors.push('El título del examen es obligatorio.');
  if (!grade || !isValidExamGrade(grade, programType) || !syllabusData[resolvedSourceGrade]) errors.push('Selecciona un grado válido.');
  if (!Array.isArray(techniques) || techniques.length === 0) errors.push('Selecciona al menos una técnica.');
  if (!Array.isArray(students) || students.filter((student) => student.student_name?.trim()).length === 0) {
    errors.push('Agrega al menos un estudiante.');
  }
  if (!Array.isArray(examiners) || examiners.filter((examiner) => examiner.name?.trim()).length === 0) {
    errors.push('Agrega al menos un examinador.');
  }

  return { valid: errors.length === 0, errors };
}

export function getSelectedTechniques(form) {
  return [...form.querySelectorAll('[data-technique]:checked')].map((input) => {
    const row = input.closest?.('[data-technique-row]');
    if (!row && input.dataset.techniqueNameInput) {
      return {
        section: input.dataset.section || '',
        name: form.querySelector(input.dataset.techniqueNameInput)?.value.trim() || input.value,
      };
    }
    const name = row?.querySelector('[data-technique-name]')?.value.trim() || input.value;
    const originalName = input.dataset.originalName || input.value || name;
    return {
      section: input.dataset.section || '',
      source_grade: input.dataset.grade || '',
      name,
      original_name: originalName,
      weight: Number(row?.querySelector('[data-technique-weight]')?.value || input.dataset.weight || 1),
      summary: techniqueSummary({ name, original_name: originalName }),
    };
  }).filter((item) => item.name);
}

