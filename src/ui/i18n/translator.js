/* ApkStart International — MIT, derived from RoutineMiku/apkstart. */
(function(global) {
'use strict';
const codes = ['en','vi','zh-CN'];
function normalize(value) {
  const code = String(value || '').toLowerCase();
  if (code.startsWith('vi')) return 'vi';
  if (code.startsWith('zh')) return 'zh-CN';
  return 'en';
}
function t(value, code) {
  const raw = String(value == null ? '' : value);
  if (normalize(code) === 'zh-CN') return raw;
  const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const source = match[2];
  const dict = global.ASI_CATALOGS[normalize(code)] || {};
  if (Object.prototype.hasOwnProperty.call(dict, source)) return match[1] + dict[source] + match[3];
  const time = source.match(/^(\d+)\s*(分钟|小时|天)前$/);
  if (time) {
    const n = Number(time[1]);
    const enUnit = {'分钟':'minute','小时':'hour','天':'day'}[time[2]];
    const viUnit = {'分钟':'phút','小时':'giờ','天':'ngày'}[time[2]];
    return match[1] + (normalize(code) === 'vi' ? n + ' ' + viUnit + ' trước' : n + ' ' + enUnit + (n === 1 ? '' : 's') + ' ago') + match[3];
  }
  return raw;
}
global.ASI_TRANSLATOR = {codes, normalize, t};
})(window);
