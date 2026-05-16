import {
  EXAM_SHEET_WEBAPP_URL,
  SUPABASE_KEY,
  SUPABASE_URL,
  buildExamSheetPayload,
  buildPrintableEvaluation,
  calculateEvaluationSummary,
  getPreviousGohoJuhoTechniqueItems,
  getSelectedTechniques,
  getOrderedTechniqueItems,
  gradeLabel,
  gradeSheetLabel,
  grades,
  normalizeToken,
  syllabusData,
  techniqueName,
  techniqueSection,
  techniqueSummary,
  validateExamDraft,
} from './exam-core.mjs';

const app = document.getElementById('app');
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  user: null,
  professor: null,
  activeTab: 'config',
  exams: [],
  selectedExam: null,
  examinerPayload: null,
  examinerTechniqueIndex: 0,
  examinerAnswers: {},
  customTechniqueCounter: 0,
  techniqueRowCounter: 0,
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

function renderExamList() {
  $('#panelContent').innerHTML = `
    <div class="section-head">
      <div>
        <h2>Mis exámenes</h2>
        <p>Gestiona estado, enlaces de examinador y detalles.</p>
      </div>
      <button class="btn btn-primary" id="newExamBtn">Crear examen</button>
    </div>
    <div class="exam-grid">
      ${state.exams.length ? state.exams.map(renderExamCard).join('') : '<div class="empty">Todavía no hay exámenes creados.</div>'}
    </div>
  `;

  $('#newExamBtn').addEventListener('click', () => switchTab('create'));
  $$('.view-exam').forEach((button) => button.addEventListener('click', () => viewExamDetails(button.dataset.id)));
  $$('.delete-exam').forEach((button) => button.addEventListener('click', () => deleteExam(button.dataset.id)));
  $$('.status-select').forEach((select) => select.addEventListener('change', () => updateExamStatus(select.dataset.id, select.value)));
}

