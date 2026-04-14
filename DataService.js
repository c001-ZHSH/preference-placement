// ============================================
// DataService.gs - Google Sheets CRUD 操作（含快取優化）
// ============================================

var WORKS_CACHE_TTL = 120;  // 作品列表快取 2 分鐘
var LIKES_CACHE_TTL = 120;  // 按讚資料快取 2 分鐘
var CATEGORIES_CACHE_TTL = 300; // 類別快取 5 分鐘

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

// ============================================
// 快取層
// ============================================

/**
 * 取得所有作品資料（含快取）
 */
function getCachedWorks() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('all_works');
  if (cached) return JSON.parse(cached);

  var sheet = getWorksSheet();
  if (!sheet) return { headers: [], rows: [] };

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var works = [];

  for (var i = 1; i < data.length; i++) {
    works.push(rowToWork(headers, data[i]));
  }

  // 從 students 表補充班級資訊（確保舊作品也有班級）
  var studentsList = getStudentsList();
  var classMap = {};
  for (var s = 0; s < studentsList.length; s++) {
    classMap[studentsList[s].email] = studentsList[s].className || '';
  }
  for (var w = 0; w < works.length; w++) {
    var email = (works[w].studentEmail || '').toString().toLowerCase();
    if (!works[w].className && email && classMap[email]) {
      works[w].className = classMap[email];
    }
  }

  var result = { headers: headers, works: works };

  var json = JSON.stringify(result);
  if (json.length < 90000) {
    cache.put('all_works', json, WORKS_CACHE_TTL);
  }

  return result;
}

/**
 * 取得所有按讚資料（含快取）
 */
function getCachedLikes() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('all_likes');
  if (cached) return JSON.parse(cached);

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('likes');
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var likes = [];
  for (var i = 1; i < data.length; i++) {
    likes.push({ workId: data[i][0], userEmail: data[i][1] });
  }

  var json = JSON.stringify(likes);
  if (json.length < 90000) {
    cache.put('all_likes', json, LIKES_CACHE_TTL);
  }

  return likes;
}

/**
 * 清除作品快取（新增/修改/刪除作品後呼叫）
 */
function clearWorksCache() {
  CacheService.getScriptCache().remove('all_works');
}

/**
 * 清除按讚快取
 */
function clearLikesCache() {
  CacheService.getScriptCache().remove('all_likes');
}

// ============================================
// 作品 CRUD
// ============================================

/**
 * 取得所有作品（支援分頁、搜尋、篩選）
 */
