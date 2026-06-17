import {
  EXAM_SHEET_WEBAPP_URL,
  SUPABASE_KEY,
  SUPABASE_URL,
  buildExamSheetPayload,
  buildPrintableEvaluation,
  calculateEvaluationSummary,
  childrenCurrentGrades,
  examPrograms,
  gradeOptionsForProgram,
  getPreviousGohoJuhoTechniqueItems,
  getSelectedTechniques,
  getOrderedTechniqueItems,
  gradeLabel,
  gradeSheetLabel,
  grades,
  normalizeToken,
  sourceGradeForExamGrade,
  syllabusData,
  techniqueName,
  techniqueSection,
  techniqueSummary,
  validateExamDraft,
} from './exam-core.mjs?v=20260617-webapp-url-6';

const app = document.getElementById('app');
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const DEFAULT_CLUB_LOGO_URL = './skbc-logo.png';

const state = {
  user: null,
  professor: null,
  activeTab: 'config',
  exams: [],
  examFolders: [],
  activeExamFolderId: 'all',
  selectedExam: null,
  examinerPayload: null,
  examinerTechniqueIndex: 0,
  examinerAnswers: {},
  customTechniqueCounter: 0,
  techniqueRowCounter: 0,
  examTemplateDraft: null,
  examEditDraft: null,
  techniqueSummaries: new Map(),
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function notify(message, type = 'success') {
  const outlet = $('#noticeOutlet');
  if (!outlet) {
    alert(message);
    return;
  }
  outlet.innerHTML = `<div class="notice ${type}">${escapeHtml(message)}</div>`;
  window.setTimeout(() => { outlet.innerHTML = ''; }, 4500);
}

function showErrors(errors) {
  notify(Array.isArray(errors) ? errors.join(' ') : errors, 'error');
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('exam') || params.get('examiner');

  if (token) {
    await renderExaminerApp(token);
    return;
  }

  const { data } = await supabase.auth.getSession();
  state.user = data.session?.user ?? null;

  if (!state.user) {
    renderAuth();
    return;
  }

  await loadProfessor();
  renderProfessorApp();
  await loadExams();
}

function renderAuth() {
  app.innerHTML = `
    <section class="auth-card">
      <div class="brand-mark">SKBC</div>
      <h1>Sistema de Exámenes</h1>
      <h2>Panel del profesor</h2>
      <div id="noticeOutlet"></div>
      <form id="loginForm">
        <div class="field">
          <label for="loginEmail">Email</label>
          <input id="loginEmail" type="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="loginPassword">Contraseña</label>
          <input id="loginPassword" type="password" autocomplete="current-password" required />
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%">Iniciar sesión</button>
      </form>
      <button class="btn btn-secondary" id="showSignup" style="width:100%;margin-top:10px">Crear cuenta nueva</button>
      <form id="signupForm" hidden style="margin-top:22px;padding-top:22px;border-top:1px solid var(--line)">
        <div class="grid-2">
          <div class="field">
            <label for="signupName">Nombre</label>
            <input id="signupName" type="text" required />
          </div>
          <div class="field">
            <label for="signupClub">Club</label>
            <input id="signupClub" type="text" required />
          </div>
        </div>
        <div class="field">
          <label for="signupEmail">Email</label>
          <input id="signupEmail" type="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="signupPassword">Contraseña</label>
          <input id="signupPassword" type="password" autocomplete="new-password" required minlength="6" />
        </div>
        <button class="btn btn-success" type="submit" style="width:100%">Registrarse</button>
      </form>
    </section>
  `;

  $('#showSignup').addEventListener('click', () => {
    $('#signupForm').hidden = !$('#signupForm').hidden;
  });
  $('#loginForm').addEventListener('submit', login);
  $('#signupForm').addEventListener('submit', signup);
}

async function login(event) {
  event.preventDefault();
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showErrors(error.message);
    return;
  }

  state.user = data.user;
  await loadProfessor();
  renderProfessorApp();
  await loadExams();
}

async function signup(event) {
  event.preventDefault();
  const email = $('#signupEmail').value.trim();
  const password = $('#signupPassword').value;
  const name = $('#signupName').value.trim();
  const clubName = $('#signupClub').value.trim();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, club_name: clubName } },
  });

  if (error) {
    showErrors(error.message);
    return;
  }

  if (!data.session) {
    notify('Cuenta creada. Revisa tu email para confirmar la cuenta y después inicia sesión.', 'warning');
    return;
  }

  state.user = data.user;
  await ensureProfessorProfile(name, clubName);
  renderProfessorApp();
  await loadExams();
}

async function ensureProfessorProfile(name, clubName) {
  const { data, error } = await supabase
    .from('professors')
    .upsert({
      user_id: state.user.id,
      email: state.user.email,
      name: name || state.user.user_metadata?.name || state.user.email,
      club_name: clubName || state.user.user_metadata?.club_name || 'Club SKBC',
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) throw error;
  state.professor = data;
}

async function loadProfessor() {
  const { data, error } = await supabase
    .from('professors')
    .select('*')
    .eq('user_id', state.user.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    await ensureProfessorProfile();
    return;
  }

  state.professor = data;
}

function renderProfessorApp() {
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-title">
        <div class="topbar-logo">${state.professor.logo_url ? `<img src="${escapeHtml(state.professor.logo_url)}" alt="Logo club" />` : 'SKBC'}</div>
        <div>
          <h1>Sistema de Exámenes SKBC</h1>
          <p>${escapeHtml(state.professor.club_name)} · ${escapeHtml(state.user.email)}</p>
        </div>
      </div>
      <div class="topbar-actions">
        <button class="btn btn-ghost" id="refreshBtn">Actualizar</button>
        <button class="btn btn-danger" id="logoutBtn">Cerrar sesión</button>
      </div>
    </header>
    <nav class="tabs">
      ${tabButton('config', 'Configuración')}
      ${tabButton('exams', 'Mis Exámenes')}
      ${tabButton('create', 'Crear Examen')}
      ${tabButton('results', 'Resultados')}
    </nav>
    <main class="panel">
      <div id="noticeOutlet"></div>
      <div id="panelContent"></div>
    </main>
  `;

  $$('.tab-btn').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  $('#logoutBtn').addEventListener('click', logout);
  $('#refreshBtn').addEventListener('click', async () => {
    await loadExams();
    notify('Datos actualizados.');
  });
  renderActiveTab();
}

function tabButton(id, label) {
  return `<button class="tab-btn ${state.activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`;
}

function switchTab(tab) {
  state.activeTab = tab;
  $$('.tab-btn').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  renderActiveTab();
}

async function logout() {
  await supabase.auth.signOut();
  state.user = null;
  state.professor = null;
  renderAuth();
}

function renderActiveTab() {
  if (state.activeTab === 'config') renderConfig();
  if (state.activeTab === 'exams') renderExamList();
  if (state.activeTab === 'create') renderCreateExam();
  if (state.activeTab === 'results') renderResults();
}

function renderConfig() {
  $('#panelContent').innerHTML = `
    <div class="section-head">
      <div>
        <h2>Configuración del club</h2>
        <p>Datos que aparecerán en el panel y en los exámenes.</p>
      </div>
    </div>
    <form id="configForm" class="grid-2">
      <div>
        <label class="card logo-drop" for="logoInput">
          ${state.professor.logo_url ? `<img src="${escapeHtml(state.professor.logo_url)}" alt="Logo actual" />` : '<div class="brand-mark">SKBC</div>'}
          <strong>Subir logo</strong>
          <p>PNG/JPG hasta 2MB. Se guarda como imagen del club.</p>
        </label>
        <input id="logoInput" type="file" accept="image/*" hidden />
      </div>
      <div>
        <div class="field">
          <label>Email del profesor</label>
          <input value="${escapeHtml(state.user.email)}" readonly />
        </div>
        <div class="field">
          <label for="clubName">Nombre del club</label>
          <input id="clubName" value="${escapeHtml(state.professor.club_name)}" required />
        </div>
        <div class="field">
          <label for="clubPhone">Teléfono</label>
          <input id="clubPhone" value="${escapeHtml(state.professor.phone || '')}" />
        </div>
        <button class="btn btn-success" type="submit">Guardar configuración</button>
      </div>
    </form>
  `;

  $('#logoInput').addEventListener('change', handleLogoUpload);
  $('#configForm').addEventListener('submit', saveConfig);
}

async function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showErrors('El logo debe ocupar menos de 2MB.');
    return;
  }
  const logoUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  state.professor.logo_url = logoUrl;
  renderConfig();
}

async function saveConfig(event) {
  event.preventDefault();
  const patch = {
    club_name: $('#clubName').value.trim(),
    phone: $('#clubPhone').value.trim() || null,
    logo_url: state.professor.logo_url || null,
  };

  const { data, error } = await supabase
    .from('professors')
    .update(patch)
    .eq('id', state.professor.id)
    .select()
    .single();

  if (error) {
    showErrors(error.message);
    return;
  }

  state.professor = data;
  renderProfessorApp();
  notify('Configuración guardada.');
}

async function loadExams() {
  if (!state.professor) return;
  await loadExamFolders();

  const { data, error } = await supabase
    .from('exams')
    .select('*')
    .eq('professor_id', state.professor.id)
    .order('created_at', { ascending: false });

  if (error) {
    showErrors(error.message);
    return;
  }

  state.exams = data || [];
  renderActiveTab();
}

async function loadExamFolders() {
  if (!state.professor) return;

  const { data, error } = await supabase
    .from('exam_folders')
    .select('*')
    .eq('professor_id', state.professor.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    showErrors(`Falta activar carpetas en Supabase: ${error.message}`);
    state.examFolders = [];
    return;
  }

  state.examFolders = data || [];
}

function renderExamList() {
  const exams = filteredExams();
  $('#panelContent').innerHTML = `
    <div class="section-head">
      <div>
        <h2>Mis exámenes</h2>
        <p>Organiza convocatorias por carpetas y gestiona enlaces de examinador.</p>
      </div>
      <button class="btn btn-primary" id="newExamBtn">Crear examen</button>
    </div>
    <div class="folder-layout">
      ${renderFolderPanel()}
      <div>
        <div class="folder-current">
          <strong>${escapeHtml(currentFolderTitle())}</strong>
          <span>${exams.length} examen${exams.length === 1 ? '' : 'es'}</span>
        </div>
        <div class="exam-grid">
          ${exams.length ? exams.map(renderExamCard).join('') : '<div class="empty">No hay exámenes en esta carpeta.</div>'}
        </div>
      </div>
    </div>
  `;

  $('#newExamBtn').addEventListener('click', () => switchTab('create'));
  $('#folderForm').addEventListener('submit', createExamFolder);
  $$('.folder-filter').forEach((button) => button.addEventListener('click', () => {
    state.activeExamFolderId = button.dataset.folderId;
    renderExamList();
  }));
  $$('.rename-folder').forEach((button) => button.addEventListener('click', () => renameExamFolder(button.dataset.id)));
  $$('.delete-folder').forEach((button) => button.addEventListener('click', () => deleteExamFolder(button.dataset.id)));
  $$('.view-exam').forEach((button) => button.addEventListener('click', () => viewExamDetails(button.dataset.id)));
  $$('.duplicate-exam').forEach((button) => button.addEventListener('click', () => duplicateExam(button.dataset.id)));
  $$('.delete-exam').forEach((button) => button.addEventListener('click', () => deleteExam(button.dataset.id)));
  $$('.status-select').forEach((select) => select.addEventListener('change', () => updateExamStatus(select.dataset.id, select.value)));
  $$('.folder-select').forEach((select) => select.addEventListener('change', () => moveExamToFolder(select.dataset.id, select.value)));
}

