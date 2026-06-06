const fs = require('fs');
const path = require('path');

// 读源码
const src = fs.readFileSync(path.join(__dirname, 'src', 'index.js'), 'utf-8');

// 输出到 dist
if (!fs.existsSync(path.join(__dirname, 'dist'))) {
  fs.mkdirSync(path.join(__dirname, 'dist'));
}
fs.writeFileSync(path.join(__dirname, 'dist', 'source.js'), src, 'utf-8');

console.log('构建完成 → dist/source.js');
