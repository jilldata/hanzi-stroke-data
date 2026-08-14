// node test/build-hanzi-packs.js [--data <解压后的 hanzi-writer-data 目录>]
//
// 把课标 2500 常用字的笔顺数据打成 4 个 JS 分包，外加一份主包索引。
// 不给 --data 就直接从 CDN 抓（2500 个请求，并发 16，约两三分钟）；
// 想快就先 `npm pack hanzi-writer-data@2.0.1` 解压后把目录传进来。
//
// 为什么是 4 个包：裁剪压缩后 2500 字共约 4.1MB，微信单个分包上限 2MB，
// 切 2 包会到 2.1MB 卡线，切 4 包每包约 1MB 留足余量。
// 按字表自身的音序切，不另外排序：课标字表一整个 2500 字都是常用字，
// 没有"更该内置"的子集；次常用字（字表二那 1000 个）不内置，继续走 CDN 兜底。
//
// 许可：数据是 Arphic Public License（见 licenses/ARPHICPL.TXT）。
// 本脚本对数据做了两处修改，生成物的文件头里也会写明：
//   ① 坐标从 1024 网格整除到 256 网格（字形有 ±0.5/256 的量化误差，
//      在字帖的实际渲染尺寸下小于 0.2px，肉眼不可见）；
//   ② 只保留 strokes 与 medians 每笔首点，其余字段丢弃。
// APL 要求修改必须对第三方 Freely Available——本脚本随仓库提供即是。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/';
const PACKS = 4;
const GRID_DIV = 4;               // 1024 ÷ 4 = 256 网格
const CONCURRENCY = 16;

const argIdx = process.argv.indexOf('--data');
const LOCAL = argIdx > 0 ? process.argv[argIdx + 1] : null;

// 字表放在 test/charlists/，来源见该目录的 README
const listDir = path.join(__dirname, 'charlists');
const readList = (f) => fs.readFileSync(path.join(listDir, f), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

function orderedChars() {
  const seen = new Set();
  const out = [];
  readList('kebiao-2022-biao1.txt').forEach((ch) => {   // 2500 常用字，音序
    if (!seen.has(ch)) { seen.add(ch); out.push(ch); }
  });
  return out;
}

async function fetchChar(ch) {
  if (LOCAL) {
    const f = path.join(LOCAL, ch + '.json');
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  const res = await fetch(CDN + encodeURIComponent(ch) + '.json');
  if (!res.ok) return null;
  return res.json();
}

// 路径瘦身：命令与数字之间的空格可以全去掉（解析器按 token 正则读，
// 见 render-copybook.js 的 fillSvgPath），数字之间必须留一个分隔符
const squeeze = (d) => d.replace(/\s*([MLQCZ])\s*/g, '$1').replace(/\s+/g, ' ').trim();
const quantize = (d) => d.replace(/-?\d+(?:\.\d+)?/g, (v) => String(Math.round(Number(v) / GRID_DIV)));

// 存成数组而不是 {strokes, medianStarts}：2500 个字，省下的字段名有几十 KB
function packOne(raw) {
  return [
    raw.strokes.map((s) => quantize(squeeze(s))),
    raw.medians.map((m) => [
      Math.round(m[0][0] / GRID_DIV),
      Math.round(m[0][1] / GRID_DIV),
    ]),
  ];
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
      if (i % 200 === 0) process.stdout.write('.');
    }
  }));
  return out;
}

const HEAD = (n, chars) => `// 汉字笔顺数据分包（自动生成，勿手改）：node test/build-hanzi-packs.js
// 第 ${n} / ${PACKS} 包，共 ${chars} 字
//
// 数据来源：hanzi-writer-data（https://github.com/chanind/hanzi-writer-data）
//   ← Make Me a Hanzi ← 文鼎科技 Arphic Technology 1999 年发布的字体
// 许可证：Arphic Public License，原文见 licenses/ARPHICPL.TXT（随包分发，不可移除）
// 本文件相对原始数据的修改（${new Date().toISOString().slice(0, 10)}）：
//   ① 坐标由 1024 网格整除为 ${1024 / GRID_DIV} 网格（量化误差 < 0.2px @ 字帖渲染尺寸）
//   ② 每字只保留 strokes 与 medians 各笔首点，其余字段删除
//   ③ 路径内多余空格删除，结构压成 [strokes[], medianStarts[]] 数组
//   目的均为压缩小程序分包体积，字形轮廓本身未重绘
// 生成脚本 test/build-hanzi-packs.js 随仓库提供，可据此从原始数据复现
`;

(async () => {
  const chars = orderedChars();
  console.log(`字表合计 ${chars.length} 字，数据源：${LOCAL || CDN}`);

  const results = await mapLimit(chars, LOCAL ? 256 : CONCURRENCY, async (ch) => {
    try {
      const raw = await fetchChar(ch);
      return raw && raw.strokes && raw.medians ? [ch, packOne(raw)] : [ch, null];
    } catch (e) {
      return [ch, null];
    }
  });
  console.log('');

  const got = results.filter(([, v]) => v);
  const missing = results.filter(([, v]) => !v).map(([ch]) => ch);
  if (missing.length) console.log(`⚠ ${missing.length} 字无数据（走 CDN 兜底）：${missing.join('')}`);

  const per = Math.ceil(got.length / PACKS);
  const index = [];
  for (let i = 0; i < PACKS; i += 1) {
    const slice = got.slice(i * per, (i + 1) * per);
    const obj = {};
    slice.forEach(([ch, v]) => { obj[ch] = v; });
    const dir = path.join(ROOT, 'subpackages', `hanzi${i + 1}`);
    fs.mkdirSync(dir, { recursive: true });
    const out = HEAD(i + 1, slice.length) + 'module.exports = ' + JSON.stringify(obj) + ';\n';
    fs.writeFileSync(path.join(dir, 'data.js'), out);
    index.push(slice.map(([ch]) => ch).join(''));
    console.log(`subpackages/hanzi${i + 1}/data.js  ${slice.length} 字  ${Math.round(Buffer.byteLength(out) / 1024)}KB`);
  }

  const idx = `// 字 → 分包号 的索引（自动生成，勿手改）：node test/build-hanzi-packs.js
// 只有字符本身，没有笔顺数据，所以放主包（约 ${Math.round(Buffer.byteLength(index.join('')) / 1024)}KB）。
// utils/hanzi-data.js 靠它判断某个字该异步加载哪个分包。
module.exports = ${JSON.stringify(index)};
`;
  fs.writeFileSync(path.join(ROOT, 'utils', 'hanzi-index.js'), idx);
  console.log(`utils/hanzi-index.js  ${Math.round(Buffer.byteLength(idx) / 1024)}KB`);
})();
