const options = {
        runScripts: 'dangerously',
        resources: 'usable'
};

const URL = './ParentNode-querySelector-All.html';

const jsdom = require("jsdom");

const { JSDOM } = jsdom;

const dom = new JSDOM();

JSDOM.fromURL(URL, options).then(dom => {

  console.log(dom.serialize());

});
