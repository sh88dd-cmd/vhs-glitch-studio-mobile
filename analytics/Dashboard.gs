/**
 * VHS STATS / Dashboard.gs (PRIVATE READ-ONLY ADMIN PANEL)
 * ВАЖНО: создайте ВТОРОЙ, отдельный Google Apps Script проект.
 * Настройки развертывания: Веб-приложение, от имени Я, доступ Только я.
 * Никогда не публикуйте эту панель с доступом «Все».
 * В этот проект добавьте HTML-файл с именем Index и вставьте Index.html.
 */
const SPREADSHEET_ID = 'PASTE_YOUR_PRIVATE_SHEET_ID_HERE';
const TAB_NAME = 'Events';

function doGet() {
  // Доступ защищён самим Google, если развернуть «Только я».
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('VHS STATS — только владелец')
    .addMetaTag('viewport', 'width=device-width,initial-scale=1,viewport-fit=cover');
}

function getDashboard(period) {
  if (SPREADSHEET_ID.indexOf('PASTE_') === 0)
    throw new Error('Добавь ID приватной таблицы в Dashboard.gs.');
  const days = [1, 7, 30, 90].indexOf(Number(period)) >= 0
    ? Number(period) : 7;
  const now = new Date();
  const dateFrom = new Date(now.getTime() - days * 86400000);
  const tz = Session.getScriptTimeZone();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName(TAB_NAME);
  const data = sheet && sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow()-1, 4).getValues() : [];
  const result = {
    days:days, updated:now.toISOString(), timezone:tz,
    overall:{visits:0, visitors:0, events:0},
    photo:blank_(), video:blank_(),
    chart:[], lastEvents: []
  };
  const visitors = {overall:new Set(), photo:new Set(), video:new Set()};
  const daily = {};
  for (let i = data.length-1; i >= 0; --i) {
    const row = data[i];
    const time = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (isNaN(time.getTime()) || time < dateFrom || time > now) continue;
    const app = String(row[1]), action = String(row[2]);
    const id = String(row[3]);
    if (app !== 'photo' && app !== 'video') continue;
    if (!/^[a-f0-9]{32}$/.test(id)) continue;
    const bucket=result[app];
    const day=Utilities.formatDate(time,tz,'yyyy-MM-dd');
    if (!daily[day]) daily[day]={date:day,photo:0,video:0};
    daily[day][app]++;
    visitors.overall.add(id);
    visitors[app].add(id);
    result.overall.events++;
    bucket.events++;
    if (action === 'visit') {
      result.overall.visits++;
      bucket.visits++;
    }
    if (action === 'camera_open') bucket.camera++;
    if (action === 'shutter_click' || action === 'record_click') bucket.capture++;
    if (action === 'export_click' || action === 'camera_save_click' ||
        action === 'x50_export_click' || action === 'frame_export_click') bucket.exports++;
    if (result.lastEvents.length < 12) result.lastEvents.push({
      at:Utilities.formatDate(time,tz,'dd.MM HH:mm'),app:app,action:action
    });
  }
  result.photo.visitors=visitors.photo.size;
  result.video.visitors=visitors.video.size;
  result.overall.visitors=visitors.overall.size;
  const today = new Date(now);
  for (let d=days-1;d>=0;d--) {
    const day=new Date(today.getTime() - d * 86400000);
    const key=Utilities.formatDate(day,tz,'yyyy-MM-dd');
    result.chart.push(daily[key] || {date:key,photo:0,video:0});
  }
  return result;
}

function blank_() {
  return {visits:0,visitors:0,events:0,camera:0,capture:0,exports:0};
}
