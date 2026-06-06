/*!
 * @name 我的聚合音源
 * @description 聚合多个API，网易/QQ/酷我/酷狗/咪咕，多链路回退
 * @version 1.0.0
 * @author maomao1714
 * @update_url https://raw.githubusercontent.com/maomao1714/my-lx-source/main/source.json
 */

'use strict';

const VERSION = '1.0.0';
const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/maomao1714/my-lx-source/main/source.json';

const APIS = {
  XINGHAI: 'https://music-api.gdstudio.xyz/api.php',
  SUYIN_QQ: 'https://oiapi.net/api/QQ_Music',
  SUYIN_163: 'https://oiapi.net/api/Music_163',
  SUYIN_KUWO: 'https://oiapi.net/api/Kuwo',
};

const QUALITIES = {
  wy: ['24bit', 'flac', '320k', '192k', '128k'],
  tx: ['24bit', 'flac', '320k', '192k', '128k'],
  kw: ['24bit', 'flac', '320k', '192k', '128k'],
  kg: ['flac', '320k', '128k'],
  mg: ['flac', '320k', '128k'],
};

const BR_MAP = {
  '128k': '128',
  '192k': '192',
  '320k': '320',
  'flac': '740',
  '24bit': '999',
};

const SUYIN_QQ_MAP = {
  '128k': 7,
  '192k': 6,
  '320k': 5,
  'flac': 4,
  '24bit': 1,
};

const PLATFORM_MAP = {
  wy: 'netease',
  tx: 'tencent',
  kw: 'kuwo',
  kg: 'kugou',
  mg: 'migu',
};

// 缓存
const cache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000;
const CACHE_MAX = 300;

function cacheGet(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return item.url;
}

function cacheSet(key, url) {
  if (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { url, ts: Date.now() });
}

// 网络请求
const { EVENT_NAMES, request, on, send } = globalThis.lx;

function httpGet(url, params, timeout) {
  params = params || {};
  timeout = timeout || 5000;
  const qs = Object.keys(params)
    .filter(function(k) { return params[k] != null; })
    .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  const fullUrl = qs ? (url + '?' + qs) : url;
  return new Promise(function(resolve, reject) {
    request(fullUrl, { method: 'GET', timeout: timeout }, function(err, res) {
      if (err) return reject(new Error(err.message || String(err)));
      var body = res && res.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body.trim()); } catch (_) {}
      }
      resolve({ status: (res && res.statusCode) || 0, data: body });
    });
  });
}

// 星海API（支持全平台）
function tryXinghai(platform, songInfo, quality) {
  var pname = PLATFORM_MAP[platform];
  if (!pname) return Promise.resolve(null);
  return httpGet(APIS.XINGHAI, {
    source: pname,
    id: songInfo.id,
    br: BR_MAP[quality] || '320',
  }).then(function(res) {
    var data = res.data;
    var url = (data && data.data && data.data.url) || (data && data.url);
    if (url && url.indexOf('http') === 0) return url;
    return null;
  }).catch(function() { return null; });
}

// 溯音QQ（仅tx）
function trySuyinQQ(platform, songInfo, quality) {
  if (platform !== 'tx') return Promise.resolve(null);
  return httpGet(APIS.SUYIN_QQ, {
    id: songInfo.id,
    level: SUYIN_QQ_MAP[quality] || 5,
  }).then(function(res) {
    var data = res.data;
    var url = data && data.data && data.data.url;
    if (url && url.indexOf('http') === 0) return url;
    return null;
  }).catch(function() { return null; });
}

// 溯音163（仅wy）
function trySuyin163(platform, songInfo, quality) {
  if (platform !== 'wy') return Promise.resolve(null);
  var level = quality === 'flac' ? 3 : quality === '320k' ? 2 : 1;
  return httpGet(APIS.SUYIN_163, {
    id: songInfo.id,
    level: level,
  }).then(function(res) {
    var data = res.data;
    var url = data && data.data && data.data.url;
    if (url && url.indexOf('http') === 0) return url;
    return null;
  }).catch(function() { return null; });
}

// 溯音酷我（仅kw）
function trySuyinKuwo(platform, songInfo, quality) {
  if (platform !== 'kw') return Promise.resolve(null);
  return httpGet(APIS.SUYIN_KUWO, {
    id: songInfo.id,
    format: quality === 'flac' ? 'flac' : 'mp3',
    br: quality === 'flac' ? 2000 : quality === '320k' ? 320 : 128,
  }).then(function(res) {
    var data = res.data;
    var url = data && data.data && data.data.url;
    if (url && url.indexOf('http') === 0) return url;
    return null;
  }).catch(function() { return null; });
}

// 回退链
var FALLBACK_CHAINS = {
  wy: [tryXinghai, trySuyin163],
  tx: [tryXinghai, trySuyinQQ],
  kw: [tryXinghai, trySuyinKuwo],
  kg: [tryXinghai],
  mg: [tryXinghai],
};

function getUrl(platform, songInfo, quality) {
  var cacheKey = platform + '__' + songInfo.id + '__' + quality;
  var cached = cacheGet(cacheKey);
  if (cached) return Promise.resolve(cached);

  var chain = FALLBACK_CHAINS[platform] || [tryXinghai];
  var index = 0;

  function tryNext() {
    if (index >= chain.length) {
      return Promise.reject(new Error('所有API均失败: ' + platform + ' - ' + quality));
    }
    var fn = chain[index++];
    return fn(platform, songInfo, quality).then(function(url) {
      if (url) {
        cacheSet(cacheKey, url);
        return url;
      }
      return tryNext();
    });
  }

  return tryNext();
}

// 版本检测
function compareVersion(a, b) {
  var pa = a.split('.').map(Number);
  var pb = b.split('.').map(Number);
  for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
    var d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function checkUpdate() {
  httpGet(UPDATE_CHECK_URL, {}, 3000).then(function(res) {
    var remote = res.data;
    if (!remote || !remote.version) return;
    if (compareVersion(remote.version, VERSION) > 0) {
      send(EVENT_NAMES.updateAlert, {
        log: '🎵 音源新版本 ' + remote.version + ' 可用！\n' + (remote.desc || ''),
        updateUrl: remote.updateUrl,
      });
    }
  }).catch(function() {});
}

// 注册到 LX Music
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
  var source = data.source;
  var action = data.action;
  var info = data.info;
  if (action !== 'musicUrl') throw new Error('不支持的action: ' + action);
  return getUrl(source, info.musicInfo, info.type);
});

checkUpdate();
