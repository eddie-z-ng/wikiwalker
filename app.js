var cheerio = require('cheerio'),
    request = require('request'),
    express = require('express'),
    async = require('async'),
    path = require('path'),
    http = require('http'),
    swig = require('swig');

// YOUR_WIKIS_URL will be something like http://192.168.1.53:3000
var baseUrl = "http://192.168.1.53:3000";

// helper function for creating a full URL
var addBaseUrl = function(url) {
  return baseUrl + url;
};

var Page = function(attrs) {
  this.url = attrs.url;
  this.links = attrs.links;
  this.title = attrs.title;
};


var visitedLinks = [];
var urlToPage = {};

// here we're using async.queue
// https://github.com/caolan/async#queue
// this limits our node process to only
// running 2 (because of the concurrency variable)
 
var concurrency = 1;
var workerQueue = async.queue(
  function(urlObject, done) {
    getAndCrawlLink(urlObject.url, done);
  },
  concurrency
);

var getAndCrawlLink = function(url, done) {
  console.log("Crawling URL: ", url);
  if (visitedLinks.indexOf(url) !== -1) {
    done();
    return;
  }
 
  // Step 1:  Grab the page at the URL we're given
  request({ uri: url }, function(err, response, body) {
    if(err && response.statusCode !== 200) { console.log("Request error getting: " , url); }
 
    /* Step 2.  Find links in the page that start with /wiki
                Convert them into a list of just the URLs we want to crawl */
 
    $ = cheerio.load(body);
    var links = $("a")
      .filter(function(i, link) {
        return $(link).attr("href").match(/wiki\/(\w+)$/);
      })
      .map(function(i, link) {
        var url = $(link).attr("href");
        return addBaseUrl(url);
      });
 
    // Store the title information from the page
    var title = $("title").text();
 
    // Save the fact that we've visited this page
    visitedLinks.push(url);

    console.log("visitedLinks:", visitedLinks);
 
    // Convert the currently crawled page into a Page object and store info about it
    urlToPage[url] = new Page({
      url: url,
      links: links,
      title: title
    });
 
    // Recursively Crawl each link -- add to worker queue if we haven't already seen this link
    links
      .each(function(i, link) {
        if(visitedLinks.indexOf(link) === -1) {
          console.log("Havent visited:", link);

          var pageObj = {url: link};
          console.log("Pushing ", pageObj, " to Queue");
          workerQueue.push(pageObj);
          //getAndCrawlLink(link);
        }
      });

    // Finally: notify the workerQueue that we're done
    done();
  });
};

// var pageObj = {url: baseUrl};
// workerQueue.push(pageObj);

// workerQueue.drain = function() {
//     console.log('all items processed');
// };

//var pageHtml = getAndCrawlLink(baseUrl);

//debugger;

// Get the HTML text of the starting room
// var pageHtml = request({uri: baseUrl}, function(err, response, body) {
//     //Just a basic error check
//     if(err && response.statusCode !== 200){
//         console.log('Request error.');
//     }

//     $ = cheerio.load(body);
//     // let's stop the engine here and

//     // var pageLinks = $("a");
//     // pageLinks.filter(function(index, link) {
//     //   if ( $(link).attr('href').match(/wiki\/.*/) ) {
//     //     return true;
//     //   }
//     // });

//     debugger;

// });



//////////////////////////////////////////
var app = express();
app.set('port', 3333);
app.engine('html', swig.renderFile);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'views'));
swig.setDefaults({ cache: false });
 
//app.use(express.logger('dev'));
//app.use(express.json());
 
app.get("/", function(req, res) {
  res.render("index");
});
 
// You need to implement this function to convert
// Your urlToPage structure into the structure
// expected by d3.js
// See the test.json route for an example -
// to see this example in action, change world.json in your index.htm
// file to test.json and refresh the page
var convertToD3Format = function(urlToPage) {
  //return JSON.stringify(urlToPage);
  // var pageNodeUrls = Object.keys(urlToPage);
  // var pageNodes = pageNodeUrls.map(function (pageNodeUrl) {
  //     return { name: pageNodeUrl};
  // });

  var pageNodes = visitedLinks.map(function (visitedLink) {
      return { name: visitedLink };
  });

  var linkObjects = [];
  visitedLinks.forEach(function(visitedLink, index) {

    var sourceIndex = index;

    var urlPage = urlToPage[visitedLink];
    var targetLinkObject = urlPage.links;

    console.log("index", index, targetLinkObject);

    for (var i = 0; i < targetLinkObject.length; i++) {
      var key = ''+i;
      var targetLinkURL = targetLinkObject[key];
      var targetIndex = visitedLinks.indexOf(targetLinkURL);
      linkObjects.push({ source: sourceIndex, target: targetIndex});
    }

  });

  console.log(pageNodes);
  console.log(linkObjects);
  return {
      nodes: pageNodes,
      links: linkObjects
  };
};
 
app.get('/world.json', function(req, res) {
  res.json(convertToD3Format(urlToPage));
});
 
// This is what d3.js expects
// nodes is an array of objects where name is the
// name of the Page
// links represents the connections, source is the
// index of the starting page (index in the nodes array)
// and target is the index of the end page
// app.get('/test.json', function(req, res) {
//   res.json({
//     nodes:  [
//               { name: "MyTestPage" },
//               { name: "MySecondTestPage" },
//               { name: "MyThirdTestPage" }
//             ],
//     links:  [
//               { source: 0, target: 1 },
//               { source: 1, target: 2 },
//               { source: 0, target: 2 }
//             ]
//   });
// });

var startingUrl = baseUrl;
// use async module to guarantee that we crawl before we boot the web server
async.series([
  function(callback) {
    // crawl a wiki stack
    console.log("Crawling starting at: ", startingUrl);
    workerQueue.push({url: startingUrl});
    workerQueue.drain = function() {
      // don't boot up the express server until we're finished crawling
      console.log("Done crawling");
      callback(null);
   };
  },
  function(callback) {
    // boot the server
    http.createServer(app).listen(app.get('port'), function(){
      console.log('Express server listening on port ' + app.get('port'));
    });
  }
]);

