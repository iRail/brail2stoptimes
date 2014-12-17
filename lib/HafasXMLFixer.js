var Transform = require('stream').Transform;
var util = require('util');

function HafasXMLFixer () {
  Transform.call(this, {objectMode: true});
  
}
util.inherits(HafasXMLFixer, Transform);

HafasXMLFixer.prototype._flush = function (done) {
  done();
}

HafasXMLFixer.prototype._transform = function (data, encoding, done) {
  data = data.replace(/\<br\s?\/>/g, " ").replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&/g,"");
  this.push(data);
  done();
}


module.exports = HafasXMLFixer;
