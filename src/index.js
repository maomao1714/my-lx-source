/*!
 * @name 我的聚合音源
 * @description 聚合多个API，网易/QQ/酷我/酷狗/咪咕，多链路回退
 * @version 1.0.1
 * @author maomao1714
 * @update_url https://raw.githubusercontent.com/maomao1714/my-lx-source/main/source.json
 */

'use strict';

const VERSION = '1.0.1';
const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/maomao1714/my-lx-source/main/source.json';

// ========== 经过验证的API端点（来自全豆要源） ==========
const XINGHAI_MAIN  = 'https://music-api.gdstudio.xyz/api.php';
const XINGHAI_BACK  = 'https://music-dl.sayqz.com/api/';
const SUYIN_QQ_API  = 'https://oiapi.net/api/QQ_Music';
const SUYIN_QQ_KEY  = 'oiapi-ef6133b7-ac2f-dc7d-878c-d3e207a82575';
const SUYIN_163_API = 'https://oiapi.net/api/Music_163';
const SUYIN_KW_API  = 'https://oiapi.net/api/Kuwo';

// ========== 平台映射 ==========
const PLATFORM_TO_XINGHAI = {
  wy: 'netease', tx: 'tencent', kw: 'kuwo', kg: 'kugou', mg: 'migu',
};
const PLATFORM_TO_XINGHAI_BACK = {
  wy: 'netease', tx: 'qq', kw: 'kuwo',
};

// ========== 音质映射 ==========
const BR_MAP = {
  '128k': '128', '192k': '192', '320k': '320', 'flac': '740', '24bit': '999',
};
const SUYIN_QQ_BR = {
  '128k': 7, '192k': 6, '320k': 5, 'flac': 4, '24bit': 1,
};
const SUYIN_KW_BR = {
  '128k': 7, '320k': 5, 'flac': 1, '24bit': 1,
};

// ========== 各平台支持音质 ==========
const QUALITIES = {
  wy: ['24bit', 'flac', '320k', '192k', '128k'],
  tx: ['24bit', 'flac', '320k', '192k', '128k'],
  kw: ['24bit', 'flac', '320k', '192k', '128k'],
  kg: ['flac', '320k', '128k'],
  mg: ['flac', '320k', '128k'],
};

// ========== 缓存 ==========
const cache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000;
const CACHE_MAX = 300;

function cacheGet(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > CACHE_TTL) { cache.delete(key); return null; }
  return item.url;
}
function cacheSet(key, url) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { url, ts: Date.now() });
}

// ========== 网络请求 ==========
const { EVENT_NAMES, request, on, send } = globalThis.lx;

function httpGet(url, params, headers, timeout) {
  params  = params  || {};
  headers = headers || {};
  timeout = timeout || 8000;
  const qs = Object.keys(params)
    .filter(function(k) { return params[k] != null; })
    .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  const fullUrl = qs ? (url + '?' + qs) : url;
  return new Promise(function(resolve, reject) {
    request(fullUrl, { method: 'GET', headers: headers, timeout: timeout }, function(err, res) {
      if (err) return reject(new Error(err.message || String(err)));
      var body = res && res.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body.trim()); } catch (_) {}
      }
      resolve({ status: (res && res.statusCode) || 0, data: body });
    });
  });
}

// ========== API 1：星海主线 ==========
function tryXinghaiMain(platform, songInfo, quality) {
  var pname = PLATFORM_TO_XINGHAI[platform];
  if (!pname) return Promise.resolve(null);
  return httpGet(XINGHAI_MAIN, {
    source: pname,
    id: songInfo.id,
    br: BR_MAP[quality] || '320',
    use_xbridge3: 'true',
    loader_name: 'forest',
    need_sec_link: '1',
    sec_link_scene: 'im',
    theme: 'light',
  }, {}, 8000).then(function(res) {
    var d = res.data;
    // 尝试多种返回路径
    var url = (d && d.data && d.data.url)
           || (d && d.url)
           || (d && d.data && d.data.src)
           || (d && d.src);
    if (url && typeof url === 'string' && url.indexOf('http') === 0) return url;
    return null;
  }).catch(function() { return null; });
}

// ========== API 2：星海备线 ==========
function tryXinghaiBack(platform, songInfo, quality) {
  var pname = PLATFORM_TO_XINGHAI_BACK[platform];
  if (!pname) return Promise.resolve(null);
  return httpGet(XINGHAI_BACK, {
    source: pname,
    id: songInfo.id,
    br: BR_MAP[quality] || '320',
  }, {}, 8000).then(function(res) {
    var d = res.data;
    var url = (d && d.data && d.data.url)
           || (d && d.url);
    if (url && typeof url === 'string' && url.indexOf('http') === 0) return url;
    return null;
  }).catch(function() { return null; });
}