function getAllWorks(page, pageSize, search, fileType) {
  page = page || 1;
  pageSize = pageSize || 12;
  search = search ? search.toLowerCase() : '';
  fileType = fileType || '';

  var cached = getCachedWorks();
  var works = [];

  for (var i = cached.works.length - 1; i >= 0; i--) {
    var work = cached.works[i];

    if (search) {
      var matchText = (work.title + work.studentId + work.studentName + work.description).toLowerCase();
      if (matchText.indexOf(search) === -1) continue;
    }

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
  var cached = getCachedWorks();
  var idStr = id.toString();
  for (var i = 0; i < cached.works.length; i++) {
    if (cached.works[i].id.toString() === idStr) return cached.works[i];
  }
  return null;
}

/**
 * 依學號取得作品
 */
function getWorksByStudent(studentId) {
  var cached = getCachedWorks();
  var works = [];
  for (var i = cached.works.length - 1; i >= 0; i--) {
    if (cached.works[i].studentId === studentId) {
      works.push(cached.works[i]);
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
  var studentClass = getStudentClass(userEmail);
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
    params.category || '',
    now,
    now,
    studentClass
  ];

  sheet.appendRow(row);
  clearWorksCache();
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
      if (params.fileType !== undefined) sheet.getRange(rowNum, 7).setValue(params.fileType);
      if (params.driveFileId !== undefined) {
        var oldFileId = data[i][7];
        if (oldFileId && oldFileId !== params.driveFileId) {
          try { deleteFile(oldFileId); } catch (e) { /* ignore */ }
        }
        sheet.getRange(rowNum, 8).setValue(params.driveFileId);
      }
      if (params.category !== undefined) sheet.getRange(rowNum, 10).setValue(params.category);
      sheet.getRange(rowNum, 12).setValue(new Date().toISOString());
      clearWorksCache();
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
  var idStr = id.toString();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === idStr) {
      sheet.deleteRow(i + 1);
      clearWorksCache();
      clearLikesCache();
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
  var textFields = { id:1, studentId:1, studentName:1, studentEmail:1, title:1, description:1, fileType:1, driveFileId:1, thumbnailId:1, category:1, className:1 };
  for (var j = 0; j < headers.length; j++) {
    var key = headers[j];
    var val = row[j];
    work[key] = (key && textFields[key] && val !== undefined && val !== null) ? val.toString() : val;
  }
  return work;
}

// ============================================
// 按讚功能（含快取）
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

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === workId && data[i][1] === userEmail) {
      sheet.deleteRow(i + 1);
      clearLikesCache();
      return { liked: false, likeCount: getLikeCount(workId) };
    }
  }

  sheet.appendRow([workId, userEmail, new Date().toISOString()]);
  clearLikesCache();
  return { liked: true, likeCount: getLikeCount(workId) };
}

/**
 * 取得某作品的按讚數
 */
function getLikeCount(workId) {
  var likes = getCachedLikes();
  var count = 0;
  for (var i = 0; i < likes.length; i++) {
    if (likes[i].workId === workId) count++;
  }
  return count;
}

/**
 * 取得某使用者是否已按讚某作品
 */
function hasLiked(workId, userEmail) {
  var likes = getCachedLikes();
  for (var i = 0; i < likes.length; i++) {
    if (likes[i].workId === workId && likes[i].userEmail === userEmail) return true;
  }
  return false;
}

/**
 * 批次取得多個作品的按讚資訊
 */
function getBatchLikeInfo(workIds, userEmail) {
  var likes = getCachedLikes();
  var counts = {};
  var userLikes = {};

  for (var k = 0; k < workIds.length; k++) {
    counts[workIds[k]] = 0;
    userLikes[workIds[k]] = false;
  }

  for (var i = 0; i < likes.length; i++) {
    var wid = likes[i].workId;
    if (counts.hasOwnProperty(wid)) {
      counts[wid]++;
      if (likes[i].userEmail === userEmail) {
        userLikes[wid] = true;
      }
    }
  }

  return { counts: counts, userLikes: userLikes };
}

/**
 * 取得所有作品（支援按讚數排序）
 */
function getAllWorksWithLikes(page, pageSize, search, fileType, sortBy, userEmail, category) {
  page = page || 1;
  pageSize = pageSize || 12;
  search = search ? search.toLowerCase() : '';
  fileType = fileType || '';
  sortBy = sortBy || 'newest';
  category = category || '';

  var cached = getCachedWorks();
  var works = [];

  for (var i = 0; i < cached.works.length; i++) {
    var work = cached.works[i];

    if (search) {
      var matchText = (work.title + work.studentId + work.studentName + work.description).toLowerCase();
      if (matchText.indexOf(search) === -1) continue;
    }

    if (fileType && work.fileType !== fileType) continue;
    if (category && (work.category || '') !== category) continue;

    works.push(work);
  }

  // 取得按讚資訊
  var workIds = works.map(function(w) { return w.id; });
  var likeInfo = getBatchLikeInfo(workIds, userEmail);

  for (var j = 0; j < works.length; j++) {
    works[j].likeCount = likeInfo.counts[works[j].id] || 0;
    works[j].liked = likeInfo.userLikes[works[j].id] || false;
  }

  // 排序
  if (sortBy === 'likes') {
    works.sort(function(a, b) { return b.likeCount - a.likeCount; });
  } else {
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

// ============================================
// 類別管理
// ============================================

function getCategories() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('categories_list');
  if (cached) return JSON.parse(cached);

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('categories');
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var categories = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) {
      categories.push({ id: data[i][0].toString(), name: data[i][1].toString(), order: data[i][2] || i });
    }
  }
  categories.sort(function(a, b) { return a.order - b.order; });
  cache.put('categories_list', JSON.stringify(categories), CATEGORIES_CACHE_TTL);
  return categories;
}

