const options = {
        runScripts: 'dangerously',
        resources: 'usable'
};

const URL = './Element-matches.html';

const jsdom = require("jsdom");

const { JSDOM } = jsdom;

const dom = new JSDOM();

JSDOM.fromURL(URL, options).then(dom => {

  console.log(dom.serialize());

});
