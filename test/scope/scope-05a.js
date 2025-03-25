const { JSDOM } = require('./jsdom');
const document = new JSDOM(`
<html>
<head>
<title>JSDOM & NWSAPI (Template_01)</title>
</head>
<body>
<div class="outer_a">
<div class="inner_a"></div>
<div class="inner_b"></div>
</div>
<div class="outer_b">
<div class="inner_c"></div>
<div class="inner_d"></div>
</div>
</body>
</html>
`);

const View = document.window;
const Dom = require('../../src/nwsapi.js')(View);

//(global.document.window);

console.log(Dom);

