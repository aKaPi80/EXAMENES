﻿import {
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
  grades,
  normalizeToken,
  syllabusData,
  techniqueName,
  techniqueSection,
  validateEmail,
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
        <button class="btn btn-secondary" id="addStudentBtn" type="button">Añadir estudiante</button>
      </div>
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

  $('#examGrade').addEventListener('change', renderTechniquesForGrade);
  $('#passPercentage').addEventListener('input', () => { $('#passLabel').textContent = `${$('#passPercentage').value}%`; });
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
  return `
    <label class="tech-item technique-editor">
      <input type="checkbox" data-technique data-section="${escapeHtml(item.section)}" data-technique-name-input="#${escapeHtml(inputId)}" value="${escapeHtml(item.name)}" checked />
      <input id="${escapeHtml(inputId)}" class="technique-name-input" value="${escapeHtml(item.name)}" aria-label="Nombre de técnica" />
    </label>
  `;
}

function addCustomTechniqueRow() {
  state.customTechniqueCounter += 1;
  const index = state.customTechniqueCounter;
  addTechniqueRow({
    inputId: `customTechniqueName-${index}`,
    section: 'Técnicas añadidas',
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
    name: item.name,
    label: 'Técnica añadida desde grado anterior',
    placeholder: '',
  });
  select.value = '';
}

function addTechniqueRow({ inputId, section, name, label, placeholder }) {
  $('#customTechniquesArea').insertAdjacentHTML('beforeend', `
    <div class="custom-technique-row">
      <input type="checkbox" data-technique data-section="${escapeHtml(section)}" data-technique-name-input="#${escapeHtml(inputId)}" value="${escapeHtml(name)}" checked hidden />
      <div class="field">
        <label for="${escapeHtml(inputId)}">${escapeHtml(label)}</label>
        <input id="${escapeHtml(inputId)}" class="technique-name-input" value="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}" />
      </div>
      <button class="btn btn-danger btn-small" type="button" data-remove-custom-technique>Eliminar</button>
    </div>
  `);
  bindCustomTechniqueRemoveButtons();
}

function bindCustomTechniqueRemoveButtons() {
  $$('[data-remove-custom-technique]').forEach((button) => {
    button.onclick = () => button.closest('.custom-technique-row').remove();
  });
}

function addStudentRow() {
  const index = $$('.student-row').length + 1;
  $('#studentsArea').insertAdjacentHTML('beforeend', `
    <div class="row-card student-row">
      <div class="field">
        <label>Nombre</label>
        <input class="student-name" required />
      </div>
      <div class="field">
        <label>Cinturón actual</label>
        <select class="student-belt">
          <option>Blanco (Minarai)</option>
          <option>Amarillo</option>
          <option>Naranja</option>
          <option>Verde</option>
          <option>Azul</option>
          <option>Marrón</option>
          <option>Negro</option>
        </select>
      </div>
      <div class="field">
        <label>Orden</label>
        <input class="student-order" type="number" min="1" value="${index}" />
      </div>
      <button class="btn btn-danger btn-small" type="button" data-remove-row>Eliminar</button>
    </div>
  `);
  bindRemoveButtons();
}

function addExaminerRow() {
  $('#examinersArea').insertAdjacentHTML('beforeend', `
    <div class="row-card examiner-row">
      <div class="field">
        <label>Nombre</label>
        <input class="examiner-name" required />
      </div>
      <div class="field">
        <label>Email</label>
        <input class="examiner-email" type="email" required />
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
      email: $('.examiner-email', row).value.trim().toLowerCase(),
    })).filter((examiner) => examiner.name || examiner.email),
  };
}

async function createExam(event) {
  event.preventDefault();
  const draft = collectDraft();
  const validation = validateExamDraft(draft);

  if (!validation.valid) {
    showErrors(validation.errors);
    return;
  }

  if (draft.examiners.some((examiner) => !validateEmail(examiner.email))) {
    showErrors('Revisa los emails de los examinadores.');
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
  const { data: existing, error: readError } = await supabase
    .from('examiners')
    .select('id')
    .eq('professor_id', state.professor.id)
    .eq('email', examiner.email)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('examiners')
    .insert({ professor_id: state.professor.id, name: examiner.name, email: examiner.email })
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
            <p><strong>${escapeHtml(link.examiners?.name || 'Examinador')}</strong> · ${escapeHtml(link.examiners?.email || '')}</p>
            <div class="link-box">${escapeHtml(link.access_url)}</div>
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
  $$('.print-evaluation').forEach((button) => {
    button.addEventListener('click', () => renderPrintableEvaluation(button.dataset.evaluationId));
  });
}

function renderEvaluationCard(evaluation) {
  const techniqueEvaluations = evaluation.technique_evaluations || evaluation.technique_scores || [];
  const summary = calculateEvaluationSummary(techniqueEvaluations, state.selectedExam?.pass_percentage || 0);
  const skippedCount = techniqueEvaluations.filter((item) => item.skipped).length;
  const evaluatedCount = techniqueEvaluations.length - skippedCount;
  return `
    <article class="result-card">
      <h3>${escapeHtml(evaluation.exam_students?.student_name || 'Estudiante')}</h3>
      <p><strong>Examinador:</strong> ${escapeHtml(evaluation.examiners?.name || '')}</p>
      <p><strong>Puntuación:</strong> ${summary.totalScore}/${summary.maxScore} puntos · ${summary.percentage}%</p>
      <p><strong>Mínimo para aprobar:</strong> ${state.selectedExam?.pass_percentage || 0}%</p>
      <p><strong>Técnicas contadas:</strong> ${evaluatedCount}${skippedCount ? ` · ${skippedCount} omitida${skippedCount === 1 ? '' : 's'}` : ''}</p>
      <span class="status ${summary.passed ? 'passed' : 'failed'}">${summary.passed ? 'Aprobado' : 'Necesita intentarlo una vez más'}</span>
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

async function registerPassedStudentsInSheet() {
  const exam = state.selectedExam;
  if (!exam) return;

  const passedEvaluations = exam.evaluations.filter((evaluation) => {
    const techniqueEvaluations = evaluation.technique_evaluations || evaluation.technique_scores || [];
    return calculateEvaluationSummary(techniqueEvaluations, exam.pass_percentage).passed;
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
  const currentSection = techniqueSection(currentTechnique) || 'Técnicas';
  const previousSection = techniqueIndex > 0 ? techniqueSection(techniques[techniqueIndex - 1]) : '';
  const sectionChanged = techniqueIndex === 0 || currentSection !== previousSection;
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
      ${sectionChanged ? `<div class="section-break">Empezamos con la sección de ${escapeHtml(currentSection)}</div>` : ''}
      <div class="technique-stage">
        <div>
          <p>Técnica actual</p>
          <h2>${escapeHtml(currentTechniqueName)}</h2>
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

