/* Non-invasive renderer localization layer. No remote translation or IPC. */
(function() {
'use strict';
const util = window.ASI_TRANSLATOR;
const localeKey = 'apkstart-international.locale';
let locale = util.normalize(navigator.language);
try { locale = util.normalize(localStorage.getItem(localeKey) || navigator.language); } catch (_) {}
const originalText = new WeakMap(), originalAttrs = new WeakMap();
let busy = false, queued = false;
function translateText(node) {
  if (!node.parentElement || node.parentElement.closest('script,style,svg,code,pre,textarea,[data-asi-no-translate],.app-name,.card .name')) return;
  const value = node.nodeValue;
  let record = originalText.get(node);
  if (!record || record.rendered !== value) record = {source:value, rendered:value};
  const next = util.t(record.source, locale);
  record.rendered = next; originalText.set(node, record);
  if (value !== next) node.nodeValue = next;
}
function translateAttrs(el) {
  if (el.closest('[data-asi-no-translate],svg')) return;
  let records = originalAttrs.get(el);
  if (!records) {records = new Map(); originalAttrs.set(el, records);}
  for (const attr of ['title','placeholder','aria-label','alt']) {
    if (!el.hasAttribute(attr)) continue;
    const current = el.getAttribute(attr);
    let record = records.get(attr);
    if (!record || record.rendered !== current) record = {source:current,rendered:current};
    const next = util.t(record.source, locale);
    record.rendered = next; records.set(attr,record);
    if (current !== next) el.setAttribute(attr,next);
  }
}
function scan() {
  if (!document.body || busy) return;
  busy = true;
  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode())) translateText(text);
    document.body.querySelectorAll('[title],[placeholder],[aria-label],[alt]').forEach(translateAttrs);
    document.documentElement.lang = locale;
    const picker = document.getElementById('asi-language');
    if (picker) picker.value = locale;
  } finally {busy = false;}
}
function schedule() {
  if (busy || queued) return;
  queued = true;
  Promise.resolve().then(() => {queued = false; scan();});
}
function setLanguage(value) {
  locale = util.normalize(value);
  try {localStorage.setItem(localeKey,locale);} catch (_) {}
  window.apkstart?.setSettings?.({uiLocale:locale}).catch(() => {});
  schedule();
  window.dispatchEvent(new CustomEvent('asi-language-change', {detail:locale}));
}
function init() {
  // Older releases kept the language only in this window's local storage.
  const initial = locale;
  window.apkstart?.getSettings?.().then(settings => {
    if (locale !== initial) return;
    if (util.codes.includes(settings.uiLocale)) {
      if (locale !== settings.uiLocale) {
        locale = settings.uiLocale;
        try {localStorage.setItem(localeKey,locale);} catch (_) {}
        schedule();
        window.dispatchEvent(new CustomEvent('asi-language-change', {detail:locale}));
      }
    } else {
      return window.apkstart.setSettings({uiLocale:locale});
    }
  }).catch(() => {});
  const picker = document.createElement('select');
  picker.id = 'asi-language';
  picker.className = 'asi-language-select';
  picker.dataset.asiNoTranslate = 'true';
  picker.setAttribute('aria-label', 'Language / Ngôn ngữ / 语言');
  for (const [key,label] of [['en','English'],['vi','Tiếng Việt'],['zh-CN','简体中文']]) {
    const option = document.createElement('option'); option.value = key; option.textContent = label; picker.appendChild(option);
  }
  picker.value = locale;
  picker.addEventListener('change', () => setLanguage(picker.value));
  const settings = document.getElementById('btnSettings');
  if (settings?.parentElement) settings.parentElement.insertBefore(picker,settings);
  else document.body.prepend(picker);
  const observer = new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['title','placeholder','aria-label','alt']});
  scan();
}
window.ASI_I18N = {setLanguage,getLanguage:()=>locale,t:source=>util.t(source,locale)};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