function renderExamCard(exam) {
  return `
    <article class="card">
      <h3>${escapeHtml(exam.title)}</h3>
      <p><strong>Grado:</strong> ${escapeHtml(gradeLabel(exam.grade))}</p>
      <p><strong>Carpeta:</strong> ${escapeHtml(folderName(exam.folder_id))}</p>
      <p><strong>Técnicas:</strong> ${(exam.techniques || []).length}</p>
      <p><strong>Aprobación:</strong> ${exam.pass_percentage}%</p>
      <span class="status ${escapeHtml(exam.status || 'draft')}">${escapeHtml(exam.status || 'draft')}</span>
      <div class="field" style="margin-top:12px">
        <label>Carpeta</label>
        <select class="folder-select" data-id="${exam.id}">
          ${folderOptions(exam.folder_id)}
        </select>
      </div>
      <div class="field" style="margin-top:12px">
        <label>Estado</label>
        <select class="status-select" data-id="${exam.id}">
          ${['draft', 'active', 'completed'].map((status) => `<option value="${status}" ${exam.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary btn-small view-exam" data-id="${exam.id}">Ver detalles</button>
        <button class="btn btn-secondary btn-small duplicate-exam" data-id="${exam.id}">Duplicar</button>
        <button class="btn btn-danger btn-small delete-exam" data-id="${exam.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function renderFolderPanel() {
  const folderButtons = state.examFolders.map((folder) => `
    <div class="folder-row">
      <button class="folder-filter ${state.activeExamFolderId === folder.id ? 'active' : ''}" data-folder-id="${folder.id}">
        <span>${escapeHtml(folder.name)}</span>
        <small>${folderExamCount(folder.id)}</small>
      </button>
      <button class="folder-icon rename-folder" data-id="${folder.id}" title="Renombrar carpeta" type="button">Editar</button>
      <button class="folder-icon delete-folder" data-id="${folder.id}" title="Eliminar carpeta" type="button">Borrar</button>
    </div>
  `).join('');

  return `
    <aside class="folder-panel">
      <h3>Carpetas</h3>
      <button class="folder-filter ${state.activeExamFolderId === 'all' ? 'active' : ''}" data-folder-id="all" type="button">
        <span>Todos</span>
        <small>${state.exams.length}</small>
      </button>
      <button class="folder-filter ${state.activeExamFolderId === 'unfiled' ? 'active' : ''}" data-folder-id="unfiled" type="button">
        <span>Sin carpeta</span>
        <small>${folderExamCount(null)}</small>
      </button>
      <div class="folder-list">${folderButtons || '<p class="helper-text">Crea carpetas para ordenar tus convocatorias.</p>'}</div>
      <form id="folderForm" class="folder-form">
        <label for="folderName">Nueva carpeta</label>
        <div class="folder-form-row">
          <input id="folderName" placeholder="Ej. Exámenes 2026" required />
          <button class="btn btn-primary btn-small" type="submit">Crear</button>
        </div>
      </form>
    </aside>
  `;
}

function filteredExams() {
  if (state.activeExamFolderId === 'all') return state.exams;
  if (state.activeExamFolderId === 'unfiled') return state.exams.filter((exam) => !exam.folder_id);
  return state.exams.filter((exam) => exam.folder_id === state.activeExamFolderId);
}

function currentFolderTitle() {
  if (state.activeExamFolderId === 'all') return 'Todos los exámenes';
  if (state.activeExamFolderId === 'unfiled') return 'Exámenes sin carpeta';
  return folderName(state.activeExamFolderId);
}

function folderName(folderId) {
  if (!folderId) return 'Sin carpeta';
  return state.examFolders.find((folder) => folder.id === folderId)?.name || 'Carpeta eliminada';
}

function folderExamCount(folderId) {
  return state.exams.filter((exam) => folderId ? exam.folder_id === folderId : !exam.folder_id).length;
}

function folderOptions(selectedFolderId) {
  return [
    `<option value="" ${!selectedFolderId ? 'selected' : ''}>Sin carpeta</option>`,
    ...state.examFolders.map((folder) => `<option value="${folder.id}" ${selectedFolderId === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`),
  ].join('');
}

async function createExamFolder(event) {
  event.preventDefault();
  const input = $('#folderName');
  const name = input.value.trim();
  if (!name) return;

  const { error } = await supabase
    .from('exam_folders')
    .insert({
      professor_id: state.professor.id,
      name,
      sort_order: state.examFolders.length + 1,
    });

  if (error) {
    showErrors(error.message);
    return;
  }

  input.value = '';
  await loadExams();
  notify('Carpeta creada.');
}

async function renameExamFolder(folderId) {
  const folder = state.examFolders.find((item) => item.id === folderId);
  if (!folder) return;

  const name = (prompt('Nuevo nombre de la carpeta:', folder.name) || '').trim();
  if (!name || name === folder.name) return;

  const { error } = await supabase
    .from('exam_folders')
    .update({ name })
    .eq('id', folderId);

  if (error) {
    showErrors(error.message);
    return;
  }

  await loadExams();
  notify('Carpeta renombrada.');
}

async function deleteExamFolder(folderId) {
  const folder = state.examFolders.find((item) => item.id === folderId);
  if (!folder) return;

  if (folderExamCount(folderId) > 0) {
    showErrors('Antes de borrar esta carpeta, mueve sus exámenes a otra carpeta o a Sin carpeta.');
    return;
  }

  if (!confirm(`¿Eliminar la carpeta "${folder.name}"?`)) return;

  const { error } = await supabase.from('exam_folders').delete().eq('id', folderId);
  if (error) {
    showErrors(error.message);
    return;
  }

  state.activeExamFolderId = 'all';
  await loadExams();
  notify('Carpeta eliminada.');
}

async function moveExamToFolder(examId, folderId) {
  const { error } = await supabase
    .from('exams')
    .update({ folder_id: folderId || null })
    .eq('id', examId);

  if (error) {
    showErrors(error.message);
    return;
  }

  await loadExams();
  notify('Examen movido.');
}

function renderCreateExam() {
  state.customTechniqueCounter = 0;
  const template = state.examTemplateDraft;
  const editDraft = state.examEditDraft;
  const draftSource = editDraft || template;
  const isEditing = Boolean(editDraft);
  $('#panelContent').innerHTML = `
    <div class="section-head">
      <div>
        <h2>${isEditing ? 'Editar examen' : template ? 'Crear examen desde copia' : 'Crear examen'}</h2>
        <p>${isEditing ? 'Solo puedes editar convocatorias sin evaluaciones enviadas. Al guardar se regeneran los enlaces de examinador.' : template ? 'Revisa la copia, carga alumnos y añade examinadores antes de crear la nueva convocatoria.' : 'Define técnicas, estudiantes y examinadores en un único flujo.'}</p>
      </div>
      ${isEditing ? '<button class="btn btn-secondary" id="cancelExamEdit" type="button">Cancelar edición</button>' : ''}
    </div>
    <form id="examForm">
      <div class="grid-3">
        <div class="field">
          <label for="examTitle">Título</label>
          <input id="examTitle" placeholder="Examen 3 KYU - Mayo 2026" required />
        </div>
        <div class="field">
          <label for="examProgram">Tipo de examen</label>
          <select id="examProgram">
            ${examPrograms.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="examGrade">Grado al que se examina</label>
          <select id="examGrade" required>
          </select>
        </div>
        <div class="field">
          <label for="passPercentage">Aprobación: <span id="passLabel">65%</span></label>
          <input id="passPercentage" type="range" min="40" max="90" value="65" />
        </div>
        <div class="field">
          <label for="examFolder">Carpeta</label>
          <select id="examFolder">
            ${folderOptions(draftSource?.folder_id || null)}
          </select>
        </div>
      </div>
      <div class="notice" id="gradeHelp">Selecciona el grado objetivo del examen: Minarai/Blanco examina 5 KYU, 5 KYU examina 4 KYU, 4 KYU examina 3 KYU, y así sucesivamente.</div>
      <div id="techniquesArea" class="technique-grid"></div>
      <div class="section-head" style="margin-top:22px">
        <div>
          <h2>Estudiantes</h2>
          <p>Ordena la salida al tatami con el número de evaluación.</p>
        </div>
        <div class="btn-row">
          <button class="btn btn-secondary" id="loadSheetStudentsBtn" type="button">Cargar desde base de datos</button>
          <button class="btn btn-secondary" id="addStudentBtn" type="button">Añadir estudiante</button>
        </div>
      </div>
      <div id="sheetStudentsArea"></div>
      <div id="studentsArea" class="card-list"></div>
      <div class="section-head" style="margin-top:22px">
        <div>
          <h2>Examinadores</h2>
          <p>Se generará un enlace único para cada examinador.</p>
        </div>
        <button class="btn btn-secondary" id="addExaminerBtn" type="button">Añadir examinador</button>
      </div>
      <div id="examinersArea" class="card-list"></div>
      <button class="btn btn-success" type="submit" style="margin-top:24px">${isEditing ? 'Guardar cambios del examen' : 'Crear examen y enlaces'}</button>
    </form>
  `;

  populateExamGradeOptions();
  if (draftSource) {
    $('#examTitle').value = draftSource.title || '';
    $('#examProgram').value = draftSource.program_type || 'adultos';
    populateExamGradeOptions();
    $('#examGrade').value = draftSource.grade || '';
    $('#passPercentage').value = Number(draftSource.pass_percentage || 65);
    $('#examFolder').value = draftSource.folder_id || '';
    $('#passLabel').textContent = `${$('#passPercentage').value}%`;
    renderTemplateTechniques(draftSource);
    if (isEditing) {
      (draftSource.students || []).forEach((student) => addStudentRow(student));
      (draftSource.examiners || []).forEach((examiner) => addExaminerRow(examiner));
    }
    if (template) state.examTemplateDraft = null;
  }
  $('#examProgram').addEventListener('change', async () => {
    populateExamGradeOptions();
    renderTechniquesForGrade();
    $('#sheetStudentsArea').innerHTML = '';
    await loadTechniqueSummariesForGrade(selectedSourceGrade());
  });
  $('#examGrade').addEventListener('change', async () => {
    renderTechniquesForGrade();
    $('#sheetStudentsArea').innerHTML = '';
    await loadTechniqueSummariesForGrade(selectedSourceGrade());
  });
  $('#passPercentage').addEventListener('input', () => { $('#passLabel').textContent = `${$('#passPercentage').value}%`; });
  $('#loadSheetStudentsBtn').addEventListener('click', loadSheetStudentsForExam);
  $('#addStudentBtn').addEventListener('click', addStudentRow);
  $('#addExaminerBtn').addEventListener('click', addExaminerRow);
  $('#examForm').addEventListener('submit', isEditing ? updateExistingExam : createExam);
  $('#cancelExamEdit')?.addEventListener('click', () => {
    const examId = state.examEditDraft?.id;
    state.examEditDraft = null;
    switchTab('exams');
    if (examId) viewExamDetails(examId);
  });
  if (!isEditing) {
    addStudentRow();
    addExaminerRow();
  }
}

function selectedProgramType() {
  return $('#examProgram')?.value || 'adultos';
}

function isProgressiveKidsProgram(programType = selectedProgramType()) {
  return programType === 'ninos_progresivo';
}

function isDanTribunalProgram(programType = selectedProgramType()) {
  return programType === 'dan_tribunal';
}

function isKidsTribunalProgram(programType = selectedProgramType()) {
  return programType === 'ninos' || programType === 'ninos_progresivo';
}

function isTribunalResultProgram(programType = selectedProgramType()) {
  return isDanTribunalProgram(programType) || isKidsTribunalProgram(programType);
}

function targetGradeForProgressiveStudent(student, exam) {
  if (!isProgressiveKidsProgram(exam?.program_type)) return exam?.grade || '';

  const studentBeltKey = normalizeBeltKey(student?.student_belt_color || '');
  const match = Object.entries(childrenCurrentGrades).find(([, currentGrade]) => normalizeBeltKey(currentGrade) === studentBeltKey);
  return match?.[0] || exam?.grade || '';
}

function sourceGradeForSheetRegistration(targetGrade, exam) {
  if (isProgressiveKidsProgram(exam?.program_type)) {
    return sourceGradeForExamGrade(targetGrade, 'ninos');
  }
  return exam?.source_grade || sourceGradeForExamGrade(targetGrade, exam?.program_type || 'adultos') || targetGrade;
}

function examinerNamesForTribunalRow(row, exam) {
  const names = row.examinerResults
    .map((item) => item.examinerName)
    .filter(Boolean);

  if (!names.length) {
    names.push(...(exam.links || []).map((link) => link.examiners?.name || '').filter(Boolean));
  }

  return [...new Set(names)].join(' - ') || (isDanTribunalProgram(exam?.program_type) ? 'Tribunal DAN' : 'Tribunal infantil');
}

function selectedSourceGrade() {
  return sourceGradeForExamGrade($('#examGrade')?.value || '', selectedProgramType());
}

function populateExamGradeOptions() {
  const programType = selectedProgramType();
  const gradeSelect = $('#examGrade');
  gradeSelect.innerHTML = `
    <option value="">Selecciona un grado</option>
    ${gradeOptionsForProgram(programType).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}
  `;
  $('#gradeHelp').textContent = isProgressiveKidsProgram(programType)
    ? 'Modo infantil progresivo: todos empiezan juntos. Construye un recorrido completo, coloca cortes y usa varios examinadores si quieres calcular una media final.'
    : isDanTribunalProgram(programType)
      ? 'Modo DAN tribunal: varios examinadores evalúan el mismo examen y el panel calcula la media final por alumno.'
      : programType === 'ninos'
      ? 'Selecciona el grado infantil objetivo. La app propondrá el temario adulto equivalente y permitirá media final si participan varios examinadores.'
      : 'Selecciona el grado objetivo del examen: Minarai/Blanco examina 5 KYU, 5 KYU examina 4 KYU, 4 KYU examina 3 KYU, y así sucesivamente.';
}

function renderTechniquesForGrade() {
  const grade = $('#examGrade').value;
  const programType = selectedProgramType();
  if (isProgressiveKidsProgram(programType)) {
    renderProgressiveKidsBuilder();
    return;
  }
  const sourceGrade = sourceGradeForExamGrade(grade, programType);
  const orderedItems = getOrderedTechniqueItems(grade, programType);
  const previousGohoJuhoItems = getPreviousGohoJuhoTechniqueItems(grade, programType);
  const blocks = groupTechniqueItemsBySection(orderedItems);
  state.techniqueRowCounter = 0;
  $('#techniquesArea').innerHTML = `
    ${programType === 'ninos' && grade ? `<div class="notice">Examen infantil ${escapeHtml(gradeLabel(grade))}: se propone el temario adulto de ${escapeHtml(gradeLabel(sourceGrade))}.</div>` : ''}
    ${isDanTribunalProgram(programType) && grade ? `<div class="notice">Examen DAN tribunal ${escapeHtml(gradeLabel(grade))}: añade varios examinadores para calcular la media final del tribunal.</div>` : ''}
    ${blocks.map(([block, techniques]) => `
      <section class="tech-block">
        <h3>${escapeHtml(block)}</h3>
        ${techniques.map((item, index) => renderTechniqueEditor(item, `${slugifyId(block)}-${index}`)).join('')}
      </section>
    `).join('')}
    ${grade ? `
      <section class="tech-block custom-tech-block">
        <div class="tech-block-head">
          <h3>Técnicas añadidas</h3>
          <button class="btn btn-secondary btn-small" id="addCustomTechniqueBtn" type="button">Añadir técnica</button>
        </div>
        <p class="helper-text">Solo se guardarán en este examen concreto.</p>
        <div class="field technique-position-field">
          <label for="insertTechniquePosition">Dónde colocar la técnica añadida</label>
          <select id="insertTechniquePosition"></select>
        </div>
        ${previousGohoJuhoItems.length ? `
          <div class="previous-technique-picker">
            <div class="field">
              <label for="previousTechniqueSelect">Añadir Goho/Juho de grados anteriores</label>
              <select id="previousTechniqueSelect">
                <option value="">Selecciona una técnica</option>
                ${previousGohoJuhoItems.map((item, index) => `
                  <option value="${index}">${escapeHtml(item.gradeLabel)} · ${escapeHtml(item.section)} · ${escapeHtml(item.name)}</option>
                `).join('')}
              </select>
            </div>
            <button class="btn btn-secondary btn-small" id="addPreviousTechniqueBtn" type="button">Añadir seleccionada</button>
          </div>
        ` : '<p class="helper-text">No hay grados anteriores para añadir Goho/Juho.</p>'}
        <div id="customTechniquesArea" class="custom-techniques"></div>
      </section>
    ` : ''}
  `;
  $('#addCustomTechniqueBtn')?.addEventListener('click', addCustomTechniqueRow);
  $('#addPreviousTechniqueBtn')?.addEventListener('click', () => addPreviousTechniqueRow(previousGohoJuhoItems));
  bindTechniqueOrderInputs();
  refreshTechniquePositionOptions();
}

function progressiveCutOptions() {
  return [
    ['Blanco (Minarai)', 'Minarai / Blanco'],
    ['Blanco-Amarillo', 'Blanco-Amarillo'],
    ['Amarillo', '5 KYU / Amarillo'],
    ['Amarillo-Naranja', 'Amarillo-Naranja'],
    ['Naranja', '4 KYU / Naranja'],
    ['Naranja-Verde', 'Naranja-Verde'],
    ['Verde', '3 KYU / Verde'],
    ['Verde-Azul', 'Verde-Azul'],
    ['Azul', '2 KYU / Azul'],
    ['Azul-Marron', 'Azul-Marron'],
  ];
}

function progressiveSyllabusItems() {
  const seen = new Set();
  return grades
    .filter(([grade]) => ['5kyu', '4kyu', '3kyu', '2kyu', '1kyu'].includes(grade))
    .flatMap(([grade, gradeName]) => getOrderedTechniqueItems(grade).map((item) => ({
      ...item,
      source_grade: item.source_grade || grade,
      gradeLabel: gradeName,
    })))
    .filter((item) => {
      const key = `${item.source_grade}|${item.section}|${item.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function renderProgressiveKidsBuilder(items = []) {
  const grade = $('#examGrade')?.value || '';
  const syllabusItems = progressiveSyllabusItems();
  state.techniqueRowCounter = 0;
  $('#techniquesArea').innerHTML = `
    <section class="tech-block progressive-builder">
      <div class="tech-block-head">
        <div>
          <h3>Recorrido progresivo infantil</h3>
          <p class="helper-text">Añade ejercicios en el orden real del examen y coloca cortes para indicar cuándo se sienta cada grupo.</p>
        </div>
      </div>
      ${grade ? `<div class="notice">Grado máximo previsto: ${escapeHtml(gradeLabel(grade))}. Los alumnos de grados bajos terminarán en el corte que coloques.</div>` : ''}
      <div class="progressive-tools">
        <div class="field">
          <label for="progressiveSyllabusSelect">Añadir desde syllabus kyu completo</label>
          <select id="progressiveSyllabusSelect">
            <option value="">Selecciona técnica o concepto</option>
            ${syllabusItems.map((item, index) => `
              <option value="${index}">${escapeHtml(item.gradeLabel)} · ${escapeHtml(item.section)} · ${escapeHtml(item.name)}</option>
            `).join('')}
          </select>
        </div>
        <button class="btn btn-secondary btn-small" id="addProgressiveSyllabusItem" type="button">Añadir del syllabus</button>
        <button class="btn btn-secondary btn-small" id="openProgressiveBank" type="button">Seleccionar varios</button>
        <button class="btn btn-secondary btn-small" id="sortProgressiveRows" type="button">Ordenar por número</button>
        <div class="field">
          <label for="progressiveCutSelect">Añadir corte</label>
          <select id="progressiveCutSelect">
            ${progressiveCutOptions().map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-secondary btn-small" id="addProgressiveCut" type="button">Añadir corte</button>
      </div>
      <div id="progressiveRows" class="progressive-rows">
        ${items.map((item, index) => renderProgressiveKidsRow(withProgressiveOrder(item, index))).join('')}
      </div>
      <aside class="progressive-cut-preview" id="progressiveCutPreview">
        <h3>Vista previa de cortes</h3>
        <p class="helper-text">Añade alumnos y cortes para comprobar quién se sienta y quién continúa antes de crear el examen.</p>
      </aside>
      <div class="progressive-manual-entry">
        <h3>Añadir ejercicio manual</h3>
        <div class="progressive-manual-grid">
          <div class="field">
            <label for="progressiveManualOrder">Orden</label>
            <input id="progressiveManualOrder" type="number" step="0.1" placeholder="Siguiente" />
          </div>
          <div class="field">
            <label for="progressiveManualSection">Sección</label>
            <input id="progressiveManualSection" value="Ejercicios añadidos" />
          </div>
          <div class="field">
            <label for="progressiveManualName">Ejercicio / concepto</label>
            <input id="progressiveManualName" placeholder="Ej. Seiza, sakuza, migi/hidari..." />
          </div>
          <label class="technique-weight">
            <span>Peso</span>
            <select id="progressiveManualWeight" aria-label="Peso de ejercicio manual">
              ${[1, 2, 3, 4, 5].map((weight) => `<option value="${weight}">${weight}</option>`).join('')}
            </select>
          </label>
          <button class="btn btn-secondary btn-small" id="addProgressiveManualItem" type="button">Añadir ejercicio</button>
        </div>
      </div>
    </section>
  `;
  $('#addProgressiveSyllabusItem')?.addEventListener('click', () => {
    const item = syllabusItems[Number($('#progressiveSyllabusSelect')?.value)];
    if (!item) return;
    addProgressiveKidsRow({
      ...item,
      type: 'technique',
      weight: item.weight || 1,
      summary: techniqueSummary(item),
    });
    $('#progressiveSyllabusSelect').value = '';
  });
  $('#openProgressiveBank')?.addEventListener('click', () => openProgressiveSyllabusBank(syllabusItems));
  $('#sortProgressiveRows')?.addEventListener('click', () => {
    sortProgressiveRowsByOrder();
    updateProgressiveCutPreview();
  });
  $('#addProgressiveManualItem')?.addEventListener('click', addProgressiveManualEntry);
  $('#addProgressiveCut')?.addEventListener('click', () => {
    const cutBelt = $('#progressiveCutSelect')?.value || 'Blanco (Minarai)';
    addProgressiveKidsRow(progressiveCutItem(cutBelt, nextProgressiveOrder()));
  });
  bindProgressiveKidsRows();
  updateProgressiveManualNextOrder();
  bindProgressiveCutPreviewInputs();
  updateProgressiveCutPreview();
}

function withProgressiveOrder(item, index) {
  return {
    ...item,
    order: Number(item?.order ?? item?.order_number ?? index + 1),
  };
}

function progressiveRowOrders() {
  return $$('[data-progressive-row]')
    .map((row) => Number($('[data-progressive-order]', row)?.value))
    .filter((value) => Number.isFinite(value));
}

function progressiveOrderInput(row) {
  return $('[data-progressive-order]', row);
}

function progressiveRowOrder(row) {
  return Number(progressiveOrderInput(row)?.value || 0);
}

function nextProgressiveOrder() {
  const orders = progressiveRowOrders();
  return orders.length ? Math.max(...orders) + 1 : 1;
}

function updateProgressiveManualNextOrder() {
  const input = $('#progressiveManualOrder');
  if (input && !input.value) input.placeholder = String(nextProgressiveOrder());
}

function addProgressiveManualEntry() {
  const nameInput = $('#progressiveManualName');
  const name = nameInput?.value.trim() || '';
  if (!name) {
    showErrors('Escribe el nombre del ejercicio manual.');
    return;
  }
  const orderInput = $('#progressiveManualOrder');
  const sectionInput = $('#progressiveManualSection');
  const weightInput = $('#progressiveManualWeight');
  addProgressiveKidsRow({
    type: 'technique',
    section: sectionInput?.value.trim() || 'Ejercicios añadidos',
    source_grade: selectedSourceGrade(),
    name,
    original_name: name,
    weight: Number(weightInput?.value || 1),
    summary: '',
    order: Number(orderInput?.value || nextProgressiveOrder()),
  });
  if (nameInput) nameInput.value = '';
  if (orderInput) orderInput.value = '';
  if (weightInput) weightInput.value = '1';
  updateProgressiveManualNextOrder();
  nameInput?.focus();
}

function openProgressiveSyllabusBank(syllabusItems = progressiveSyllabusItems()) {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="dialog-backdrop">
      <section class="dialog-card progressive-bank-dialog" role="dialog" aria-modal="true" aria-labelledby="progressiveBankTitle">
        <div class="dialog-head">
          <div>
            <h2 id="progressiveBankTitle">Banco de ejercicios</h2>
            <p>Marca varias técnicas o conceptos y añádelos al recorrido progresivo.</p>
          </div>
          <button class="btn btn-secondary btn-small" id="closeProgressiveBank" type="button">Cerrar</button>
        </div>
        <div class="progressive-bank-toolbar">
          <div class="field">
            <label for="progressiveBankSearch">Buscar</label>
            <input id="progressiveBankSearch" placeholder="Ej. daisharin, seiza, geri, gamae..." />
          </div>
          <button class="btn btn-secondary btn-small" id="clearProgressiveBankSelection" type="button">Limpiar selección</button>
          <button class="btn btn-primary btn-small" id="addProgressiveBankSelection" type="button">Añadir seleccionados</button>
        </div>
        <div class="progressive-bank-list" id="progressiveBankList">
          ${renderProgressiveBankItems(syllabusItems)}
        </div>
      </section>
    </div>
  `);

  $('#closeProgressiveBank').addEventListener('click', closeProgressiveSyllabusBank);
  $('#clearProgressiveBankSelection').addEventListener('click', () => {
    $$('.progressive-bank-check').forEach((input) => { input.checked = false; });
  });
  $('#addProgressiveBankSelection').addEventListener('click', () => {
    const selectedItems = $$('.progressive-bank-check:checked')
      .map((input) => syllabusItems[Number(input.dataset.itemIndex)])
      .filter(Boolean);
    if (!selectedItems.length) {
      showErrors('Selecciona al menos un ejercicio del banco.');
      return;
    }
    selectedItems.forEach((item) => addProgressiveKidsRow({
      ...item,
      type: 'technique',
      weight: item.weight || 1,
      summary: techniqueSummary(item),
      order: nextProgressiveOrder(),
    }));
    closeProgressiveSyllabusBank();
  });
  $('#progressiveBankSearch').addEventListener('input', (event) => {
    filterProgressiveBank(event.target.value);
  });
}

function closeProgressiveSyllabusBank() {
  $('.progressive-bank-dialog')?.closest('.dialog-backdrop')?.remove();
}

function renderProgressiveBankItems(syllabusItems) {
  return groupTechniqueItemsBySection(syllabusItems).map(([section, items]) => `
    <section class="progressive-bank-section">
      <h3>${escapeHtml(section || 'Ejercicios')}</h3>
      <div class="progressive-bank-items">
        ${items.map((item) => {
          const globalIndex = syllabusItems.indexOf(item);
          const searchText = `${item.gradeLabel} ${item.section} ${item.name}`.toLowerCase();
          return `
            <label class="progressive-bank-item" data-bank-search="${escapeHtml(searchText)}">
              <input class="progressive-bank-check" type="checkbox" data-item-index="${globalIndex}" />
              <span>
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.gradeLabel)} · ${escapeHtml(item.section)}</small>
              </span>
            </label>
          `;
        }).join('')}
      </div>
    </section>
  `).join('');
}

function filterProgressiveBank(query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  $$('.progressive-bank-item').forEach((item) => {
    item.hidden = normalizedQuery && !item.dataset.bankSearch.includes(normalizedQuery);
  });
  $$('.progressive-bank-section').forEach((section) => {
    section.hidden = !$('.progressive-bank-item:not([hidden])', section);
  });
}

function progressiveCutItem(cutBelt, order = nextProgressiveOrder()) {
  return {
    type: 'cut',
    section: 'Corte de grado',
    name: `Corte: se sientan ${cutBelt}`,
    original_name: `Corte: se sientan ${cutBelt}`,
    cut_belt: cutBelt,
    weight: 1,
    order,
    summary: 'Aviso para retirar del examen a este grupo.',
  };
}

function normalizeBeltKey(value) {
  const simple = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*-\s*/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!simple) return '';
  if (simple.includes('blanco') && simple.includes('amarillo')) return 'blanco-amarillo';
  if (simple.includes('amarillo') && simple.includes('naranja')) return 'amarillo-naranja';
  if (simple.includes('naranja') && simple.includes('verde')) return 'naranja-verde';
  if (simple.includes('verde') && simple.includes('azul')) return 'verde-azul';
  if (simple.includes('azul') && simple.includes('marron')) return 'azul-marron';
  if (simple.includes('blanco') || simple.includes('minarai')) return 'blanco';
  if (simple.includes('amarillo') || simple.includes('5 kyu') || simple.includes('5kyu')) return 'amarillo';
  if (simple.includes('naranja') || simple.includes('4 kyu') || simple.includes('4kyu')) return 'naranja';
  if (simple.includes('verde') || simple.includes('3 kyu') || simple.includes('3kyu')) return 'verde';
  if (simple.includes('azul') || simple.includes('2 kyu') || simple.includes('2kyu')) return 'azul';
  if (simple.includes('marron') || simple.includes('1 kyu') || simple.includes('1kyu')) return 'marron';
  if (simple.includes('negro') || simple.includes('dan')) return 'negro';
  return simple;
}

function progressiveDraftStudents() {
  return $$('.student-row').map((row, index) => ({
    id: `draft-${index}`,
    student_name: $('.student-name', row)?.value.trim() || `Alumno ${index + 1}`,
    student_belt_color: $('.student-belt', row)?.value || '',
    order_number: Number($('.student-order', row)?.value || index + 1),
  }))
    .filter((student) => student.student_name)
    .sort((a, b) => Number(a.order_number || 0) - Number(b.order_number || 0));
}

function studentPreviewLine(student) {
  return `${student.student_name} · ${student.student_belt_color || 'sin cinturón'}`;
}

function renderPreviewStudentList(students, emptyText) {
  if (!students.length) return `<p class="progressive-preview-empty">${escapeHtml(emptyText)}</p>`;
  return `
    <ul>
      ${students.map((student) => `<li>${escapeHtml(studentPreviewLine(student))}</li>`).join('')}
    </ul>
  `;
}

