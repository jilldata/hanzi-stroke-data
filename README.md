# hanzi-stroke-data

《通用规范汉字表》一级 + 二级共 6500 字的汉字笔顺数据，为微信小程序体积做过裁剪与量化，
可直接当分包用。

这个仓库的存在是为了满足 **Arphic Public License** 的一条要求：对数据所做的修改，
必须以同样的条件对第三方开放（"make such modifications Freely Available as a whole
to all third parties ... such as by offering access to copy the modifications from a
designated place"）。这里就是那个 designated place。

## 数据来源与许可

- 来源：[hanzi-writer-data](https://github.com/chanind/hanzi-writer-data)
  ← [Make Me a Hanzi](https://github.com/skishore/makemeahanzi)
  ← 文鼎科技（Arphic Technology）1999 年以自由许可发布的字体
- 许可证：**Arphic Public License**，原文见 [`ARPHICPL.TXT`](./ARPHICPL.TXT)，未作改动。
  本仓库的数据文件同样以 APL 分发。

> 注意别被搞混：`hanzi-writer`（那个 JS 绘制库）是 MIT，但**笔顺数据不是 MIT**，
> 是 APL。网上不少项目把这两个混为一谈。

## 相对原始数据做了什么修改

1. 每个字只保留 `strokes`（笔画的 SVG 填充路径）与 `medians` 每笔的**首个点**
   （改名 `medianStarts`，用途是在笔顺字帖上标笔画序号），其余字段丢弃；
2. 路径里多余的空格删除——解析器按 token 正则读，不依赖空格；
3. 坐标由原始的 **1024 网格整除为 256 网格**，y 轴基线相应由 900 变为 225。
   这一步有 ±0.5/256 的量化误差，在字帖的实际渲染尺寸（每格约 100px）下不到 0.2px，
   肉眼不可见——但它确实改动了坐标数值，故在此明确说明。

**字形轮廓本身没有重绘**，三步全部是为压缩体积：6500 字不裁不压约 15MB，
而微信小程序单个分包上限 2MB、所有包合计上限 20MB。裁剪后共 12.3MB。

## 收录范围

打包的是《通用规范汉字表》（2013）**一级 3500 字 + 二级 3000 字**，
其中 6371 字在数据源里有笔顺，另 129 字数据源本身没有收录
（清单见 [`charlists/_no-stroke-data.txt`](./charlists/_no-stroke-data.txt)）。

为什么收到二级为止：给孩子名字做字帖是最容易碰壁的场景，而人名用字
（劼、昶、珩、祎、骁、琛、奕、烨、瑄…）**几乎全部落在二级**。
三级 1605 字里有 1239 个数据源就没有，只多 495 个有效字；
数据源全部 9574 字则要 19.5MB，几乎顶满小程序 20MB 上限，不留余地。

## 文件

| 路径 | 内容 |
|---|---|
| `subpackages/hanzi1~8/data.js` | 6371 字，按字节切成 8 份各 ≤1.6MB，`{ 字: [strokes[], medianStarts[]] }` |
| `hanzi-index.js` | 字 → 分包号 的索引，只有字符没有数据，约 19KB |
| `hanzi-packs.js` | 分包加载器（微信分包异步化要求 `require` 路径是字面量） |
| `hanzi-bundle.js` | 57 个高频字，`{ 字: {strokes, medianStarts} }`，给首屏秒出用 |
| `charlists/` | 用到的字表与取舍说明 |
| `scripts/` | 生成脚本，可从原始数据完整复现上面所有文件 |

切包按**字节**贪心而不是按字数等分：生僻字的路径明显更长，
按字数切会让某些包鼓到 1.9MB 顶着 2MB 上限。

## 复现

```bash
npm pack hanzi-writer-data@2.0.1
tar -xzf hanzi-writer-data-2.0.1.tgz          # 解出 package/ 目录
node scripts/build-hanzi-packs.js --data ./package
node scripts/build-hanzi-bundle.js            # 这个直接从 CDN 抓，57 个字
```

不传 `--data` 就改从 CDN 逐字抓（6500 个请求，并发 16，五六分钟）。
脚本里的输出路径是按原小程序项目的目录结构写的，单独跑请按需调整。

## 坐标系

`256 × 256`，y 轴**向上**，基线偏移 `225`。渲染到画布时需要翻转：

```js
px = ox + x * scale
py = oy + (225 - y) * scale       // scale = 格子边长 / 256
```

路径命令只有 `M / L / Q / C / Z`，全部绝对坐标。
