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

// ============================================
// 按讚功能
// ============================================

/**
 * 取得 likes 資料表
 */
function getLikesSheet() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('likes');
  if (!sheet) {
    sheet = ss.insertSheet('likes');
    sheet.appendRow(['workId', 'userEmail', 'createdAt']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * 按讚 / 取消讚
 */
function toggleLike(workId, userEmail) {
  var sheet = getLikesSheet();
  var data = sheet.getDataRange().getValues();

  // 檢查是否已按讚
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === workId && data[i][1] === userEmail) {
      // 已按讚 → 取消讚
      sheet.deleteRow(i + 1);
      return { liked: false, likeCount: getLikeCount(workId) };
    }
  }

  // 未按讚 → 新增讚
  sheet.appendRow([workId, userEmail, new Date().toISOString()]);
  return { liked: true, likeCount: getLikeCount(workId) };
}

/**
 * 取得某作品的按讚數
 */
function getLikeCount(workId) {
  var sheet = getLikesSheet();
  var data = sheet.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === workId) count++;
  }
  return count;
}

/**
 * 取得某使用者是否已按讚某作品
 */
function hasLiked(workId, userEmail) {
  var sheet = getLikesSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === workId && data[i][1] === userEmail) return true;
  }
  return false;
}

/**
 * 批次取得多個作品的按讚資訊（優化效能）
 */
function getBatchLikeInfo(workIds, userEmail) {
  var sheet = getLikesSheet();
  var data = sheet.getDataRange().getValues();
  var counts = {};
  var userLikes = {};

  // 初始化
  for (var k = 0; k < workIds.length; k++) {
    counts[workIds[k]] = 0;
    userLikes[workIds[k]] = false;
  }

  for (var i = 1; i < data.length; i++) {
    var wid = data[i][0];
    if (counts.hasOwnProperty(wid)) {
      counts[wid]++;
      if (data[i][1] === userEmail) {
        userLikes[wid] = true;
      }
    }
  }

  return { counts: counts, userLikes: userLikes };
}

/**
 * 取得所有作品（支援按讚數排序）
 */
function getAllWorksWithLikes(page, pageSize, search, fileType, sortBy, userEmail) {
  page = page || 1;
  pageSize = pageSize || 12;
  search = search ? search.toLowerCase() : '';
  fileType = fileType || '';
  sortBy = sortBy || 'newest';

  var sheet = getWorksSheet();
  if (!sheet) return { works: [], total: 0, page: page, pageSize: pageSize };

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var works = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var work = rowToWork(headers, row);

    if (search) {
      var matchText = (work.title + work.studentId + work.studentName + work.description).toLowerCase();
      if (matchText.indexOf(search) === -1) continue;
    }

    if (fileType && work.fileType !== fileType) continue;

    works.push(work);
  }

  // 取得按讚資訊
  var workIds = works.map(function(w) { return w.id; });
  var likeInfo = getBatchLikeInfo(workIds, userEmail);

  // 將按讚資訊附加到作品
  for (var j = 0; j < works.length; j++) {
    works[j].likeCount = likeInfo.counts[works[j].id] || 0;
    works[j].liked = likeInfo.userLikes[works[j].id] || false;
  }

  // 排序
  if (sortBy === 'likes') {
    works.sort(function(a, b) { return b.likeCount - a.likeCount; });
  } else {
    // newest (預設) - 依上傳時間新到舊
    works.sort(function(a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
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