function buildProgressiveCutPreview() {
  const students = progressiveDraftStudents();
  const techniques = collectProgressiveKidsTechniques();
  const cuts = techniques.filter((item) => item.type === 'cut');
  let activeStudents = students.slice();

  return cuts.map((cut) => {
    const cutKey = normalizeBeltKey(cut.cut_belt);
    const seated = activeStudents.filter((student) => normalizeBeltKey(student.student_belt_color) === cutKey);
    const continuing = activeStudents.filter((student) => normalizeBeltKey(student.student_belt_color) !== cutKey);
    const result = {
      cut,
      seated,
      continuing,
      warnings: [],
    };

    if (!seated.length) {
      result.warnings.push('Este corte no sienta a ningún alumno activo. Revisa el cinturón elegido o la posición del corte.');
    }
    if (!continuing.length) {
      result.warnings.push('Después de este corte no queda ningún alumno activo para las siguientes técnicas.');
    }

    activeStudents = continuing;
    return result;
  });
}

function updateProgressiveCutPreview() {
  const preview = $('#progressiveCutPreview');
  if (!preview) return;

  const students = progressiveDraftStudents();
  const previewRows = buildProgressiveCutPreview();
  const techniques = collectProgressiveKidsTechniques();
  const evaluableAfterLastCut = (() => {
    const lastCutIndex = techniques.map((item) => item.type).lastIndexOf('cut');
    return lastCutIndex >= 0 ? techniques.slice(lastCutIndex + 1).some((item) => item.type !== 'cut') : true;
  })();

  preview.innerHTML = `
    <h3>Vista previa de cortes</h3>
    <p class="helper-text">Comprueba aquí el efecto real de cada corte antes de crear el examen.</p>
    ${!students.length ? '<div class="notice">Añade o carga alumnos para ver quién se sienta y quién continúa.</div>' : ''}
    ${students.length && !previewRows.length ? '<div class="notice">Todavía no hay cortes. Si todos los alumnos no deben llegar hasta el final, añade cortes en el recorrido.</div>' : ''}
    ${previewRows.map((row, index) => `
      <section class="progressive-preview-cut ${row.warnings.length ? 'has-warning' : ''}">
        <div class="progressive-preview-head">
          <strong>Corte ${index + 1}: se sientan ${escapeHtml(row.cut.cut_belt)}</strong>
          <span>Orden ${escapeHtml(row.cut.order || index + 1)}</span>
        </div>
        <div class="progressive-preview-grid">
          <div>
            <h4>Se sientan ahora</h4>
            ${renderPreviewStudentList(row.seated, 'Ningún alumno se sienta en este corte.')}
          </div>
          <div>
            <h4>Continúan después</h4>
            ${renderPreviewStudentList(row.continuing, 'No queda ningún alumno activo después de este corte.')}
          </div>
        </div>
        ${row.warnings.length ? `<div class="notice error">${row.warnings.map(escapeHtml).join('<br />')}</div>` : ''}
      </section>
    `).join('')}
    ${previewRows.length && !evaluableAfterLastCut ? '<div class="notice error">El recorrido termina justo después de un corte. Si quieres evaluar algo más, añade técnicas después del último corte.</div>' : ''}
  `;
}

function bindProgressiveCutPreviewInputs() {
  $$('.student-row input, .student-row select').forEach((input) => {
    input.removeEventListener('input', updateProgressiveCutPreview);
    input.removeEventListener('change', updateProgressiveCutPreview);
    input.addEventListener('input', updateProgressiveCutPreview);
    input.addEventListener('change', updateProgressiveCutPreview);
  });
}

