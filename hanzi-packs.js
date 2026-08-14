// 分包加载器（自动生成，勿手改）：node test/build-hanzi-packs.js
// require 的路径必须写成字面量：小程序靠静态分析决定把哪些代码分出去，
// 拼出来的路径分不掉。所以这里一条条列出来，由脚本按实际分包数生成。
module.exports = [
  (ok, fail) => require('../subpackages/hanzi1/data.js', ok, fail),
  (ok, fail) => require('../subpackages/hanzi2/data.js', ok, fail),
  (ok, fail) => require('../subpackages/hanzi3/data.js', ok, fail),
  (ok, fail) => require('../subpackages/hanzi4/data.js', ok, fail),
  (ok, fail) => require('../subpackages/hanzi5/data.js', ok, fail),
  (ok, fail) => require('../subpackages/hanzi6/data.js', ok, fail),
  (ok, fail) => require('../subpackages/hanzi7/data.js', ok, fail),
  (ok, fail) => require('../subpackages/hanzi8/data.js', ok, fail),
];
