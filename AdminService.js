// ============================================
// AdminService.gs - 管理員功能（含快取優化）
// ============================================

/**
 * 取得統計資料
 */
function getStatistics() {
  var cached = getCachedWorks();
  if (!cached.works.length) return { totalWorks: 0, yearStats: [], typeStats: {} };

  var yearMap = {};
  var typeStats = { pdf: 0, video: 0 };
  var studentSet = {};

  for (var i = 0; i < cached.works.length; i++) {
    var work = cached.works[i];
    var studentId = work.studentId.toString();
    var fileType = work.fileType;
    var enrollYear = getEnrollmentYear(studentId);

    // 年份統計（無法判斷年份的歸入 0）
    var yearKey = enrollYear > 0 ? enrollYear : 0;
    if (!yearMap[yearKey]) {
      yearMap[yearKey] = { year: yearKey, workCount: 0, studentCount: 0, students: {} };
    }
    yearMap[yearKey].workCount++;
    yearMap[yearKey].students[studentId] = true;

    // 類型統計
    if (fileType === 'pdf') typeStats.pdf++;
    else if (fileType === 'video') typeStats.video++;

    studentSet[studentId] = true;
  }

  // 轉換年份統計為陣列
  var yearStats = [];
  for (var year in yearMap) {
    var stat = yearMap[year];
    stat.studentCount = Object.keys(stat.students).length;
    stat.isGraduated = (stat.year > 0) ? isGraduated(stat.year + '000') : false;
    stat.label = (stat.year > 0) ? '民國 ' + stat.year + ' 年入學' : '其他（無法辨識入學年份）';
    delete stat.students;
    yearStats.push(stat);
  }

  // 依年份排序（新到舊，0 放最後）
  yearStats.sort(function (a, b) {
    if (a.year === 0) return 1;
    if (b.year === 0) return -1;
    return b.year - a.year;
  });

  return {
    totalWorks: cached.works.length,
    totalStudents: Object.keys(studentSet).length,
    yearStats: yearStats,
    typeStats: typeStats
  };
}

/**
 * 依入學年份取得作品（year=0 代表無法辨識年份的）
 */
function getWorksByGraduationYear(year) {
  var cached = getCachedWorks();
  var works = [];

  for (var i = 0; i < cached.works.length; i++) {
    var work = cached.works[i];
    var studentId = work.studentId.toString();
    var enrollYear = getEnrollmentYear(studentId);

    if (year === 0 && enrollYear === 0) {
      works.push(work);
    } else if (enrollYear === year) {
      works.push(work);
    }
  }

  return works;
}

/**
 * 批次刪除作品（含 Drive 檔案）
 */
function batchDeleteWorks(workIds) {
  if (!workIds || !workIds.length) {
    return { deletedCount: 0, errors: ['沒有選擇要刪除的作品'] };
  }

  var sheet = getWorksSheet();
  var data = sheet.getDataRange().getValues();
  var deletedCount = 0;
  var errors = [];
  var rowsToDelete = [];

  // 確保 workIds 都是字串
  var idSet = {};
  for (var k = 0; k < workIds.length; k++) {
    idSet[workIds[k].toString()] = true;
  }

  Logger.log('要刪除的 IDs: ' + JSON.stringify(Object.keys(idSet)));
  Logger.log('Sheet 共有 ' + (data.length - 1) + ' 筆資料');

  // 建立 header 對應表以正確讀取欄位（適應新欄位）
  var headers = data[0];
  var colIdx = {};
  for (var h = 0; h < headers.length; h++) colIdx[headers[h]] = h;

  for (var i = 1; i < data.length; i++) {
    var rowId = data[i][0].toString();
    if (idSet[rowId]) {
      var fileIds = [
        data[i][colIdx.driveFileId],
        data[i][colIdx.thumbnailId],
        data[i][colIdx.proofFileId],
        data[i][colIdx.videoFileId]
      ];
      for (var f = 0; f < fileIds.length; f++) {
        if (fileIds[f]) {
          try { deleteFile(fileIds[f].toString()); } catch (e) { /* ignore */ }
        }
      }

      rowsToDelete.push(i + 1);
      deletedCount++;
    }
  }

  Logger.log('找到符合的行數: ' + deletedCount);

  // 從後往前刪除行（避免行號偏移）
  rowsToDelete.sort(function (a, b) { return b - a; });
  for (var j = 0; j < rowsToDelete.length; j++) {
    sheet.deleteRow(rowsToDelete[j]);
  }

  clearWorksCache();
  clearLikesCache();
  logAdminAction('批次刪除', '刪除了 ' + deletedCount + ' 筆作品');

  return {
    deletedCount: deletedCount,
    errors: errors
  };
}

