/*jshint strict: false */

var connect = require("connect"),
    http = require('http'),
    assert = require("assert"),
    escort = require("../index");
    
var methods = ["get", "post", "put", "delete"];
var exampleNames = ["neil", "bob", "windsor"];

module.exports = {
    "methods static": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                methods.forEach(function (method) {
                    routes[method]("home_" + method, "/" + method, function (req, res) {
                        res.end(method.toUpperCase() + " /" + method);
                    });
                });
            })
        );
        
        methods.forEach(function (method) {
            assert.response(app,
                { url: "/" + method, method: method.toUpperCase() },
                { body: method.toUpperCase() + " /" + method });
            
            assert.strictEqual("/" + method, url["home_" + method]());

            methods.forEach(function (otherMethod) {
                if (method !== otherMethod) {
                    assert.response(app,
                        { url: "/" + method, method: otherMethod.toUpperCase() },
                        { statusCode: 405 });
                }
            });
        });
    },
    "bind static": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                var descriptor = {};
                methods.forEach(function (method) {
                    descriptor[method] = function (req, res) {
                        res.end(method.toUpperCase() + " /");
                    };
                });
                routes.bind("home", "/", descriptor);
            })
        );
        
        assert.strictEqual("/", url.home());
        
        methods.forEach(function (method) {
            assert.response(app,
                { url: "/", method: method.toUpperCase() },
                { body: method.toUpperCase() + " /" });
        });
    },
    "methods dynamic": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;

                methods.forEach(function (method) {
                    routes[method]("name_" + method, "/{name}/" + method, function (req, res, params) {
                        res.end(method.toUpperCase() + " /" + params.name + "/" + method);
                    });
                });
            })
        );
        
        exampleNames.forEach(function (name) {
            methods.forEach(function (method) {
                assert.response(app,
                    { url: "/" + name + "/" + method, method: method.toUpperCase() },
                    { body: method.toUpperCase() + " /" + name + "/" + method });
                
                assert.strictEqual("/" + name + "/" + method, url["name_" + method](name));
                assert.strictEqual("/" + name + "/" + method, url["name_" + method]({ name: name }));
                
                methods.forEach(function (otherMethod) {
                    if (method !== otherMethod) {
                        assert.response(app,
                            { url: "/" + name + "/" + method, method: otherMethod.toUpperCase() },
                            { statusCode: 405 });
                    }
                });
            });
        });
    },
    "bind dynamic": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;

                var descriptor = {};
                methods.forEach(function (method) {
                    descriptor[method] = function (req, res, params) {
                        res.end(method.toUpperCase() + " /" + params.name);
                    };
                });
                routes.bind("name", "/{name}", descriptor);
            })
        );
        
        exampleNames.forEach(function (name) {
            assert.strictEqual("/" + name, url.name(name));
            assert.strictEqual("/" + name, url.name({ name: name }));
        });

        methods.forEach(function (method) {
            exampleNames.forEach(function (name) {
                assert.response(app,
                    { url: "/" + name, method: method.toUpperCase() },
                    { body: method.toUpperCase() + " /" + name });
            });
        });
    },
    "calling other methods": function () {
        var app = connect(
            escort(function (routes) {
                routes.bind("doSomething", "/do-something", {
                    get: function (req, res) {
                        this.post(req, res);
                    },
                    post: function (req, res) {
                        res.end(req.method + " /do-something");
                    }
                });
            })
        );
        
        assert.response(app,
            { url: "/do-something", method: "GET" },
            { body: "GET /do-something" });
        assert.response(app,
            { url: "/do-something", method: "POST" },
            { body: "POST /do-something" });
    },
    "guessed route names": function () {
        var routesToExpectedNames = {
            "/do-something": "doSomething",
            "/posts": "posts",
            "/": "root",
        };
        
        Object.keys(routesToExpectedNames).forEach(function (route) {
            var name = routesToExpectedNames[route];
            
            var url;
            var app = connect(
                escort(function (routes) {
                    url = routes.url;
                    routes.get(route, function (req, res) {
                        res.end("GET " + route);
                    });
                })
            );
            assert.strictEqual(route, url[name]());
        });
    },
    "int converter": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                routes.get("post", "/posts/{id:int({min: 1, max: 99})}", function (req, res, params) {
                    assert.strictEqual("number", typeof params.id);
                    
                    res.end("GET /posts/" + params.id);
                });
            })
        );
        
        assert.response(app,
            { url: "/posts/0", method: "GET" },
            { statusCode: 404 });
        assert.response(app,
            { url: "/posts/100", method: "GET" },
            { statusCode: 404 });
        
        for (var i = 1; i <= 99; i += 1) {
            assert.strictEqual("/posts/" + i, url.post(i));
            assert.strictEqual("/posts/" + i, url.post({ id: i }));
            
            assert.response(app,
                { url: "/posts/" + i, method: "GET" },
                { body: "GET /posts/" + i });
        }
    },
    "int converter (fixedDigits)": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                routes.get("post", "/posts/{id:int({fixedDigits: 4})}", function (req, res, params) {
                    assert.strictEqual("number", typeof params.id);
                    
                    res.end("GET /posts/" + params.id);
                });
            })
        );
        
        assert.response(app,
            { url: "/posts/0", method: "GET" },
            { statusCode: 404 });
        assert.response(app,
            { url: "/posts/100", method: "GET" },
            { statusCode: 404 });
        
        for (var i = 1; i <= 9; i += 1) {
            assert.strictEqual("/posts/000" + i, url.post(i));
            assert.strictEqual("/posts/000" + i, url.post({ id: i }));
            
            assert.response(app,
                { url: "/posts/000" + i, method: "GET" },
                { body: "GET /posts/" + i });
        }
    },
    "string converter": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;

                routes.get("post", "/posts/{id:string({minLength: 3, maxLength: 8})}", function (req, res, params) {
                    assert.strictEqual("string", typeof params.id);

                    res.end("GET /posts/" + params.id);
                });
            })
        );

        assert.response(app,
            { url: "/posts/hi", method: "GET" },
            { statusCode: 404 });
        assert.response(app,
            { url: "/posts/howdypartner", method: "GET" },
            { statusCode: 404 });
        for (var i = 0; i < 20; i += 1) {
            assert.response(app,
                { url: "/posts/" + "howdypartner".substr(0, i), method: "GET" },
                { statusCode: i < 3 || i > 8 ? 404 : 200 });
        }

        for (i = 1; i <= 9; i += 1) {
            assert.strictEqual("/posts/hey" + i, url.post("hey" + i));
            assert.strictEqual("/posts/hey" + i, url.post({ id: "hey" + i }));

            assert.response(app,
                { url: "/posts/hey" + i, method: "GET" },
                { body: "GET /posts/hey" + i });
        }
    },
    "path converter": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;

                routes.get("post", "/posts/{id:path}", function (req, res, params) {
                    assert.strictEqual("string", typeof params.id);

                    res.end("GET /posts/" + params.id);
                });
            })
        );

        for (var i = 1; i < "howdy/partner/how/are/you".length; i += 1) {
            var part = "howdy/partner/how/are/you".substr(0, i);
            if (part.charAt(part.length - 1) !== "/") {
                assert.response(app,
                    { url: "/posts/" + part, method: "GET" },
                    { body: "GET /posts/" + part });
            }
        }
    },
    "any converter": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;

                routes.get("post", "/posts/{id:any('alpha', 'bravo', 'charlie')}", function (req, res, params) {
                    assert.strictEqual("string", typeof params.id);

                    res.end("GET /posts/" + params.id);
                });
            })
        );
        
        assert.response(app,
            { url: "/posts/alpha", method: "GET" },
            { body: "GET /posts/alpha" });
        
        assert.response(app,
            { url: "/posts/bravo", method: "GET" },
            { body: "GET /posts/bravo" });
        
        assert.response(app,
            { url: "/posts/charlie", method: "GET" },
            { body: "GET /posts/charlie" });
        
        assert.response(app,
            { url: "/posts/delta", method: "GET" },
            { statusCode: 404 });
    },
    "custom converter": function () {
        var CustomConverter = function () {
            return {
                regex: "(?:yes|no)",
                fromUrl: function (value) {
                    return value === "yes";
                },
                toUrl: function (value) {
                    return value ? "yes" : "no";
                }
            };
        };
        
        var url;
        var app = connect(
            escort({ converters: { custom: CustomConverter } }, function (routes) {
                url = routes.url;

                routes.get("post", "/posts/{id:custom}", function (req, res, params) {
                    assert.strictEqual("boolean", typeof params.id);

                    res.end("GET /posts/" + (params.id ? "yes" : "no"));
                });
            })
        );

        assert.response(app,
            { url: "/posts/yes", method: "GET" },
            { body: "GET /posts/yes" });

        assert.response(app,
            { url: "/posts/no", method: "GET" },
            { body: "GET /posts/no" });

        assert.response(app,
            { url: "/posts/maybe", method: "GET" },
            { statusCode: 404 });
        
        assert.strictEqual("/posts/yes", url.post(true));
        assert.strictEqual("/posts/no", url.post(false));
    },
    "notFound handler": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res) {
                    res.end("Found the root");
                });
                
                routes.notFound(function (req, res, next) {
                    res.writeHead(404);
                    res.end("Not found, oh noes!");
                });
            })
        );
        
        assert.response(app,
            { url: "/", method: "GET" },
            { body: "Found the root" });

        assert.response(app,
            { url: "/other", method: "GET" },
            { body: "Not found, oh noes!", statusCode: 404 });
    },
    "calling next in the notFound handler should go to the next middleware": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res) {
                    res.end("Found the root");
                });
                
                routes.notFound(function (req, res, next) {
                    next();
                });
            }),
            function (req, res) {
                res.end("Next middleware");
            }
        );
        
        assert.response(app,
            { url: "/", method: "GET" },
            { body: "Found the root" });

        assert.response(app,
            { url: "/other", method: "GET" },
            { body: "Next middleware" });
    },
    "methodNotAllowed handler": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res) {
                    res.end("Found the root");
                });
                
                routes.methodNotAllowed(function (req, res, next) {
                    res.writeHead(405);
                    res.end("No such method, nuh-uh.");
                });
            })
        );
        
        assert.response(app,
            { url: "/", method: "GET" },
            { body: "Found the root" });
        
        assert.response(app,
            { url: "/", method: "POST" },
            { body: "No such method, nuh-uh.", statusCode: 405 });
    },
    "calling next in the methodNotAllowed handler should go to the next middleware": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res) {
                    res.end("Found the root");
                });

                routes.methodNotAllowed(function (req, res, next) {
                    next();
                });
            }),
            function (req, res) {
                res.end("Next middleware");
            }
        );

        assert.response(app,
            { url: "/", method: "GET" },
            { body: "Found the root" });

        assert.response(app,
            { url: "/", method: "POST" },
            { body: "Next middleware" });
    },
    "dynamic caching": function () {
        var doneParts = {};
        var CustomConverter = function () {
            return {
                regex: "[a-z]+",
                fromUrl: function (value) {
                    if (doneParts[value]) {
                        throw new Error("Already seen " + value);
                    }
                    return value;
                },
                toUrl: function (value) {
                    return value;
                }
            };
        };
        
        var app = connect(
            escort({ converters: { custom: CustomConverter } }, function (routes) {
                routes.bind("user", "/users/{name:custom}", {
                    get: function (req, res, params) {
                        res.end("GET /users/" + params.name);
                    },
                    post: function (req, res, params) {
                        res.end("POST /users/" + params.name);
                    },
                });
            })
        );
        
        for (var i = 0; i < 100; i += 1) {
            for (var j = 0, len = exampleNames.length; j < len; j += 1) {
                var name = exampleNames[j];
                
                assert.response(app,
                    { url: "/users/" + name, method: "GET" },
                    { body: "GET /users/" + name });
                
                assert.response(app,
                    { url: "/users/" + name, method: "POST" },
                    { body: "POST /users/" + name });
            }
        }
    },
    "submounting": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                routes.submount("/users", function (users) {
                    users.get("user", "/{name}", function (req, res, params) {
                        res.end("GET /users/" + params.name);
                    });
                });
            })
        );
        
        exampleNames.forEach(function (name) {
            assert.response(app,
                { url: "/users/" + name, method: "GET" },
                { body: "GET /users/" + name });
        });
    },
    "dynamic submounting": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                routes.submount("/users/{name}", function (users) {
                    users.get("userInfo", "/info", function (req, res, params) {
                        res.end("GET /users/" + params.name + "/info");
                    });
                });
            })
        );
        
        exampleNames.forEach(function (name) {
            assert.response(app,
                { url: "/users/" + name + "/info", method: "GET" },
                { body: "GET /users/" + name + "/info" });
        });
    },
    "submount within submount": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                routes.submount("/alpha", function (alpha) {
                    alpha.submount("/bravo", function (bravo) {
                        bravo.submount("/charlie", function (charlie) {
                            charlie.get("item", "/{name}", function (req, res, params) {
                                res.end("GET /alpha/bravo/charlie/" + params.name);
                            });
                        });
                    });
                });
            })
        );
        
        exampleNames.forEach(function (name) {
            assert.response(app,
                { url: "/alpha/bravo/charlie/" + name, method: "GET" },
                { body: "GET /alpha/bravo/charlie/" + name });
        });
    },
    "conflicts": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                routes.submount("/forums", function (forums) {
                    forums.get("forum", "/{forumSlug}", function (req, res, params) {
                        res.end("GET /forums/" + params.forumSlug);
                    });
                    forums.get("thread", "/{threadID:int}", function (req, res, params) {
                        res.end("GET /forums/" + params.threadID + " (thread)");
                    });
                });
            })
        );
        
        for (var i = 1; i < 10; i += 1) {
            assert.response(app,
                { url: "/forums/" + i, method: "GET" },
                { body: "GET /forums/" + i + " (thread)" });
        }

        exampleNames.forEach(function (name) {
            assert.response(app,
                { url: "/forums/" + name, method: "GET" },
                { body: "GET /forums/" + name });
        });
    },
    "multiple routes per callback": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                routes.get("home", ["/", "/home"], function (req, res, params) {
                    res.end("GET " + req.url);
                });
            })
        );
        
        assert.strictEqual("/", url.home());
        
        assert.response(app,
            { url: "/", method: "GET" },
            { body: "GET /" });
            
        assert.response(app,
            { url: "/home", method: "GET" },
            { body: "GET /home" });
        
        assert.response(app,
            { url: "/ho", method: "GET" },
            { statusCode: 404 });
    },
    "multiple routes per callback with [] syntax": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;

                routes.get("home", "/[home]", function (req, res, params) {
                    res.end("GET " + req.url);
                });
            })
        );

        assert.strictEqual("/", url.home());

        assert.response(app,
            { url: "/", method: "GET" },
            { body: "GET /" });

        assert.response(app,
            { url: "/home", method: "GET" },
            { body: "GET /home" });

        assert.response(app,
            { url: "/ho", method: "GET" },
            { statusCode: 404 });
    },
    "submounted multiple routes per callback": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                routes.submount("/forums", function (forums) {
                    forums.get("forum", ["", "/home"], function (req, res, params) {
                        res.end("GET " + req.url);
                    });
                });
            })
        );
        
        assert.strictEqual("/forums", url.forum());
        
        assert.response(app,
            { url: "/forums", method: "GET" },
            { body: "GET /forums" });
            
        assert.response(app,
            { url: "/forums/home", method: "GET" },
            { body: "GET /forums/home" });
            
        assert.response(app,
            { url: "/forums/ho", method: "GET" },
            { statusCode: 404 });
    },
    "submounted multiple routes per callback with [] syntax": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                routes.submount("/forums", function (forums) {
                    forums.get("forum", "[/home]", function (req, res, params) {
                        res.end("GET " + req.url);
                    });
                });
            })
        );
        
        assert.strictEqual("/forums", url.forum());
        
        assert.response(app,
            { url: "/forums", method: "GET" },
            { body: "GET /forums" });
            
        assert.response(app,
            { url: "/forums/home", method: "GET" },
            { body: "GET /forums/home" });
        
        assert.response(app,
            { url: "/forums/ho", method: "GET" },
            { statusCode: 404 });
    },
    "dynamic multiple routes per callback": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                routes.get("page", ["/", "/page/{pageNum:int({min: 1})}"], function (req, res, params) {
                    var pageNum = params.pageNum || 1;
                    res.end("Viewing page #" + pageNum);
                });
            })
        );
        
        assert.strictEqual("/", url.page());
        assert.strictEqual("/page/2", url.page(2));
        assert.strictEqual("/page/2", url.page({pageNum: 2}));
        
        assert.response(app,
            { url: "/", method: "GET" },
            { body: "Viewing page #1" });
            
        assert.response(app,
            { url: "/page/1", method: "GET" },
            { body: "Viewing page #1" });
            
        assert.response(app,
            { url: "/page/2", method: "GET" },
            { body: "Viewing page #2" });
    },
    "dynamic multiple routes per callback with [] syntax": function () {
        var url;
        var app = connect(
            escort(function (routes) {
                url = routes.url;
                
                routes.get("page", "/[page/{pageNum:int({min: 1})}]", function (req, res, params) {
                    var pageNum = params.pageNum || 1;
                    res.end("Viewing page #" + pageNum);
                });
            })
        );
        
        assert.strictEqual("/", url.page());
        assert.strictEqual("/page/2", url.page(2));
        assert.strictEqual("/page/2", url.page({pageNum: 2}));
        
        assert.response(app,
            { url: "/", method: "GET" },
            { body: "Viewing page #1" });
            
        assert.response(app,
            { url: "/page/1", method: "GET" },
            { body: "Viewing page #1" });
            
        assert.response(app,
            { url: "/page/2", method: "GET" },
            { body: "Viewing page #2" });
    },
    "error handling": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res, params) {
                    throw new Error("fake error");
                });
            }),
            function (err, req, res, next) {
                res.writeHead(500);
                res.end(err.toString());
            }
        );
        
        assert.response(app,
            { url: "/", method: "GET" },
            { statusCode: 500, body: "Error: fake error" });
    },
    "escaping regexp characters": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("blah", "/blah.txt", function (req, res, params) {
                    res.end("Blah!");
                });
                routes.get("name", "/{name}.txt", function (req, res, params) {
                    res.end("Blah: " + params.name + "!");
                });
            })
        );
        
        assert.response(app,
            { url: "/blah.txt", method: "GET" },
            { body: "Blah!" });
        
        assert.response(app,
            { url: "/blahxtxt", method: "GET" },
            { statusCode: 404 });
        
        exampleNames.forEach(function (name) {
            assert.response(app,
                { url: "/" + name + ".txt", method: "GET" },
                { body: "Blah: " + name + "!" });
            
            assert.response(app,
                { url: "/" + name + "xtxt", method: "GET" },
                { statusCode: 404 });
        });
    },
    "options": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res) {
                    res.end("GET /");
                });
                routes.bind("/item", {
                    get: function (req, res) {
                        res.end("GET /item");
                    },
                    post: function (req, res) {
                        res.end("POST /item");
                    }
                });
            })
        );
        
        assert.response(app,
            { url: "/", method: "OPTIONS" },
            { body: "GET", headers: { Allow: "GET" }, statusCode: 200 });
        
        assert.response(app,
            { url: "/item", method: "OPTIONS" },
            { body: "GET,POST", headers: { Allow: "GET,POST" }, statusCode: 200 });
    },
    "querystring": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res) {
                    res.end("GET /");
                });
            })
        );
        
        assert.response(app,
            { url: "/?q=stuff", method: "GET" },
            { body: "GET /", statusCode: 200 });
    },
    "multiple methods defined by the same callback": function () {
        var app = connect(
            escort(function (routes) {
                routes.bind("doSomething", "/do-something", {
                    "get,post": function (req, res) {
                        res.end(req.method + " /do-something");
                    },
                });
            })
        );

        assert.response(app,
            { url: "/do-something", method: "GET" },
            { body: "GET /do-something" });
        assert.response(app,
            { url: "/do-something", method: "POST" },
            { body: "POST /do-something" });
    },
    "run without connect": function () {
        var routing = escort(function (routes) {
            routes.get("/", function (req, res) {
                res.end("GET /");
            });
            
            routes.get("/error", function (req, res) {
                throw new Error("This is an error");
            });
        });
        var app = http.createServer(function (req, res) {
            routing(req, res);
        });
        
        assert.response(app,
            { url: "/", method: "GET" },
            { body: "GET /" });
        
        assert.response(app,
            { url: "/not-found", method: "GET" },
            { statusCode: 404 });
        
        assert.response(app,
            { url: "/error", method: "GET" },
            { statusCode: 500 });
    },
    "allow lack of callback": function () {
        var routing = escort();
        routing.get("/", function (req, res) {
            res.end("GET /");
        });
        
        assert.response(connect(routing),
            { url: "/", method: "GET" },
            { body: "GET /" });
    },
    "work with options but no callback": function () {
        var routing = escort({ converters: { custom: escort.StringConverter } });
        routing.get("post", "/{post:custom}", function (req, res, params) {
            res.end("GET /" + params.post);
        });
        
        var app = connect(routing);
        
        exampleNames.forEach(function (name) {
            assert.response(app,
                { url: "/" + name, method: "GET" },
                { body: "GET /" + name });
            
            assert.strictEqual("/" + name, routing.url.post(name));
        });
    },
    "multiple parameters": function () {
        var url;
        var app = connect(escort(function (routes) {
            url = routes.url;
            routes.get("multi", "/{alpha}/{bravo}/{charlie}/{delta}", function (req, res, params) {
                res.end("GET /" + params.alpha + "/" + params.bravo + "/" + params.charlie + "/" + params.delta);
            });
        }));
        
        exampleNames.forEach(function (alpha) {
            exampleNames.forEach(function (bravo) {
                exampleNames.forEach(function (charlie) {
                    exampleNames.forEach(function (delta) {
                        assert.response(app,
                            { url: "/" + alpha + "/" + bravo + "/" + charlie + "/" + delta, method: "GET" },
                            { body: "GET /" + alpha + "/" + bravo + "/" + charlie + "/" + delta });
            
                        assert.strictEqual("/" + alpha + "/" + bravo + "/" + charlie + "/" + delta, url.multi(alpha, bravo, charlie, delta));
                        assert.strictEqual("/" + alpha + "/" + bravo + "/" + charlie + "/" + delta, url.multi({alpha: alpha, bravo: bravo, charlie: charlie, delta: delta}));
                    });
                });
            });
        });
    },
    "calling next will call the next middleware": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res, params, next) {
                    next();
                });
            }),
            function (req, res) {
                res.end("Next middleware");
            }
        );
        
        assert.response(app,
            { url: "/", method: "GET"},
            { body: "Next middleware" });
    },
    "calling next will not call an unreferenced middleware": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res, params, next) {
                    next();
                });
            }),
            function (req, res) {
                res.end("Next middleware");
            },
            function (req, res) {
                res.end("Unreferenced");
            }
        );
        
        assert.response(app,
            { url: "/", method: "GET"},
            { body: "Next middleware" });
    },
    "calling next will call the middleware after next": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res, params, next) {
                    next();
                });
            }),
            function (req, res, next) {
                next();
            },
            function (req, res) {
                res.end("Next middleware");
            }
        );
        
        assert.response(app,
            { url: "/", method: "GET" },
            { body: "Next middleware" });
    },
    "calling next will call the notFound handler": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res, params, next) {
                    next();
                });
                
                routes.notFound(function (req, res) {
                    res.end("Not found!");
                });
            }),
            function (req, res) {
                res.end("Should not be hit");
            }
        );
        
        assert.response(app,
            { url: "/", method: "GET" },
            { body: "Not found!" });
    },
    "calling next will call the next middleware after the notFound handler": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/", function (req, res, params, next) {
                    next();
                });
                
                routes.notFound(function (req, res, next) {
                    next();
                });
            }),
            function (req, res) {
                res.end("Next middleware");
            }
        );
        
        assert.response(app,
            { url: "/", method: "GET" },
            { body: "Next middleware" });
    },
    "ending a URL in a slash is an error": function () {
        var gotError = false;
        escort(function (routes) {
            try {
                routes.get("/thing/", function (req, res) {
                    res.end("GET /thing/");
                });
            } catch (err) {
                gotError = true;
            }
        });
        assert.eql(true, gotError);
    },
    "two slashes in a URL is an error": function () {
        var gotError = false;
        escort(function (routes) {
            try {
                routes.get("/alpha//bravo", function (req, res) {
                    res.end("GET /alpha//bravo");
                });
            } catch (err) {
                gotError = true;
            }
        });
        assert.eql(true, gotError);
    },
    "including a question mark in a URL is an error": function () {
        var gotError = false;
        escort(function (routes) {
            try {
                routes.get("/thing?hey", function (req, res) {
                    res.end("GET /thing?hey");
                });
            } catch (err) {
                gotError = true;
            }
        });
        assert.eql(true, gotError);
    },
    "retrieving a known URL with a slash should return a MovedPermanently": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/thing", function (req, res) {
                    res.end("GET /thing");
                });
            })
        );
        
        assert.response(app,
            { url: "/thing/", method: "GET" },
            { statusCode: 301, headers: { Location: "/thing" } });
    },
    "retrieving a known URL with a slash should return a MovedPermanently and preserve querystring": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/thing", function (req, res) {
                    res.end("GET /thing");
                });
            })
        );

        assert.response(app,
            { url: "/thing/?hello=there", method: "GET" },
            { statusCode: 301, headers: { Location: "/thing?hello=there" } });
    },
    "retrieving an unknown URL with a slash should return a NotFound": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/thing", function (req, res) {
                    res.end("GET /thing");
                });
            })
        );
        
        assert.response(app,
            { url: "/other/", method: "GET" },
            { statusCode: 404 });
    },
    "redirect on case difference (static)": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("/Thing", function (req, res) {
                    res.end("GET /Thing");
                });
            })
        );
        
        assert.response(app,
            { url: "/Thing", method: "GET" },
            { statusCode: 200, body: "GET /Thing" });
        
        assert.response(app,
            { url: "/thing", method: "GET" },
            { statusCode: 301, headers: { Location: "/Thing" } });
        
        assert.response(app,
            { url: "/THING", method: "GET" },
            { statusCode: 301, headers: { Location: "/Thing" } });
    },
    "redirect on case difference (dynamic)": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("thing", "/Thing/{item}", function (req, res, params) {
                    res.end("GET /Thing/" + params.item);
                });
                
                routes.get("other", "/Thing/{item}/Blah", function (req, res, params) {
                    res.end("GET /Thing/" + params.item + "/Blah");
                });
            })
        );
        
        exampleNames.forEach(function (name) {
            assert.response(app,
                { url: "/Thing/" + name, method: "GET" },
                { statusCode: 200, body: "GET /Thing/" + name });
        
            assert.response(app,
                { url: "/thing/" + name, method: "GET" },
                { statusCode: 301, headers: { Location: "/Thing/" + name } });
        
            assert.response(app,
                { url: "/THING/" + name, method: "GET" },
                { statusCode: 301, headers: { Location: "/Thing/" + name } });
                
            assert.response(app,
                { url: "/Thing/" + name + "/Blah", method: "GET" },
                { statusCode: 200, body: "GET /Thing/" + name + "/Blah" });
        
            assert.response(app,
                { url: "/thing/" + name + "/blah", method: "GET" },
                { statusCode: 301, headers: { Location: "/Thing/" + name + "/Blah" } });
        
            assert.response(app,
                { url: "/THING/" + name + "/BLAH", method: "GET" },
                { statusCode: 301, headers: { Location: "/Thing/" + name + "/Blah" } });
        });
    },
    "any converter case sensitivity": function () {
        var app = connect(
            escort(function (routes) {
                routes.get("post", "/posts/{id:any('Alpha', 'Bravo', 'Charlie')}", function (req, res, params) {
                    assert.strictEqual("string", typeof params.id);

                    res.end("GET /posts/" + params.id);
                });
            })
        );
        
        ["Alpha", "Bravo", "Charlie"].forEach(function (name) {
            assert.response(app,
                { url: "/posts/" + name, method: "GET" },
                { body: "GET /posts/" + name });
            
            assert.response(app,
                { url: "/posts/" + name.toLowerCase(), method: "GET" },
                { statusCode: 301, headers: { Location: "/posts/" + name } });
            
            assert.response(app,
                { url: "/posts/" + name.toUpperCase(), method: "GET" },
                { statusCode: 301, headers: { Location: "/posts/" + name } });
        });
    }
};