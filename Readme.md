# Escort

  Escort is a middleware for [Connect](https://github.com/senchalabs/connect) which provides routing and url generation
  capabilities.

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
  
  * `string` - Parses any string that does not have a slash (`/`) in it. Can specify `minLength` and `maxLength`.
  * `int` - Parses a numeric string. Converts to and from *Number*. Can specify `min`, `max`, and `fixedDigits`.
  * `path` - Parses any string, even those with slashes (`/`) in them. Useful for wikis.
  * `any` - Parses one of a specified set of strings.
  
  ----
    connect(
        escort(function(routes) {
            routes.get("post", "/posts/{postSlug:string}", function(req, res, params) {
                // exact same as "/posts/{postSlug}"
                res.end("GET /posts/" + params.postSlug);
            });

            routes.get("user", "/users/{username:string({minLength: 3, maxLength: 8})}", function(req, res, params) {
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
  also return a 404, since `toolongofaname` is too long. `/users/ckknight` will work perfectly fine.
  
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
            
            routes.namespace("/pages", function(pages) {
                forums.get("", function(req, res) {
                    res.end("Page listing here");
                });
                
                pages.namespace("/{pageSlug}", function(page) {
                    page.get("page", "", function(req, res, params) {
                        res.end("Page details for " + params.pageSlug);
                    });
                    
                    page.bind("pageEdit", "/edit", {
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

## Not Found (404).
  
  By default, the `notFound` handler passes to the next middleware, which has an opportunity to handle it.
  
  If instead of having another middleware handle, you want to handle it yourself, it is quite simple:
  
    connect(
        escort(function(routes) {
            url = routes.url;
            
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

## Running Tests

first:

    $ git submodule update --init

then:

    $ make test

## License

MIT licensed. See [LICENSE](https://github.com/ckknight/escort/blob/master/LICENSE) for more details.
