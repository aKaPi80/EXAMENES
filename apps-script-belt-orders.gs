/*************************************************
 * PEDIDO DE CINTURONES DESDE LA WEB DE EXAMENES
 *
 * IMPORTANTE:
 * - No crees otro doPost(e).
 * - Integra la accion REGISTRAR_PEDIDO_CINTURONES_WEB
 *   dentro del doPost(e) robusto que ya tienes.
 *************************************************/

const SKBC_BELT_ORDER_CFG = {
  // Opcional. Si lo dejas vacio, el script crea una hoja nueva en Drive
  // la primera vez y guarda su ID en Propiedades del script.
  SPREADSHEET_ID: '',
  PROPERTY_KEY_SPREADSHEET_ID: 'SKBC_BELT_ORDER_SPREADSHEET_ID',
  SHEET_LINES: 'LINEAS_PEDIDO',
  SHEET_SUMMARY: 'RESUMEN_PEDIDO',
  FILE_NAME: 'SKBC_PEDIDO_CINTURONES'
};

/*
 * ANADE ESTO DENTRO DE TU doPost(e), junto al resto de acciones:
 *
 * if (accion === 'REGISTRAR_PEDIDO_CINTURONES_WEB') {
 *   return skbcRegistrarPedidoCinturonesDesdeWeb_(data);
 * }
 */

function skbcRegistrarPedidoCinturonesDesdeWeb_(payload) {
  payload = payload || {};

  const token = String(payload.token || '').trim();
  if (token !== SKBC_API_TOKEN) {
    return skbcBeltOrderJson_({
      ok: false,
      error: 'Token invalido'
    });
  }

  const pedido = payload.pedido || {};
  const items = Array.isArray(pedido.items) ? pedido.items : [];

  if (!items.length) {
    return skbcBeltOrderJson_({
      ok: false,
      error: 'No hay lineas de pedido'
    });
  }

  const ss = skbcBeltOrderSpreadsheet_();
  const shLines = skbcBeltOrderEnsureLinesSheet_(ss);
  const shSummary = skbcBeltOrderEnsureSummarySheet_(ss);

  const now = new Date();
  const rows = items
    .map(function(item) {
      return {
        fecha: now,
        examId: String(pedido.examId || '').trim(),
        examen: String(pedido.examTitle || '').trim(),
        programa: String(pedido.programa || '').trim(),
        grado: String(pedido.grado || '').trim(),
        alumno: String(item.studentName || '').trim(),
        alumnoRef: String(item.studentRef || '').trim(),
        alumnoId: String(item.studentSourceId || '').trim(),
        articulo: String(item.item || 'Cinturon').trim(),
        color: String(item.color || '').trim(),
        medida: String(item.size || '').trim(),
        cantidad: Math.max(1, Number(item.quantity || 1) || 1),
        notas: String(item.notes || '').trim(),
        creadoPor: String(pedido.creadoPor || '').trim()
      };
    })
    .filter(function(item) {
      return item.alumno || item.articulo || item.color;
    })
    .map(function(item) {
      return [
        item.fecha,
        item.examId,
        item.examen,
        item.programa,
        item.grado,
        item.alumno,
        item.alumnoRef,
        item.alumnoId,
        item.articulo,
        item.color,
        item.medida,
        item.cantidad,
        item.notas,
        item.creadoPor
      ];
    });

  if (!rows.length) {
    return skbcBeltOrderJson_({
      ok: false,
      error: 'No hay lineas validas de pedido'
    });
  }

  shLines
    .getRange(shLines.getLastRow() + 1, 1, rows.length, rows[0].length)
    .setValues(rows);

  skbcBeltOrderRebuildSummary_(shLines, shSummary);

  return skbcBeltOrderJson_({
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    lineasAnadidas: rows.length
  });
}

function skbcBeltOrderSpreadsheet_() {
  const configuredId = String(SKBC_BELT_ORDER_CFG.SPREADSHEET_ID || '').trim();
  if (configuredId) {
    return SpreadsheetApp.openById(configuredId);
  }

  const props = PropertiesService.getScriptProperties();
  const savedId = String(props.getProperty(SKBC_BELT_ORDER_CFG.PROPERTY_KEY_SPREADSHEET_ID) || '').trim();
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (e) {
      props.deleteProperty(SKBC_BELT_ORDER_CFG.PROPERTY_KEY_SPREADSHEET_ID);
    }
  }

  const ss = SpreadsheetApp.create(SKBC_BELT_ORDER_CFG.FILE_NAME);
  props.setProperty(SKBC_BELT_ORDER_CFG.PROPERTY_KEY_SPREADSHEET_ID, ss.getId());
  return ss;
}

function skbcBeltOrderEnsureLinesSheet_(ss) {
  const name = SKBC_BELT_ORDER_CFG.SHEET_LINES;
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const headers = [
    'Fecha',
    'ExamID',
    'Examen',
    'Programa',
    'Grado',
    'Alumno',
    'AlumnoRef',
    'AlumnoId',
    'Articulo',
    'Color',
    'Medida',
    'Cantidad',
    'Notas',
    'CreadoPor'
  ];

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sh.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1F4E78')
    .setFontColor('#FFFFFF');

  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, headers.length);
  return sh;
}

function skbcBeltOrderEnsureSummarySheet_(ss) {
  const name = SKBC_BELT_ORDER_CFG.SHEET_SUMMARY;
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function skbcBeltOrderRebuildSummary_(shLines, shSummary) {
  const values = shLines.getDataRange().getValues();
  const headers = values[0] || [];
  const idxArticulo = skbcBeltOrderHeaderIndex_(headers, 'Articulo');
  const idxColor = skbcBeltOrderHeaderIndex_(headers, 'Color');
  const idxMedida = skbcBeltOrderHeaderIndex_(headers, 'Medida');
  const idxCantidad = skbcBeltOrderHeaderIndex_(headers, 'Cantidad');

  const totals = {};

  values.slice(1).forEach(function(row) {
    const articulo = String(row[idxArticulo] || 'Cinturon').trim() || 'Cinturon';
    const color = String(row[idxColor] || 'Sin color').trim() || 'Sin color';
    const medida = String(row[idxMedida] || 'Sin medida').trim() || 'Sin medida';
    const cantidad = Math.max(1, Number(row[idxCantidad] || 1) || 1);
    const key = [articulo, color, medida].join('||');
    totals[key] = (totals[key] || 0) + cantidad;
  });

  const rows = Object.keys(totals)
    .sort()
    .map(function(key) {
      const parts = key.split('||');
      return [parts[0], parts[1], parts[2], totals[key]];
    });

  shSummary.clear();
  shSummary.getRange(1, 1, 1, 4).setValues([[
    'Articulo',
    'Color',
    'Medida',
    'Total'
  ]]);

  if (rows.length) {
    shSummary.getRange(2, 1, rows.length, 4).setValues(rows);
  }

  shSummary.getRange(1, 1, 1, 4)
    .setFontWeight('bold')
    .setBackground('#38761D')
    .setFontColor('#FFFFFF');

  shSummary.setFrozenRows(1);
  shSummary.autoResizeColumns(1, 4);
}

function skbcBeltOrderHeaderIndex_(headers, name) {
  const wanted = String(name || '').trim().toUpperCase();
  const idx = headers.findIndex(function(header) {
    return String(header || '').trim().toUpperCase() === wanted;
  });
  return idx;
}

function skbcBeltOrderJson_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data || {}))
    .setMimeType(ContentService.MimeType.JSON);
}
