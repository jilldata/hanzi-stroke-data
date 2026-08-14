// node test/build-hanzi-packs.js [--data <解压后的 hanzi-writer-data 目录>]
//
// 把《通用规范汉字表》（2013）一级 + 二级共 6500 字的笔顺数据打成若干 JS 分包，
// 外加主包用的索引和加载器。不给 --data 就直接从 CDN 抓（6500 个请求，并发 16，
// 约五六分钟）；想快就先 `npm pack hanzi-writer-data@2.0.1` 解压后把目录传进来。
//
// 为什么收到二级为止：家长最容易碰壁的是孩子名字里的字，而"劼昶珩祎骁琛奕烨瑄"
// 这类人名用字**几乎全部落在国标二级**——收到二级，字帖就基本不用联网了。
// 三级 1605 字里有 1239 个数据源本身就没有，只多 495 个有效字，不划算；
// 数据源全部 9574 字则要 19.5MB，加上主包离 20MB 上限只剩 70KB，没有余地。
//
// 切包按**字节**贪心而不是按字数等分：生僻字的路径明显更长，
// 按字数切会让某些包鼓到 1.9MB 顶着 2MB 上限。
//
// 许可：数据是 Arphic Public License（见 licenses/ARPHICPL.TXT）。
// 本脚本对数据做了三处修改，生成物的文件头里也会写明：
//   ① 坐标从 1024 网格整除到 256 网格（字形有 ±0.5/256 的量化误差，
//      在字帖的实际渲染尺寸下小于 0.2px，肉眼不可见）；
//   ② 只保留 strokes 与 medians 每笔首点；
//   ③ 路径内多余空格删除，结构压成数组。
// APL 要求修改必须对第三方 Freely Available——本脚本随仓库提供，
// 生成物同步推送到 https://github.com/jilldata/hanzi-stroke-data

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/';
const MAX_PACK = 1.6 * 1024 * 1024;   // 单包上限 2MB，按 1.6MB 切留足余量
const GRID_DIV = 4;                   // 1024 ÷ 4 = 256 网格
const CONCURRENCY = 16;

const argIdx = process.argv.indexOf('--data');
const LOCAL = argIdx > 0 ? process.argv[argIdx + 1] : null;

// 字表放在 test/charlists/，来源见该目录的 README
const listDir = path.join(__dirname, 'charlists');
const readList = (f) => fs.readFileSync(path.join(listDir, f), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

// 一级在前、二级在后：一级是日常用字，让它们集中在前面的包里，
// 多数人只会触发下载前一两个包
function orderedChars() {
  const seen = new Set();
  const out = [];
  readList('guobiao-2013-ji1.txt').concat(readList('guobiao-2013-ji2.txt')).forEach((ch) => {
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

// 存成数组而不是 {strokes, medianStarts}：6500 个字，省下的字段名有一百多 KB
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
      if (i % 500 === 0) process.stdout.write('.');
    }
  }));
  return out;
}

const HEAD = (n, total, chars) => `// 汉字笔顺数据分包（自动生成，勿手改）：node test/build-hanzi-packs.js
// 第 ${n} / ${total} 包，共 ${chars} 字
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
  console.log(`国标一级+二级合计 ${chars.length} 字，数据源：${LOCAL || CDN}`);

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
  console.log(`有笔顺数据 ${got.length} 字，数据源里没有 ${missing.length} 字（这些字打印时降级为楷体）`);
  if (missing.length) fs.writeFileSync(path.join(__dirname, 'charlists', '_no-stroke-data.txt'),
    `# 国标一二级里 hanzi-writer-data 没有收录的字（自动生成）\n${missing.join('\n')}\n`);

  // 按字节贪心切包
  const groups = [[]];
  let cur = 0;
  got.forEach(([ch, v]) => {
    const bytes = Buffer.byteLength(JSON.stringify(ch) + ':' + JSON.stringify(v) + ',');
    if (cur + bytes > MAX_PACK && groups[groups.length - 1].length) {
      groups.push([]);
      cur = 0;
    }
    groups[groups.length - 1].push([ch, v]);
    cur += bytes;
  });

  // 旧的分包目录先清掉，免得改了档位之后留下一堆孤儿包被打进代码包
  const subRoot = path.join(ROOT, 'subpackages');
  if (fs.existsSync(subRoot)) {
    fs.readdirSync(subRoot).filter((d) => /^hanzi\d+$/.test(d))
      .forEach((d) => fs.rmSync(path.join(subRoot, d), { recursive: true, force: true }));
  }

  const index = [];
  groups.forEach((slice, i) => {
    const obj = {};
    slice.forEach(([ch, v]) => { obj[ch] = v; });
    const dir = path.join(subRoot, `hanzi${i + 1}`);
    fs.mkdirSync(dir, { recursive: true });
    const out = HEAD(i + 1, groups.length, slice.length) + 'module.exports = ' + JSON.stringify(obj) + ';\n';
    fs.writeFileSync(path.join(dir, 'data.js'), out);
    index.push(slice.map(([ch]) => ch).join(''));
    console.log(`  subpackages/hanzi${i + 1}/data.js  ${slice.length} 字  ${(Buffer.byteLength(out) / 1048576).toFixed(2)}MB`);
  });

  const idx = `// 字 → 分包号 的索引（自动生成，勿手改）：node test/build-hanzi-packs.js
// 只有字符本身，没有笔顺数据，所以放主包（约 ${Math.round(Buffer.byteLength(index.join('')) / 1024)}KB）。
// utils/hanzi-data.js 靠它判断某个字该异步加载哪个分包。
module.exports = ${JSON.stringify(index)};
`;
  fs.writeFileSync(path.join(ROOT, 'utils', 'hanzi-index.js'), idx);

  // 分包路径必须是字面量，小程序才能静态分析出依赖，所以这份加载器也自动生成——
  // 改档位导致包数变化时，不用再手动去 hanzi-data.js 里加减 require
  const loaders = `// 分包加载器（自动生成，勿手改）：node test/build-hanzi-packs.js
// require 的路径必须写成字面量：小程序靠静态分析决定把哪些代码分出去，
// 拼出来的路径分不掉。所以这里一条条列出来，由脚本按实际分包数生成。
module.exports = [
${groups.map((_, i) => `  (ok, fail) => require('../subpackages/hanzi${i + 1}/data.js', ok, fail),`).join('\n')}
];
`;
  fs.writeFileSync(path.join(ROOT, 'utils', 'hanzi-packs.js'), loaders);

  const subs = groups.map((_, i) => `    { "root": "subpackages/hanzi${i + 1}", "pages": [] }`).join(',\n');
  console.log(`\nutils/hanzi-index.js  ${Math.round(Buffer.byteLength(idx) / 1024)}KB`);
  console.log(`utils/hanzi-packs.js  ${groups.length} 个加载器`);
  console.log(`\n⚠ app.json 的 subpackages 要与之对应，共 ${groups.length} 条：\n${subs}`);
})();