function renderProgressiveKidsRow(item = {}) {
  const rowId = nextTechniqueRowId();
  if (item.type === 'cut') {
    const cutBelt = item.cut_belt || 'MINARAI';
    return `
      <div class="progressive-row progressive-cut-row" data-progressive-row data-progressive-type="cut" data-technique-row-id="${escapeHtml(rowId)}">
        <div class="field progressive-order-field">
          <label>Orden</label>
          <input data-progressive-order type="number" step="0.1" value="${escapeHtml(item.order ?? nextProgressiveOrder())}" />
        </div>
        <div class="field">
          <label>Se sientan</label>
          <select data-progressive-cut-belt>
            ${progressiveCutOptions().map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === cutBelt ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
          </select>
        </div>
        <p class="helper-text">Este paso no puntúa. A partir de aquí esos alumnos dejan de aparecer en las técnicas siguientes.</p>
        <div class="custom-technique-actions">
          <button class="btn btn-danger btn-small" type="button" data-remove-progressive>Eliminar</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="progressive-row" data-progressive-row data-progressive-type="technique" data-technique-row-id="${escapeHtml(rowId)}">
      <div class="field progressive-order-field">
        <label>Orden</label>
        <input data-progressive-order type="number" step="0.1" value="${escapeHtml(item.order ?? nextProgressiveOrder())}" />
      </div>
      <div class="field">
        <label>Sección</label>
        <input data-progressive-section value="${escapeHtml(item.section || 'Ejercicios')}" />
      </div>
      <div class="field">
        <label>Ejercicio / técnica</label>
        <input data-progressive-name value="${escapeHtml(techniqueName(item))}" placeholder="Ej. Seiza, Hidari chudan gamae, Daisharin..." />
      </div>
      <label class="technique-weight">
        <span>Peso</span>
        <select data-progressive-weight aria-label="Peso de ejercicio">
          ${[1, 2, 3, 4, 5].map((weight) => `<option value="${weight}" ${Number(item.weight || 1) === weight ? 'selected' : ''}>${weight}</option>`).join('')}
        </select>
      </label>
      <input type="hidden" data-progressive-grade value="${escapeHtml(item.source_grade || selectedSourceGrade())}" />
      <input type="hidden" data-progressive-original-name value="${escapeHtml(item.original_name || techniqueName(item))}" />
      <input type="hidden" data-progressive-summary value="${escapeHtml(item.summary || techniqueSummary(item))}" />
      <div class="custom-technique-actions">
        <button class="btn btn-danger btn-small" type="button" data-remove-progressive>Eliminar</button>
      </div>
    </div>
  `;
}

function addProgressiveKidsRow(item) {
  const container = $('#progressiveRows');
  if (!container) return;
  container.insertAdjacentHTML('beforeend', renderProgressiveKidsRow(item));
  const row = container.lastElementChild;
  applyProgressiveInsertionOrder(row);
  bindProgressiveKidsRows();
  updateProgressiveManualNextOrder();
  updateProgressiveCutPreview();
}

function bindProgressiveKidsRows() {
  $$('[data-remove-progressive]').forEach((button) => {
    button.onclick = () => {
      button.closest('[data-progressive-row]')?.remove();
      updateProgressiveManualNextOrder();
      updateProgressiveCutPreview();
    };
  });
  $$('[data-progressive-order]').forEach((input) => {
    input.onchange = () => {
      applyProgressiveInsertionOrder(input.closest('[data-progressive-row]'));
      updateProgressiveCutPreview();
    };
  });
  $$('[data-progressive-cut-belt]').forEach((select) => {
    select.onchange = updateProgressiveCutPreview;
  });
}

function collectProgressiveKidsTechniques() {
  return $$('[data-progressive-row]').map((row, index) => {
    const order = Number($('[data-progressive-order]', row)?.value || index + 1);
    if (row.dataset.progressiveType === 'cut') {
      const cutBelt = $('[data-progressive-cut-belt]', row)?.value || 'Blanco (Minarai)';
      return progressiveCutItem(cutBelt, order);
    }
    const name = $('[data-progressive-name]', row)?.value.trim() || '';
    const originalName = $('[data-progressive-original-name]', row)?.value.trim() || name;
    return {
      type: 'technique',
      section: $('[data-progressive-section]', row)?.value.trim() || 'Ejercicios',
      source_grade: $('[data-progressive-grade]', row)?.value.trim() || selectedSourceGrade(),
      name,
      original_name: originalName,
      weight: Number($('[data-progressive-weight]', row)?.value || 1),
      order,
      summary: $('[data-progressive-summary]', row)?.value.trim() || '',
    };
  }).filter((item) => item.type === 'cut' || item.name)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function sortProgressiveRowsByOrder() {
  const container = $('#progressiveRows');
  if (!container) return;
  $$('[data-progressive-row]', container)
    .sort((a, b) => {
      const orderA = progressiveRowOrder(a);
      const orderB = progressiveRowOrder(b);
      return orderA - orderB;
    })
    .forEach((row) => container.appendChild(row));
  updateProgressiveManualNextOrder();
}

function applyProgressiveInsertionOrder(activeRow) {
  const container = $('#progressiveRows');
  if (!container || !activeRow) return;

  const activeInput = progressiveOrderInput(activeRow);
  const desiredOrder = Number(activeInput?.value || nextProgressiveOrder());
  if (!Number.isFinite(desiredOrder) || desiredOrder <= 0) {
    activeInput.value = String(nextProgressiveOrder());
    return;
  }

  const rows = $$('[data-progressive-row]', container).filter((row) => row !== activeRow);
  const desiredIsWhole = Number.isInteger(desiredOrder);
  const occupiedWholeOrder = rows.some((row) => progressiveRowOrder(row) === desiredOrder);

  if (desiredIsWhole && occupiedWholeOrder) {
    rows
      .sort((a, b) => progressiveRowOrder(b) - progressiveRowOrder(a))
      .forEach((row) => {
        const input = progressiveOrderInput(row);
        const order = Number(input?.value || 0);
        if (Number.isInteger(order) && order >= desiredOrder) {
          input.value = String(order + 1);
        }
      });
  }

  activeInput.value = Number.isInteger(desiredOrder) ? String(desiredOrder) : String(desiredOrder);
  sortProgressiveRowsByOrder();
}

function renderTemplateTechniques(template) {
  const grade = $('#examGrade').value;
  const programType = selectedProgramType();
  if (isProgressiveKidsProgram(programType)) {
    renderProgressiveKidsBuilder(template.techniques || []);
    return;
  }
  const sourceGrade = template.source_grade || sourceGradeForExamGrade(grade, programType);
  const previousGohoJuhoItems = getPreviousGohoJuhoTechniqueItems(grade, programType);
  const blocks = groupTechniqueItemsBySection(template.techniques || []);
  state.techniqueRowCounter = 0;
  $('#techniquesArea').innerHTML = `
    <div class="notice">Copia cargada desde "${escapeHtml(template.original_title || 'examen anterior')}". Puedes cambiar técnicas, pesos, alumnos y examinadores antes de crear el nuevo examen.</div>
    ${programType === 'ninos' && grade ? `<div class="notice">Examen infantil ${escapeHtml(gradeLabel(grade))}: usa como base el temario adulto de ${escapeHtml(gradeLabel(sourceGrade))}.</div>` : ''}
    ${blocks.map(([block, techniques]) => `
      <section class="tech-block">
        <h3>${escapeHtml(block || 'Técnicas')}</h3>
        ${techniques.map((item, index) => renderTechniqueEditor(item, `${slugifyId(block)}-${index}`)).join('')}
      </section>
    `).join('')}
    ${grade ? `
      <section class="tech-block custom-tech-block">
        <div class="tech-block-head">
          <h3>Técnicas añadidas</h3>
          <button class="btn btn-secondary btn-small" id="addCustomTechniqueBtn" type="button">Añadir técnica</button>
        </div>
        <p class="helper-text">Solo se guardarán en este examen concreto.</p>
        <div class="field technique-position-field">
          <label for="insertTechniquePosition">Dónde colocar la técnica añadida</label>
          <select id="insertTechniquePosition"></select>
        </div>
        ${previousGohoJuhoItems.length ? `
          <div class="previous-technique-picker">
            <div class="field">
              <label for="previousTechniqueSelect">Añadir Goho/Juho de grados anteriores</label>
              <select id="previousTechniqueSelect">
                <option value="">Selecciona una técnica</option>
                ${previousGohoJuhoItems.map((item, index) => `
                  <option value="${index}">${escapeHtml(item.gradeLabel)} · ${escapeHtml(item.section)} · ${escapeHtml(item.name)}</option>
                `).join('')}
              </select>
            </div>
            <button class="btn btn-secondary btn-small" id="addPreviousTechniqueBtn" type="button">Añadir seleccionada</button>
          </div>
        ` : '<p class="helper-text">No hay grados anteriores para añadir Goho/Juho.</p>'}
        <div id="customTechniquesArea" class="custom-techniques"></div>
      </section>
    ` : ''}
  `;
  $('#addCustomTechniqueBtn')?.addEventListener('click', addCustomTechniqueRow);
  $('#addPreviousTechniqueBtn')?.addEventListener('click', () => addPreviousTechniqueRow(previousGohoJuhoItems));
  bindTechniqueOrderInputs();
  refreshTechniquePositionOptions();
}

function groupTechniqueItemsBySection(items) {
  const sections = [];
  items.forEach((item) => {
    const last = sections[sections.length - 1];
    if (last && last[0] === item.section) {
      last[1].push(item);
    } else {
      sections.push([item.section, [item]]);
    }
  });
  return sections;
}

function slugifyId(value) {
  return String(value || 'tech')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tech';
}

function renderTechniqueEditor(item, id) {
  const inputId = `techniqueName-${id}`;
  const name = techniqueName(item);
  const originalName = item?.original_name || name;
  const grade = item?.source_grade || selectedSourceGrade();
  const weightValue = Number(item?.weight || 1);
  const rowId = nextTechniqueRowId();
  const orderValue = Number(item?.order || item?.order_number || state.techniqueRowCounter);
  return `
    <div class="tech-item technique-editor" data-technique-row data-technique-row-id="${escapeHtml(rowId)}">
      <label class="technique-check">
        <input type="checkbox" data-technique data-section="${escapeHtml(item.section)}" data-grade="${escapeHtml(grade)}" data-original-name="${escapeHtml(originalName)}" value="${escapeHtml(name)}" checked />
        <span class="sr-only">Incluir técnica</span>
      </label>
      <label class="technique-order">
        <span>Orden</span>
        <input data-technique-order type="number" step="0.1" value="${escapeHtml(orderValue)}" />
      </label>
      <div class="field technique-name-field">
        <label for="${escapeHtml(inputId)}">Técnica</label>
        <input id="${escapeHtml(inputId)}" class="technique-name-input" data-technique-name value="${escapeHtml(name)}" aria-label="Nombre de técnica" />
      </div>
      <label class="technique-weight">
        <span>Peso</span>
        <select data-technique-weight aria-label="Peso de técnica">
          ${[1, 2, 3, 4, 5].map((weight) => `<option value="${weight}" ${weight === weightValue ? 'selected' : ''}>${weight}</option>`).join('')}
        </select>
      </label>
    </div>
  `;
}

function nextTechniqueRowId() {
  state.techniqueRowCounter += 1;
  return `tech-row-${state.techniqueRowCounter}`;
}

function addCustomTechniqueRow() {
  state.customTechniqueCounter += 1;
  const index = state.customTechniqueCounter;
  addTechniqueRow({
    inputId: `customTechniqueName-${index}`,
    section: 'Técnicas añadidas',
    grade: selectedSourceGrade(),
    name: '',
    label: 'Nombre de técnica',
    placeholder: 'Ej. Defensa especial para este examen',
  });
}

function addPreviousTechniqueRow(previousGohoJuhoItems) {
  const select = $('#previousTechniqueSelect');
  const item = previousGohoJuhoItems[Number(select?.value)];
  if (!item) return;

  state.customTechniqueCounter += 1;
  const index = state.customTechniqueCounter;
  addTechniqueRow({
    inputId: `customTechniqueName-${index}`,
    section: `Repaso ${item.gradeLabel} · ${item.section}`,
    grade: item.grade,
    name: item.name,
    label: 'Técnica añadida desde grado anterior',
    placeholder: '',
  });
  select.value = '';
}

function addTechniqueRow({ inputId, section, grade, name, label, placeholder }) {
  const rowId = nextTechniqueRowId();
  $('#customTechniquesArea').insertAdjacentHTML('beforeend', `
    <div class="custom-technique-row" data-technique-row data-technique-row-id="${escapeHtml(rowId)}">
      <div class="drag-handle" title="Orden" aria-hidden="true">↕</div>
      <input type="checkbox" data-technique data-section="${escapeHtml(section)}" data-grade="${escapeHtml(grade)}" data-original-name="${escapeHtml(name)}" value="${escapeHtml(name)}" checked hidden />
      <label class="technique-order">
        <span>Orden</span>
        <input data-technique-order type="number" step="0.1" value="${escapeHtml(nextTechniqueOrder())}" />
      </label>
      <div class="field">
        <label for="${escapeHtml(inputId)}">${escapeHtml(label)}</label>
        <input id="${escapeHtml(inputId)}" class="technique-name-input" data-technique-name value="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}" />
      </div>
      <label class="technique-weight">
        <span>Peso</span>
        <select data-technique-weight aria-label="Peso de técnica">
          ${[1, 2, 3, 4, 5].map((weight) => `<option value="${weight}">${weight}</option>`).join('')}
        </select>
      </label>
      <div class="custom-technique-actions">
        <button class="btn btn-secondary btn-small" type="button" data-move-custom-technique="up">Subir</button>
        <button class="btn btn-secondary btn-small" type="button" data-move-custom-technique="down">Bajar</button>
        <button class="btn btn-danger btn-small" type="button" data-remove-custom-technique>Eliminar</button>
      </div>
    </div>
  `);
  const row = $(`[data-technique-row-id="${CSS.escape(rowId)}"]`);
  placeTechniqueRow(row, $('#insertTechniquePosition')?.value || '__end__');
  bindCustomTechniqueButtons();
  bindTechniqueOrderInputs();
  applyTechniqueInsertionOrder(row);
  refreshTechniquePositionOptions(rowId);
}

function bindCustomTechniqueButtons() {
  $$('[data-remove-custom-technique]').forEach((button) => {
    button.onclick = () => {
      button.closest('.custom-technique-row').remove();
      refreshTechniquePositionOptions();
    };
  });
  $$('[data-move-custom-technique]').forEach((button) => {
    button.onclick = () => moveCustomTechnique(button.closest('.custom-technique-row'), button.dataset.moveCustomTechnique);
  });
}

function moveCustomTechnique(row, direction) {
  if (!row) return;
  const rows = getTechniqueRows();
  const index = rows.indexOf(row);
  if (direction === 'up' && index > 0) {
    rows[index - 1].before(row);
  }
  if (direction === 'down' && index >= 0 && index < rows.length - 1) {
    rows[index + 1].after(row);
  }
  refreshTechniquePositionOptions(row.dataset.techniqueRowId);
}

function placeTechniqueRow(row, position) {
  if (!row) return;
  if (position === '__start__') {
    const firstTechnique = getTechniqueRows().find((item) => item !== row);
    firstTechnique?.before(row);
    return;
  }
  if (position && position !== '__end__') {
    const target = $(`[data-technique-row-id="${CSS.escape(position)}"]`);
    if (target && target !== row) {
      target.after(row);
    }
  }
}

function getTechniqueRows() {
  return $$('[data-technique-row]', $('#techniquesArea'));
}

function techniqueOrderInput(row) {
  return $('[data-technique-order]', row);
}

function techniqueRowOrder(row) {
  return Number(techniqueOrderInput(row)?.value || 0);
}

function nextTechniqueOrder() {
  const orders = getTechniqueRows()
    .map(techniqueRowOrder)
    .filter((value) => Number.isFinite(value));
  return orders.length ? Math.max(...orders) + 1 : 1;
}

function bindTechniqueOrderInputs() {
  $$('[data-technique-order]').forEach((input) => {
    input.onchange = () => applyTechniqueInsertionOrder(input.closest('[data-technique-row]'));
  });
}

function applyTechniqueInsertionOrder(activeRow) {
  if (!activeRow) return;

  const activeInput = techniqueOrderInput(activeRow);
  const desiredOrder = Number(activeInput?.value || nextTechniqueOrder());
  if (!Number.isFinite(desiredOrder) || desiredOrder <= 0) {
    activeInput.value = String(nextTechniqueOrder());
    return;
  }

  const rows = getTechniqueRows().filter((row) => row !== activeRow);
  const desiredIsWhole = Number.isInteger(desiredOrder);
  const occupiedWholeOrder = rows.some((row) => techniqueRowOrder(row) === desiredOrder);

  if (desiredIsWhole && occupiedWholeOrder) {
    rows
      .sort((a, b) => techniqueRowOrder(b) - techniqueRowOrder(a))
      .forEach((row) => {
        const input = techniqueOrderInput(row);
        const order = Number(input?.value || 0);
        if (Number.isInteger(order) && order >= desiredOrder) {
          input.value = String(order + 1);
        }
      });
  }

  activeInput.value = String(desiredOrder);
  placeTechniqueRowByOrder(activeRow);
  refreshTechniquePositionOptions();
}

function placeTechniqueRowByOrder(activeRow) {
  const activeOrder = techniqueRowOrder(activeRow);
  const rows = getTechniqueRows()
    .filter((row) => row !== activeRow)
    .sort((a, b) => techniqueRowOrder(a) - techniqueRowOrder(b));

  const previous = [...rows].reverse().find((row) => techniqueRowOrder(row) <= activeOrder);
  const next = rows.find((row) => techniqueRowOrder(row) > activeOrder);

  if (previous) {
    previous.after(activeRow);
    return;
  }

  if (next) {
    next.before(activeRow);
  }
}

function refreshTechniquePositionOptions(selectedRowId = '') {
  const select = $('#insertTechniquePosition');
  if (!select) return;

  const rows = getTechniqueRows().filter((row) => row.dataset.techniqueRowId !== selectedRowId);
  const options = [
    ['__end__', 'Al final del examen'],
    ['__start__', 'Al principio del examen'],
    ...rows.map((row) => [row.dataset.techniqueRowId, `Después de: ${getTechniqueRowLabel(row)}`]),
  ];
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join('');
  select.value = selectedRowId ? selectedRowId : '__end__';
  if (!select.value) select.value = '__end__';
}

function getTechniqueRowLabel(row) {
  const section = row.querySelector('[data-technique]')?.dataset.section || 'Técnica';
  const name = row.querySelector('[data-technique-name]')?.value || row.querySelector('[data-technique]')?.value || 'sin nombre';
  return `${section} · ${name}`;
}

function addStudentRow(student = {}) {
  const index = $$('.student-row').length + 1;
  const name = student.student_name || student.name || student.nombre || '';
  const belt = normalizeStudentBelt(student.student_belt_color || student.belt || student.cinturon || student.gradoActual || '');
  const order = Number(student.order_number || student.orden || index);
  const studentRef = student.student_ref || student.alumnoRef || student.AlumnoRef || '';
  const studentSourceId = student.student_source_id || student.alumnoId || student.id || student.ID || '';
  $('#studentsArea').insertAdjacentHTML('beforeend', `
    <div class="row-card student-row">
      <input class="student-ref" type="hidden" value="${escapeHtml(studentRef)}" />
      <input class="student-source-id" type="hidden" value="${escapeHtml(studentSourceId)}" />
      <div class="field">
        <label>Nombre</label>
        <input class="student-name" value="${escapeHtml(name)}" required />
      </div>
      <div class="field">
        <label>Cinturón actual</label>
        <select class="student-belt">
          ${studentBeltOptions(belt)}
        </select>
      </div>
      <div class="field">
        <label>Orden</label>
        <input class="student-order" type="number" min="1" value="${escapeHtml(order)}" />
      </div>
      <button class="btn btn-danger btn-small" type="button" data-remove-row>Eliminar</button>
    </div>
  `);
  bindRemoveButtons();
  if (isProgressiveKidsProgram()) {
    bindProgressiveCutPreviewInputs();
    updateProgressiveCutPreview();
  }
}

function studentBeltOptions(selected = '') {
  const belts = ['Blanco (Minarai)', 'Blanco-Amarillo', 'Amarillo', 'Amarillo-Naranja', 'Naranja', 'Naranja-Verde', 'Verde', 'Verde-Azul', 'Azul', 'Azul-Marron', 'Marrón', 'Negro'];
  const normalized = normalizeStudentBelt(selected);
  return belts.map((belt) => `<option${belt === normalized ? ' selected' : ''}>${escapeHtml(belt)}</option>`).join('');
}

function normalizeStudentBelt(value) {
  const raw = String(value || '').trim();
  const simple = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (!simple) return '';
  if (simple.includes('blanco') && simple.includes('amarillo')) return 'Blanco-Amarillo';
  if (simple.includes('amarillo') && simple.includes('naranja')) return 'Amarillo-Naranja';
  if (simple.includes('naranja') && simple.includes('verde')) return 'Naranja-Verde';
  if (simple.includes('verde') && simple.includes('azul')) return 'Verde-Azul';
  if (simple.includes('azul') && simple.includes('marron')) return 'Azul-Marron';
  if (simple.includes('blanco') || simple.includes('minarai')) return 'Blanco (Minarai)';
  if (simple.includes('amarillo') || simple.includes('5 kyu') || simple.includes('5kyu')) return 'Amarillo';
  if (simple.includes('naranja') || simple.includes('4 kyu') || simple.includes('4kyu')) return 'Naranja';
  if (simple.includes('verde') || simple.includes('3 kyu') || simple.includes('3kyu')) return 'Verde';
  if (simple.includes('azul') || simple.includes('2 kyu') || simple.includes('2kyu')) return 'Azul';
  if (simple.includes('marron') || simple.includes('1 kyu') || simple.includes('1kyu')) return 'Marrón';
  if (simple.includes('negro') || simple.includes('dan')) return 'Negro';
  return raw;
}

function currentGradeForTargetGrade(targetGrade) {
  if (childrenCurrentGrades[targetGrade]) return childrenCurrentGrades[targetGrade];
  const currentGrades = {
    '5kyu': 'MINARAI',
    '4kyu': '5 KYU',
    '3kyu': '4 KYU',
    '2kyu': '3 KYU',
    '1kyu': '2 KYU',
    shodan: '1 KYU',
    nidan: '1 DAN',
    sandan: '2 DAN',
    yondan: '3 DAN',
    godan: '4 DAN',
  };
  return currentGrades[targetGrade] || '';
}

function currentBeltForTargetGrade(targetGrade) {
  const childrenBelts = {
    children_blanco_amarillo: 'Blanco',
    children_5kyu: 'Blanco-Amarillo',
    children_amarillo_naranja: 'Amarillo',
    children_4kyu: 'Amarillo-Naranja',
    children_naranja_verde: 'Naranja',
    children_3kyu: 'Naranja-Verde',
    children_verde_azul: 'Verde',
    children_2kyu: 'Verde-Azul',
    children_azul_marron: 'Azul',
    children_1kyu: 'Azul-Marron',
  };
  if (childrenBelts[targetGrade]) return childrenBelts[targetGrade];
  const belts = {
    '5kyu': 'Blanco (Minarai)',
    '4kyu': 'Amarillo',
    '3kyu': 'Naranja',
    '2kyu': 'Verde',
    '1kyu': 'Azul',
    shodan: 'Marrón',
    nidan: 'Negro',
    sandan: 'Negro',
    yondan: 'Negro',
    godan: 'Negro',
  };
  return belts[targetGrade] || '';
}

function progressiveCurrentGradesForTargetGrade(targetGrade) {
  const orderedTargets = [
    'children_blanco_amarillo',
    'children_5kyu',
    'children_amarillo_naranja',
    'children_4kyu',
    'children_naranja_verde',
    'children_3kyu',
    'children_verde_azul',
    'children_2kyu',
    'children_azul_marron',
    'children_1kyu',
  ];
  const targetIndex = orderedTargets.indexOf(targetGrade);
  const includedTargets = targetIndex >= 0 ? orderedTargets.slice(0, targetIndex + 1) : orderedTargets;
  return includedTargets.map((grade) => currentGradeForTargetGrade(grade)).filter(Boolean);
}

function uniqueSheetStudents(students) {
  const seen = new Set();
  return students.filter((student) => {
    const key = [
      sheetStudentRef(student),
      sheetStudentSourceId(student),
      String(student.nombre || student.name || '').trim().toLowerCase(),
    ].filter(Boolean).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadSheetStudentsForExam() {
  const grade = $('#examGrade')?.value || '';
  const programType = selectedProgramType();
  if (!grade) {
    showErrors('Selecciona primero el grado objetivo del examen.');
    return;
  }

  const savedToken = localStorage.getItem('skbcSheetToken') || '';
  const token = (prompt('Pega el token configurado en Apps Script para leer alumnos:', savedToken) || '').trim();
  if (!token) return;
  localStorage.setItem('skbcSheetToken', token);

  const area = $('#sheetStudentsArea');
  area.innerHTML = '<div class="notice">Cargando alumnos desde la base de datos...</div>';

  try {
    if (isProgressiveKidsProgram(programType)) {
      const currentGrades = progressiveCurrentGradesForTargetGrade(grade);
      const payloads = await Promise.all(currentGrades.map((currentGrade) => fetchSheetStudentsJsonp({
        token,
        programType: 'ninos',
        targetGrade: grade,
        targetGradeLabel: gradeSheetLabel(grade),
        currentGrade,
      })));
      const students = uniqueSheetStudents(payloads.flatMap((payload) =>
        Array.isArray(payload.alumnos) ? payload.alumnos : Array.isArray(payload.students) ? payload.students : []
      ));
      renderSheetStudentPicker(students, grade);
      return;
    }

    const payload = await fetchSheetStudentsJsonp({
      token,
      programType,
      targetGrade: grade,
      targetGradeLabel: gradeSheetLabel(grade),
      currentGrade: currentGradeForTargetGrade(grade),
    });
    const students = Array.isArray(payload.alumnos) ? payload.alumnos : Array.isArray(payload.students) ? payload.students : [];
    renderSheetStudentPicker(students, grade);
  } catch (error) {
    area.innerHTML = `<div class="notice error">${escapeHtml(error.message || 'No se pudieron cargar los alumnos.')}</div>`;
  }
}

function fetchSheetStudentsJsonp({ token, programType, targetGrade, targetGradeLabel, currentGrade }) {
  return new Promise((resolve, reject) => {
    const callbackName = `skbcStudentsCallback_${normalizeToken(8)}`;
    const url = new URL(EXAM_SHEET_WEBAPP_URL);
    url.searchParams.set('accion', 'LISTAR_ALUMNOS_EXAMEN_WEB');
    url.searchParams.set('token', token);
    url.searchParams.set('programa', programType);
    url.searchParams.set('gradoObjetivo', targetGradeLabel);
    url.searchParams.set('gradoObjetivoId', targetGrade);
    url.searchParams.set('gradoActual', currentGrade);
    url.searchParams.set('callback', callbackName);

    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('La base de datos tardó demasiado en responder.'));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    }

    window[callbackName] = (payload) => {
      cleanup();
      if (!payload?.ok) {
        reject(new Error(payload?.error || 'Apps Script no devolvió alumnos.'));
        return;
      }
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('No se pudo conectar con Apps Script.'));
    };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function renderSheetStudentPicker(students, targetGrade) {
  const area = $('#sheetStudentsArea');
  if (!students.length) {
    area.innerHTML = `<div class="notice warning">No se encontraron alumnos para ${escapeHtml(currentGradeForTargetGrade(targetGrade)) || escapeHtml(gradeSheetLabel(targetGrade))}.</div>`;
    return;
  }

  area.innerHTML = `
    <section class="sheet-student-picker">
      <div class="tech-block-head">
        <div>
          <h3>Alumnos encontrados</h3>
          <p class="helper-text">Selecciona los alumnos que se presentan a este examen.</p>
        </div>
        <button class="btn btn-primary btn-small" id="addSelectedSheetStudents" type="button">Añadir seleccionados</button>
      </div>
      <div class="sheet-student-list">
        ${students.map((student, index) => {
          const name = sheetStudentName(student);
          const belt = normalizeStudentBelt(student.cinturon || student.belt || student.gradoActual || currentBeltForTargetGrade(targetGrade));
          const refLabel = sheetStudentRef(student) || sheetStudentSourceId(student);
          return `
            <label class="sheet-student-option">
              <input type="checkbox" data-sheet-student-index="${index}" checked />
              <span>
                <strong>${escapeHtml(name || 'Alumno sin nombre')}</strong>
                <small>${escapeHtml([belt || currentBeltForTargetGrade(targetGrade), refLabel ? `Ref. ${refLabel}` : ''].filter(Boolean).join(' · '))}</small>
              </span>
            </label>
          `;
        }).join('')}
      </div>
    </section>
  `;

  $('#addSelectedSheetStudents').addEventListener('click', () => addSelectedSheetStudents(students, targetGrade));
}

function sheetStudentName(student) {
  return String(student.nombre || student.name || student.alumno || student.student_name || '').trim();
}

function sheetStudentRef(student) {
  return String(student.alumnoRef || student.AlumnoRef || student.student_ref || '').trim();
}

function sheetStudentSourceId(student) {
  return String(student.alumnoId || student.ID || student.id || student.student_source_id || '').trim();
}

function addSelectedSheetStudents(students, targetGrade) {
  const existingNames = new Set($$('.student-name').map((input) => normalizeStudentName(input.value)));
  const selected = $$('[data-sheet-student-index]:checked', $('#sheetStudentsArea'))
    .map((input) => students[Number(input.dataset.sheetStudentIndex)])
    .filter(Boolean);

  let added = 0;
  selected.forEach((student) => {
    const name = sheetStudentName(student);
    if (!name || existingNames.has(normalizeStudentName(name))) return;
    existingNames.add(normalizeStudentName(name));
    addStudentRow({
      student_name: name,
      student_belt_color: student.cinturon || student.belt || student.gradoActual || currentBeltForTargetGrade(targetGrade),
      student_ref: sheetStudentRef(student),
      student_source_id: sheetStudentSourceId(student),
    });
    added += 1;
  });

  notify(added ? `${added} alumno(s) añadidos al examen.` : 'No se añadió ningún alumno nuevo.', added ? 'success' : 'warning');
}

function normalizeStudentName(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function addExaminerRow(examiner = {}) {
  $('#examinersArea').insertAdjacentHTML('beforeend', `
    <div class="row-card examiner-row">
      <div class="field">
        <label>Nombre</label>
        <input class="examiner-name" value="${escapeHtml(examiner.name || examiner.examiners?.name || '')}" required />
      </div>
      <button class="btn btn-danger btn-small" type="button" data-remove-row>Eliminar</button>
    </div>
  `);
  bindRemoveButtons();
}

function bindRemoveButtons() {
  $$('[data-remove-row]').forEach((button) => {
    button.onclick = () => {
      button.closest('.row-card').remove();
      if (isProgressiveKidsProgram()) {
        bindProgressiveCutPreviewInputs();
        updateProgressiveCutPreview();
      }
    };
  });
}

function collectDraft() {
  const form = $('#examForm');
  const programType = selectedProgramType();
  const grade = $('#examGrade').value;
  const techniques = isProgressiveKidsProgram(programType)
    ? collectProgressiveKidsTechniques()
    : getSelectedTechniques(form);
  return {
    title: $('#examTitle').value.trim(),
    folderId: $('#examFolder')?.value || null,
    programType,
    grade,
    sourceGrade: sourceGradeForExamGrade(grade, programType),
    passPercentage: Number($('#passPercentage').value),
    techniques,
    students: $$('.student-row').map((row, idx) => ({
      student_name: $('.student-name', row).value.trim(),
      student_belt_color: $('.student-belt', row).value,
      student_ref: $('.student-ref', row)?.value.trim() || null,
      student_source_id: $('.student-source-id', row)?.value.trim() || null,
      order_number: Number($('.student-order', row).value || idx + 1),
    })).filter((student) => student.student_name),
    examiners: $$('.examiner-row').map((row) => ({
      name: $('.examiner-name', row).value.trim(),
    })).filter((examiner) => examiner.name),
  };
}

async function loadTechniqueSummariesForGrade(grade) {
  if (!grade) {
    state.techniqueSummaries = new Map();
    return;
  }

  const gradeIds = grades.map(([id]) => id);
  const gradeIndex = gradeIds.indexOf(grade);
  const relevantGrades = gradeIndex >= 0 ? gradeIds.slice(0, gradeIndex + 1) : [grade];
  const { data, error } = await supabase
    .from('technique_summaries')
    .select('canonical_name, grade, summary, summary_en, summary_es')
    .in('grade', relevantGrades);

  if (error) {
    state.techniqueSummaries = new Map();
    console.warn('No se pudieron cargar los resúmenes de técnicas:', error.message);
    return;
  }

  const summaries = new Map();
  (data || []).forEach((item) => {
    const summary = item.summary_es || item.summary_en || item.summary || '';
    summaries.set(`${item.grade}|${item.canonical_name}`, summary);
    if (!summaries.has(item.canonical_name)) summaries.set(item.canonical_name, summary);
  });
  state.techniqueSummaries = summaries;
}

function addSummariesToTechniques(techniques) {
  return techniques.map((technique) => {
    const sourceGrade = technique.source_grade || '';
    const summary = technique.summary
      || state.techniqueSummaries.get(`${sourceGrade}|${technique.original_name}`)
      || state.techniqueSummaries.get(`${sourceGrade}|${technique.name}`)
      || state.techniqueSummaries.get(technique.original_name)
      || state.techniqueSummaries.get(technique.name)
      || '';

    return { ...technique, summary };
  });
}

async function createExam(event) {
  event.preventDefault();
  const draft = collectDraft();
  await loadTechniqueSummariesForGrade(draft.sourceGrade);
  draft.techniques = addSummariesToTechniques(draft.techniques);
  const validation = validateExamDraft(draft);

  if (!validation.valid) {
    showErrors(validation.errors);
    return;
  }

  const { data: exam, error: examError } = await supabase
    .from('exams')
    .insert({
      professor_id: state.professor.id,
      title: draft.title,
      grade: draft.grade,
      program_type: draft.programType,
      source_grade: draft.sourceGrade,
      folder_id: draft.folderId,
      techniques: draft.techniques,
      pass_percentage: draft.passPercentage,
      status: 'active',
    })
    .select()
    .single();

  if (examError) {
    showErrors(examError.message);
    return;
  }

  const { error: studentsError } = await supabase.from('exam_students').insert(
    draft.students.map((student) => ({ ...student, exam_id: exam.id }))
  );
  if (studentsError) {
    showErrors(studentsError.message);
    return;
  }

  for (const examiner of draft.examiners) {
    const examinerId = await upsertExaminer(examiner);
    const token = normalizeToken();
    const accessUrl = `${window.location.origin}${window.location.pathname}?exam=${token}`;

    const { error } = await supabase.from('exam_examiners').insert({
      exam_id: exam.id,
      examiner_id: examinerId,
      access_token: token,
      access_url: accessUrl,
    });
    if (error) {
      showErrors(error.message);
      return;
    }
  }

  await loadExams();
  switchTab('exams');
  await viewExamDetails(exam.id);
  notify('Examen creado. Ya puedes compartir los enlaces de examinador.');
}

async function startEditExam() {
  const exam = state.selectedExam;
  if (!exam) return;

  if ((exam.evaluations || []).length > 0) {
    showErrors('No se puede editar: este examen ya tiene evaluaciones enviadas.');
    return;
  }

  const { data, error } = await supabase
    .from('evaluations')
    .select('id')
    .eq('exam_id', exam.id)
    .limit(1);

  if (error) {
    showErrors(error.message);
    return;
  }

  if ((data || []).length > 0) {
    showErrors('No se puede editar: un examinador ya ha enviado una evaluación.');
    await viewExamDetails(exam.id);
    return;
  }

  state.examEditDraft = {
    ...exam,
    students: JSON.parse(JSON.stringify(exam.students || [])),
    examiners: (exam.links || []).map((link) => ({
      name: link.examiners?.name || 'Examinador',
    })),
    techniques: JSON.parse(JSON.stringify(exam.techniques || [])),
  };
  switchTab('create');
}

async function updateExistingExam(event) {
  event.preventDefault();
  const editDraft = state.examEditDraft;
  if (!editDraft) return;

  const { data: existingEvaluations, error: evaluationsError } = await supabase
    .from('evaluations')
    .select('id')
    .eq('exam_id', editDraft.id)
    .limit(1);

  if (evaluationsError) {
    showErrors(evaluationsError.message);
    return;
  }

  if ((existingEvaluations || []).length > 0) {
    state.examEditDraft = null;
    showErrors('No se han guardado cambios: el examen ya fue auditado por un examinador.');
    await viewExamDetails(editDraft.id);
    return;
  }

  const draft = collectDraft();
  await loadTechniqueSummariesForGrade(draft.sourceGrade);
  draft.techniques = addSummariesToTechniques(draft.techniques);
  const validation = validateExamDraft(draft);

  if (!validation.valid) {
    showErrors(validation.errors);
    return;
  }

  const { error: examError } = await supabase
    .from('exams')
    .update({
      title: draft.title,
      grade: draft.grade,
      program_type: draft.programType,
      source_grade: draft.sourceGrade,
      folder_id: draft.folderId,
      techniques: draft.techniques,
      pass_percentage: draft.passPercentage,
      status: 'active',
    })
    .eq('id', editDraft.id);

  if (examError) {
    showErrors(examError.message);
    return;
  }

  const { error: deleteStudentsError } = await supabase
    .from('exam_students')
    .delete()
    .eq('exam_id', editDraft.id);

  if (deleteStudentsError) {
    showErrors(deleteStudentsError.message);
    return;
  }

  const { error: studentsError } = await supabase.from('exam_students').insert(
    draft.students.map((student) => ({ ...student, exam_id: editDraft.id }))
  );

  if (studentsError) {
    showErrors(studentsError.message);
    return;
  }

  const { error: deleteLinksError } = await supabase
    .from('exam_examiners')
    .delete()
    .eq('exam_id', editDraft.id);

  if (deleteLinksError) {
    showErrors(deleteLinksError.message);
    return;
  }

  for (const examiner of draft.examiners) {
    const examinerId = await upsertExaminer(examiner);
    const token = normalizeToken();
    const accessUrl = `${window.location.origin}${window.location.pathname}?exam=${token}`;

    const { error } = await supabase.from('exam_examiners').insert({
      exam_id: editDraft.id,
      examiner_id: examinerId,
      access_token: token,
      access_url: accessUrl,
    });
    if (error) {
      showErrors(error.message);
      return;
    }
  }

  state.examEditDraft = null;
  await loadExams();
  switchTab('exams');
  await viewExamDetails(editDraft.id);
  notify('Examen actualizado. Los enlaces de examinador se han regenerado.');
}

async function upsertExaminer(examiner) {
  const email = `examiner-${normalizeToken(8)}@skbc.local`;
  const { data: existing, error: readError } = await supabase
    .from('examiners')
    .select('id')
    .eq('professor_id', state.professor.id)
    .eq('email', email)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('examiners')
    .insert({ professor_id: state.professor.id, name: examiner.name, email })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function viewExamDetails(examId) {
  const exam = state.exams.find((item) => item.id === examId);
  if (!exam) return;

  const [studentsRes, linksRes, evaluationsRes] = await Promise.all([
    supabase.from('exam_students').select('*').eq('exam_id', examId).order('order_number'),
    supabase.from('exam_examiners').select('*, examiners(*)').eq('exam_id', examId),
    supabase.from('evaluations').select('*, exam_students(*), examiners(*)').eq('exam_id', examId),
  ]);

  if (studentsRes.error || linksRes.error || evaluationsRes.error) {
    showErrors(studentsRes.error?.message || linksRes.error?.message || evaluationsRes.error?.message);
    return;
  }

  let tribunalReviews = [];
  if (isTribunalResultProgram(exam.program_type)) {
    const reviewsRes = await supabase.from('tribunal_reviews').select('*').eq('exam_id', examId);
    if (reviewsRes.error) {
      showErrors(`Falta preparar Supabase para revisión final de tribunal: ${reviewsRes.error.message}`);
      return;
    }
    tribunalReviews = reviewsRes.data || [];
  }

  state.selectedExam = {
    ...exam,
    students: studentsRes.data || [],
    links: linksRes.data || [],
    evaluations: evaluationsRes.data || [],
    tribunalReviews,
  };

  renderExamDetails();
}

function renderExamDetails() {
  const exam = state.selectedExam;
  $('#panelContent').innerHTML = `
    <div class="section-head">
      <div>
        <h2>${escapeHtml(exam.title)}</h2>
        <p>${escapeHtml(gradeLabel(exam.grade))} · ${(exam.techniques || []).filter((item) => item?.type !== 'cut').length} técnicas · aprobado desde ${exam.pass_percentage}%</p>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="editExamBtn" ${exam.evaluations.length ? 'disabled' : ''}>Editar examen</button>
        <button class="btn btn-secondary" id="printStudyExam">Imprimir temario para alumnos</button>
        <button class="btn btn-secondary" id="beltOrderBtn">Añadir a pedido de cinturones</button>
        <button class="btn btn-success" id="registerPassed">Registrar aprobados en base de datos</button>
        <button class="btn btn-secondary" id="backToExams">Volver</button>
      </div>
    </div>
    <div class="details-layout">
      <aside class="card-list">
        <section class="card">
          <h3>Estudiantes</h3>
          ${exam.students.map((student) => `<p>${student.order_number}. ${escapeHtml(student.student_name)} · ${escapeHtml(student.student_belt_color)}</p>`).join('')}
        </section>
        <section class="card">
          <h3>Enlaces de examinador</h3>
          ${exam.links.map((link) => `
            <p><strong>${escapeHtml(link.examiners?.name || 'Examinador')}</strong></p>
            <div class="link-copy-row">
              <div class="link-box">${escapeHtml(link.access_url)}</div>
              <button class="btn btn-secondary btn-small copy-link" type="button" data-url="${escapeHtml(link.access_url)}">Copiar</button>
            </div>
          `).join('') || '<p>No hay examinadores.</p>'}
        </section>
      </aside>
      ${isTribunalResultProgram(exam.program_type) ? renderTribunalResults(exam) : `
        <section>
          <h3>Resultados recibidos</h3>
          <div class="card-list">
            ${exam.evaluations.length ? exam.evaluations.map(renderEvaluationCard).join('') : '<div class="empty">Todavía no hay evaluaciones enviadas.</div>'}
          </div>
        </section>
      `}
    </div>
  `;
  $('#backToExams').addEventListener('click', renderExamList);
  $('#editExamBtn').addEventListener('click', startEditExam);
  $('#printStudyExam').addEventListener('click', renderPrintableStudyExam);
  $('#beltOrderBtn').addEventListener('click', openBeltOrderDialog);
  $('#registerPassed').addEventListener('click', registerPassedStudentsInSheet);
  $$('.copy-link').forEach((button) => {
    button.addEventListener('click', () => copyLink(button.dataset.url));
  });
  $$('.print-evaluation').forEach((button) => {
    button.addEventListener('click', () => renderPrintableEvaluation(button.dataset.evaluationId));
  });
  $$('.save-review').forEach((button) => {
    button.addEventListener('click', () => saveProfessorReview(button.dataset.evaluationId));
  });
  $$('.save-tribunal-review').forEach((button) => {
    button.addEventListener('click', () => saveTribunalReview(button.dataset.studentId, Number(button.dataset.basePercentage || 0)));
  });
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    notify('Enlace copiado.');
  } catch {
    showErrors('No se pudo copiar automáticamente. Selecciona el enlace manualmente.');
  }
}

function renderEvaluationCard(evaluation) {
  const techniqueEvaluations = evaluation.technique_evaluations || evaluation.technique_scores || [];
  const evaluableTechniques = techniqueEvaluations.filter((item) => item?.type !== 'cut');
  const passPercentage = state.selectedExam?.pass_percentage || 0;
  const adjustmentPoints = evaluationAdjustmentPoints(evaluation);
  const originalSummary = calculateEvaluationSummary(techniqueEvaluations, passPercentage);
  const summary = calculateEvaluationSummary(techniqueEvaluations, passPercentage, adjustmentPoints);
  const skippedCount = evaluableTechniques.filter((item) => item.skipped).length;
  const evaluatedCount = evaluableTechniques.length - skippedCount;
  return `
    <article class="result-card">
      <h3>${escapeHtml(evaluation.exam_students?.student_name || 'Estudiante')}</h3>
      <p><strong>Examinador:</strong> ${escapeHtml(evaluation.examiners?.name || '')}</p>
      ${adjustmentPoints ? `<p><strong>Resultado original:</strong> ${originalSummary.totalScore}/${originalSummary.maxScore} puntos · ${originalSummary.percentage}%</p>` : ''}
      <p><strong>Puntuación:</strong> ${summary.totalScore}/${summary.maxScore} puntos · ${summary.percentage}%</p>
      <p><strong>Mínimo para aprobar:</strong> ${state.selectedExam?.pass_percentage || 0}%</p>
      <p><strong>Técnicas contadas:</strong> ${evaluatedCount}${skippedCount ? ` · ${skippedCount} omitida${skippedCount === 1 ? '' : 's'}` : ''}</p>
      <span class="status ${summary.passed ? 'passed' : 'failed'}">${summary.passed ? 'Aprobado' : 'Necesita intentarlo una vez más'}</span>
      <details class="review-box" style="margin-top:10px">
        <summary>Revisión del profesor</summary>
        <p class="helper-text">Uso interno. El motivo no aparece en el informe final del alumno.</p>
        <div class="grid-2">
          <div class="field">
            <label for="reviewPoints-${escapeHtml(evaluation.id)}">Ajuste de puntos</label>
            <input id="reviewPoints-${escapeHtml(evaluation.id)}" type="number" step="1" class="review-points" data-evaluation-id="${escapeHtml(evaluation.id)}" value="${escapeHtml(adjustmentPoints)}" />
          </div>
          <div class="field">
            <label for="reviewReason-${escapeHtml(evaluation.id)}">Motivo interno</label>
            <input id="reviewReason-${escapeHtml(evaluation.id)}" class="review-reason" data-evaluation-id="${escapeHtml(evaluation.id)}" value="${escapeHtml(evaluation.adjustment_reason || '')}" placeholder="Ej. Corrección del tribunal" />
          </div>
        </div>
        ${adjustmentPoints || evaluation.adjustment_reason ? `<p><strong>Ajuste aplicado:</strong> ${adjustmentPoints > 0 ? '+' : ''}${adjustmentPoints} punto${Math.abs(adjustmentPoints) === 1 ? '' : 's'}${evaluation.adjustment_reason ? ` · ${escapeHtml(evaluation.adjustment_reason)}` : ''}</p>` : ''}
        <button class="btn btn-secondary btn-small save-review" type="button" data-evaluation-id="${escapeHtml(evaluation.id)}">Guardar revisión</button>
      </details>
      <details style="margin-top:10px">
        <summary>Técnicas evaluadas</summary>
        ${evaluableTechniques.map((item) => `
          <p><strong>${escapeHtml(techniqueName(item))}</strong>${techniqueSection(item) ? ` <span class="muted-inline">(${escapeHtml(techniqueSection(item))})</span>` : ''}: ${item.skipped ? 'omitida' : `${item.score} puntos`} ${item.notes ? `· ${escapeHtml(item.notes)}` : ''}</p>
        `).join('')}
      </details>
      <button class="btn btn-secondary btn-small print-evaluation" data-evaluation-id="${evaluation.id}" style="margin-top:12px">Imprimir / PDF</button>
    </article>
  `;
}

function evaluationAdjustmentPoints(evaluation) {
  return Number(evaluation.adjustment_points ?? evaluation.professor_adjustment_points ?? 0) || 0;
}

function tribunalRowsForExam(exam) {
  return (exam.students || []).map((student) => {
    const evaluations = (exam.evaluations || []).filter((evaluation) => evaluation.student_id === student.id || evaluation.exam_student_id === student.id || evaluation.exam_students?.id === student.id);
    const review = (exam.tribunalReviews || []).find((item) => item.student_id === student.id);
    const examinerResults = evaluations.map((evaluation) => {
      const techniqueEvaluations = evaluation.technique_evaluations || evaluation.technique_scores || [];
      const summary = calculateEvaluationSummary(techniqueEvaluations, exam.pass_percentage, evaluationAdjustmentPoints(evaluation));
      return {
        evaluation,
        examinerName: evaluation.examiners?.name || 'Examinador',
        percentage: summary.percentage,
        passed: summary.passed,
        totalScore: summary.totalScore,
        maxScore: summary.maxScore,
      };
    });
    const average = examinerResults.length
      ? Math.round((examinerResults.reduce((sum, item) => sum + item.percentage, 0) / examinerResults.length) * 100) / 100
      : 0;
    const adjustmentPoints = Number(review?.adjustment_points || 0);
    const finalPercentage = review
      ? Number(review.final_percentage ?? Math.max(0, Math.min(100, average + adjustmentPoints)))
      : average;
    const finalPassed = review
      ? Boolean(review.final_passed)
      : examinerResults.length > 0 && average >= Number(exam.pass_percentage || 0);
    return {
      student,
      examinerResults,
      average,
      review,
      adjustmentPoints,
      finalPercentage,
      finalPassed,
    };
  });
}

function tribunalResultValue(row, exam) {
  if (!row.examinerResults.length) return 'auto';
  if (!row.review) return 'auto';
  return row.finalPassed ? 'passed' : 'failed';
}

function tribunalResultsTitle(exam) {
  return isDanTribunalProgram(exam.program_type)
    ? 'Resultado del tribunal'
    : 'Resultado final por examinadores';
}

function tribunalResultsHelpText(exam) {
  return isDanTribunalProgram(exam.program_type)
    ? 'Cada examinador evalúa el mismo examen. El panel calcula la media final por alumno y permite la revisión final del maestro.'
    : 'Cada examinador infantil puede enviar su propia evaluación. El panel calcula la media por alumno y permite la revisión final del maestro.';
}

function renderTribunalResults(exam) {
  const rows = tribunalRowsForExam(exam);
  const expectedExaminers = exam.links?.length || 0;
  return `
    <section>
      <h3>${tribunalResultsTitle(exam)}</h3>
      <p class="helper-text">${tribunalResultsHelpText(exam)}</p>
      <div class="tribunal-list">
        ${rows.map((row) => `
          <article class="tribunal-card">
            <div class="tribunal-head">
              <div>
                <h3>${escapeHtml(row.student.student_name || 'Alumno')}</h3>
                <p>${escapeHtml(row.student.student_belt_color || '')} · ${row.examinerResults.length}/${expectedExaminers} evaluaciones recibidas</p>
              </div>
              <span class="status ${row.finalPassed ? 'passed' : 'failed'}">${row.examinerResults.length ? row.finalPassed ? 'Aprobado final' : 'Suspenso final' : 'Pendiente'}</span>
            </div>
            <div class="tribunal-average">
              <strong>${row.examinerResults.length ? `${row.finalPercentage}%` : '-'}</strong>
              <span>resultado final · media original ${row.examinerResults.length ? `${row.average}%` : '-'} · mínimo ${escapeHtml(exam.pass_percentage)}%</span>
            </div>
            <details class="review-box tribunal-review-box" ${row.review ? 'open' : ''}>
              <summary>Revisión final del maestro</summary>
              <p class="helper-text">Este ajuste decide el resultado final. El motivo es interno.</p>
              <div class="grid-3">
                <div class="field">
                  <label for="tribunalAdjustment-${escapeHtml(row.student.id)}">Ajuste</label>
                  <input id="tribunalAdjustment-${escapeHtml(row.student.id)}" class="tribunal-adjustment" data-student-id="${escapeHtml(row.student.id)}" type="number" step="0.1" value="${escapeHtml(row.adjustmentPoints)}" />
                </div>
                <div class="field">
                  <label for="tribunalResult-${escapeHtml(row.student.id)}">Resultado final</label>
                  <select id="tribunalResult-${escapeHtml(row.student.id)}" class="tribunal-result" data-student-id="${escapeHtml(row.student.id)}">
                    <option value="auto" ${tribunalResultValue(row, exam) === 'auto' ? 'selected' : ''}>Automático por media</option>
                    <option value="passed" ${tribunalResultValue(row, exam) === 'passed' ? 'selected' : ''}>Aprobado por maestro</option>
                    <option value="failed" ${tribunalResultValue(row, exam) === 'failed' ? 'selected' : ''}>Suspenso por maestro</option>
                  </select>
                </div>
                <div class="field">
                  <label for="tribunalReason-${escapeHtml(row.student.id)}">Motivo interno</label>
                  <input id="tribunalReason-${escapeHtml(row.student.id)}" class="tribunal-reason" data-student-id="${escapeHtml(row.student.id)}" value="${escapeHtml(row.review?.adjustment_reason || '')}" placeholder="Criterio final del maestro" />
                </div>
              </div>
              ${row.review ? `<p><strong>Último ajuste:</strong> ${row.adjustmentPoints > 0 ? '+' : ''}${row.adjustmentPoints} · Final ${row.finalPercentage}%${row.review.adjustment_reason ? ` · ${escapeHtml(row.review.adjustment_reason)}` : ''}</p>` : ''}
              <button class="btn btn-secondary btn-small save-tribunal-review" type="button" data-student-id="${escapeHtml(row.student.id)}" data-base-percentage="${escapeHtml(row.average)}">Guardar revisión final</button>
            </details>
            <div class="tribunal-examiners">
              ${row.examinerResults.length ? row.examinerResults.map((item) => `
                <div>
                  <strong>${escapeHtml(item.examinerName)}</strong>
                  <span>${item.percentage}% · ${item.totalScore}/${item.maxScore} puntos</span>
                  <span class="status ${item.passed ? 'passed' : 'failed'}">${item.passed ? 'Aprobado' : 'Suspenso'}</span>
                </div>
              `).join('') : '<p class="helper-text">Todavía no hay evaluaciones para este alumno.</p>'}
            </div>
          </article>
        `).join('')}
      </div>
      <h3 style="margin-top:22px">Evaluaciones individuales</h3>
      <div class="card-list">
        ${exam.evaluations.length ? exam.evaluations.map(renderEvaluationCard).join('') : '<div class="empty">Todavía no hay evaluaciones enviadas.</div>'}
      </div>
    </section>
  `;
}

async function saveProfessorReview(evaluationId) {
  const card = $(`[data-evaluation-id="${CSS.escape(evaluationId)}"]`)?.closest('.result-card');
  const points = Number($(`.review-points[data-evaluation-id="${CSS.escape(evaluationId)}"]`, card)?.value || 0);
  const reason = ($(`.review-reason[data-evaluation-id="${CSS.escape(evaluationId)}"]`, card)?.value || '').trim();

  if (!Number.isFinite(points)) {
    showErrors('El ajuste de puntos no es válido.');
    return;
  }

  const { error } = await supabase.rpc('adjust_evaluation_review', {
    p_evaluation_id: evaluationId,
    p_adjustment_points: Math.round(points),
    p_adjustment_reason: reason,
  });

  if (error) {
    showErrors(error.message);
    return;
  }

  notify('Revisión guardada.');
  await viewExamDetails(state.selectedExam.id);
}

async function saveTribunalReview(studentId, basePercentage) {
  const exam = state.selectedExam;
  if (!exam) return;

  const adjustment = Number($(`.tribunal-adjustment[data-student-id="${CSS.escape(studentId)}"]`)?.value || 0);
  const resultMode = $(`.tribunal-result[data-student-id="${CSS.escape(studentId)}"]`)?.value || 'auto';
  const reason = ($(`.tribunal-reason[data-student-id="${CSS.escape(studentId)}"]`)?.value || '').trim();
  const finalPercentage = Math.max(0, Math.min(100, Math.round((basePercentage + adjustment) * 100) / 100));
  const finalPassed = resultMode === 'auto'
    ? finalPercentage >= Number(exam.pass_percentage || 0)
    : resultMode === 'passed';

  const { error } = await supabase.rpc('upsert_tribunal_review', {
    p_exam_id: exam.id,
    p_student_id: studentId,
    p_base_percentage: basePercentage,
    p_adjustment_points: adjustment,
    p_final_percentage: finalPercentage,
    p_final_passed: finalPassed,
    p_adjustment_reason: reason,
  });

  if (error) {
    showErrors(error.message);
    return;
  }

  notify('Revisión final del tribunal guardada.');
  await viewExamDetails(exam.id);
}

async function registerPassedStudentsInSheet() {
  const exam = state.selectedExam;
  if (!exam) return;

  if (isTribunalResultProgram(exam.program_type)) {
    await registerPassedTribunalStudentsInSheet(exam);
    return;
  }

  const passedEvaluations = exam.evaluations.filter((evaluation) => {
    const techniqueEvaluations = evaluation.technique_evaluations || evaluation.technique_scores || [];
    return calculateEvaluationSummary(techniqueEvaluations, exam.pass_percentage, evaluationAdjustmentPoints(evaluation)).passed;
  });

  if (passedEvaluations.length === 0) {
    notify('No hay alumnos aprobados para registrar.', 'warning');
    return;
  }

  const savedToken = localStorage.getItem('skbcSheetToken') || '';
  const token = (prompt('Pega el token configurado en Apps Script para registrar en la base de datos:', savedToken) || '').trim();
  if (!token) return;
  localStorage.setItem('skbcSheetToken', token);

  if (!confirm(`Se registrarán ${passedEvaluations.length} alumno(s) aprobado(s) en la pestaña EXAMENES. ¿Continuar?`)) {
    return;
  }

  const failed = [];

  for (const evaluation of passedEvaluations) {
    const payload = buildExamSheetPayload({
      studentName: evaluation.exam_students?.student_name || '',
      studentRef: evaluation.exam_students?.student_ref || '',
      studentSourceId: evaluation.exam_students?.student_source_id || '',
      programType: exam.program_type || 'adultos',
      grade: exam.grade,
      sourceGrade: exam.source_grade || exam.grade,
      examinerName: evaluation.examiners?.name || '',
      submittedAt: evaluation.submitted_at || evaluation.created_at || new Date().toISOString(),
      registeredBy: state.professor?.name || state.professor?.email || 'Sistema exámenes SKBC',
      token,
    });

    try {
      await fetch(EXAM_SHEET_WEBAPP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      failed.push(payload.alumno);
    }
  }

  if (failed.length) {
    showErrors(`No se pudieron enviar: ${failed.join(', ')}`);
    return;
  }

  notify('Aprobados enviados a Google Sheets. Revisa la pestaña EXAMENES.');
}

async function registerPassedTribunalStudentsInSheet(exam) {
  const passedRows = tribunalRowsForExam(exam).filter((row) => row.examinerResults.length && row.finalPassed);

  if (passedRows.length === 0) {
    notify('No hay alumnos aprobados por el resultado final para registrar.', 'warning');
    return;
  }

  const savedToken = localStorage.getItem('skbcSheetToken') || '';
  const token = (prompt('Pega el token configurado en Apps Script para registrar en la base de datos:', savedToken) || '').trim();
  if (!token) return;
  localStorage.setItem('skbcSheetToken', token);

  if (!confirm(`Se registrarán ${passedRows.length} alumno(s) aprobado(s) por el resultado final. ¿Continuar?`)) {
    return;
  }

  const failed = [];
  for (const row of passedRows) {
    const registrationGrade = targetGradeForProgressiveStudent(row.student, exam);
    const registrationSourceGrade = sourceGradeForSheetRegistration(registrationGrade, exam);
    const examinerName = examinerNamesForTribunalRow(row, exam);
    const payload = buildExamSheetPayload({
      studentName: row.student.student_name || '',
      studentRef: row.student.student_ref || '',
      studentSourceId: row.student.student_source_id || '',
      programType: exam.program_type || 'adultos',
      grade: registrationGrade,
      sourceGrade: registrationSourceGrade,
      examinerName,
      submittedAt: row.review?.reviewed_at || new Date().toISOString(),
      registeredBy: state.professor?.name || state.professor?.email || 'Sistema exámenes SKBC',
      token,
    });

    try {
      await fetch(EXAM_SHEET_WEBAPP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      failed.push(payload.alumno);
    }
  }

  if (failed.length) {
    showErrors(`No se pudieron enviar: ${failed.join(', ')}`);
    return;
  }

  notify('Aprobados del resultado final enviados a Google Sheets. Revisa la pestaña EXAMENES.');
}

function beltOrderColorForExamGrade(grade) {
  const labels = {
    '5kyu': 'Amarillo',
    '4kyu': 'Naranja',
    '3kyu': 'Verde',
    '2kyu': 'Azul',
    '1kyu': 'Marron',
    shodan: 'Negro',
    nidan: 'Negro',
    sandan: 'Negro',
    yondan: 'Negro',
    godan: 'Negro',
    children_blanco_amarillo: 'Blanco-Amarillo',
    children_5kyu: 'Amarillo',
    children_amarillo_naranja: 'Amarillo-Naranja',
    children_4kyu: 'Naranja',
    children_naranja_verde: 'Naranja-Verde',
    children_3kyu: 'Verde',
    children_verde_azul: 'Verde-Azul',
    children_2kyu: 'Azul',
    children_azul_marron: 'Azul-Marron',
    children_1kyu: 'Marron',
  };
  return labels[grade] || gradeLabel(grade);
}

function defaultBeltSizeForExam(exam) {
  return exam?.program_type === 'ninos' || exam?.program_type === 'ninos_progresivo' ? '240cm' : '300cm';
}

function buildDefaultBeltOrderItems(exam) {
  const color = beltOrderColorForExamGrade(exam.grade);
  const size = defaultBeltSizeForExam(exam);
  return (exam.students || []).map((student) => ({
    studentName: student.student_name || '',
    studentRef: student.student_ref || '',
    studentSourceId: student.student_source_id || '',
    currentBelt: student.student_belt_color || '',
    item: 'Cinturon',
    color,
    size,
    quantity: 1,
    notes: '',
  }));
}

function beltOrderRowTemplate(item = {}) {
  return `
    <div class="belt-order-row row-card">
      <div class="field">
        <label>Alumno / concepto</label>
        <input class="belt-order-student" value="${escapeHtml(item.studentName || '')}" placeholder="Ej. Ivan Calvo / Bolsa / Escudo" />
      </div>
      <div class="field">
        <label>Articulo</label>
        <input class="belt-order-item" value="${escapeHtml(item.item || 'Cinturon')}" />
      </div>
      <div class="field">
        <label>Color</label>
        <input class="belt-order-color" value="${escapeHtml(item.color || '')}" placeholder="Amarillo, naranja..." />
      </div>
      <div class="field">
        <label>Medida</label>
        <input class="belt-order-size" value="${escapeHtml(item.size || '')}" placeholder="240cm, 300cm..." />
      </div>
      <div class="field">
        <label>Cantidad</label>
        <input class="belt-order-quantity" type="number" min="1" step="1" value="${escapeHtml(item.quantity || 1)}" />
      </div>
      <div class="field belt-order-notes-field">
        <label>Notas</label>
        <input class="belt-order-notes" value="${escapeHtml(item.notes || '')}" placeholder="Cambio de talla, pedido especial..." />
      </div>
      <input class="belt-order-ref" type="hidden" value="${escapeHtml(item.studentRef || '')}" />
      <input class="belt-order-source-id" type="hidden" value="${escapeHtml(item.studentSourceId || '')}" />
      <button class="btn btn-secondary btn-small remove-belt-order-row" type="button">Quitar</button>
    </div>
  `;
}

function collectBeltOrderItems() {
  return $$('.belt-order-row').map((row) => ({
    studentName: $('.belt-order-student', row)?.value.trim() || '',
    studentRef: $('.belt-order-ref', row)?.value.trim() || '',
    studentSourceId: $('.belt-order-source-id', row)?.value.trim() || '',
    item: $('.belt-order-item', row)?.value.trim() || 'Cinturon',
    color: $('.belt-order-color', row)?.value.trim() || '',
    size: $('.belt-order-size', row)?.value.trim() || '',
    quantity: Math.max(1, Number($('.belt-order-quantity', row)?.value || 1) || 1),
    notes: $('.belt-order-notes', row)?.value.trim() || '',
  })).filter((item) => item.studentName || item.item || item.color);
}

function renderBeltOrderSummary() {
  const summary = new Map();
  collectBeltOrderItems().forEach((item) => {
    const key = `${item.item || 'Cinturon'}|${item.color || 'Sin color'}|${item.size || 'Sin medida'}`;
    summary.set(key, (summary.get(key) || 0) + item.quantity);
  });

  const lines = [...summary.entries()].map(([key, quantity]) => {
    const [item, color, size] = key.split('|');
    return `<li><strong>${escapeHtml(quantity)}</strong> ${escapeHtml(item)} · ${escapeHtml(color)} · ${escapeHtml(size)}</li>`;
  });

  $('#beltOrderSummary').innerHTML = lines.length
    ? `<ul>${lines.join('')}</ul>`
    : '<p class="helper-text">Añade líneas para ver el resumen del pedido.</p>';
}

function bindBeltOrderDialogEvents() {
  $$('.remove-belt-order-row').forEach((button) => {
    button.onclick = () => {
      button.closest('.belt-order-row')?.remove();
      renderBeltOrderSummary();
    };
  });

  $$('.belt-order-row input').forEach((input) => {
    input.addEventListener('input', renderBeltOrderSummary);
  });
}

function closeBeltOrderDialog() {
  $('.dialog-backdrop')?.remove();
}

function openBeltOrderDialog() {
  const exam = state.selectedExam;
  if (!exam) return;

  const rows = buildDefaultBeltOrderItems(exam).map(beltOrderRowTemplate).join('');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="dialog-backdrop">
      <section class="dialog-card belt-order-dialog" role="dialog" aria-modal="true" aria-labelledby="beltOrderTitle">
        <div class="dialog-head">
          <div>
            <h2 id="beltOrderTitle">Pedido de cinturones</h2>
            <p>${escapeHtml(exam.title)} · ${escapeHtml(gradeLabel(exam.grade))} · ${exam.program_type === 'adultos' ? 'Adultos' : 'Niños'}</p>
          </div>
          <button class="btn btn-secondary btn-small" id="closeBeltOrderDialog" type="button">Cerrar</button>
        </div>
        <div class="notice">Revisa colores, tallas y cantidades antes de enviar. Niños salen por defecto con 240cm y adultos con 300cm.</div>
        <div class="belt-order-layout">
          <div>
            <div class="belt-order-list" id="beltOrderRows">${rows}</div>
            <button class="btn btn-secondary btn-small" id="addBeltOrderRow" type="button">Añadir línea manual</button>
          </div>
          <aside class="belt-order-summary card">
            <h3>Resumen del pedido</h3>
            <div id="beltOrderSummary"></div>
          </aside>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" id="cancelBeltOrder" type="button">Cancelar</button>
          <button class="btn btn-success" id="sendBeltOrder" type="button">Volcar a hoja de pedido</button>
        </div>
      </section>
    </div>
  `);

  $('#closeBeltOrderDialog').addEventListener('click', closeBeltOrderDialog);
  $('#cancelBeltOrder').addEventListener('click', closeBeltOrderDialog);
  $('#addBeltOrderRow').addEventListener('click', () => {
    $('#beltOrderRows').insertAdjacentHTML('beforeend', beltOrderRowTemplate({
      item: 'Cinturon',
      size: defaultBeltSizeForExam(exam),
      quantity: 1,
    }));
    bindBeltOrderDialogEvents();
    renderBeltOrderSummary();
  });
  $('#sendBeltOrder').addEventListener('click', sendBeltOrderToSheet);
  bindBeltOrderDialogEvents();
  renderBeltOrderSummary();
}

async function sendBeltOrderToSheet() {
  const exam = state.selectedExam;
  if (!exam) return;

  const items = collectBeltOrderItems();
  if (!items.length) {
    showErrors('No hay líneas para enviar al pedido.');
    return;
  }

  const savedToken = localStorage.getItem('skbcSheetToken') || '';
  const token = (prompt('Pega el token configurado en Apps Script para el pedido de cinturones:', savedToken) || '').trim();
  if (!token) return;
  localStorage.setItem('skbcSheetToken', token);

  if (!confirm(`Se enviarán ${items.length} línea(s) a la hoja de pedido de cinturones. ¿Continuar?`)) {
    return;
  }

  const payload = {
    accion: 'REGISTRAR_PEDIDO_CINTURONES_WEB',
    token,
    pedido: {
      examId: exam.id,
      examTitle: exam.title,
      programa: exam.program_type || 'adultos',
      grado: gradeSheetLabel(exam.grade),
      creadoPor: state.professor?.name || state.professor?.email || 'Sistema exámenes SKBC',
      fechaPedido: new Date().toISOString(),
      items,
    },
  };

  try {
    await fetch(EXAM_SHEET_WEBAPP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    closeBeltOrderDialog();
    notify('Pedido enviado a Apps Script. Revisa la hoja de pedido de cinturones.');
  } catch (error) {
    showErrors('No se pudo enviar el pedido de cinturones.');
  }
}

function buildStudyExamReport(exam) {
  const techniques = exam.techniques || [];
  const evaluableTechniques = techniques.filter((item) => item?.type !== 'cut');
  return {
    clubName: state.professor.club_name,
    examTitle: exam.title,
    gradeLabel: gradeLabel(exam.grade),
    programLabel: exam.program_type === 'adultos' ? 'Examen adultos' : exam.program_type === 'ninos_progresivo' ? 'Examen infantil progresivo' : 'Examen infantil',
    techniqueCount: evaluableTechniques.length,
    sections: groupTechniqueItemsBySection(techniques),
  };
}

function renderPrintableStudyExam() {
  const exam = state.selectedExam;
  if (!exam) return;

  const report = buildStudyExamReport(exam);
  $('#panelContent').innerHTML = `
    <div class="print-toolbar">
      <button class="btn btn-secondary" id="backToDetails">Volver al examen</button>
      <div class="btn-row">
        <button class="btn btn-secondary" id="printStudyReport">Imprimir</button>
        <button class="btn btn-primary" id="downloadStudyPdf">Descargar PDF</button>
      </div>
    </div>
    <article class="print-report study-report">
      <header class="print-report-head">
        <div>
          <p class="print-kicker">Temario de estudio SKBC</p>
          <h1>${escapeHtml(report.clubName || 'Club SKBC')}</h1>
          <h2>${escapeHtml(report.examTitle)}</h2>
        </div>
      </header>
      <section class="print-meta">
        <div><strong>Tipo</strong><span>${escapeHtml(report.programLabel)}</span></div>
        <div><strong>Grado</strong><span>${escapeHtml(report.gradeLabel)}</span></div>
        <div><strong>Técnicas</strong><span>${report.techniqueCount}</span></div>
      </section>
      <table class="study-table">
        <thead>
          <tr>
            <th>Sección</th>
            <th>Técnica</th>
            <th>Resumen / claves</th>
            <th>Mis notas</th>
          </tr>
        </thead>
        <tbody>
          ${report.sections.flatMap(([section, techniques]) => techniques.map((item) => `
            <tr>
              <td>${escapeHtml(section || 'Técnicas')}</td>
              <td><strong>${escapeHtml(techniqueName(item))}</strong></td>
              <td class="notes-cell"></td>
              <td class="notes-cell"></td>
            </tr>
          `)).join('')}
        </tbody>
      </table>
    </article>
  `;

  $('#backToDetails').addEventListener('click', renderExamDetails);
  $('#printStudyReport').addEventListener('click', () => window.print());
  $('#downloadStudyPdf').addEventListener('click', () => downloadStudyExamPdf(report));
}

function buildStudentImprovementItems(techniqueEvaluations) {
  return (techniqueEvaluations || [])
    .filter((item) => !item.skipped)
    .map((item) => {
      const rawScore = item.score ?? item.technique_score ?? item.points ?? item.value;
      const score = Number(rawScore);
      const notes = String(item.notes || '').trim();
      const needsWork = Number.isFinite(score) && score < 10;
      if (!needsWork && !notes) return null;

      let levelLabel = 'Comentario';
      let levelClass = 'comment';
      let sortValue = Number.isFinite(score) ? score : 10;
      let defaultAdvice = 'Revisar la indicación del examinador.';

      if (Number.isFinite(score) && score <= 0) {
        levelLabel = 'Prioritario';
        levelClass = 'high';
        defaultAdvice = 'Reforzar desde la base: forma, distancia, control y finalización.';
      } else if (Number.isFinite(score) && score <= 5) {
        levelLabel = 'A mejorar';
        levelClass = 'medium';
        defaultAdvice = 'Pulir los detalles principales y repetir con atención técnica.';
      }

      return {
        name: techniqueName(item),
        section: techniqueSection(item),
        notes,
        defaultAdvice,
        levelLabel,
        levelClass,
        sortValue,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortValue - b.sortValue || a.name.localeCompare(b.name))
    .slice(0, 6);
}

function buildStudentStrengthItems(techniqueEvaluations) {
  return (techniqueEvaluations || [])
    .filter((item) => !item.skipped)
    .map((item) => {
      const score = Number(item.score ?? item.technique_score ?? item.points ?? item.value);
      if (!Number.isFinite(score) || score < 10) return null;
      return {
        name: techniqueName(item),
        section: techniqueSection(item),
      };
    })
    .filter((item) => item?.name)
    .slice(0, 5);
}

function studentReportIntro(report) {
  if (!report.improvementItems.length) {
    return 'Buen trabajo. No se han marcado prioridades concretas en esta evaluación.';
  }
  if (report.summary.passed) {
    return 'Has aprobado. Estas son las prioridades principales para seguir mejorando con claridad en el próximo ciclo.';
  }
  return 'Necesitas intentarlo una vez más. Trabaja especialmente estos puntos antes de la próxima valoración.';
}

function isKidsReport(report) {
  return report.programType === 'ninos' || report.programType === 'ninos_progresivo';
}

function kidsReportIntro(report) {
  if (report.summary.passed && report.improvementItems.length) {
    return 'Has conseguido tu objetivo. Ahora toca entrenar estos pequeños retos para que tu Shorinji Kempo siga creciendo.';
  }
  if (report.summary.passed) {
    return 'Has hecho un gran examen. Sigue entrenando con la misma energia, respeto y atencion.';
  }
  return 'Esta vez necesitas practicar un poco mas. No pasa nada: ya tienes claro que retos entrenar para volver mas fuerte.';
}

function kidsReportResultText(report) {
  return report.summary.passed ? 'OBJETIVO CONSEGUIDO' : 'A SEGUIR PRACTICANDO';
}

function beltDisplayLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');

  const labels = {
    MINARAI: 'Blanco',
    BLANCO: 'Blanco',
    'BLANCO-AMARILLO': 'Blanco-Amarillo',
    AMARILLO: '5 KYU (Amarillo)',
    '5 KYU': '5 KYU (Amarillo)',
    'AMARILLO-NARANJA': 'Amarillo-Naranja',
    NARANJA: '4 KYU (Naranja)',
    '4 KYU': '4 KYU (Naranja)',
    'NARANJA-VERDE': 'Naranja-Verde',
    VERDE: '3 KYU (Verde)',
    '3 KYU': '3 KYU (Verde)',
    'VERDE-AZUL': 'Verde-Azul',
    AZUL: '2 KYU (Azul)',
    '2 KYU': '2 KYU (Azul)',
    'AZUL-MARRON': 'Azul-Marrón',
    MARRON: '1 KYU (Marrón)',
    '1 KYU': '1 KYU (Marrón)',
    NEGRO: 'Negro',
    '1 DAN': '1 DAN (Negro)',
    '2 DAN': '2 DAN (Negro)',
    '3 DAN': '3 DAN (Negro)',
    '4 DAN': '4 DAN (Negro)',
  };

  return labels[normalized] || raw;
}

function reportCurrentBeltLabel(report) {
  const fallback = isKidsReport(report) ? childrenCurrentGrades[report.grade] : '';
  return beltDisplayLabel(report.beltColor || fallback);
}

function reportTargetBeltLabel(report) {
  if (isKidsReport(report)) {
    return beltDisplayLabel(report.gradeLabel);
  }
  return beltDisplayLabel(report.gradeLabel);
}

function reportAdviceText(item) {
  return item.notes || item.defaultAdvice || '';
}

function renderReportCommentEditor(report) {
  if (!report.improvementItems.length) return '';

  return `
    <section class="print-comment-editor">
      <div>
        <h3>Comentarios del informe</h3>
        <p>Estos textos son los que verá el alumno en “Qué reforzar”. Puedes corregirlos antes de imprimir o descargar el PDF.</p>
      </div>
      <div class="print-comment-list">
        ${report.improvementItems.map((item, index) => `
          <label class="print-comment-row">
            <span>${escapeHtml(item.name)}${item.section ? ` · ${escapeHtml(item.section)}` : ''}</span>
            <textarea class="report-advice-input" data-advice-index="${index}" rows="2">${escapeHtml(reportAdviceText(item))}</textarea>
          </label>
        `).join('')}
      </div>
    </section>
  `;
}

function bindReportCommentEditor(report) {
  $$('.report-advice-input').forEach((textarea) => {
    textarea.addEventListener('input', () => {
      const index = Number(textarea.dataset.adviceIndex);
      const item = report.improvementItems[index];
      if (!item) return;

      item.notes = textarea.value.trim();
      $$(`[data-report-advice-index="${index}"]`).forEach((node) => {
        node.textContent = textarea.value.trim() || item.defaultAdvice || '';
      });
    });
  });
}

function renderKidsPrintableEvaluation(report) {
  return `
    <article class="print-report student-report kids-student-report">
      <header class="kids-report-hero">
        <div class="kids-report-brand">
          <div class="kids-report-logo">
            ${report.logoUrl ? `<img src="${escapeHtml(report.logoUrl)}" alt="Logo club" />` : 'SKBC'}
          </div>
          <div>
            <p class="print-kicker">Informe de progreso infantil</p>
            <h1>${escapeHtml(report.studentName)}</h1>
            <h2>${escapeHtml(report.examTitle)}</h2>
          </div>
        </div>
        <div class="kids-result-card ${report.summary.passed ? 'passed' : 'failed'}">
          <span>${report.summary.passed ? 'Enhorabuena' : 'Sigue entrenando'}</span>
          <strong>${kidsReportResultText(report)}</strong>
        </div>
      </header>

      <section class="kids-progress-strip">
        <div>
          <span>Cinturón actual</span>
          <strong>${escapeHtml(reportCurrentBeltLabel(report))}</strong>
        </div>
        <div>
          <span>Cinturón objetivo</span>
          <strong>${escapeHtml(reportTargetBeltLabel(report))}</strong>
        </div>
        <div>
          <span>Fecha</span>
          <strong>${escapeHtml(formatDate(report.submittedAt))}</strong>
        </div>
        <div>
          <span>Resultado</span>
          <strong>${report.summary.percentage}%</strong>
        </div>
      </section>

      <section class="kids-message-card">
        <div class="kids-message-icon">${report.summary.passed ? '1' : '!'}</div>
        <div>
          <h3>${report.summary.passed ? 'Buen trabajo' : 'Proximo intento'}</h3>
          <p>${escapeHtml(kidsReportIntro(report))}</p>
        </div>
      </section>

      <section class="kids-report-grid">
        <div class="kids-panel kids-panel-strong">
          <h3>Lo mejor de tu examen</h3>
          ${report.strengthItems.length ? `
            <ul>
              ${report.strengthItems.map((item) => `
                <li>
                  <strong>${escapeHtml(item.name)}</strong>
                  ${item.section ? `<span>${escapeHtml(item.section)}</span>` : ''}
                </li>
              `).join('')}
            </ul>
          ` : `
            <p>Has completado el examen y eso ya es un paso importante. Sigue sumando buenos entrenamientos.</p>
          `}
        </div>

        <div class="kids-panel kids-panel-goal">
          <h3>Recomendamos reforzar</h3>
          <p>${report.improvementItems.length
            ? 'Los apartados que mostramos a continuación son los que han tenido alguna incidencia en el examen.'
            : 'No se han marcado incidencias concretas. Mantén la concentración, el respeto y la energía en cada clase.'}</p>
        </div>
      </section>

      <section class="kids-practice-section">
        <h3>Retos para practicar</h3>
        ${report.improvementItems.length ? `
          <div class="kids-practice-list">
            ${report.improvementItems.map((item, index) => `
              <div class="kids-practice-item ${escapeHtml(item.levelClass)}">
                <div class="kids-practice-number">${index + 1}</div>
                <div>
                  <strong>${escapeHtml(item.name)}</strong>
                  ${item.section ? `<span>${escapeHtml(item.section)}</span>` : ''}
                  <p data-report-advice-index="${index}">${escapeHtml(reportAdviceText(item))}</p>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="kids-empty-practice">No hay retos prioritarios marcados. Repasa el temario completo y sigue entrenando igual de bien.</div>
        `}
      </section>

      <footer class="kids-report-footer">
        <div>
          <strong>Mensaje del sensei</strong>
          <span>Lo importante es mejorar un poco cada dia: atencion, respeto y ganas de aprender.</span>
        </div>
        <div class="student-signature">Firma profesor</div>
      </footer>
    </article>
  `;
}

function renderPrintableEvaluation(evaluationId) {
  const exam = state.selectedExam;
  const evaluation = exam.evaluations.find((item) => item.id === evaluationId);
  if (!evaluation) return;

  const report = buildPrintableEvaluation({
    clubName: state.professor.club_name,
    examTitle: exam.title,
    grade: exam.grade,
    studentName: evaluation.exam_students?.student_name || 'Estudiante',
    beltColor: evaluation.exam_students?.student_belt_color || '',
    examinerName: evaluation.examiners?.name || '',
    passPercentage: exam.pass_percentage,
    techniqueEvaluations: evaluation.technique_evaluations || evaluation.technique_scores || [],
    adjustmentPoints: evaluationAdjustmentPoints(evaluation),
    submittedAt: evaluation.submitted_at || evaluation.created_at || new Date().toISOString(),
  });
  report.programType = exam.program_type || 'adultos';
  report.logoUrl = state.professor.logo_url || DEFAULT_CLUB_LOGO_URL;
  report.examId = exam.id;
  report.evaluationId = evaluation.id;
  report.studentRef = evaluation.exam_students?.student_ref || '';
  report.studentSourceId = evaluation.exam_students?.student_source_id || '';
  report.sourceGrade = exam.source_grade || sourceGradeForExamGrade(exam.grade, exam.program_type || 'adultos') || exam.grade;
  report.examinerName = evaluation.examiners?.name || '';
  report.improvementItems = buildStudentImprovementItems(report.techniqueEvaluations);
  report.strengthItems = buildStudentStrengthItems(report.techniqueEvaluations);

  state.printReport = report;
  $('#panelContent').innerHTML = `
    <div class="print-toolbar">
      <button class="btn btn-secondary" id="backToDetails">Volver a resultados</button>
      <div class="btn-row">
        <button class="btn btn-success" id="saveReportToFicha">Guardar informe en ficha</button>
        <button class="btn btn-secondary" id="printReport">Imprimir</button>
        <button class="btn btn-primary" id="downloadPdf">Descargar PDF</button>
      </div>
    </div>
    ${renderReportCommentEditor(report)}
    ${isKidsReport(report) ? renderKidsPrintableEvaluation(report) : `
    <article class="print-report student-report adult-student-report">
      <header class="student-report-head">
        <div class="student-report-brand">
          <div class="student-report-logo">
            ${report.logoUrl ? `<img src="${escapeHtml(report.logoUrl)}" alt="Logo club" />` : 'SKBC'}
          </div>
          <div>
            <p class="print-kicker">Informe oficial de evaluación</p>
            <h1>${escapeHtml(report.clubName || 'Club SKBC')}</h1>
            <h2>${escapeHtml(report.examTitle)}</h2>
          </div>
        </div>
        <div class="print-result ${report.summary.passed ? 'passed' : 'failed'}">
          ${report.summary.passed ? 'APROBADO' : 'NECESITA INTENTARLO UNA VEZ MÁS'}
        </div>
      </header>
      <section class="student-summary-band adult-summary-band">
        <div>
          <span>Alumno</span>
          <strong>${escapeHtml(report.studentName)}</strong>
        </div>
        <div>
          <span>Cinturón actual</span>
          <strong>${escapeHtml(reportCurrentBeltLabel(report))}</strong>
        </div>
        <div>
          <span>Cinturón objetivo</span>
          <strong>${escapeHtml(reportTargetBeltLabel(report))}</strong>
        </div>
        <div>
          <span>Fecha</span>
          <strong>${escapeHtml(formatDate(report.submittedAt))}</strong>
        </div>
        <div>
          <span>Resultado final</span>
          <strong>${report.summary.percentage}%</strong>
        </div>
      </section>
      <section class="student-message">
        <h3>Plan de mejora recomendado</h3>
        <p>${escapeHtml(studentReportIntro(report))}</p>
      </section>
      ${report.improvementItems.length ? `
        <table class="student-focus-table">
          <thead>
            <tr>
              <th>Prioridad</th>
              <th>Técnica</th>
              <th>Qué reforzar</th>
            </tr>
          </thead>
          <tbody>
            ${report.improvementItems.map((item, index) => `
              <tr>
                <td><span class="focus-badge ${escapeHtml(item.levelClass)}">${escapeHtml(item.levelLabel)}</span></td>
                <td>
                  <strong>${escapeHtml(item.name)}</strong>
                  ${item.section ? `<small>${escapeHtml(item.section)}</small>` : ''}
                </td>
                <td data-report-advice-index="${index}">${escapeHtml(reportAdviceText(item))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `
        <div class="student-empty-focus">
          No hay técnicas señaladas como prioritarias. Mantén el entrenamiento regular y repasa el temario completo del grado.
        </div>
      `}
      <footer class="student-report-footer">
        <div>
          <strong>Próximo paso</strong>
          <span>Trabaja estas prioridades en clase y pregunta al profesor si tienes dudas.</span>
        </div>
        <div class="student-signature">Firma profesor</div>
      </footer>
    </article>
    `}
  `;

  $('#backToDetails').addEventListener('click', renderExamDetails);
  $('#printReport').addEventListener('click', () => window.print());
  $('#downloadPdf').addEventListener('click', () => downloadEvaluationPdf(report));
  $('#saveReportToFicha').addEventListener('click', () => saveEvaluationReportToFicha(report));
  bindReportCommentEditor(report);
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function imageUrlToDataUrl(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve('');
      return;
    }
    if (String(url).startsWith('data:image/')) {
      resolve(url);
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        resolve('');
      }
    };
    image.onerror = () => resolve('');
    image.src = url;
  });
}

function pdfImageFormat(dataUrl) {
  return String(dataUrl).includes('image/jpeg') || String(dataUrl).includes('image/jpg') ? 'JPEG' : 'PNG';
}

function safeFileName(value) {
  return String(value || 'evaluacion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

async function saveEvaluationReportToFicha(report) {
  const savedToken = localStorage.getItem('skbcSheetToken') || '';
  const token = (prompt('Pega el token configurado en Apps Script para guardar el informe en la ficha:', savedToken) || '').trim();
  if (!token) return;
  localStorage.setItem('skbcSheetToken', token);

  const generated = await downloadEvaluationPdf(report, { save: false });
  if (!generated?.doc) return;

  const dataUri = generated.doc.output('datauristring');
  const pdfBase64 = String(dataUri || '').split(',')[1] || '';
  if (!pdfBase64) {
    showErrors('No se pudo preparar el PDF para subirlo a Drive.');
    return;
  }

  const payload = {
    accion: 'GUARDAR_INFORME_EXAMEN_WEB',
    token,
    alumno: report.studentName || '',
    alumnoRef: report.studentRef || '',
    alumnoId: report.studentSourceId || '',
    programa: report.programType || 'adultos',
    grado: gradeSheetLabel(report.grade),
    gradoFuente: report.sourceGrade ? gradeSheetLabel(report.sourceGrade) : '',
    examinador: report.examinerName || '',
    fechaExamen: report.submittedAt ? new Date(report.submittedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    registradoPor: state.professor?.name || state.professor?.email || 'Sistema exámenes SKBC',
    informeTipo: isKidsReport(report) ? 'infantil' : 'adulto',
    informeNombreArchivo: generated.fileName,
    informePdfBase64: pdfBase64,
    examId: report.examId || '',
    evaluationId: report.evaluationId || '',
  };

  try {
    await fetch(EXAM_SHEET_WEBAPP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    notify('Informe enviado a Apps Script. Revisa la ficha cuando se actualice la caché.');
  } catch (error) {
    showErrors(`No se pudo enviar el informe: ${error.message}`);
  }
}

function downloadStudyExamPdf(report) {
  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    showErrors('No se pudo cargar el generador de PDF. Usa el botón Imprimir y elige Guardar como PDF.');
    return;
  }

  const doc = new jsPdf({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const margin = 28;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 32;

  const addText = (text, x, yy, options = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(options.size || 10);
    doc.setTextColor(...(options.color || [17, 24, 39]));
    doc.text(String(text || ''), x, yy, options);
  };

  const addWrapped = (text, x, yy, width, options = {}) => {
    const lines = doc.splitTextToSize(String(text || ''), width);
    addText(lines, x, yy, options);
    return yy + (lines.length * ((options.size || 10) + 4));
  };

  const ensureSpace = (needed) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  addText('TEMARIO DE ESTUDIO SKBC', margin, y, { size: 10, bold: true, color: [25, 118, 210] });
  y += 20;
  addText(report.examTitle, margin, y, { size: 15, bold: true, color: [18, 79, 141] });
  addText(`${report.programLabel} · ${report.gradeLabel} · ${report.techniqueCount} técnicas`, pageWidth - margin, y, {
    size: 9,
    color: [75, 93, 115],
    align: 'right',
  });
  y += 14;
  doc.setDrawColor(25, 118, 210);
  doc.setLineWidth(2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  const columns = [
    { label: 'Sección', x: margin, width: 92 },
    { label: 'Técnica', x: margin + 96, width: 158 },
    { label: 'Resumen', x: margin + 258, width: 336 },
    { label: 'Mis notas', x: margin + 598, width: pageWidth - margin - (margin + 598) },
  ];

  const drawHeader = () => {
    doc.setFillColor(234, 244, 255);
    doc.rect(margin, y - 11, pageWidth - margin * 2, 18, 'F');
    columns.forEach((column) => addText(column.label, column.x + 3, y, { size: 8, bold: true, color: [18, 55, 94] }));
    y += 14;
  };

  drawHeader();

  report.sections.forEach(([section, techniques]) => {
    techniques.forEach((item) => {
      const nameLines = doc.splitTextToSize(String(techniqueName(item)), columns[1].width - 6);
      const rowHeight = Math.max(34, (Math.max(nameLines.length, 2) * 10) + 16);
      ensureSpace(rowHeight + 12);
      if (y < 50) drawHeader();

      doc.setDrawColor(217, 226, 236);
      doc.rect(margin, y - 10, pageWidth - margin * 2, rowHeight);
      columns.slice(1).forEach((column) => doc.line(column.x - 4, y - 10, column.x - 4, y - 10 + rowHeight));
      addWrapped(section || 'Técnicas', columns[0].x + 3, y, columns[0].width - 6, { size: 7, color: [75, 85, 99] });
      addWrapped(techniqueName(item), columns[1].x + 3, y, columns[1].width - 6, { size: 8, bold: true });
      [columns[2], columns[3]].forEach((column) => {
        const notesTop = y - 3;
        for (let lineY = notesTop + 9; lineY < y - 10 + rowHeight - 4; lineY += 12) {
          doc.setDrawColor(229, 231, 235);
          doc.line(column.x + 4, lineY, column.x + column.width - 6, lineY);
        }
      });
      y += rowHeight;
    });
  });

  doc.save(`${safeFileName(report.examTitle)}-temario.pdf`);
}

async function downloadEvaluationPdf(report, options = {}) {
  if (isKidsReport(report)) {
    return downloadKidsEvaluationPdf(report, options);
  }

  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    showErrors('No se pudo cargar el generador de PDF. Usa el botón Imprimir y elige Guardar como PDF.');
    return null;
  }

  const doc = new jsPdf({ unit: 'pt', format: 'a4' });
  const margin = 32;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 34;
  const improvementItems = report.improvementItems || buildStudentImprovementItems(report.techniqueEvaluations);
  const logoDataUrl = await imageUrlToDataUrl(report.logoUrl);

  const addText = (text, x, yy, options = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(options.size || 10);
    doc.setTextColor(...(options.color || [17, 24, 39]));
    doc.text(String(text || ''), x, yy, options);
  };

  const addWrapped = (text, x, yy, width, options = {}) => {
    const lines = doc.splitTextToSize(String(text || ''), width);
    addText(lines, x, yy, options);
    return yy + (lines.length * ((options.size || 10) + 4));
  };

  const ensureSpace = (needed) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  doc.setFillColor(248, 251, 253);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 82, 8, 8, 'F');
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, pdfImageFormat(logoDataUrl), margin + 14, y + 14, 46, 46);
    } catch (error) {
      addText('SKBC', margin + 22, y + 40, { size: 12, bold: true, color: [18, 79, 141] });
    }
  } else {
    addText('SKBC', margin + 20, y + 40, { size: 12, bold: true, color: [18, 79, 141] });
  }

  addText('INFORME DEL ALUMNO', margin + 72, y + 22, { size: 9, bold: true, color: [25, 118, 210] });
  addText(report.clubName || 'Club SKBC', margin + 72, y + 43, { size: 17, bold: true, color: [18, 79, 141] });
  addText(report.examTitle, margin + 72, y + 63, { size: 9, color: [75, 93, 115] });

  const resultText = report.summary.passed ? 'APROBADO' : 'NECESITA INTENTARLO UNA VEZ MAS';
  doc.setFillColor(...(report.summary.passed ? [231, 247, 232] : [255, 235, 238]));
  doc.roundedRect(pageWidth - margin - 168, y + 24, 148, 30, 6, 6, 'F');
  addText(resultText, pageWidth - margin - 94, y + 43, {
    size: 8,
    bold: true,
    color: report.summary.passed ? [31, 107, 36] : [156, 27, 27],
    align: 'center',
  });

  y += 96;
  doc.setDrawColor(25, 118, 210);
  doc.setLineWidth(2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 22;

  const meta = [
    ['Alumno', report.studentName],
    ['Cinturón actual', reportCurrentBeltLabel(report)],
    ['Cinturón objetivo', reportTargetBeltLabel(report)],
    ['Fecha', formatDate(report.submittedAt)],
    ['Resultado final', `${report.summary.percentage}%`],
  ];

  meta.forEach(([label, value], index) => {
    const boxWidth = (pageWidth - margin * 2 - 24) / 5;
    const x = margin + index * (boxWidth + 6);
    doc.setFillColor(248, 251, 253);
    doc.roundedRect(x, y, boxWidth, 42, 5, 5, 'F');
    addText(label, x + 8, y + 15, { size: 7, bold: true, color: [93, 111, 131] });
    addWrapped(value, x + 8, y + 31, boxWidth - 16, { size: 7.2, bold: index === 0 });
  });
  y += 56;

  addText('Plan de mejora recomendado', margin, y, { size: 13, bold: true, color: [18, 55, 94] });
  y = addWrapped(studentReportIntro({ ...report, improvementItems }), margin, y + 16, pageWidth - margin * 2, { size: 8, color: [75, 85, 99] }) + 10;

  if (improvementItems.length) {
    const columns = [
      { label: 'Prioridad', x: margin, width: 82 },
      { label: 'Técnica', x: margin + 88, width: 172 },
      { label: 'Qué reforzar', x: margin + 266, width: pageWidth - margin - (margin + 266) },
    ];

    doc.setFillColor(234, 244, 255);
    doc.rect(margin, y - 12, pageWidth - margin * 2, 22, 'F');
    columns.forEach((column) => addText(column.label, column.x + 5, y + 2, { size: 8, bold: true, color: [18, 55, 94] }));
    y += 15;

    improvementItems.forEach((item) => {
      const advice = item.notes || item.defaultAdvice;
      const rowHeight = Math.max(30, doc.splitTextToSize(advice, columns[2].width - 12).length * 9 + 16);
      ensureSpace(rowHeight + 10);
      doc.setDrawColor(217, 226, 236);
      doc.rect(margin, y - 10, pageWidth - margin * 2, rowHeight);
      doc.line(columns[1].x - 4, y - 10, columns[1].x - 4, y - 10 + rowHeight);
      doc.line(columns[2].x - 4, y - 10, columns[2].x - 4, y - 10 + rowHeight);
      addText(item.levelLabel, columns[0].x + 6, y + 2, { size: 7, bold: true, color: item.levelClass === 'high' ? [156, 27, 27] : [18, 79, 141] });
      addWrapped(item.name, columns[1].x + 5, y, columns[1].width - 10, { size: 8, bold: true });
      if (item.section) addWrapped(item.section, columns[1].x + 5, y + 13, columns[1].width - 10, { size: 6.5, color: [93, 111, 131] });
      addWrapped(advice, columns[2].x + 5, y, columns[2].width - 10, { size: 7.5, color: [55, 65, 81] });
      y += rowHeight;
    });
  } else {
    doc.setFillColor(248, 251, 253);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 42, 6, 6, 'F');
    addWrapped('No hay técnicas señaladas como prioritarias. Mantén el entrenamiento regular y repasa el temario completo del grado.', margin + 12, y + 18, pageWidth - margin * 2 - 24, { size: 9 });
    y += 54;
  }

  ensureSpace(46);
  y = pageHeight - margin - 30;
  doc.setDrawColor(17, 24, 39);
  doc.line(pageWidth - margin - 190, y, pageWidth - margin, y);
  addText('Firma profesor', pageWidth - margin - 190, y + 16, { size: 8, color: [75, 85, 99] });

  const fileName = `${safeFileName(report.studentName)}-${safeFileName(report.examTitle)}.pdf`;
  if (options.save !== false) doc.save(fileName);
  return { doc, fileName };
}

async function downloadKidsEvaluationPdf(report, options = {}) {
  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    showErrors('No se pudo cargar el generador de PDF. Usa el botón Imprimir y elige Guardar como PDF.');
    return null;
  }

  const doc = new jsPdf({ unit: 'pt', format: 'a4' });
  const margin = 28;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const improvementItems = report.improvementItems || buildStudentImprovementItems(report.techniqueEvaluations);
  const strengthItems = report.strengthItems || buildStudentStrengthItems(report.techniqueEvaluations);
  const logoDataUrl = await imageUrlToDataUrl(report.logoUrl);
  let y = margin;

  const addText = (text, x, yy, options = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(options.size || 10);
    doc.setTextColor(...(options.color || [17, 24, 39]));
    doc.text(String(text || ''), x, yy, options);
  };

  const addWrapped = (text, x, yy, width, options = {}) => {
    const lines = doc.splitTextToSize(String(text || ''), width);
    addText(lines, x, yy, options);
    return yy + (lines.length * ((options.size || 10) + 4));
  };

  doc.setFillColor(245, 250, 255);
  doc.roundedRect(margin, y, contentWidth, 112, 10, 10, 'F');
  doc.setFillColor(25, 118, 210);
  doc.rect(margin, y, 8, 112, 'F');

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, pdfImageFormat(logoDataUrl), margin + 22, y + 20, 58, 58);
    } catch (error) {
      addText('SKBC', margin + 28, y + 53, { size: 13, bold: true, color: [18, 79, 141] });
    }
  } else {
    addText('SKBC', margin + 28, y + 53, { size: 13, bold: true, color: [18, 79, 141] });
  }

  addText('INFORME DE PROGRESO INFANTIL', margin + 96, y + 28, { size: 9, bold: true, color: [25, 118, 210] });
  addWrapped(report.studentName, margin + 96, y + 55, 250, { size: 22, bold: true, color: [18, 55, 94] });
  addWrapped(report.examTitle, margin + 96, y + 78, 275, { size: 9, color: [75, 93, 115] });

  doc.setFillColor(...(report.summary.passed ? [230, 246, 228] : [255, 244, 217]));
  doc.roundedRect(pageWidth - margin - 158, y + 28, 134, 48, 8, 8, 'F');
  addText(report.summary.passed ? 'Enhorabuena' : 'Sigue entrenando', pageWidth - margin - 91, y + 47, {
    size: 8,
    bold: true,
    color: report.summary.passed ? [47, 111, 43] : [130, 78, 0],
    align: 'center',
  });
  addText(kidsReportResultText(report), pageWidth - margin - 91, y + 64, {
    size: 8,
    bold: true,
    color: report.summary.passed ? [47, 111, 43] : [130, 78, 0],
    align: 'center',
  });
  y += 132;

  const meta = [
    ['Cinturón actual', reportCurrentBeltLabel(report)],
    ['Cinturón objetivo', reportTargetBeltLabel(report)],
    ['Fecha', formatDate(report.submittedAt)],
    ['Resultado', `${report.summary.percentage}%`],
  ];
  const metaWidth = (contentWidth - 18) / 4;
  meta.forEach(([label, value], index) => {
    const x = margin + index * (metaWidth + 6);
    doc.setFillColor(249, 251, 253);
    doc.roundedRect(x, y, metaWidth, 44, 6, 6, 'F');
    addText(label, x + 10, y + 16, { size: 8, bold: true, color: [93, 111, 131] });
    addWrapped(value, x + 10, y + 32, metaWidth - 20, { size: 8, bold: index === 3, color: [17, 24, 39] });
  });
  y += 62;

  doc.setFillColor(255, 252, 234);
  doc.roundedRect(margin, y, contentWidth, 62, 8, 8, 'F');
  doc.setFillColor(255, 193, 7);
  doc.circle(margin + 30, y + 31, 14, 'F');
  addText(report.summary.passed ? '1' : '!', margin + 30, y + 36, { size: 12, bold: true, color: [255, 255, 255], align: 'center' });
  addText(report.summary.passed ? 'Buen trabajo' : 'Proximo intento', margin + 56, y + 23, { size: 13, bold: true, color: [18, 55, 94] });
  addWrapped(kidsReportIntro({ ...report, improvementItems }), margin + 56, y + 41, contentWidth - 74, { size: 8.5, color: [75, 85, 99] });
  y += 82;

  const panelWidth = (contentWidth - 12) / 2;
  const panelHeight = 116;
  doc.setFillColor(241, 249, 243);
  doc.roundedRect(margin, y, panelWidth, panelHeight, 8, 8, 'F');
  addText('Lo mejor de tu examen', margin + 14, y + 22, { size: 12, bold: true, color: [47, 111, 43] });
  let listY = y + 42;
  if (strengthItems.length) {
    strengthItems.slice(0, 4).forEach((item) => {
      addText('-', margin + 15, listY, { size: 9, bold: true, color: [47, 111, 43] });
      listY = addWrapped(item.name, margin + 28, listY, panelWidth - 40, { size: 8, color: [31, 41, 55] }) + 2;
    });
  } else {
    addWrapped('Has completado el examen y eso ya es un paso importante. Sigue sumando buenos entrenamientos.', margin + 14, listY, panelWidth - 28, { size: 8, color: [31, 41, 55] });
  }

  doc.setFillColor(238, 246, 255);
  doc.roundedRect(margin + panelWidth + 12, y, panelWidth, panelHeight, 8, 8, 'F');
  addText('Recomendamos reforzar', margin + panelWidth + 26, y + 22, { size: 12, bold: true, color: [18, 79, 141] });
  addWrapped(improvementItems.length
    ? 'Los apartados que mostramos a continuación son los que han tenido alguna incidencia en el examen.'
    : 'No se han marcado incidencias concretas. Mantén la concentración, el respeto y la energía en cada clase.',
    margin + panelWidth + 26,
    y + 44,
    panelWidth - 28,
    { size: 8, color: [31, 41, 55] });
  y += panelHeight + 28;

  addText('Retos para practicar', margin, y, { size: 15, bold: true, color: [18, 55, 94] });
  y += 16;
  if (improvementItems.length) {
    improvementItems.slice(0, 6).forEach((item, index) => {
      const advice = item.notes || item.defaultAdvice;
      const rowHeight = Math.max(48, doc.splitTextToSize(advice, contentWidth - 92).length * 9 + 32);
      doc.setFillColor(index % 2 ? 249 : 255, index % 2 ? 251 : 255, index % 2 ? 253 : 255);
      doc.roundedRect(margin, y, contentWidth, rowHeight, 6, 6, 'F');
      doc.setFillColor(item.levelClass === 'high' ? 220 : 25, item.levelClass === 'high' ? 74 : 118, item.levelClass === 'high' ? 74 : 210);
      doc.circle(margin + 22, y + 24, 12, 'F');
      addText(String(index + 1), margin + 22, y + 29, { size: 10, bold: true, color: [255, 255, 255], align: 'center' });
      addWrapped(item.name, margin + 46, y + 20, contentWidth - 64, { size: 10, bold: true, color: [17, 24, 39] });
      if (item.section) addText(item.section, margin + 46, y + 35, { size: 7, color: [93, 111, 131] });
      addWrapped(advice, margin + 46, y + 50, contentWidth - 64, { size: 8, color: [55, 65, 81] });
      y += rowHeight + 7;
    });
  } else {
    doc.setFillColor(248, 251, 253);
    doc.roundedRect(margin, y, contentWidth, 48, 6, 6, 'F');
    addWrapped('No hay retos prioritarios marcados. Repasa el temario completo y sigue entrenando igual de bien.', margin + 14, y + 22, contentWidth - 28, { size: 9 });
    y += 60;
  }

  y = Math.min(y + 8, pageHeight - 74);
  doc.setFillColor(245, 250, 255);
  doc.roundedRect(margin, y, contentWidth, 50, 8, 8, 'F');
  addText('Mensaje del sensei', margin + 14, y + 19, { size: 9, bold: true, color: [18, 55, 94] });
  addWrapped('Lo importante es mejorar un poco cada dia: atencion, respeto y ganas de aprender.', margin + 14, y + 35, contentWidth - 220, { size: 8, color: [75, 85, 99] });
  doc.setDrawColor(17, 24, 39);
  doc.line(pageWidth - margin - 176, y + 30, pageWidth - margin - 18, y + 30);
  addText('Firma profesor', pageWidth - margin - 176, y + 43, { size: 7, color: [75, 85, 99] });

  const fileName = `${safeFileName(report.studentName)}-${safeFileName(report.examTitle)}-infantil.pdf`;
  if (options.save !== false) doc.save(fileName);
  return { doc, fileName };
}

async function updateExamStatus(examId, status) {
  const { error } = await supabase.from('exams').update({ status }).eq('id', examId);
  if (error) {
    showErrors(error.message);
    return;
  }
  await loadExams();
}

async function duplicateExam(examId) {
  const exam = state.exams.find((item) => item.id === examId);
  if (!exam) return;

  const suggestedTitle = `Copia de ${exam.title || 'examen'}`;
  const title = (prompt('Título para la copia del examen:', suggestedTitle) || '').trim();
  if (!title) return;

  state.examTemplateDraft = {
    original_title: exam.title,
    title,
    program_type: exam.program_type || 'adultos',
    grade: exam.grade,
    source_grade: exam.source_grade || exam.grade,
    folder_id: exam.folder_id || null,
    techniques: JSON.parse(JSON.stringify(exam.techniques || [])),
    pass_percentage: exam.pass_percentage || 65,
  };
  switchTab('create');
  notify('Copia cargada. Añade alumnos y examinadores, y después crea la nueva convocatoria.', 'success');
}

async function deleteExam(examId) {
  if (!confirm('¿Eliminar este examen y sus datos asociados?')) return;
  const { error } = await supabase.from('exams').delete().eq('id', examId);
  if (error) {
    showErrors(error.message);
    return;
  }
  await loadExams();
  notify('Examen eliminado.');
}

function renderResults() {
  const exams = filteredExams();
  const examsWithResults = exams.map((exam) => `
    <article class="card">
      <h3>${escapeHtml(exam.title)}</h3>
      <p>${escapeHtml(gradeLabel(exam.grade))}</p>
      <p>${escapeHtml(folderName(exam.folder_id))}</p>
      <button class="btn btn-primary btn-small view-exam" data-id="${exam.id}">Ver resultados</button>
    </article>
  `).join('');

  $('#panelContent').innerHTML = `
    <div class="section-head">
      <div>
        <h2>Resultados</h2>
        <p>Abre un examen para revisar evaluaciones, notas y aprobados.</p>
      </div>
    </div>
    <div class="folder-layout">
      ${renderFolderPanel()}
      <div>
        <div class="folder-current">
          <strong>${escapeHtml(currentFolderTitle())}</strong>
          <span>${exams.length} examen${exams.length === 1 ? '' : 'es'}</span>
        </div>
        <div class="exam-grid">${examsWithResults || '<div class="empty">No hay resultados en esta carpeta.</div>'}</div>
      </div>
    </div>
  `;
  $('#folderForm').addEventListener('submit', createExamFolder);
  $$('.folder-filter').forEach((button) => button.addEventListener('click', () => {
    state.activeExamFolderId = button.dataset.folderId;
    renderResults();
  }));
  $$('.rename-folder').forEach((button) => button.addEventListener('click', () => renameExamFolder(button.dataset.id)));
  $$('.delete-folder').forEach((button) => button.addEventListener('click', () => deleteExamFolder(button.dataset.id)));
  $$('.view-exam').forEach((button) => button.addEventListener('click', () => viewExamDetails(button.dataset.id)));
}

async function renderExaminerApp(token) {
  app.innerHTML = `
    <section class="examiner-card">
      <div class="boot-screen" style="margin:0 auto;box-shadow:none">
        <div class="brand-mark">SKBC</div>
        <p>Cargando formulario de evaluación...</p>
      </div>
    </section>
  `;

  const { data, error } = await supabase.rpc('get_examiner_exam_payload', { p_token: token });
  if (error || !data) {
    app.innerHTML = `<section class="examiner-card"><div class="notice error">El enlace no es válido o el examen ya no está disponible.</div></section>`;
    return;
  }

  state.examinerPayload = data;
  state.examinerPayload.token = token;

  if (data.submitted) {
    app.innerHTML = `<section class="examiner-card"><div class="notice success">Esta evaluación ya fue enviada. Gracias.</div></section>`;
    return;
  }

  data.students.forEach((student) => {
    state.examinerAnswers[student.id] = (data.exam.techniques || []).map((technique) => ({
      technique_name: techniqueName(technique),
      section: techniqueSection(technique),
      weight: technique.weight || 1,
      score: null,
      skipped: technique?.type === 'cut',
      notes: '',
      type: technique?.type || 'technique',
      cut_belt: technique?.cut_belt || '',
    }));
  });

  renderExaminerForm();
}

function renderExaminerForm() {
  const payload = state.examinerPayload;
  const techniques = payload.exam.techniques || [];
  const techniqueIndex = state.examinerTechniqueIndex;
  const currentTechnique = techniques[techniqueIndex];
  if (isCutTechnique(currentTechnique)) {
    renderProgressiveCutStep(payload, techniques, techniqueIndex, currentTechnique);
    return;
  }
  const currentTechniqueName = techniqueName(currentTechnique);
  const currentTechniqueSummary = techniqueSummary(currentTechnique);
  const currentTechniqueWeight = currentTechnique?.weight || 1;
  const currentSection = techniqueSection(currentTechnique) || 'Técnicas';
  const previousSection = techniqueIndex > 0 ? techniqueSection(techniques[techniqueIndex - 1]) : '';
  const sectionChanged = techniqueIndex === 0 || currentSection !== previousSection;
  const sectionLead = techniqueIndex === 0 ? 'Empezamos con' : 'Seguimos con';
  const progress = Math.round(((techniqueIndex + 1) / techniques.length) * 100);
  const activeStudents = payload.students.filter((student) => isStudentActiveAtTechnique(student, techniques, techniqueIndex));
  const completedForTechnique = activeStudents.filter((student) => answerComplete(state.examinerAnswers[student.id][techniqueIndex])).length;

  app.innerHTML = `
    <section class="examiner-card">
      <div id="noticeOutlet"></div>
      <div class="examiner-header">
        <div>
          <h1>${escapeHtml(payload.exam.title)}</h1>
          <p>${escapeHtml(gradeLabel(payload.exam.grade))} · Examinador: ${escapeHtml(payload.examiner.name)}</p>
        </div>
        <span class="status active">Técnica ${techniqueIndex + 1} de ${techniques.length}</span>
      </div>
      <div class="progress"><span style="width:${progress}%"></span></div>
      ${sectionChanged ? `<div class="section-break">${sectionLead} la sección de ${escapeHtml(currentSection)}</div>` : ''}
      <div class="technique-stage">
        <div>
          <p>Técnica actual</p>
          <h2>${escapeHtml(currentTechniqueName)}</h2>
          <p class="technique-weight-label">Peso ${escapeHtml(currentTechniqueWeight)}</p>
          ${currentTechniqueSummary ? `<div class="technique-summary">${escapeHtml(currentTechniqueSummary)}</div>` : ''}
        </div>
        <span class="status ${completedForTechnique === activeStudents.length ? 'passed' : 'draft'}">${completedForTechnique}/${activeStudents.length} alumnos activos</span>
      </div>
      <form id="examinerForm">
        ${activeStudents.length ? activeStudents.map((student) => renderStudentTechniqueRow(student, techniqueIndex)).join('') : '<div class="empty">No quedan alumnos activos en este punto del examen.</div>'}
        <div class="btn-row" style="margin-top:22px;justify-content:space-between">
          <button class="btn btn-secondary" type="button" id="prevTechnique" ${techniqueIndex === 0 ? 'disabled' : ''}>Técnica anterior</button>
          <button class="btn btn-secondary" type="button" id="skipTechnique">Omitir técnica para todos</button>
          ${techniqueIndex === techniques.length - 1
            ? '<button class="btn btn-success" type="submit">Enviar evaluación completa</button>'
            : '<button class="btn btn-primary" type="button" id="nextTechnique">Siguiente técnica</button>'}
        </div>
      </form>
    </section>
  `;

  $$('.score-btn').forEach((button) => button.addEventListener('click', () => setScore(button)));
  $$('.tech-notes').forEach((textarea) => textarea.addEventListener('input', () => {
    state.examinerAnswers[textarea.dataset.studentId][techniqueIndex].notes = textarea.value;
  }));
  $('#prevTechnique').addEventListener('click', () => moveTechnique(-1));
  $('#nextTechnique')?.addEventListener('click', () => moveTechnique(1));
  $('#skipTechnique').addEventListener('click', skipCurrentTechniqueForAll);
  $('#examinerForm').addEventListener('submit', submitExaminerEvaluation);
}

function isCutTechnique(item) {
  return item?.type === 'cut';
}

function normalizeBeltText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function beltMatchesCut(studentBelt, cutBelt) {
  return normalizeBeltKey(studentBelt) === normalizeBeltKey(cutBelt);
}

function studentCutIndex(student, techniques) {
  return techniques.findIndex((item) => isCutTechnique(item) && beltMatchesCut(student.student_belt_color, item.cut_belt));
}

function isStudentActiveAtTechnique(student, techniques, techniqueIndex) {
  const cutIndex = studentCutIndex(student, techniques);
  return cutIndex === -1 || techniqueIndex <= cutIndex;
}

function renderProgressiveCutStep(payload, techniques, techniqueIndex, currentTechnique) {
  payload.students.forEach((student) => {
    const answer = state.examinerAnswers[student.id][techniqueIndex];
    answer.score = null;
    answer.skipped = true;
  });

  const progress = Math.round(((techniqueIndex + 1) / techniques.length) * 100);
  const cutBelt = currentTechnique.cut_belt || techniqueName(currentTechnique).replace(/^Corte:\s*se sientan\s*/i, '');
  const seatedStudents = payload.students.filter((student) => beltMatchesCut(student.student_belt_color, cutBelt));
  const stillActive = payload.students.filter((student) => isStudentActiveAtTechnique(student, techniques, techniqueIndex + 1));

  app.innerHTML = `
    <section class="examiner-card">
      <div id="noticeOutlet"></div>
      <div class="examiner-header">
        <div>
          <h1>${escapeHtml(payload.exam.title)}</h1>
          <p>${escapeHtml(gradeLabel(payload.exam.grade))} · Examinador: ${escapeHtml(payload.examiner.name)}</p>
        </div>
        <span class="status active">Corte ${techniqueIndex + 1} de ${techniques.length}</span>
      </div>
      <div class="progress"><span style="width:${progress}%"></span></div>
      <div class="progressive-cut-stage">
        <p class="print-kicker">Corte de grado</p>
        <h2>Mandar sentarse a ${escapeHtml(cutBelt)}</h2>
        <p>Este paso no puntúa. A partir de la siguiente técnica, estos alumnos quedan fuera del resto del examen.</p>
        <div class="grid-2">
          <section class="card">
            <h3>Se sientan ahora</h3>
            ${seatedStudents.length ? seatedStudents.map((student) => `<p>${escapeHtml(student.student_name)} · ${escapeHtml(student.student_belt_color)}</p>`).join('') : '<p>No hay alumnos de este cinturón en la convocatoria.</p>'}
          </section>
          <section class="card">
            <h3>Continúan</h3>
            ${stillActive.length ? stillActive.map((student) => `<p>${escapeHtml(student.student_name)} · ${escapeHtml(student.student_belt_color)}</p>`).join('') : '<p>No quedan alumnos activos después de este corte.</p>'}
          </section>
        </div>
      </div>
      <div class="btn-row" style="margin-top:22px;justify-content:space-between">
        <button class="btn btn-secondary" type="button" id="prevTechnique" ${techniqueIndex === 0 ? 'disabled' : ''}>Paso anterior</button>
        ${techniqueIndex === techniques.length - 1
          ? '<button class="btn btn-success" type="button" id="submitFromCut">Enviar evaluación completa</button>'
          : '<button class="btn btn-primary" type="button" id="nextTechnique">Siguiente paso</button>'}
      </div>
    </section>
  `;

  $('#prevTechnique').addEventListener('click', () => moveTechnique(-1));
  $('#nextTechnique')?.addEventListener('click', () => moveTechnique(1));
  $('#submitFromCut')?.addEventListener('click', () => submitExaminerEvaluation(new Event('submit')));
}

function renderStudentTechniqueRow(student, techniqueIndex) {
  const answer = state.examinerAnswers[student.id][techniqueIndex];
  return `
    <div class="score-row">
      <div>
        <strong>${escapeHtml(student.student_name)}</strong>
        <p>${escapeHtml(student.student_belt_color)}</p>
        <textarea class="tech-notes" data-student-id="${student.id}" placeholder="Observaciones">${escapeHtml(answer.notes)}</textarea>
      </div>
      <div class="score-options">
        ${scoreButton(student.id, 10, 'Correcto')}
        ${scoreButton(student.id, 5, 'Mejorable')}
        ${scoreButton(student.id, 0, 'No cumple')}
        ${skipButton(student.id)}
      </div>
    </div>
  `;
}

function scoreButton(studentId, score, label) {
  const answer = state.examinerAnswers[studentId][state.examinerTechniqueIndex];
  const selected = !answer.skipped && answer.score === score;
  return `<button class="score-btn score-${score} ${selected ? 'selected' : ''}" type="button" data-student-id="${studentId}" data-score="${score}">${label}<br>${score} pts</button>`;
}

function skipButton(studentId) {
  const answer = state.examinerAnswers[studentId][state.examinerTechniqueIndex];
  return `<button class="score-btn score-skip ${answer.skipped ? 'selected' : ''}" type="button" data-student-id="${studentId}" data-skip="true">Omitir<br>sin nota</button>`;
}

function setScore(button) {
  const answer = state.examinerAnswers[button.dataset.studentId][state.examinerTechniqueIndex];
  if (button.dataset.skip === 'true') {
    answer.score = null;
    answer.skipped = true;
  } else {
    answer.score = Number(button.dataset.score);
    answer.skipped = false;
  }
  renderExaminerForm();
}

function answerComplete(answer) {
  return answer.skipped || Number.isInteger(answer.score);
}

function moveTechnique(delta) {
  const maxIndex = Math.max(0, (state.examinerPayload?.exam?.techniques || []).length - 1);
  state.examinerTechniqueIndex = Math.min(maxIndex, Math.max(0, state.examinerTechniqueIndex + delta));
  renderExaminerForm();
}

function skipCurrentTechniqueForAll() {
  const techniques = state.examinerPayload.exam.techniques || [];
  state.examinerPayload.students
    .filter((student) => isStudentActiveAtTechnique(student, techniques, state.examinerTechniqueIndex))
    .forEach((student) => {
    const answer = state.examinerAnswers[student.id][state.examinerTechniqueIndex];
    answer.score = null;
    answer.skipped = true;
  });
  renderExaminerForm();
}

function finalizeProgressiveAnswers() {
  const techniques = state.examinerPayload.exam.techniques || [];
  state.examinerPayload.students.forEach((student) => {
    techniques.forEach((technique, index) => {
      const answer = state.examinerAnswers[student.id][index];
      if (isCutTechnique(technique) || !isStudentActiveAtTechnique(student, techniques, index)) {
        answer.score = null;
        answer.skipped = true;
      }
    });
  });
}

async function submitExaminerEvaluation(event) {
  event.preventDefault();

  finalizeProgressiveAnswers();
  const techniques = state.examinerPayload.exam.techniques || [];
  const missing = state.examinerPayload.students.some((student) =>
    state.examinerAnswers[student.id].some((answer, index) =>
      !isCutTechnique(techniques[index]) &&
      isStudentActiveAtTechnique(student, techniques, index) &&
      !answerComplete(answer)
    )
  );
  if (missing) {
    showErrors('Hay técnicas sin evaluar u omitir. Usa Omitir si no quieres puntuar alguna técnica.');
    return;
  }
  if (!confirm('¿Enviar la evaluación? Después no se podrá modificar.')) return;

  const evaluations = state.examinerPayload.students.map((student) => {
    const techniqueEvaluations = state.examinerAnswers[student.id];
    const summary = calculateEvaluationSummary(techniqueEvaluations, state.examinerPayload.exam.pass_percentage);
    return {
      student_id: student.id,
      technique_evaluations: techniqueEvaluations,
      total_score: summary.totalScore,
      percentage: summary.percentage,
      passed: summary.passed,
    };
  });

  const { error } = await supabase.rpc('submit_examiner_evaluation', {
    p_token: state.examinerPayload.token,
    p_evaluations: evaluations,
  });

  if (error) {
    showErrors(error.message);
    return;
  }

  app.innerHTML = `
    <section class="examiner-card">
      <div class="notice success">Evaluación enviada correctamente. Gracias.</div>
    </section>
  `;
}

init().catch((error) => {
  console.error(error);
  app.innerHTML = `<section class="auth-card"><div class="notice error">${escapeHtml(error.message)}</div></section>`;
});



