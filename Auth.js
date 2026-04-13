// ============================================
// Auth.gs - 認證與授權邏輯（含快取優化）
// ============================================

var SCHOOL_DOMAIN = 'mail2.chshs.ntpc.edu.tw';
var CACHE_TTL = 300; // 快取 5 分鐘

/**
 * 取得目前登入者的 email
 */
function getCurrentUser() {
  return Session.getActiveUser().getEmail();
}

/**
 * 取得學生名單（含快取）
 */
function getStudentsList() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('students_list');
  if (cached) return JSON.parse(cached);

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('students');
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    list.push({
      email: data[i][0].toString().toLowerCase(),
      name: data[i][1].toString(),
      enrollYear: data[i][2] ? parseInt(data[i][2], 10) : 0
    });
  }

  cache.put('students_list', JSON.stringify(list), CACHE_TTL);
  return list;
}

/**
 * 取得管理員名單（含快取）
 */
function getAdminsList() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('admins_list');
  if (cached) return JSON.parse(cached);

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('admins');
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    list.push({ email: data[i][0].toString().toLowerCase(), name: data[i][1].toString() });
  }

  cache.put('admins_list', JSON.stringify(list), CACHE_TTL);
  return list;
}

/**
 * 驗證是否為本校帳號（學生或管理員都算）
 */
function isAuthorized(email) {
  if (!email) return false;
  return isStudent(email) || isAdmin(email);
}

/**
 * 檢查是否為已註冊的學生
 */
function isStudent(email) {
  if (!email) return false;
  var emailLower = email.toLowerCase();
  var list = getStudentsList();
  for (var i = 0; i < list.length; i++) {
    if (list[i].email === emailLower) return true;
  }
  return false;
}

/**
 * 檢查是否為管理員
 */
function isAdmin(email) {
  if (!email) return false;
  var emailLower = email.toLowerCase();
  var list = getAdminsList();
  for (var i = 0; i < list.length; i++) {
    if (list[i].email === emailLower) return true;
  }
  return false;
}

/**
 * 取得學生姓名（從快取的名單查詢）
 */
function getStudentName(email) {
  if (!email) return '';
  var emailLower = email.toLowerCase();
  var list = getStudentsList();
  for (var i = 0; i < list.length; i++) {
    if (list[i].email === emailLower) return list[i].name;
  }
  return '';
}

/**
 * 從 email 擷取學號
 */
function getStudentId(email) {
  if (!email) return '';
  return email.split('@')[0];
}

/**
 * 取得入學年份（優先從 students 表讀取，退回學號前3碼）
 */
function getEnrollmentYear(studentId) {
  if (!studentId) return 0;

  // 從 students 表查找 enrollYear 欄位
  var emailLower = (studentId + '@mail2.chshs.ntpc.edu.tw').toLowerCase();
  var list = getStudentsList();
  for (var i = 0; i < list.length; i++) {
    if (list[i].email === emailLower && list[i].enrollYear > 0) {
      return list[i].enrollYear;
    }
  }

  // 退回：嘗試從學號前3碼判斷
  if (studentId.length >= 3) {
    var yearStr = studentId.substring(0, 3);
    var year = parseInt(yearStr, 10);
    if (!isNaN(year) && year >= 90 && year <= 200) return year;
  }
  return 0;
}

/**
 * 判斷學生是否已畢業
 */
function isGraduated(studentId) {
  var enrollYear = getEnrollmentYear(studentId);
  if (enrollYear === 0) return false;
  var now = new Date();
  var rocYear = now.getFullYear() - 1911;
  return (enrollYear + 3) <= rocYear;
}

/**
 * 取得使用者資訊（含角色判斷）
 */
function getUserInfo(email) {
  var studentId = getStudentId(email);
  var admin = isAdmin(email);
  var student = isStudent(email);

  return {
    email: email,
    studentId: studentId,
    name: admin ? '管理員' : getStudentName(email),
    role: admin ? 'admin' : 'student',
    isAdmin: admin,
    isStudent: student,
    enrollmentYear: student ? getEnrollmentYear(studentId) : 0
  };
}

/**
 * 清除所有快取（管理員修改名單後呼叫）
 */
function clearAuthCache() {
  var cache = CacheService.getScriptCache();
  cache.removeAll(['students_list', 'admins_list']);
}
