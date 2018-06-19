const cheerio = require('cheerio');
const request = require('request-promise-native');

const isBlank = str => (!str || /^\s*$/.test(str));

const trimmer = text =>
  text.replace(/ {2}/g, '').split(/[\n,]+/).slice(1, -1);

const trimmers = mappable =>
  mappable.map(text => text
    .replace(/ {2}/g, '')
    .split(/[\n,]+/)
    .slice(1, -1)[0]);

const n2str = (type, nr) => {
  const str = nr.toString().padStart(5, '0');
  return `${type}${str}.htm`;
};

const parseJSObject = (elem, jsText) =>
  JSON
    .parse(jsText
      .match(`var ${elem} (.)*`)[0]
      .replace(`var ${elem} = `, '')
      .replace(';', ''))
    .map((text, value) => ({ text, value: value + 1 }));


const fetchHtmlFromUrl = url =>
  request
    .get(url)
    .then(resp => cheerio.load(resp, { xmlMode: false }))
    .catch((error) => {
      error.status = (error.response && error.response.status) || 500;
      throw error;
    });


module.exports = {
  isBlank,
  trimmer,
  trimmers,
  n2str,
  parseJSObject,
  fetchHtmlFromUrl,
};
