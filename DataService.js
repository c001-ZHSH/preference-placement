// ============================================
// DataService.gs - Google Sheets CRUD 操作（含快取優化）
// ============================================

var WORKS_CACHE_TTL = 120;  // 作品列表快取 2 分鐘
var LIKES_CACHE_TTL = 120;  // 按讚資料快取 2 分鐘

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

  var result = { headers: headers, works: works };

  // CacheService 單一值上限 100KB，分段儲存如果太大
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
  for (var i = 0; i < cached.works.length; i++) {
    if (cached.works[i].id === id) return cached.works[i];
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
        // 刪除舊檔案
        var oldFileId = data[i][7];
        if (oldFileId && oldFileId !== params.driveFileId) {
          try { deleteFile(oldFileId); } catch (e) { /* ignore */ }
        }
        sheet.getRange(rowNum, 8).setValue(params.driveFileId);
      }
      sheet.getRange(rowNum, 11).setValue(new Date().toISOString());
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

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      clearWorksCache();
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
function getAllWorksWithLikes(page, pageSize, search, fileType, sortBy, userEmail) {
  page = page || 1;
  pageSize = pageSize || 12;
  search = search ? search.toLowerCase() : '';
  fileType = fileType || '';
  sortBy = sortBy || 'newest';

  var cached = getCachedWorks();
  var works = [];

  for (var i = 0; i < cached.works.length; i++) {
    var work = cached.works[i];

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