// ========== API 3：溯音QQ（仅tx） ==========
function trySuyinQQ(platform, songInfo, quality) {
  if (platform !== 'tx') return Promise.resolve(null);
  return httpGet(SUYIN_QQ_API, {
    id: songInfo.id,
    level: SUYIN_QQ_BR[quality] || 5,
    key: SUYIN_QQ_KEY,
  }, {}, 8000).then(function(res) {
    var d = res.data;
    var url = (d && d.data && d.data.url)
           || (d && d.url);
    if (url && typeof url === 'string' && url.indexOf('http') === 0) return url;
    return null;
  }).catch(function() { return null; });
}

// ========== API 4：溯音163（仅wy） ==========
function trySuyin163(platform, songInfo, quality) {
  if (platform !== 'wy') return Promise.resolve(null);
  return httpGet(SUYIN_163_API, {
    id: songInfo.id,
    level: quality === 'flac' ? 3 : quality === '320k' ? 2 : 1,
  }, {}, 8000).then(function(res) {
    var d = res.data;
    var url = (d && d.data && d.data.url)
           || (d && d.url);
    if (url && typeof url === 'string' && url.indexOf('http') === 0) return url;
    return null;
  }).catch(function() { return null; });
}

// ========== API 5：溯音酷我（仅kw） ==========
function trySuyinKW(platform, songInfo, quality) {
  if (platform !== 'kw') return Promise.resolve(null);
  return httpGet(SUYIN_KW_API, {
    id: songInfo.id,
    level: SUYIN_KW_BR[quality] || 5,
  }, {}, 8000).then(function(res) {
    var d = res.data;
    var url = (d && d.data && d.data.url)
           || (d && d.url);
    if (url && typeof url === 'string' && url.indexOf('http') === 0) return url;
    return null;
  }).catch(function() { return null; });
}

// ========== 回退链 ==========
var CHAINS = {
  wy: [tryXinghaiMain, tryXinghaiBack, trySuyin163],
  tx: [tryXinghaiMain, tryXinghaiBack, trySuyinQQ],
  kw: [tryXinghaiMain, tryXinghaiBack, trySuyinKW],
  kg: [tryXinghaiMain],
  mg: [tryXinghaiMain],
};

function getUrl(platform, songInfo, quality) {
  var key = platform + '__' + songInfo.id + '__' + quality;
  var hit = cacheGet(key);
  if (hit) return Promise.resolve(hit);

  var chain = CHAINS[platform] || [tryXinghaiMain];
  var i = 0;

  function next() {
    if (i >= chain.length) {
      return Promise.reject(new Error('所有API均失败: ' + platform + ' ' + quality));
    }
    var fn = chain[i++];
    return fn(platform, songInfo, quality).then(function(url) {
      if (url) { cacheSet(key, url); return url; }
      return next();
    });
  }
  return next();
}

// ========== 版本检测 ==========
function compareVer(a, b) {
  var pa = a.split('.').map(Number);
  var pb = b.split('.').map(Number);
  for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
    var d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
function checkUpdate() {
  httpGet(UPDATE_CHECK_URL, {}, {}, 4000).then(function(res) {
    var r = res.data;
    if (!r || !r.version) return;
    if (compareVer(r.version, VERSION) > 0) {
      send(EVENT_NAMES.updateAlert, {
        log: '🎵 音源新版本 ' + r.version + ' 可用！\n' + (r.desc || ''),
        updateUrl: r.updateUrl,
      });
    }
  }).catch(function() {});
}

// ========== 注册到 LX Music ==========
send(EVENT_NAMES.inited, {
  sources: {
    wy: { name: '网易云', type: 'music', actions: ['musicUrl'], qualitys: QUALITIES.wy },
    tx: { name: 'QQ音乐', type: 'music', actions: ['musicUrl'], qualitys: QUALITIES.tx },
    kw: { name: '酷我',   type: 'music', actions: ['musicUrl'], qualitys: QUALITIES.kw },
    kg: { name: '酷狗',   type: 'music', actions: ['musicUrl'], qualitys: QUALITIES.kg },
    mg: { name: '咪咕',   type: 'music', actions: ['musicUrl'], qualitys: QUALITIES.mg },
  },
});

on(EVENT_NAMES.musicUrl, function(data) {
  if (data.action !== 'musicUrl') throw new Error('不支持: ' + data.action);
  return getUrl(data.source, data.info.musicInfo, data.info.type);
});

checkUpdate();
