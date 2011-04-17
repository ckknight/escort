# Escort

  Escort is a middleware for [Connect](https://github.com/senchalabs/connect) which provides routing and url generation
  capabilities.

## Installation
  
  The easiest way to install is through [npm](http://npmjs.org/).
  
    $ npm install escort
  
  Alternatively, you can pull from [github](https://github.com/ckknight/escort) and place where necessary.

## What makes Escort different from other routing libraries
  
  * URL generation
    
    Because routing from URLs to callbacks is only half of the problem, you also need to generate URLs.
    
    Hardcoding the URLs (in your views, likely) can be a pain to update if ever your URLs. Also, if you have dynamic
    URLs, knowing the correct and safe syntax to convert the Javascript values to a safe URL can be tricky.
    
  * Converters
  
    Converters provide a way to safely and consistently handle dynamic route parameter consumption and generation.
    
    Rather than defining regular expression yourself or manually converting URL strings to other JavaScript
    objects, the converter takes care of all of that for you.
    
    Also, it knows how to convert the JavaScript objects provided back into safe URL components with ease.
    
  * Submounting
    
    Logically divide segments of your app into different route submounts.
    
  * Case-agnostic but aware
  
    Although domains are case-insensitive, URLs are not. `/foo` is a different URL from `/FOO` and from `/Foo`, and your
    SEO (Search Engine Optimization) can be hurt by having all three serve the same content (assuming they're referenced
    from other pages). Also, having your expected url (e.g. `/foo`) work but the other casings not work can be confusing
    for users in certain cases.
    
    Escort takes the approach of allowing all three URLs to work, but if it is not exactly case equivalent to the
    expected route, then a 301 Moved Permanently will redirect to the correct one. This means that if someone visits
    `/FOO`, they are immediately redirected to `/foo`. Since it is a 301, any SEO rankings should also update.
  
  * Unicode-aware
  
    You are fully able to have unicode parts in your URLs without harm, and you register them as if they are normal
    paths. You can also very capably accept unicode parts in the dynamic parameters as well.
    
  * Performance concerns
    
    Routing tends to be hit every request, since any caching that occurs typically starts inside one's route callback.
    Thus, making route consumption as efficient as possible is a key priority.
    
    Routes are separated into static and dynamic routes. Static routes are implicitly efficient,
    since it is just a quick Object key lookup (which V8) has very optimized.
    
    Dynamic routes are trickier and Escort has a two-phase approach for consuming them.
    
    First, every time a route is properly calculated, its callback and generated parameters are stored in an in-memory
    cache keyed on its URL. That means that if someone were to visit any particular URL more than once (before the
    cache clears), the routing system only has to do the calculation once rather than each time.
    
    Secondly, for the actual calculation of the route, it separates out all routes based on their prefixes. Since all
    prefixes are guaranteed to be static (even if it is just `/`), doing an efficient non-RegExp check for whether the
    incoming URL matches the prefix will cut down lookups by a significant amount in the general case (varying from app
    to app). Not having to traverse all the `/pages/` routes for something that we know is under `/forums/` removes a
    significant amount of work.
  
  * Client-side URL generation
    
    Escort provides a way to serialize its URL structure such that a client-side library can interpret that JSON data
    and be able to generate URLs. This is extremely handy if you have a web app where you generate HTML rather than
    leave it up to the server.
    
    The `escort-client.js` is provided for you that can be used in the browser.

## Hello, world!
  
  This will assume you already have [Connect](https://github.com/senchalabs/connect) installed.
  
  This should be the absolutely simplest program, a simple app that listens on `localhost:3000` and says
  `"Hello, world!"` when you visit its root (`/`).
  
    var connect = require('connect'),
        escort = require('escort');
      
    connect(
        escort(function(routes) {
            routes.get("/", function(req, res) {
                res.end("Hello, world!");
            });
        })
    ).listen(3000);

  It will only respond when a `GET` is sent to `/`. If you were to send a `POST`, it would not respond be providing
  `"Hello, world!"`. Also, if you were to visit any other URL, it wouldn't respond either, since those have not been
  bound yet.
  
  *Note: the routes parameter can be removed in favor of using `this`, as in the following example*
  
    connect(
        escort(function() {
            this.get("/", function(req, res) {
                res.end("Hello, world!");
            });
        })
    ).listen(3000);

## Dynamic parameters

  Not every route can or should be statically-defined. After all, what's the point of writing a fluid, dynamic
  application if we were limited to that?
  
  Thus, we need to be able to have dynamic parameters in our routes. In Escort, they are specified through the syntax
  `{param}`.
  
    connect(
        escort(function(routes) {
            routes.get("/", function(req, res) {
                res.end("Hello, world!");
            });
            routes.get("/{name}", function(req, res, params) {
                res.end("Hello, " + params.name + "!");
            });
        })
    ).listen(3000);
  
  Visiting `/` still sends you `"Hello, world!"`, but visiting `/ckknight` will now send you `"Hello, ckknight!"`
  instead of just giving a 404.

## URL generation

  Just as one can visit a URL and have it properly route to a callback to run which powers our apps, often we want the
  reverse: being able to generate URLs.
    
    connect(
        escort(function(routes) {
            var url = routes.url;
            
            routes.get("/", function(req, res) {
                res.end("You are visiting " + url.root());
            })
            routes.get("/about", function(req, res) {
                res.end("You are visiting " + url.about());
            })
            routes.get("pageIndex", "/pages", function(req, res) {
                res.end("You are visiting " + url.pageIndex());
            })
            routes.get("page", "/pages/{pageSlug}", function(req, res, params) {
                res.end("You are visiting " + url.page({ pageSlug: params.pageSlug }));
                // alternatively, url.page(params.pageSlug)
            })
        })
    ).listen(3000);
  
  In the first two routes, the `routeName` is generated automatically for each. The system tries to guess, but it's not
  perfect in every case. In the cases where you either don't like what it guesses or if it is unable to, you can specify
  your own name for the route, which is done in the latter two cases.
  
  This `routeName` is then used to generate a function on the `url` object. For static routes, to parameters are
  required or expected, but for dynamic routes, either an Object must be passed in or the in-order parameters expected.

## Multiple methods

  Unlike some other routing libraries, if you wish to bind a URL to multiple methods, it must all be done so at the same
  time using the bind function. This is done because every unique route has a unique name, regardless of the methods
  that it accepts.
    
    connect(
        escort(function(routes) {
            routes.bind("users", "/users", {
                get: function(req, res) {
                    res.end("Show a list of users");
                },
                post: function(req, res) {
                    res.end("Successfully created a new user!");
                }
            });
            
            routes.bind("user", "/users/{username}", {
                get: function(req, res, params) {
                    res.end("Found user " + params.username);
                },
                put: function(req, res, params) {
                    res.end("Updated user " + params.username);
                }
            })
        })
    ).listen(3000);
  
  Each route in this case has two methods it listens to. `/users` matches `GET` and `POST`, which RESTfully lists the
  users and creates a new user, respectively. `/users/{username}` matches `GET` and `PUT`, which RESTfully details the
  user and updates the existing user, respectively.

### Calling other methods

  One particularly useful usage pattern that comes particularly in handy when making an HTML app (as opposed to a
  JSON-driven app) is having the `GET` and `POST` (or `PUT`) actions run through the same code in the following manner:
  
    connect(
        escort(function(routes) {
            routes.bind("createPost", "/posts/create", {
                get: function(req, res) {
                    this.post(req, res);
                },
                post: function(req, res) {
                    var form = parseForm(req);
                    if (!form.isValid()) {
                        res.end("Render the form here, show validation errors.");
                        return;
                    }
                    // create the post
                    res.end("Successfully created a new post!");
                }
            });
        })
    ).listen(3000);
  
  What this allows is for your `GET` request to render a form (without validation errors, since it's a blank slate), and
  allow your `POST` request to validate the form, if valid, create, if invalid, re-render the form (with helpful
  validation errors).
  
  _Please note that this leaves a lot of code up to the user, such as the form validation and the actual HTML
  rendering_.

### Multiple methods with the same callback

  If you'd rather not just call `this.post`, you can easily specify that multiple methods are serviced by a single
  callback.
  
    connect(
        escort(function(routes) {
            routes.bind("createPost", "/posts/create", {
                "get,post": function(req, res) {
                    res.end(req.method + " /posts/create");
                }
            });
        })
    ).listen(3000);
  
  This will bind `/posts/create` to listen on both `GET` and `POST`.

## Converters

  For dynamic routes, different *converters* may be used for each dynamic parameter, each with their own capabilities
  and options.
  
  The default is the `string` converter, which is used when one is not specified.
  
  * `string` - Parses any string that does not have a slash (`/`) in it. Can specify `minLength`, `maxLength`, and
               `allowUpperCase`.
  * `int` - Parses a numeric string. Converts to and from *Number*. Can specify `min`, `max`, and `fixedDigits`.
  * `path` - Parses any string, even those with slashes (`/`) in them. Useful for wikis. Can specify `allowUpperCase`.
  * `any` - Parses one of a specified set of strings.
  
  ----
    connect(
        escort(function(routes) {
            routes.get("post", "/posts/{postSlug:string}", function(req, res, params) {
                // exact same as "/posts/{postSlug}"
                res.end("GET /posts/" + params.postSlug);
            });

            routes.get("user", "/users/{username:string({minLength: 3, maxLength: 8, allowUpperCase: true})}", function(req, res, params) {
                res.end("GET /users/" + params.username);
            });

            routes.get("thread", "/thread/{threadID:int({min: 1})}", function(req, res, params) {
                // params.threadID is a Number, not a String
                res.end("GET /thread/" + params.threadID);
            });

            routes.get("archiveYear", "/archive/{year:int({fixedDigits: 4})}", function(req, res, params) {
                res.end("Archive for year: " + params.year);
            });

            routes.get("wikiPage", "/wiki/{page:path}", function(req, res, params) {
                res.end("GET /page/" + params.page);
            });

            routes.get("info", "/{page:any('about', 'contact')}", function(req, res, params) {
                res.end("GET /" + params.info);
            });
        })
    ).listen(3000);
  
  `/posts/some-post` does as expected, since `string` is the default converter anyway. `/posts/some-post/deep` will not,
  as the slash (`/`) in it makes the route not recognize it properly.
  
  `/users/hi` will return a 404, won't ever even hit the route, since `hi` is too short. `/users/toolongofaname` will
  also return a 404, since `toolongofaname` is too long. `/users/SomeGuy` will work perfectly fine.
  
  `/thread/some-thread` will return a 404, since `some-thread` isn't a number. `/thread/0` also returns a 404, since 0
  is less than the specified minimum of 1. `/thread/1` works fine, as does `/thread/1000000000`.
  
  `/archive/123` will return a 404, since `123` isn't 4 digits. Contrarily, `/archive/0123` will work fine, as well as
  the expected `/archive/1960`.
  
  `/wiki/some-page` will work fine, as well as `/wiki/some-page/discussion`.
  
  Both `/about` and `/contact` will match the *info* route, but no others will.

### Custom converters
  
  If you are so inclined (95% of apps out there probably aren't) to define your own converter, it's relatively easy.
  
  You merely have to define a function which returns an object that has the following interface:
  
    {
        weight: 100, // optional, if not provided, defaults to 100 regardless
        regex: "[^/]+", // must be a string, not a RegExp
        fromUrl: function (value) {
            // return any _immutable_ value, can be any Javascript element, even Object, Array, or Function (as long as
            // they're frozen).
            return value;
        },
        toUrl: function (value) {
            // return a String
            return encodeURIComponent(value);
        },
        serialize: function () {
            return { type: "customName" };
        }
    }
  
  If you wish to, you can inherit from `escort.BaseConverter`, but it's not necessary.
  
  Here is an example converter:
  
    var BooleanConverter = function (trueName, falseName) {
        if (!trueName) {
            trueName = "yes";
        }
        if (!falseName) {
            falseName = "no";
        }
        return {
            regex: "(?:" + trueName + "|" + falseName + ")",
            fromUrl: function (value) {
                return value === trueName;
            },
            toUrl: function (value) {
                return value ? trueName : falseName;
            },
            serialize: function () {
                return { type: "bool" };
            }
        };
    };
  
  And here it is in action:
  
    var url;
    connect(
        escort({ converters: { bool: BooleanConverter } }, function(routes) {
            url = routes.url;
            
            routes.get("check", "/check/{careful}", function(req, res, params) {
                res.end(params.careful
                    ? "Carefully checking"
                    : "Playing solitaire, not actually checking");
            });
            
            routes.get("feed", "/feed/{goodFood:bool('good', 'bad')}", function(req, res, params) {
                if (params.goodFood) {
                    res.end("Yay, good food!");
                } else {
                    res.end("Gruel again :(");
                }
            })
        })
    ).listen(3000);
    
    url.check(true) === "/check/yes";
    url.check(false) === "/check/no";
    url.feed(true) === "/check/good";
    url.feed(false) === "/check/bad";
  
  So the param you get back is a **Boolean**, as the converter's `fromUrl` specifies. The `toUrl` function also properly
  makes the url generation work and provide the reverse result.
  
  If you want to have the `default` converter not be `escort.StringConverter`, you can provide the `default` key with
  your own.

## Submounting
  Often times, your app may have many parts to it that belong in their own route sections. Submounting is the perfect
  answer for this (assuming you don't want to have multiple apps for each section). Submounting can also be used for
  more rigorously defining the tree structure of your app.
  
  There is no performance downside to using submounting, it is merely a configuration nicety.
  
    connect(
        escort(function(routes) {
            url = routes.url;
            
            routes.submount("/pages", function(pages) {
                pages.get("", function(req, res) {
                    res.end("Page listing here");
                });
                
                this.submount("/{pageSlug}", function() {
                    this.get("page", "", function(req, res, params) {
                        res.end("Page details for " + params.pageSlug);
                    });
                    
                    this.bind("pageEdit", "/edit", {
                        get: function(req, res, params) {
                            res.end("Editing page " + params.pageSlug);
                        },
                        put: function(req, res, params) {
                            res.end("Updating page " + params.pageSlug);
                        }
                    });
                });
            });
            
            url.pages() === "/pages";
            url.page("thing") === "/pages/thing";
            url.pageEdit("thing") === "/pages/thing/edit";
        })
    ).listen(3000);

  *Note: both `this` and the first argument of the `submount` callback are the same thing. Use whichever one you're
  more comfortable with.*

## Optional route segments
  
  In some cases, you may want to have optional segments as part of your routes, which is easily solvable through one of
  two ways:
  
  You can provide two distinct routes to bind to:
  
    connect(
        escort(function(routes) {
            routes.get(["/data", "/data.{format}"], function(req, res, params) {
                var format = params.format || "html";
                
                switch (format) {
                    case "html":
                        res.end("<p>Hey there</p>");
                        break;
                    case "json":
                        res.end(JSON.stingify("Hey there"));
                        break;
                    default:
                        res.writeHead(404);
                        res.end();
                        break;
                }
            })
        })
    ).listen(3000);
  
  Or you can use the `[]` syntax to denote optionality.
  
    connect(
        escort(function(routes) {
            routes.get("/data[.{format}]", function(req, res, params) {
                var format = params.format || "html";
                
                switch (format) {
                    case "html":
                        res.end("<p>Hey there</p>");
                        break;
                    case "json":
                        res.end(JSON.stingify("Hey there"));
                        break;
                    default:
                        res.writeHead(404);
                        res.end();
                        break;
                }
            })
        })
    ).listen(3000);
  
  _Note: a better way of determining what format someone wants is to check their Accept header, so I recommend you do
  that for your non-example apps._

## Unicode
  
  You can have unicode (non-ASCII) characters in both the literal segments of your paths as well as in the dynamic
  segments of your path.
  
    var url;
    connect(
        escort(function(routes) {
            url = routes.url;
            
            routes.get("uber", "/über", function(req, res) {
                res.end("You're super-cool.");
            });
            routes.get("post", "/posts/{name:string({allowNonASCII: true})}", function(req, res, params) {
                res.end("You hit the " + params.name + " post");
            });
        })
    ).listen(3000);
    
    url.uber() === "/%C3%BCber";
    url.post("cliché") === "/posts/clich%C3%A9";
  
  Visiting `/über`, which is actually `/%C3%BCber`, will respond with "You're super-cool".
  
  Visiting `/posts/cliché`, which is actually `/posts/clich%C3%A9`, will respond with "You hit the cliché post".
  
  All the URL encoding and decoding is transparently taken care of without issue.

## Not Found (404).
  
  By default, the `notFound` handler passes to the next middleware, which has an opportunity to handle it.
  
  If instead of having another middleware handle, you want to handle it yourself, it is quite simple:
  
    connect(
        escort(function(routes) {
            routes.get("/", function(req, res) {
                res.end("Welcome!");
            });
            
            routes.notFound(function(req, res, next) {
                res.writeHead(404);
                res.end("Sorry, that cannot be found.");
            });
        })
    ).listen(3000);
  
  Now visiting `/` will properly tell you `"Welcome!"`, but visiting any other URL will give you your custom 404.

### Data-driven Not Founds

  Often, you may have a route with parameters that requires data to be pulled down from a database. In the event that
  the item you are retrieving does not exist, you should be properly returning a 404 Not Found. Rather than having to
  replicate the logic of your Not Found handler, you can simply call `next` which will pass on to the next middleware
  (or your defined Not Found handler).
  
    connect(
        escort(function(routes) {
            routes.get("/posts/{slug}", function(req, res, params, next) {
                Post.findOne({ slug: params.slug }, function(err, post) {
                    if (err) {
                        // an error occurred, pass it to the next middleware to throw a 500.
                        return next(err);
                    } else if (post === null) {
                        // we didn't get a result back
                        return next();
                    }
                    
                    res.end("Retrieved post: " + post);
                })
            });
        })
    ).listen(3000);

## Method Not Allowed (405).
  
  By default, the `methodNotAllowed` handler returns a 405 to the user with no body, which would not be appropriate in
  an HTML application. It might be in a JSON-based app, but that's up to you.
  
    connect(
        escort(function(routes) {
            url = routes.url;
            
            routes.get("/", function(req, res) {
                res.end("Welcome!");
            });
            
            routes.methodNotAllowed(function(req, res, next) {
                res.writeHead(405);
                res.end("The method " + req.method + " is not allowed on " + req.url + ".");
            });
        })
    ).listen(3000);
  
  Now issuing a `GET` to `/` will properly tell you `"Welcome!"`, but issuing a `POST` or any undefined method will
  go through the custom handler.

## Code structuring

  For small apps, it's easy to put all your routes inline, but once things get big enough, that can be very troublesome
  maintenance-wise.
  
  Here is one way for how you can structure your app and retain your sanity.
  
  In `main.js`:
    var connect = require('connect'),
        escort = require('escort');
      
    connect(
        escort(function(routes) {
            require('./routes/home')(routes);
            
            routes.submount("/forums", function(forums) {
                require('./routes/forums')(forums);
            });

            routes.submount("/pages", function(pages) {
                require('./routes/forums')(pages);
            });

            routes.submount("/users", function(users) {
                require('./routes/users')(users);
            });
        })
    ).listen(3000);
  
  In `routes/users.js`:
    module.exports = function(routes) {
        routes.get("users", "/", function(req, res) {
            res.end("User listing");
        });
        
        routes.get("user", "/{username}", function(req, res, params) {
            res.end("User details: " + params.username);
        });
    };
  
  Of course, you're free to structure your app however you like.

## Running without Connect
  Some of you may be wondering how to use Escort's routing framework without having to use
  [Connect](https://github.com/senchalabs/connect). It's not actually required or even used by Escort, it merely
  provides an interface that Connect accepts.
  
  If you do have the desire to run without Connect, the following code is an example of doing so:
  
    var http = require('http'),
        escort = require('escort');
    
    var routing = escort(function(routes) {
        routes.get("/", function(req, res) {
            res.end("Welcome!");
        })
    });
    http.createServer(function(req, res) {
        escort(req, res);
    }).listen(3000);
  
  This provides a very simplistic default 404 and error handler, but works without issue.

## Using with Express
  Express is built on top of Connect, but it tends to expect that You'll be using the connect.router routing framework.
  This is very easy to overcome, though.
  
    var express = require("express"),
        escort = require("escort");

    var app = express.createServer();

    var routing = escort();

    app.dynamicHelpers({
        url: routing.url,
        messages: messages
    });

    app.configure(function () {
        app.use(express.logger('\x1b[33m:method\x1b[0m \x1b[32m:url\x1b[0m :response-time'));
        app.use(express.bodyParser());
        app.use(express.methodOverride());
        app.use(express.cookieParser());
        app.use(express.session({ secret: 'keyboard cat' }));
        app.use(routing);
        app.use(express.static(__dirname + '/public'));
        app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
    });

    routing.get('/', function (req, res) {
        res.render('index', {
            message: "Hello, world"
        });
    });

    if (!module.parent) {
        app.listen(3000);
        console.log('Express started on port 3000');
    }
  
  The only real differences from a typical *Hello world* app using Express is that:
  
  * `routing` is declared before `app.configure` (but not the configuration of it).
  * `routing` is passed into `app.configure` instead of `app.router`.
  * `routing.get` is used instead of `app.get`.
  * `url` is provided to `dynamicHelpers`. This is optional, but nice inside views.

## Client-side URL generation
  
  First, you'll need to serialize the URL structure of your webapp. This can be done at any point in your app's
  lifecycle, even in its own exposed route, as long as it occurs after configuration.
  
  As you may notice, the URL generation API is the exact same once the `url` object has been created.

### In-development example
  For development, it may be handy to have your URL JSON dump accessible by its own route, but once you go into
  production/staging, I strongly recommend placing the serialized dump directly into your client javascript files.
  
  Node.js code
  
    connect(
        escort(function() {
            this.get("root", "/", function(req, res) {
                res.end("GET /");
            });
            
            this.get("post", "/{post}", function(req, res, params) {
                res.end("GET /" + params.post);
            });
            
            if (process.env.NODE_ENV !== "production") {
                // we only want to expose this during development
                
                var serialize = this.serialize;
                this.get("routeExport", "/routes.js", function(req, res) {
                    res.writeHead(200, {"Content-Type", "text/javascript"});
                    res.end("window.url = escortClient.generateUrlObject(" + JSON.stringify(serialize()) + ")");
                });
            }
        })
    ).listen(3000);
  
  Browser HTML code
  
    <script src="/static/scripts/escort-client.js"></script>
    <script src="/routes.js"></script>
    <script>
        url.root() === "/";
        url.post("hey") === "/hey";
        url.post({ post: "hey" }) === "/hey";
    </script>

### Production example
  You'll actually want to concatenate all your scripts as well as minify them when launching your production app, but
  I'm leaving that part out for clarity.
  
  The Node.js code is the same as above, since `/routes.js` is not available during production.
  
  Browser Javascript code (url-routes.js)
  
    // sticking this on the global window object is probably a bad idea.
    window.url = escortClient.generateUrlObject(/* paste your blob into here */);
  
  Browser HTML code
  
    <script src="/static/scripts/escort-client.js"></script>
    <script src="/static/scripts/url-routes.js"></script>
    <script>
        url.root() === "/";
        url.post("hey") === "/hey";
        url.post({ post: "hey" }) === "/hey";
    </script>

## Running Tests

first:

    $ git submodule update --init

then:

    $ make test

## Issues

  If you find any issues with Escort or have any suggestions or feedback, please feel free to visit the [github
  issues](https://github.com/ckknight/escort/issues) page.

## License

MIT licensed. See [LICENSE](https://github.com/ckknight/escort/blob/master/LICENSE) for more details.
