/**
 * TVBox Spider JAR/DEX 解析器
 * 从 spider jar 中提取类名列表，用于判断站点是否兼容
 */
const JSZip = require('jszip');

async function parseSpiderClasses(spiderUrl) {
  const url = spiderUrl.split(';')[0];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TVBox-Search/1.0' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 8) return [];
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic === 'PK\x03\x04' || magic === 'PK\x05\x06') return await parseJarFile(buffer);
    if (magic.startsWith('dex\n')) return parseDexClasses(bytes);
    return [];
  } catch (e) {
    return [];
  }
}

async function parseJarFile(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const classes = new Set();
  for (const [name, entry] of Object.entries(zip.files)) {
    if (name.endsWith('.dex') && !entry.dir) {
      const dexData = await entry.async('uint8array');
      parseDexClasses(dexData).forEach(c => classes.add(c));
    }
  }
  if (classes.size > 0) return [...classes];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (name.endsWith('.class') && !entry.dir) {
      const className = name.replace(/\.class$/, '').split('/').pop();
      if (!className.includes('$') && !isSystemClass(className)) classes.add(className);
    }
  }
  return [...classes];
}

function parseDexClasses(dex) {
  if (dex.length < 0x70) return [];
  const view = new DataView(dex.buffer, dex.byteOffset, dex.byteLength);
  const magic = String.fromCharCode(dex[0], dex[1], dex[2], dex[3]);
  if (!magic.startsWith('dex\n')) return [];
  const stringIdsSize = view.getUint32(0x38, true);
  const stringIdsOff = view.getUint32(0x3C, true);
  const typeIdsSize = view.getUint32(0x40, true);
  const typeIdsOff = view.getUint32(0x44, true);
  const classDefsSize = view.getUint32(0x60, true);
  const classDefsOff = view.getUint32(0x64, true);
  const strings = readStringTable(dex, view, stringIdsSize, stringIdsOff);
  const typeNames = [];
  for (let i = 0; i < typeIdsSize; i++) {
    const stringIdx = view.getUint32(typeIdsOff + i * 4, true);
    if (stringIdx < strings.length) typeNames.push(strings[stringIdx]);
  }
  const classes = [];
  for (let i = 0; i < classDefsSize; i++) {
    const classIdx = view.getUint32(classDefsOff + i * 32, true);
    if (classIdx < typeNames.length) {
      const className = convertTypeDescriptor(typeNames[classIdx]);
      if (className && !isSystemClass(className)) classes.push(className);
    }
  }
  return classes;
}

function readStringTable(dex, view, size, offset) {
  const strings = [];
  for (let i = 0; i < size; i++) {
    const stringDataOff = view.getUint32(offset + i * 4, true);
    if (stringDataOff >= dex.length) { strings.push(''); continue; }
    let pos = stringDataOff;
    while (pos < dex.length && (dex[pos] & 0x80) !== 0) pos++;
    pos++;
    let str = '';
    while (pos < dex.length && dex[pos] !== 0) {
      const byte = dex[pos];
      if ((byte & 0x80) === 0) { str += String.fromCharCode(byte); pos++; }
      else if ((byte & 0xE0) === 0xC0) { str += String.fromCharCode(((byte & 0x1F) << 6) | ((dex[pos+1]||0) & 0x3F)); pos += 2; }
      else if ((byte & 0xF0) === 0xE0) { str += String.fromCharCode(((byte & 0x0F) << 12) | (((dex[pos+1]||0) & 0x3F) << 6) | ((dex[pos+2]||0) & 0x3F)); pos += 3; }
      else pos++;
    }
    strings.push(str);
  }
  return strings;
}

function convertTypeDescriptor(desc) {
  if (!desc || !desc.startsWith('L') || !desc.endsWith(';')) return '';
  const fullPath = desc.substring(1, desc.length - 1);
  const className = fullPath.split('/').pop();
  if (className.includes('$')) return '';
  return className;
}

function isSystemClass(name) {
  if (name.startsWith('csp_') || name.startsWith('Csp_') || name.startsWith('Spider')) return false;
  const systemExact = new Set(['R', 'BuildConfig', 'Manifest', 'Application', 'Activity', 'Service', 'Provider', 'Receiver', 'Fragment']);
  if (systemExact.has(name)) return true;
  return [/^I[A-Z][a-z]/, /Impl$/, /Exception$/, /Error$/, /^android/, /^java/, /^kotlin/, /^androidx/, /^com\.google/, /^org\.apache/].some(p => p.test(name));
}

function isSiteCompatible(siteApi, spiderClasses) {
  if (!siteApi || !spiderClasses || spiderClasses.length === 0) return true;
  if (!siteApi.startsWith('csp_') && !siteApi.startsWith('Csp') && !siteApi.includes('.')) return true;
  if (spiderClasses.includes(siteApi)) return true;
  let shortName = siteApi;
  if (shortName.startsWith('csp_')) shortName = shortName.substring(4);
  if (shortName.startsWith('Csp_')) shortName = shortName.substring(4);
  if (spiderClasses.includes(shortName)) return true;
  const lastPart = siteApi.split('.').pop();
  if (lastPart !== siteApi && spiderClasses.includes(lastPart)) return true;
  const lowerShort = shortName.toLowerCase();
  const lowerApi = siteApi.toLowerCase();
  return spiderClasses.some(c => {
    const lc = c.toLowerCase();
    return lc === lowerShort || lc === lowerApi || lc === lastPart.toLowerCase();
  });
}

module.exports = { parseSpiderClasses, isSiteCompatible, parseDexClasses, parseJarFile };
