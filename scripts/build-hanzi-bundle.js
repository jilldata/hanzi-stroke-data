// node test/build-hanzi-bundle.js — 从 hanzi-writer-data 抓取常用字笔顺数据，
// 生成 utils/hanzi-bundle.js 内置字库（strokes = SVG 填充路径，medianStarts = 各笔画起点，
// 用于笔顺序号标注）。生僻字由小程序运行时从 CDN 拉取，见 utils/hanzi-data.js。
//
// 许可：数据是 **Arphic Public License**，不是 MIT——MIT 那个是 hanzi-writer 绘制库，
// 本项目没用。APL 要求修改必须对第三方 Freely Available，本脚本就是"修改"的全部内容：
// 只裁字段、不动字形。详见 licenses/README.md 与 licenses/ARPHICPL.TXT。
const fs = require('fs');
const path = require('path');

// 内置常用字：一年级高频生字 + 演示默认字
const CHARS = (
  '一二三四五六七八九十上下大小人口手目日月水火山石田土木禾' +
  '天地你我他她它好学写字花鸟虫云雨风春夏秋冬爱妈爸中国文左右'
).split('');

const CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/';

async function fetchChar(ch) {
  const res = await fetch(CDN + encodeURIComponent(ch) + '.json');
  if (!res.ok) throw new Error(`${ch}: HTTP ${res.status}`);
  return res.json();
}

// 和分包用同一套压缩：去空格 + 坐标整除到 256 网格。
// 两边坐标系必须一致，否则同一页里内置字和分包字会画成两种大小
const GRID_DIV = 4;
const squeeze = (d) => d.replace(/\s*([MLQCZ])\s*/g, '$1').replace(/\s+/g, ' ').trim();
const quantize = (d) => d.replace(/-?\d+(?:\.\d+)?/g, (v) => String(Math.round(Number(v) / GRID_DIV)));

(async () => {
  const bundle = {};
  for (const ch of CHARS) {
    try {
      const data = await fetchChar(ch);
      bundle[ch] = {
        strokes: data.strokes.map((s) => quantize(squeeze(s))),
        // 只保留每笔起点（笔顺序号标注用），控制体积
        medianStarts: data.medians.map((m) => [
          Math.round(m[0][0] / GRID_DIV),
          Math.round(m[0][1] / GRID_DIV),
        ]),
      };
      process.stdout.write(ch);
    } catch (e) {
      console.error(`\n跳过 ${ch}: ${e.message}`);
    }
  }
  // 文件头的"修改说明"是 Arphic Public License 的硬性要求
  //（"insert a prominent notice in each modified file stating how and when you changed that file"）
  const out = '// 内置笔顺字库（自动生成，勿手改）：node test/build-hanzi-bundle.js\n'
    + '// 数据来源：hanzi-writer-data（https://github.com/chanind/hanzi-writer-data）\n'
    + '//   ← Make Me a Hanzi ← 文鼎科技 Arphic Technology 1999 年发布的字体\n'
    + '// 许可证：Arphic Public License，原文见 licenses/ARPHICPL.TXT（随包分发，不可移除）\n'
    + '// 本文件相对原始数据的修改（' + new Date().toISOString().slice(0, 10) + '）：\n'
    + '//   ① 坐标由 1024 网格整除为 256 网格（量化误差 < 0.2px @ 字帖渲染尺寸）\n'
    + '//   ② 每字只保留 strokes 与 medians 各笔首点（改名 medianStarts，用于标笔顺序号）\n'
    + '//   ③ 路径内多余空格删除\n'
    + '//   目的均为压缩小程序主包体积，字形轮廓本身未重绘\n'
    + '// 坐标系：256×256，y 轴向上、基线偏移 225（渲染时需翻转，见 render-copybook.js）\n'
    + 'module.exports = ' + JSON.stringify(bundle) + ';\n';
  fs.writeFileSync(path.join(__dirname, '..', 'utils', 'hanzi-bundle.js'), out);
  const kb = Math.round(Buffer.byteLength(out) / 1024);
  console.log(`\nwritten utils/hanzi-bundle.js（${Object.keys(bundle).length} 字，${kb}KB）`);
})();
