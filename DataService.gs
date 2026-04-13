// ============================================
// DataService.gs - Google Sheets CRUD 操作
// ============================================

/**
 * 取得 Spreadsheet 物件
 */
function getSpreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('請先在 Script Properties 中設定 SPREADSHEET_ID');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * 取得作品資料表
 */
function getWorksSheet() {
  return getSpreadsheet().getSheetByName('works');
}

/**
 * 產生 UUID
 */
function generateId() {
  return Utilities.getUuid();
}

/**
 * 取得所有作品（支援分頁、搜尋、篩選）
 */
function getAllWorks(page, pageSize, search, fileType) {
  page = page || 1;
  pageSize = pageSize || 12;
  search = search ? search.toLowerCase() : '';
  fileType = fileType || '';

  var sheet = getWorksSheet();
  if (!sheet) return { works: [], total: 0, page: page, pageSize: pageSize };

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var works = [];

  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    var work = rowToWork(headers, row);

    // 搜尋篩選
    if (search) {
      var matchText = (work.title + work.studentId + work.studentName + work.description).toLowerCase();
      if (matchText.indexOf(search) === -1) continue;
    }

    // 檔案類型篩選
    if (fileType && work.fileType !== fileType) continue;

    works.push(work);
  }

  var total = works.length;
  var start = (page - 1) * pageSize;
  var paged = works.slice(start, start + pageSize);

  return {
    works: paged,
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

/**
 * 依 ID 取得單一作品
 */
function getWorkById(id) {
  var sheet = getWorksSheet();
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      return rowToWork(headers, data[i]);
    }
  }
  return null;
}

/**
 * 依學號取得作品
 */
function getWorksByStudent(studentId) {
  var sheet = getWorksSheet();
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var works = [];

  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === studentId) {
      works.push(rowToWork(headers, data[i]));
    }
  }
  return works;
}

/**
 * 新增作品
 */
function createWork(params) {
  var sheet = getWorksSheet();
  var userEmail = Session.getActiveUser().getEmail();
  var studentId = getStudentId(userEmail);
  var now = new Date().toISOString();
  var id = generateId();

  var row = [
    id,
    studentId,
    params.studentName || studentId,
    userEmail,
    params.title,
    params.description || '',
    params.fileType,
    params.driveFileId,
    params.thumbnailId || '',
    now,
    now
  ];

  sheet.appendRow(row);
  return { id: id };
}

/**
 * 更新作品
 */
function updateWork(id, params) {
  var sheet = getWorksSheet();
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      var rowNum = i + 1;
      if (params.title !== undefined) sheet.getRange(rowNum, 5).setValue(params.title);
      if (params.description !== undefined) sheet.getRange(rowNum, 6).setValue(params.description);
      sheet.getRange(rowNum, 11).setValue(new Date().toISOString()); // updatedAt
      return true;
    }
  }
  return false;
}

/**
 * 刪除作品
 */
function deleteWork(id) {
  var sheet = getWorksSheet();
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

/**
 * 將 Sheet 行資料轉為物件
 */
function rowToWork(headers, row) {
  var work = {};
  for (var j = 0; j < headers.length; j++) {
    work[headers[j]] = row[j];
  }
  return work;
}