/**
 * 記錄管理員操作日誌
 */
function logAdminAction(action, detail) {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName('admin_logs');
  if (!logSheet) {
    logSheet = ss.insertSheet('admin_logs');
    logSheet.appendRow(['時間', '管理員', '操作', '詳細']);
    logSheet.setFrozenRows(1);
  }

  var email = Session.getActiveUser().getEmail();
  logSheet.appendRow([new Date().toISOString(), email, action, detail]);
}

// ============================================
// Drive 資料夾遷移
// ============================================

/**
 * 檢查新資料夾是否可存取
 */
function validateMigrationTarget(newFolderId) {
  if (!newFolderId) return { ok: false, error: '請提供新資料夾 ID' };
  try {
    var folder = DriveApp.getFolderById(newFolderId);
    return { ok: true, folderName: folder.getName() };
  } catch (e) {
    return { ok: false, error: '無法存取該資料夾，請確認 ID 正確且擁有者有存取權限' };
  }
}

/**
 * 收集所有需要遷移的檔案 ID（含證明文件、影音、縮圖、舊主檔）
 */
function collectAllFileIds() {
  var cached = getCachedWorks();
  var set = {};
  for (var i = 0; i < cached.works.length; i++) {
    var w = cached.works[i];
    ['proofFileId', 'videoFileId', 'driveFileId', 'thumbnailId'].forEach(function(k) {
      var id = w[k];
      if (id && id.toString().trim()) set[id.toString().trim()] = true;
    });
  }
  return Object.keys(set);
}

/**
 * 遷移 Drive 檔案到新資料夾
 * @param {string} newFolderId - 新資料夾 ID
 * @param {number} startIndex - 從第幾個檔案開始（支援分批）
 * @returns {Object} 進度資訊
 */
function migrateDriveFolder(newFolderId, startIndex) {
  startIndex = startIndex || 0;

  var check = validateMigrationTarget(newFolderId);
  if (!check.ok) return { success: false, error: check.error };

  var newFolder = DriveApp.getFolderById(newFolderId);
  var allIds = collectAllFileIds();
  var total = allIds.length;

  if (total === 0) {
    // 沒有檔案可遷移，直接更新設定
    PropertiesService.getScriptProperties().setProperty('DRIVE_FOLDER_ID', newFolderId);
    return { success: true, moved: 0, failed: 0, total: 0, done: true, folderName: check.folderName };
  }

  var moved = 0;
  var failed = 0;
  var errors = [];
  var startTime = Date.now();
  var TIMEOUT = 4 * 60 * 1000; // 4 分鐘後返回（留 2 分鐘緩衝）
  var i = startIndex;

  for (; i < total; i++) {
    if (Date.now() - startTime > TIMEOUT) break;

    try {
      var file = DriveApp.getFileById(allIds[i]);
      file.moveTo(newFolder);
      moved++;
    } catch (e) {
      failed++;
      if (errors.length < 20) errors.push(allIds[i] + ': ' + e.message);
    }
  }

  var nextIndex = i;
  var done = nextIndex >= total;

  // 全部完成時才更新 DRIVE_FOLDER_ID
  if (done) {
    PropertiesService.getScriptProperties().setProperty('DRIVE_FOLDER_ID', newFolderId);
    logAdminAction('Drive 遷移完成', '已遷移 ' + moved + ' 個檔案到資料夾 ' + newFolderId);
  }

  return {
    success: true,
    moved: moved,
    failed: failed,
    total: total,
    processed: nextIndex,
    nextIndex: nextIndex,
    done: done,
    errors: errors,
    folderName: check.folderName
  };
}