function clearCategoriesCache() {
  CacheService.getScriptCache().remove('categories_list');
}

function addCategory(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('categories');
  if (!sheet) {
    sheet = ss.insertSheet('categories');
    sheet.appendRow(['id', 'name', 'order']);
    sheet.setFrozenRows(1);
  }
  var id = generateId();
  var data = sheet.getDataRange().getValues();
  var maxOrder = 0;
  for (var i = 1; i < data.length; i++) { if (data[i][2] > maxOrder) maxOrder = data[i][2]; }
  sheet.appendRow([id, name, maxOrder + 1]);
  clearCategoriesCache();
  return { id: id, name: name };
}

function updateCategory(categoryId, newName) {
  var ss = getSpreadsheet();
  var catSheet = ss.getSheetByName('categories');
  if (!catSheet) return false;
  var catData = catSheet.getDataRange().getValues();
  var oldName = '';
  for (var i = 1; i < catData.length; i++) {
    if (catData[i][0].toString() === categoryId) {
      oldName = catData[i][1].toString();
      catSheet.getRange(i + 1, 2).setValue(newName);
      break;
    }
  }
  if (!oldName) return false;
  var worksSheet = getWorksSheet();
  if (worksSheet) {
    var worksData = worksSheet.getDataRange().getValues();
    for (var j = 1; j < worksData.length; j++) {
      if (worksData[j][9] && worksData[j][9].toString() === oldName) {
        worksSheet.getRange(j + 1, 10).setValue(newName);
      }
    }
  }
  clearCategoriesCache();
  clearWorksCache();
  return true;
}

function deleteCategory(categoryId, replacementName) {
  var ss = getSpreadsheet();
  var catSheet = ss.getSheetByName('categories');
  if (!catSheet) return false;
  var catData = catSheet.getDataRange().getValues();
  var deletedName = '';
  var deleteRow = -1;
  for (var i = 1; i < catData.length; i++) {
    if (catData[i][0].toString() === categoryId) {
      deletedName = catData[i][1].toString();
      deleteRow = i + 1;
      break;
    }
  }
  if (!deletedName || deleteRow < 0) return false;
  if (replacementName) {
    var worksSheet = getWorksSheet();
    if (worksSheet) {
      var worksData = worksSheet.getDataRange().getValues();
      for (var j = 1; j < worksData.length; j++) {
        if (worksData[j][9] && worksData[j][9].toString() === deletedName) {
          worksSheet.getRange(j + 1, 10).setValue(replacementName);
        }
      }
    }
  }
  catSheet.deleteRow(deleteRow);
  clearCategoriesCache();
  clearWorksCache();
  return true;
}

/**
 * 搜尋作品（管理員用，搜尋標題/學號/姓名/類別）
 */
function searchWorks(query) {
  if (!query) return [];
  query = query.toLowerCase();

  var cached = getCachedWorks();
  var results = [];

  for (var i = 0; i < cached.works.length; i++) {
    var w = cached.works[i];
    var text = [
      w.title || '', w.studentId || '', w.studentName || '',
      w.description || '', w.category || '', w.className || ''
    ].join(' ').toLowerCase();

    if (text.indexOf(query) !== -1) {
      results.push(w);
    }
  }

  // 依上傳時間新到舊
  results.sort(function(a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return results;
}