function renderExamCard(exam) {
  return `
    <article class="card">
      <h3>${escapeHtml(exam.title)}</h3>
      <p><strong>Grado:</strong> ${escapeHtml(gradeLabel(exam.grade))}</p>
      <p><strong>Técnicas:</strong> ${(exam.techniques || []).length}</p>
      <p><strong>Aprobación:</strong> ${exam.pass_percentage}%</p>
      <span class="status ${escapeHtml(exam.status || 'draft')}">${escapeHtml(exam.status || 'draft')}</span>
      <div class="field" style="margin-top:12px">
        <label>Estado</label>
        <select class="status-select" data-id="${exam.id}">
          ${['draft', 'active', 'completed'].map((status) => `<option value="${status}" ${exam.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary btn-small view-exam" data-id="${exam.id}">Ver detalles</button>
        <button class="btn btn-danger btn-small delete-exam" data-id="${exam.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function renderCreateExam() {
  state.customTechniqueCounter = 0;
  $('#panelContent').innerHTML = `
    <div class="section-head">
      <div>
        <h2>Crear examen</h2>
        <p>Define técnicas, estudiantes y examinadores en un único flujo.</p>
      </div>
    </div>
    <form id="examForm">
      <div class="grid-3">
        <div class="field">
          <label for="examTitle">Título</label>
          <input id="examTitle" placeholder="Examen 3 KYU - Mayo 2026" required />
        </div>
        <div class="field">
          <label for="examGrade">Grado al que se examina</label>
          <select id="examGrade" required>
            <option value="">Selecciona un grado</option>
            ${grades.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="passPercentage">Aprobación: <span id="passLabel">65%</span></label>
          <input id="passPercentage" type="range" min="40" max="90" value="65" />
        </div>
      </div>
      <div class="notice">Selecciona el grado objetivo del examen: Minarai/Blanco examina 5 KYU, 5 KYU examina 4 KYU, 4 KYU examina 3 KYU, y así sucesivamente.</div>
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
      <button class="btn btn-success" type="submit" style="margin-top:24px">Crear examen y enlaces</button>
    </form>
  `;

  $('#examGrade').addEventListener('change', async () => {
    renderTechniquesForGrade();
    $('#sheetStudentsArea').innerHTML = '';
    await loadTechniqueSummariesForGrade($('#examGrade').value);
  });
  $('#passPercentage').addEventListener('input', () => { $('#passLabel').textContent = `${$('#passPercentage').value}%`; });
  $('#loadSheetStudentsBtn').addEventListener('click', loadSheetStudentsForExam);
  $('#addStudentBtn').addEventListener('click', addStudentRow);
  $('#addExaminerBtn').addEventListener('click', addExaminerRow);
  $('#examForm').addEventListener('submit', createExam);
  addStudentRow();
  addExaminerRow();
}

function renderTechniquesForGrade() {
  const grade = $('#examGrade').value;
  const orderedItems = getOrderedTechniqueItems(grade);
  const previousGohoJuhoItems = getPreviousGohoJuhoTechniqueItems(grade);
  const blocks = groupTechniqueItemsBySection(orderedItems);
  state.techniqueRowCounter = 0;
  $('#techniquesArea').innerHTML = `
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
  const grade = $('#examGrade')?.value || '';
  const rowId = nextTechniqueRowId();
  return `
    <div class="tech-item technique-editor" data-technique-row data-technique-row-id="${escapeHtml(rowId)}">
      <label class="technique-check">
        <input type="checkbox" data-technique data-section="${escapeHtml(item.section)}" data-grade="${escapeHtml(grade)}" data-original-name="${escapeHtml(item.name)}" value="${escapeHtml(item.name)}" checked />
        <span class="sr-only">Incluir técnica</span>
      </label>
      <input id="${escapeHtml(inputId)}" class="technique-name-input" data-technique-name value="${escapeHtml(item.name)}" aria-label="Nombre de técnica" />
      <label class="technique-weight">
        <span>Peso</span>
        <select data-technique-weight aria-label="Peso de técnica">
          ${[1, 2, 3, 4, 5].map((weight) => `<option value="${weight}">${weight}</option>`).join('')}
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
    grade: $('#examGrade')?.value || '',
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
  $('#studentsArea').insertAdjacentHTML('beforeend', `
    <div class="row-card student-row">
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
}

function studentBeltOptions(selected = '') {
  const belts = ['Blanco (Minarai)', 'Amarillo', 'Naranja', 'Verde', 'Azul', 'Marrón', 'Negro'];
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

async function loadSheetStudentsForExam() {
  const grade = $('#examGrade')?.value || '';
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
    const payload = await fetchSheetStudentsJsonp({
      token,
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

function fetchSheetStudentsJsonp({ token, targetGrade, targetGradeLabel, currentGrade }) {
  return new Promise((resolve, reject) => {
    const callbackName = `skbcStudentsCallback_${normalizeToken(8)}`;
    const url = new URL(EXAM_SHEET_WEBAPP_URL);
    url.searchParams.set('accion', 'LISTAR_ALUMNOS_EXAMEN_WEB');
    url.searchParams.set('token', token);
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
          return `
            <label class="sheet-student-option">
              <input type="checkbox" data-sheet-student-index="${index}" checked />
              <span>
                <strong>${escapeHtml(name || 'Alumno sin nombre')}</strong>
                <small>${escapeHtml(belt || currentBeltForTargetGrade(targetGrade))}</small>
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

function addExaminerRow() {
  $('#examinersArea').insertAdjacentHTML('beforeend', `
    <div class="row-card examiner-row">
      <div class="field">
        <label>Nombre</label>
        <input class="examiner-name" required />
      </div>
      <button class="btn btn-danger btn-small" type="button" data-remove-row>Eliminar</button>
    </div>
  `);
  bindRemoveButtons();
}

function bindRemoveButtons() {
  $$('[data-remove-row]').forEach((button) => {
    button.onclick = () => button.closest('.row-card').remove();
  });
}

function collectDraft() {
  const form = $('#examForm');
  return {
    title: $('#examTitle').value.trim(),
    grade: $('#examGrade').value,
    passPercentage: Number($('#passPercentage').value),
    techniques: getSelectedTechniques(form),
    students: $$('.student-row').map((row, idx) => ({
      student_name: $('.student-name', row).value.trim(),
      student_belt_color: $('.student-belt', row).value,
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
  await loadTechniqueSummariesForGrade(draft.grade);
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

  state.selectedExam = {
    ...exam,
    students: studentsRes.data || [],
    links: linksRes.data || [],
    evaluations: evaluationsRes.data || [],
  };

  renderExamDetails();
}

function renderExamDetails() {
  const exam = state.selectedExam;
  $('#panelContent').innerHTML = `
    <div class="section-head">
      <div>
        <h2>${escapeHtml(exam.title)}</h2>
        <p>${escapeHtml(gradeLabel(exam.grade))} · ${(exam.techniques || []).length} técnicas · aprobado desde ${exam.pass_percentage}%</p>
      </div>
      <div class="btn-row">
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
      <section>
        <h3>Resultados recibidos</h3>
        <div class="card-list">
          ${exam.evaluations.length ? exam.evaluations.map(renderEvaluationCard).join('') : '<div class="empty">Todavía no hay evaluaciones enviadas.</div>'}
        </div>
      </section>
    </div>
  `;
  $('#backToExams').addEventListener('click', renderExamList);
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
  const passPercentage = state.selectedExam?.pass_percentage || 0;
  const adjustmentPoints = evaluationAdjustmentPoints(evaluation);
  const originalSummary = calculateEvaluationSummary(techniqueEvaluations, passPercentage);
  const summary = calculateEvaluationSummary(techniqueEvaluations, passPercentage, adjustmentPoints);
  const skippedCount = techniqueEvaluations.filter((item) => item.skipped).length;
  const evaluatedCount = techniqueEvaluations.length - skippedCount;
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
        ${techniqueEvaluations.map((item) => `
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

async function registerPassedStudentsInSheet() {
  const exam = state.selectedExam;
  if (!exam) return;

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
      grade: exam.grade,
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

  state.printReport = report;
  $('#panelContent').innerHTML = `
    <div class="print-toolbar">
      <button class="btn btn-secondary" id="backToDetails">Volver a resultados</button>
      <div class="btn-row">
        <button class="btn btn-secondary" id="printReport">Imprimir</button>
        <button class="btn btn-primary" id="downloadPdf">Descargar PDF</button>
      </div>
    </div>
    <article class="print-report">
      <header class="print-report-head">
        <div>
          <p class="print-kicker">Evaluación SKBC</p>
          <h1>${escapeHtml(report.clubName || 'Club SKBC')}</h1>
          <h2>${escapeHtml(report.examTitle)}</h2>
        </div>
        <div class="print-result ${report.summary.passed ? 'passed' : 'failed'}">
          ${report.summary.passed ? 'APROBADO' : 'NECESITA INTENTARLO UNA VEZ MÁS'}
        </div>
      </header>
      <section class="print-meta">
        <div><strong>Alumno</strong><span>${escapeHtml(report.studentName)}</span></div>
        <div><strong>Cinturón</strong><span>${escapeHtml(report.beltColor || '-')}</span></div>
        <div><strong>Grado</strong><span>${escapeHtml(report.gradeLabel)}</span></div>
        <div><strong>Examinador</strong><span>${escapeHtml(report.examinerName || '-')}</span></div>
        <div><strong>Fecha</strong><span>${formatDate(report.submittedAt)}</span></div>
        <div><strong>Mínimo</strong><span>${report.passPercentage}%</span></div>
      </section>
      <section class="print-score">
        <div>
          <strong>${report.summary.totalScore}/${report.summary.maxScore}</strong>
          <span>puntos</span>
        </div>
        <div>
          <strong>${report.summary.percentage}%</strong>
          <span>porcentaje final</span>
        </div>
        <div>
          <strong>${report.evaluatedCount}</strong>
          <span>técnicas contadas</span>
        </div>
        <div>
          <strong>${report.skippedCount}</strong>
          <span>omitidas</span>
        </div>
      </section>
      <table class="print-table">
        <thead>
          <tr>
            <th>Técnica</th>
            <th>Puntuación</th>
            <th>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          ${report.techniqueEvaluations.map((item) => `
            <tr>
              <td>${escapeHtml(techniqueName(item))}${techniqueSection(item) ? `<br><small>${escapeHtml(techniqueSection(item))}</small>` : ''}</td>
              <td>${item.skipped ? 'Omitida' : `${item.score} / 10`}</td>
              <td>${escapeHtml(item.notes || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <footer class="print-signatures">
        <div>Firma examinador</div>
        <div>Firma alumno / tutor</div>
      </footer>
    </article>
  `;

  $('#backToDetails').addEventListener('click', renderExamDetails);
  $('#printReport').addEventListener('click', () => window.print());
  $('#downloadPdf').addEventListener('click', () => downloadEvaluationPdf(report));
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function safeFileName(value) {
  return String(value || 'evaluacion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function downloadEvaluationPdf(report) {
  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    showErrors('No se pudo cargar el generador de PDF. Usa el botón Imprimir y elige Guardar como PDF.');
    return;
  }

  const doc = new jsPdf({ unit: 'pt', format: 'a4' });
  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 46;

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

  addText('EVALUACION SKBC', margin, y, { size: 12, bold: true, color: [25, 118, 210] });
  y += 30;
  addText(report.clubName || 'Club SKBC', margin, y, { size: 22, bold: true, color: [18, 79, 141] });
  y += 26;
  addText(report.examTitle, margin, y, { size: 14, bold: true, color: [75, 93, 115] });

  const resultText = report.summary.passed ? 'APROBADO' : 'NECESITA INTENTARLO UNA VEZ MAS';
  doc.setFillColor(...(report.summary.passed ? [231, 247, 232] : [255, 235, 238]));
  doc.roundedRect(pageWidth - 245, 58, 200, 36, 6, 6, 'F');
  addText(resultText, pageWidth - 225, 81, {
    size: 11,
    bold: true,
    color: report.summary.passed ? [31, 107, 36] : [156, 27, 27],
  });

  y += 26;
  doc.setDrawColor(25, 118, 210);
  doc.setLineWidth(2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 28;

  const meta = [
    ['Alumno', report.studentName],
    ['Cinturon', report.beltColor || '-'],
    ['Grado', report.gradeLabel],
    ['Examinador', report.examinerName || '-'],
    ['Fecha', formatDate(report.submittedAt)],
    ['Minimo', `${report.passPercentage}%`],
  ];

  meta.forEach(([label, value], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + col * 170;
    const yy = y + row * 46;
    addText(label, x, yy, { size: 9, bold: true, color: [93, 111, 131] });
    addText(value, x, yy + 17, { size: 11 });
  });
  y += 112;

  const score = [
    [`${report.summary.totalScore}/${report.summary.maxScore}`, 'puntos'],
    [`${report.summary.percentage}%`, 'porcentaje final'],
    [String(report.evaluatedCount), 'tecnicas contadas'],
    [String(report.skippedCount), 'omitidas'],
  ];

  score.forEach(([value, label], index) => {
    const x = margin + index * 125;
    addText(value, x, y, { size: 18, bold: true, color: [18, 79, 141] });
    addText(label, x, y + 17, { size: 9, color: [93, 111, 131] });
  });
  y += 56;

  addText('Tecnica', margin, y, { bold: true, size: 10, color: [18, 55, 94] });
  addText('Puntuacion', margin + 245, y, { bold: true, size: 10, color: [18, 55, 94] });
  addText('Observaciones', margin + 340, y, { bold: true, size: 10, color: [18, 55, 94] });
  y += 16;
  doc.setDrawColor(217, 226, 236);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  report.techniqueEvaluations.forEach((item) => {
    ensureSpace(52);
    const startY = y;
    y = addWrapped(techniqueName(item), margin, y, 205, { size: 10, bold: true });
    if (techniqueSection(item)) {
      y = addWrapped(techniqueSection(item), margin, y, 205, { size: 8, color: [93, 111, 131] });
    }
    addText(item.skipped ? 'Omitida' : `${item.score} / 10`, margin + 245, startY, { size: 10 });
    addWrapped(item.notes || '', margin + 340, startY, pageWidth - margin - 340, { size: 9 });
    y = Math.max(y, startY + 32);
    doc.setDrawColor(235, 240, 246);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;
  });

  ensureSpace(74);
  y += 40;
  doc.setDrawColor(17, 24, 39);
  doc.line(margin, y, margin + 190, y);
  doc.line(pageWidth - margin - 190, y, pageWidth - margin, y);
  addText('Firma examinador', margin, y + 16, { size: 9, color: [75, 85, 99] });
  addText('Firma alumno / tutor', pageWidth - margin - 190, y + 16, { size: 9, color: [75, 85, 99] });

  doc.save(`${safeFileName(report.studentName)}-${safeFileName(report.examTitle)}.pdf`);
}

async function updateExamStatus(examId, status) {
  const { error } = await supabase.from('exams').update({ status }).eq('id', examId);
  if (error) {
    showErrors(error.message);
    return;
  }
  await loadExams();
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
  const examsWithResults = state.exams.map((exam) => `
    <article class="card">
      <h3>${escapeHtml(exam.title)}</h3>
      <p>${escapeHtml(gradeLabel(exam.grade))}</p>
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
    <div class="exam-grid">${examsWithResults || '<div class="empty">No hay exámenes todavía.</div>'}</div>
  `;
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
      skipped: false,
      notes: '',
    }));
  });

  renderExaminerForm();
}

function renderExaminerForm() {
  const payload = state.examinerPayload;
  const techniques = payload.exam.techniques || [];
  const techniqueIndex = state.examinerTechniqueIndex;
  const currentTechnique = techniques[techniqueIndex];
  const currentTechniqueName = techniqueName(currentTechnique);
  const currentTechniqueSummary = techniqueSummary(currentTechnique);
  const currentTechniqueWeight = currentTechnique?.weight || 1;
  const currentSection = techniqueSection(currentTechnique) || 'Técnicas';
  const previousSection = techniqueIndex > 0 ? techniqueSection(techniques[techniqueIndex - 1]) : '';
  const sectionChanged = techniqueIndex === 0 || currentSection !== previousSection;
  const sectionLead = techniqueIndex === 0 ? 'Empezamos con' : 'Seguimos con';
  const progress = Math.round(((techniqueIndex + 1) / techniques.length) * 100);
  const completedForTechnique = payload.students.filter((student) => answerComplete(state.examinerAnswers[student.id][techniqueIndex])).length;

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
        <span class="status ${completedForTechnique === payload.students.length ? 'passed' : 'draft'}">${completedForTechnique}/${payload.students.length} alumnos</span>
      </div>
      <form id="examinerForm">
        ${payload.students.map((student) => renderStudentTechniqueRow(student, techniqueIndex)).join('')}
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
  state.examinerTechniqueIndex += delta;
  renderExaminerForm();
}

function skipCurrentTechniqueForAll() {
  state.examinerPayload.students.forEach((student) => {
    const answer = state.examinerAnswers[student.id][state.examinerTechniqueIndex];
    answer.score = null;
    answer.skipped = true;
  });
  renderExaminerForm();
}

async function submitExaminerEvaluation(event) {
  event.preventDefault();

  const missing = state.examinerPayload.students.some((student) =>
    state.examinerAnswers[student.id].some((answer) => !answerComplete(answer))
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






