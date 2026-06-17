/*************************************************
 * SKBC INFORMES DE EXAMEN EN FICHAS
 *
 * Pega este archivo .gs en el mismo proyecto Apps Script
 * donde tienes doPost(e), registrarExamenDesdeWeb(...)
 * y SKBC_API_TOKEN.
 *
 * Dentro de tu doPost(e), añade una accion:
 *
 * } else if (accion === 'GUARDAR_INFORME_EXAMEN_WEB') {
 *   if (data.token !== SKBC_API_TOKEN) throw new Error('Token invalido');
 *   resultado = skbcGuardarInformeExamenDesdeWeb_(data);
 *
 *************************************************/

const SKBC_EXAM_REPORTS_CFG = {
  ROOT_FOLDER_NAME: 'SKBC Informes de Examenes',
  ADULTS_FOLDER_NAME: 'Adultos',
  KIDS_FOLDER_NAME: 'Ninos',
  SHEET_EXAMS: 'EXAMENES',
  PROP_ROOT_FOLDER_ID: 'SKBC_EXAM_REPORTS_ROOT_FOLDER_ID',
  PROP_ADULTS_FOLDER_ID: 'SKBC_EXAM_REPORTS_ADULTS_FOLDER_ID',
  PROP_KIDS_FOLDER_ID: 'SKBC_EXAM_REPORTS_KIDS_FOLDER_ID'
};

function skbcGuardarInformeExamenDesdeWeb_(payload) {
  payload = payload || {};

  if (typeof SKBC_API_TOKEN !== 'undefined' && payload.token !== SKBC_API_TOKEN) {
    throw new Error('Token invalido');
  }

  const ss = skbcExamReportsSpreadsheet_();
  const sh = ss.getSheetByName(SKBC_EXAM_REPORTS_CFG.SHEET_EXAMS);
  if (!sh) throw new Error('No existe la hoja EXAMENES');

  const setup = skbcExamReportsSetup_();
  const folder = skbcExamReportsFolderForProgram_(String(payload.programa || '').trim(), setup);
  const file = skbcExamReportsCreatePdfFile_(payload, folder);
  const fileUrl = file.getUrl();

  const headers = skbcExamReportsEnsureHeaders_(sh, [
    'URL_Diploma',
    'InformePDF',
    'InformeCreadoEl',
    'InformeCreadoPor',
    'InformeTipo',
    'InformeNombreArchivo'
  ]);

  const rowNumber = skbcExamReportsFindExamRow_(sh, headers, payload);
  if (!rowNumber) {
    throw new Error('No se encontro la fila del examen para ' + String(payload.alumno || payload.alumnoId || '').trim());
  }

  const now = new Date();
  skbcExamReportsSetByHeader_(sh, rowNumber, headers, 'URL_Diploma', fileUrl);
  skbcExamReportsSetByHeader_(sh, rowNumber, headers, 'InformePDF', fileUrl);
  skbcExamReportsSetByHeader_(sh, rowNumber, headers, 'InformeCreadoEl', now);
  skbcExamReportsSetByHeader_(sh, rowNumber, headers, 'InformeCreadoPor', String(payload.registradoPor || 'WEB EXAMEN SKBC').trim());
  skbcExamReportsSetByHeader_(sh, rowNumber, headers, 'InformeTipo', String(payload.informeTipo || payload.programa || '').trim());
  skbcExamReportsSetByHeader_(sh, rowNumber, headers, 'InformeNombreArchivo', file.getName());

  SpreadsheetApp.flush();

  return {
    ok: true,
    alumno: payload.alumno || '',
    fila: rowNumber,
    url: fileUrl,
    archivo: file.getName()
  };
}

function skbcExamReportsSetup_() {
  const props = PropertiesService.getScriptProperties();

  const root = skbcExamReportsGetOrCreateFolder_(
    props,
    SKBC_EXAM_REPORTS_CFG.PROP_ROOT_FOLDER_ID,
    SKBC_EXAM_REPORTS_CFG.ROOT_FOLDER_NAME,
    null
  );

  const adults = skbcExamReportsGetOrCreateFolder_(
    props,
    SKBC_EXAM_REPORTS_CFG.PROP_ADULTS_FOLDER_ID,
    SKBC_EXAM_REPORTS_CFG.ADULTS_FOLDER_NAME,
    root
  );

  const kids = skbcExamReportsGetOrCreateFolder_(
    props,
    SKBC_EXAM_REPORTS_CFG.PROP_KIDS_FOLDER_ID,
    SKBC_EXAM_REPORTS_CFG.KIDS_FOLDER_NAME,
    root
  );

  const ss = skbcExamReportsSpreadsheet_();
  const sh = ss.getSheetByName(SKBC_EXAM_REPORTS_CFG.SHEET_EXAMS);
  if (sh) {
    skbcExamReportsEnsureHeaders_(sh, [
      'URL_Diploma',
      'InformePDF',
      'InformeCreadoEl',
      'InformeCreadoPor',
      'InformeTipo',
      'InformeNombreArchivo'
    ]);
  }

  return {
    rootFolderId: root.getId(),
    adultsFolderId: adults.getId(),
    kidsFolderId: kids.getId()
  };
}

