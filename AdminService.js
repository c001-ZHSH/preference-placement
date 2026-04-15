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
