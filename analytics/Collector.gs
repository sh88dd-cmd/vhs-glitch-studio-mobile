/**
 * VHS STATS / Collector.gs (PUBLIC WRITE-ONLY ENDPOINT)
 * Создайте отдельный Google Apps Script проект для приёма событий.
 * 1) Создайте приватную Google таблицу VHS STATS DATA.
 * 2) Вставьте её ID из ссылки ниже. НЕ публикуйте саму таблицу.
 * 3) Развернуть -> Новое развертывание -> Веб-приложение.
 *    Выполнять от имени: Я; Доступ: Все.
 * Публичный сборщик НИКОГДА не возвращает данные таблицы.
 */
const SPREADSHEET_ID = 'PASTE_YOUR_PRIVATE_SHEET_ID_HERE';
const TAB_NAME = 'Events';
const ALLOWED_APPS = ['photo', 'video'];
const ALLOWED_EVENTS = [
  'visit', 'camera_open', 'shutter_click', 'record_click',
  'export_click', 'camera_save_click', 'x50_export_click',
  'frame_export_click'
];


const ALLOWED_SECTIONS = [
  'vhs','film','glitch','cassettes','masks','correction',
  'polaroid','shoot','photobooth','x50','camera','timeline',
  'keyframes','frametools','filmdamage','audio','touch',
  'speed','live','export'
];
const ALLOWED_FEATURES = [
  'reroll','reset','compare','photobooth','best_shot',
  'double_exposure','film_burn','face_tools','brush_tools',
  'brush_draw','face_auto','face_mark','speed_point',
  'speed_reverse','speed_forward','audio_beats','timeline_event',
  'keyframe_add','frame_step','film_only','film_gallery',
  'cassette_save','cassette_clear','cassette_aging','glitch_hold',
  'glitch_mild','glitch_chaos','vhs_preset','film_category',
  'film_select','film_toggle','vhs_toggle','glitch_toggle',
  'face_style','face_pixel','tape_kind','output_size',
  'film_damage','touch_mode'
];
function allowedEvent_(action) {
  if (typeof action !== 'string' || action.length > 64) return false;
  if (ALLOWED_EVENTS.indexOf(action) >= 0) return true;
  if (action.startsWith('section_'))
    return ALLOWED_SECTIONS.indexOf(action.slice(8)) >= 0;
  if (action.startsWith('feature_'))
    return ALLOWED_FEATURES.indexOf(action.slice(8)) >= 0;
  return false;
}

function doGet() {
  return output_('VHS STATS collector: receiving events only');
}
function doPost(request) {
  try {
    if (!request || !request.postData) return output_('invalid');
    const text = String(request.postData.contents || '');
    if (!text || text.length > 1100) return output_('invalid');
    const item = JSON.parse(text);
    if (!item || ALLOWED_APPS.indexOf(item.app) < 0 ||
        !allowedEvent_(item.action)) return output_('invalid');
    // 32 hex chars = pseudonymous 128-bit device ID, generated in the browser.
    // It is NOT a name, email address, phone number, IP or media content.
    const visitor = String(item.visitor || '');
    if (!/^[a-f0-9]{32}$/.test(visitor)) return output_('invalid');
    if (SPREADSHEET_ID.indexOf('PASTE_') === 0) return output_('not-configured');

    const doc = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = doc.getSheetByName(TAB_NAME);
    if (!sheet) {
      sheet = doc.insertSheet(TAB_NAME);
      sheet.appendRow(['Время', 'Приложение', 'Действие', 'Анонимный ID']);
      sheet.setFrozenRows(1);
    }
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) return output_('busy');
    try {
      sheet.appendRow([new Date(), item.app, item.action, visitor]);
    } finally {
      lock.releaseLock();
    }
    return output_('ok');
  } catch (error) {
    // Never leak spreadsheet data, IDs, internal errors or user information.
    console.error('Collector error: ' + String(error));
    return output_('error');
  }
}
function output_(msg) {
  return ContentService.createTextOutput(msg)
    .setMimeType(ContentService.MimeType.TEXT);
}