function skbcExamReportsSpreadsheet_() {
  if (typeof SKBC_WEB_CFG !== 'undefined' && SKBC_WEB_CFG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SKBC_WEB_CFG.SPREADSHEET_ID);
  }

  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  throw new Error('No se pudo abrir el spreadsheet principal.');
}

function skbcExamReportsGetOrCreateFolder_(props, propName, folderName, parentFolder) {
  const savedId = props.getProperty(propName);
  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (e) {
      props.deleteProperty(propName);
    }
  }

  const iterator = parentFolder
    ? parentFolder.getFoldersByName(folderName)
    : DriveApp.getFoldersByName(folderName);

  const folder = iterator.hasNext()
    ? iterator.next()
    : parentFolder
      ? parentFolder.createFolder(folderName)
      : DriveApp.createFolder(folderName);

  props.setProperty(propName, folder.getId());
  return folder;
}

function skbcExamReportsFolderForProgram_(programa, setup) {
  const normalized = skbcExamReportsNormalizeText_(programa);
  const folderId = normalized.indexOf('nino') !== -1 || normalized.indexOf('infantil') !== -1
    ? setup.kidsFolderId
    : setup.adultsFolderId;

  return DriveApp.getFolderById(folderId);
}

function skbcExamReportsCreatePdfFile_(payload, folder) {
  const base64 = String(payload.informePdfBase64 || '').trim();
  if (!base64) throw new Error('No llega informePdfBase64');

  const bytes = Utilities.base64Decode(base64);
  const fileName = skbcExamReportsFileName_(payload);
  const blob = Utilities.newBlob(bytes, 'application/pdf', fileName);
  const file = folder.createFile(blob);

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log('No se pudo compartir el informe con enlace: ' + e.message);
  }

  return file;
}

function skbcExamReportsFileName_(payload) {
  const provided = String(payload.informeNombreArchivo || '').trim();
  if (provided) return provided.toLowerCase().endsWith('.pdf') ? provided : provided + '.pdf';

  const date = String(payload.fechaExamen || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')).trim();
  const name = skbcExamReportsSlug_(payload.alumno || 'alumno');
  const grade = skbcExamReportsSlug_(payload.grado || 'examen');
  return date + '-' + name + '-' + grade + '-informe.pdf';
}

function skbcExamReportsEnsureHeaders_(sh, requiredHeaders) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  let headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });

  requiredHeaders.forEach(function(header) {
    if (skbcExamReportsHeaderIndex_(headers, header) !== -1) return;
    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn()).setValue(header).setFontWeight('bold');
    headers.push(header);
  });

  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
}

function skbcExamReportsFindExamRow_(sh, headers, payload) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getDisplayValues();
  const targetId = skbcExamReportsNormalizeId_(payload.alumnoId || payload.studentSourceId || '');
  const targetName = skbcExamReportsNormalizeName_(payload.alumno || '');
  const targetDate = skbcExamReportsNormalizeDate_(payload.fechaExamen || '');
  const targetGrade = skbcExamReportsNormalizeText_(payload.grado || '');

  const idxId = skbcExamReportsHeaderIndex_(headers, 'ID');
  const idxAlumno = skbcExamReportsHeaderIndex_(headers, 'Alumno');
  const idxFecha = skbcExamReportsHeaderIndex_(headers, 'FechaExamen');
  const idxGrado = skbcExamReportsHeaderIndex_(headers, 'Grado');

  let bestRow = 0;
  let bestScore = -1;

  values.forEach(function(row, i) {
    let score = 0;
    const rowId = idxId !== -1 ? skbcExamReportsNormalizeId_(row[idxId]) : '';
    const rowName = idxAlumno !== -1 ? skbcExamReportsNormalizeName_(row[idxAlumno]) : '';
    const rowDate = idxFecha !== -1 ? skbcExamReportsNormalizeDate_(row[idxFecha]) : '';
    const rowGrade = idxGrado !== -1 ? skbcExamReportsNormalizeText_(row[idxGrado]) : '';

    if (targetId && rowId && targetId === rowId) score += 10;
    if (targetName && rowName && targetName === rowName) score += 6;
    if (targetDate && rowDate && targetDate === rowDate) score += 3;
    if (targetGrade && rowGrade && targetGrade === rowGrade) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestRow = i + 2;
    }
  });

  return bestScore >= 8 ? bestRow : 0;
}

function skbcExamReportsSetByHeader_(sh, rowNumber, headers, headerName, value) {
  const index = skbcExamReportsHeaderIndex_(headers, headerName);
  if (index === -1) return;
  sh.getRange(rowNumber, index + 1).setValue(value);
}

function skbcExamReportsHeaderIndex_(headers, headerName) {
  const target = skbcExamReportsNormalizeText_(headerName);
  for (let i = 0; i < headers.length; i++) {
    if (skbcExamReportsNormalizeText_(headers[i]) === target) return i;
  }
  return -1;
}

function skbcExamReportsNormalizeDate_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return raw.slice(0, 10);
}

function skbcExamReportsNormalizeId_(value) {
  return String(value || '').trim().toUpperCase();
}

function skbcExamReportsNormalizeName_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function skbcExamReportsNormalizeText_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function skbcExamReportsSlug_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'informe';
}

function TEST_skbcExamReportsSetup_() {
  return skbcExamReportsSetup_();
}
