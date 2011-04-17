/*jshint strict: false */

var assert = require("assert"),
    escortClient = require("../lib/escort-client");
    
var exampleNames = ["neil", "bob", "windsor"];
var exampleUnicodeNames = ["nøgel", "über", "cliché"];

var makeBadString = (function (Ctor) {
    return function (value) {
        return new Ctor(value);
    };
}(String));

module.exports = {
    "static": function () {
        var data = {
            home: [{
                path: "/"
            }],
            dynamic: [{
                literals: ["/dynamic/"],
                params: [
                    {
                        name: "value",
                        type: "string"
                    }
                ]
            }]
        };
        
        var url = escortClient.generateUrlObject(data);
        
        assert.strictEqual("/", url.home());
    },
    "dynamic": function () {
        var data = {
            dynamic: [{
                literals: ["/dynamic/"],
                params: [
                    {
                        name: "value",
                        type: "string"
                    }
                ]
            }]
        };
        
        var url = escortClient.generateUrlObject(data);
        
        exampleNames.concat(exampleUnicodeNames).forEach(function (name) {
            assert.strictEqual("/dynamic/" + encodeURIComponent(name), url.dynamic(name));
            assert.strictEqual("/dynamic/" + encodeURIComponent(name), url.dynamic({ value: name }));
            assert.strictEqual("/dynamic/" + encodeURIComponent(name), url.dynamic(makeBadString(name)));
            assert.strictEqual("/dynamic/" + encodeURIComponent(name), url.dynamic({ value: makeBadString(name) }));
        });
    },
    "mixed": function () {
        var data = {
            posts: [
                {
                    path: "/posts",
                },
                {
                    literals: ["/posts/page/"],
                    params: [
                        {
                            name: "page",
                            type: "int",
                        }
                    ]
                }
            ]
        };
        
        var url = escortClient.generateUrlObject(data);
        assert.strictEqual("/posts", url.posts());
        for (var i = 2; i < 20; i += 1) {
            assert.strictEqual("/posts/page/" + i, url.posts(i));
            assert.strictEqual("/posts/page/" + i, url.posts({ page: i }));
        }
    },
    "multiple dynamic": function () {
        var data = {
            test: [
                {
                    literals: ["/", "/", "/", "/"],
                    params: [
                        {
                            name: "alpha",
                            type: "string"
                        },
                        {
                            name: "bravo",
                            type: "string"
                        },
                        {
                            name: "charlie",
                            type: "string"
                        },
                        {
                            name: "delta",
                            type: "string"
                        }
                    ]
                }
            ]
        };

        var url = escortClient.generateUrlObject(data);
        exampleNames.forEach(function (alpha) {
            exampleNames.forEach(function (bravo) {
                exampleNames.forEach(function (charlie) {
                    exampleNames.forEach(function (delta) {
                        assert.strictEqual("/" + alpha + "/" + bravo + "/" + charlie + "/" + delta, url.test(alpha, bravo, charlie, delta));
                        assert.strictEqual("/" + alpha + "/" + bravo + "/" + charlie + "/" + delta, url.test({ alpha: alpha, bravo: bravo, charlie: charlie, delta: delta }));
                    });
                });
            });
        });
    },
    "int converter": function () {
        var data = {
            int: [{
                literals: ["/"],
                params: [{
                    name: "value",
                    type: "int"
                }]
            }],
            archive: [{
                literals: ["/archive/"],
                params: [{
                    name: "year",
                    type: "int",
                    fixedDigits: 4
                }]
            }],
        };
        
        var zeroPad = function (value) {
            if (value < 10) {
                return "000" + value;
            } else if (value < 100) {
                return "00" + value;
            } else if (value < 1000) {
                return "0" + value;
            } else {
                return value;
            }
        };
        
        var url = escortClient.generateUrlObject(data);
        for (var i = 0; i < 100; i += 1) {
            var randValue = Math.floor(Math.random() * 10000);
            assert.strictEqual("/" + i, url.int(i));
            assert.strictEqual("/" + i, url.int({ value: i }));
            assert.strictEqual("/" + randValue, url.int(randValue));
            assert.strictEqual("/" + randValue, url.int({ value: randValue }));
            
            assert.strictEqual("/archive/" + zeroPad(i), url.archive(i));
            assert.strictEqual("/archive/" + zeroPad(i), url.archive({ year: i }));
            assert.strictEqual("/archive/" + zeroPad(randValue), url.archive(randValue));
            assert.strictEqual("/archive/" + zeroPad(randValue), url.archive({ year: randValue }));
            
        }
    },
    "path converter": function () {
        var data = {
            post: [{
                literals: ["/"],
                params: [{
                    name: "path",
                    type: "path"
                }]
            }]
        };
        var url = escortClient.generateUrlObject(data);
        
        for (var i = 1; i < "howdy/partner/how/are/you".length; i += 1) {
            var part = "howdy/partner/how/are/you".substr(0, i);
            if (part.charAt(part.length - 1) !== "/") {
                assert.strictEqual("/" + part, url.post(part));
                assert.strictEqual("/" + part, url.post({ path: part }));
            }
        }
    }
};