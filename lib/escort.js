/*!
 * Escort
 * Copyright(c) 2011 Cameron Kenneth Knight
 * MIT Licensed
 */

/*jshint node: true evil: true*/

var calculateConverterArgs, generateUrlFunction;

(function () {
    "use strict";
    
    /**
     * the regex used to parse routes.
     * 1: the name of the parameter.
     * 2: the converter name.
     * 3: options provided to the converter.
     * "/hey" - no match
     * "/{name}" - ["name", null, null]
     * "/{name:string}" - ["name", "string", null]
     * "/{name:string({minLength:1})}" - ["name", "string", "{minLength:1}"]
     *
     * @api private
     */
    var ROUTE_REGEX = /\{([a-zA-Z][a-zA-Z0-9_]*)(?:\:([a-zA-Z_][a-zA-Z0-9_]*)(?:\((.*?)\))?)?\}/g;
    
    /**
     * the amount of time in milliseconds between clears of the dynamic route's cache.
     * @api private
     */
    var DYNAMIC_ROUTE_CACHE_CLEAR_TIME = 60000;
    
    /**
     * the array of (lowercase) known HTTP and WebDAV methods that can be provided.
     * @api private
     */
    var ACCEPTABLE_METHODS = [
        "get",
        "post",
        "put",
        "delete",
        "connect",
        "options",
        "trace",
        "copy",
        "lock",
        "mkcol",
        "move",
        "propfind",
        "proppatch",
        "unlock",
        "report",
        "mkactivity",
        "checkout",
        "merge"
    ];
    
    /**
     * a set of (lowercase) known HTTP and WebDAV methods that can be provided.
     * @api private
     */
    var ACCEPTABLE_METHOD_SET = {};
    ACCEPTABLE_METHODS.forEach(function (method) {
        ACCEPTABLE_METHOD_SET[method] = true;
    });
    
    var freeze = Object.freeze;
    /**
     * a simple wrapper around Object.create to easily make new objects without providing property descriptors.
     *
     * @param {Object} prototype The prototype to inherit from
     * @param {Object} properties A map of properties
     * @api private
     */
    var spawn = function (prototype, properties) {
        var object = Object.create(prototype);
        Object.keys(properties).forEach(function (key) {
            object[key] = properties[key];
        });
        return object;
    };
    
    /**
     * Compare two values and give their relative position as either -1, 0, or 1. Used in Array.prototype.sort
     *
     * @param {any} alpha Any value that can be compared to bravo
     * @param {any} bravo Any value that can be compared to alpha
     * @return {Number} -1, 0, or 1 based on the comparison between alpha and bravo
     * @api private
     *
     * @example cmp(1, 2) === -1
     * @example cmp(2, 1) === 1
     * @example cmp("hello", "hello") === 0
     */
    var cmp = function (alpha, bravo) {
        if (alpha < bravo) {
            return -1;
        } else if (alpha > bravo) {
            return 1;
        } else {
            return 0;
        }
    };
    
    /**
     * Create a handler for the HTTP OPTIONS method based on the descriptor (which is a method name to callback map).
     * This is only used of options is not provided by the user.
     *
     * @param {Object} descriptor A map of methods to their associated callbacks
     * @return {Function} A function which will return a proper OPTIONS response
     * @api private
     */
    var createOptionsHandler = function (descriptor) {
        var methods = [];
        ACCEPTABLE_METHODS.forEach(function (method) {
            if (descriptor[method]) {
                methods.push(method.toUpperCase());
            }
        });
        methods = methods.join(",");
        return function (request, response) {
            response.writeHead(200, {
                "Content-Length": methods.length,
                "Allow": methods
            });
            response.end(methods);
        };
    };
    
    /**
     * Verify the validity of the provided descriptor and return a sanitized version.
     * This will add an options handler if none is provided.
     *
     * @param {Object} descriptor A map of methods to their associated callbacks
     * @return {Object} A map of methods to their associated callbacks
     * @api private
     *
     * @example descriptor = sanitizeDescriptor(descriptor);
     */
    var sanitizeDescriptor = function (descriptor) {
        var result = {};
        for (var key in descriptor) {
            if (Object.prototype.hasOwnProperty.call(descriptor, key)) {
                var keys = key.split(',');
                for (var i = 0, len = keys.length; i < len; i += 1) {
                    var method = keys[i];
                    if (!ACCEPTABLE_METHOD_SET[method]) {
                        throw new Error("Unknown descriptor method " + method);
                    }
                    if (Object.prototype.hasOwnProperty.call(result, method)) {
                        throw new Error("Already specified descriptor method " + method);
                    }
                    result[method] = descriptor[key];
                }
            }
        }
        if (!result.options) {
            result.options = createOptionsHandler(result);
        }
        return freeze(result);
    };
    
    /**
     * a regex which contains the escape codes used in JavaScript's RegExp.
     * @api private
     */
    var REGEXP_ESCAPE_REGEX = /([\-\[\]\{\}\(\)\*\+\?\.\,\\\^\$\|\#])/g;
    /**
     * Escape a string's RegExp escape codes with backslashes.
     *
     * @param {String} text The text to escape
     * @return {String} The escaped text
     * @api private
     *
     * @example regexpEscape("Hello") == "Hello"
     * @example regexpEscape("thing.txt") == "thing\\.txt"
     * @example regexpEscape("{value}") == "\\{value\\}"
     */
    var regexpEscape = function (text) {
        return String(text).replace(REGEXP_ESCAPE_REGEX, "\\$1");
    };
    
    /**
     * a regex that will be used to remove slashes (/) at the front of a string.
     * @api private
     */
    var SLASH_PREFIX_REGEX = /^\/+/g;
    /**
     * a regex that will be used to remove unexpected characters from a route when trying to guess the route name
     * @api private
     */
    var GUESS_ROUTE_NAME_UNEXPECTED_CHARACTER_REGEX = /[^a-zA-Z0-9\-_\/]/g;
    /**
     * a regex that recognizes dashes (-), underscores (_), and slashes (/), and the character afterwards in order to remove the punctuation and turn the character into uppercase.
     * @api private
     */
    var PUNCTUATION_LETTER_REGEX = /[\-_\/](.)/g;
    
    /**
     * Guess a route name for the given route. This will strip out any characters and give a best-guess.
     *
     * @param {String} route The provided route that it uses to determine a good name for it.
     * @return {String} A name for the route.
     * @throws {Error} When unable to guess a route name.
     * @api private
     * 
     * @example guessRouteName("/") === "root"
     * @example guessRouteName("/pages") === "pages"
     * @example guessRouteName("/pages/view") === "pagesView"
     * @example guessRouteName("/pages/{name}") // Error
     */
    var guessRouteName = function (route) {
        if (route === "/") {
            return "root";
        }
        
        if (route.indexOf("{") >= 0) {
            throw new Error("Unable to guess route name for route " + route);
        }
        var result = route
            .replace(SLASH_PREFIX_REGEX, "")
            .replace(GUESS_ROUTE_NAME_UNEXPECTED_CHARACTER_REGEX, "")
            .replace(PUNCTUATION_LETTER_REGEX, function (full, character) {
                return character.toUpperCase();
            });
        if (!result) {
            throw new Error("Unable to guess route name for route " + route);
        }
        return result;
    };
    
    /**
     * Run forEach on the provided value or if it lacks that, run the callback immediately on the value itself.
     *
     * @param {any} value Either an Array or any other value
     * @param {Function} callback A function to pass into forEach or call immediately
     * @api private
     *
     * @example forEachOrSingular(["alpha", "bravo"], function(value) { value == "alpha" || value == "bravo"; } );
     * @example forEachOrSingular("charlie", function(value) { value == "charlie"; } );
     */
    var forEachOrSingular = function (value, callback) {
        if (value.forEach) {
            value.forEach(callback);
        } else {
            callback(value, 0);
        }
    };
    
    /**
     * Determine whether text starts with value.
     *
     * @param {String} text the text to check if value is the beginning part of the string.
     * @param {String} value the potential value of the start of the string.
     * @return {Boolean}
     * @api private
     *
     * @example startsWith("hey there", "hey") === true
     * @example startsWith("hey there", "hello") === true
     */
    var startsWith = function (text, value) {
        var valueLength = value.length;
        if (text.length < valueLength) {
            return false;
        }
        
        return text.substring(0, valueLength) === value;
    };
    
    /**
     * Add a char to certain elements of an array.
     *
     * @param {Array} array An array of strings
     * @param {String} c A string to add to each string
     * @param {Number} depth The current binary tree depth to add to.
     * @api private
     */
    var addCharToArray = function (array, c, depth) {
        var start = array.length - (array.length / Math.pow(2, depth));
        for (var i = start, len = array.length; i < len; i += 1) {
            array[i] += c;
        }
    };
    
    /**
     * Return an array with only distinct elements.
     * This assumes that the elements of an array have their uniqueness determined by their String value.
     *
     * @param {Array} array The array to iterate over.
     * @return {Array} An array with distinct elements.
     * @api private
     *
     * @example distinct(["a", "b", "c", "a", "a", "c"]) => ["a", "b", "c"]
     */
    var distinct = function (array) {
        var set = {};

        var result = [];
        for (var i = 0, len = array.length; i < len; i += 1) {
            var item = array[i];

            if (!Object.prototype.hasOwnProperty.call(set, item)) {
                set[item] = true;
                result.push(item);
            }
        }
        return result;
    };

    /**
     * Parse all potential optional routes out of the provided String or Array.
     * 
     * @param {Array} routes an array of routes, or a String which is a single route.
     * @return {Array} the parsed-out array of optional routes.
     * @api private
     *
     * @example parseOptionalRoutes("/same") => ["/same"]
     * @example parseOptionalRoutes("/[optional]") => ["/", "/optional"]
     * @example parseOptionalRoutes("/data[.{format}]") => ["/data", "/data.{format}"]
     * @example parseOptionalRoutes("/multiple[/optional][/parameters]") => ["/multiple", "/multiple/optional", "/multiple/parameters", "/multiple/optional/parameters"]
     * @example parseOptionalRoutes("/deep[/optional[/parameters]]") => ["/deep", "/deep/optional", "/deep/optional/parameters"]
     * @example parseOptionalRoutes(["/data[.{format}]", "/data/page/{num:int}[.{format}]"]) => ["/data", "/data.{format}", "/data/page/{num:int}", "/data/page/{num:int}.{format}"]
     * @example parseOptionalRoutes("/{name:custom(['a', 'b', 'c'])}") => ["/{name:custom(['a', 'b', 'c'])}"]
     */
    var parseOptionalRoutes = function (routes) {
        if (!Array.isArray(routes)) {
            routes = [routes];
        }

        var result = [];

        routes.forEach(function (route) {
            if (route.indexOf('[') === -1) {
                result.push(route);
                return;
            }

            var immediateResult = [''];

            var depth = 0;
            var inLiteral = 0;

            for (var i = 0, len = route.length; i < len; i += 1) {
                var c = route[i];
                if (!inLiteral) {
                    if (c === '[') {
                        depth += 1;
                        for (var j = 0, lenJ = immediateResult.length; j < lenJ; j += 1) {
                            immediateResult.push(immediateResult[j]);
                        }
                    } else if (c === ']') {
                        depth -= 1;
                    } else {
                        if (c === '{') {
                            inLiteral += 1;
                        } else if (c === '}') {    
                            throw new Error("Found unexpected } in route: " + route);
                        }
                        addCharToArray(immediateResult, c, depth);
                    }
                } else {
                    if (c === '{') {
                        inLiteral += 1;
                    } else if (c === '}') {
                        inLiteral -= 1;
                    }
                    addCharToArray(immediateResult, c, depth);
                }
            }

            for (i = 0, len = immediateResult.length; i < len; i += 1) {
                result.push(immediateResult[i]);
            }
        });

        return distinct(result);
    };
    
    var validatePath = function (path) {
        if (path[0] !== "/") {
            throw new Error("Routes must start with '/', '" + path + "' does not.");
        } else if (path.length > 1 && path[path.length - 1] === "/") {
            throw new Error("Routes cannot end in '/', '" + path + "' does.");
        } else if (path.indexOf("//") !== -1) {
            throw new Error("Detected '//' in path '" + path + "'.");
        } else if (path.indexOf("?") !== -1) {
            throw new Error("Detected '?' in path '" + path + "'.");
        }
    };

    var trimEndingSlashes = function (path) {
        var i = path.length - 1;
        while (i > 0 && path[i] === "/") {
            i -= 1;
        }
        return path.substring(0, i + 1);
    };
    
    var movedPermanently = function (response, location) {
        response.writeHead(301, {
            "Location": location
        });
        response.end("");
        return;
    };
    
    var escort;
    
    /**
     * Make the submount function for the escort Object.
     * 
     * @param {Function} bind the bind function for the current escort Object.
     * @param {String} prefix the route prefix for the submount.
     * @api private
     *
     * @example makeSubmountFunction("/forums")
     */
    var makeSubmountFunction = function (bind, prefix) {
        return function (path, callback) {
            var prefixedPath = prefix + path;
            validatePath(prefixedPath);
            var innerMethods = spawn(escort.prototype, {
                bind: function (routeName, route, descriptor) {
                    if (arguments.length === 2) {
                        descriptor = route;
                        route = routeName;
                        if (Array.isArray(route)) {
                            routeName = guessRouteName(prefixedPath + route[0]);
                        } else {
                            routeName = guessRouteName(prefixedPath + route);
                        }
                    }
                    return bind(routeName, route, descriptor, prefixedPath);
                },
                submount: makeSubmountFunction(bind, prefixedPath)
            });
            
            callback(innerMethods);
        };
    };
    
    /**
     * A handler for calling the next middleware module if for some reason one isn't provided.
     *
     * @param {Error} err An error, if it occurred.
     * @api private
     */
    var makeDefaultNext = function (req, res) {
        return function (err) {
            if (err) {
                res.writeHead(500);
                res.end(err.toString());
            } else {
                res.writeHead(404);
                res.end();
            }
        };
    };

    /**
     * Attach all the helper HTTP and WebDAV methods as helper functions which will
     * ultimately call bind on the provided object.
     *
     * @param {Object} object the Object to attach the methods to.
     * @api private
     */
    var attachHttpMethods = function (object) {
        ACCEPTABLE_METHODS.forEach(function (method) {
            /**
             * Bind the provided route with a specific method to the callback provided.
             * Since you cannot specify a route more than once, it is required to use bind to provide multiple methods.
             *
             * @param {String} routeName The name of the route. Should be a JavaScript identifier. Optional.
             * @param {String} route The URL for the route.
             * @param {Function} callback The callback to be called when the route is accessed.
             *
             * @throws Error the routeName is already specified
             * @throws Error the route is already specified
             * @throws Error the route does not start with "/"
             * @throws Error an unknown route converter was specified
             *
             * @api public
             * 
             * @example routes.get("/", function(request, response) {
             *     response.end("GET /");
             * });
             * @example routes.post("item", "/{name}", function(request, response, params) {
             *     response.end("GET /" + params.name);
             * });
             */
            object[method] = function (routeName, route, callback) {
                if (arguments.length === 2) {
                    callback = route;
                    route = routeName;
                    routeName = guessRouteName(route);
                }
                var descriptor = {};
                descriptor[method] = callback;
                return this.bind(routeName, route, descriptor);
            };
        });
        object.del = object.delete;
    };
    
    /**
     * Create the Escort middleware based on the provided options and callback.
     * 
     * @param {Object} options An options object, optional
     * @param {Function} fn A callback that is immediately called where the routing configuration is set up. Optional.
     * @api public
     * @example escort(function(routes) {
     *     routes.get("/", function(req, res) {
     *         res.end("Hello there!");
     *     });
     * });
     */
    escort = function (options, fn) {
        if (!fn && typeof options === "function") {
            fn = options;
            options = null;
        }
        if (!options) {
            options = {};
        }
        
        /**
         * A map of static URLs to descriptor
         * @api private
         */
        var staticRoutes = {};
        /**
         * A list of dynamic routes
         * @api private
         */
        var dynamicRoutes = [];
        /**
         * The url generator object for the current configuration
         * @api private
         */
        var urlGenerators = {};
        /**
         * The current handler used when a route is not found
         * @api private
         */
        var notFoundHandler = null;
        /**
         * The current handler used when a route is found but the method accessed is not available
         * @api private
         */
        var methodNotAllowedHandler = function (request, response, next) {
            response.writeHead(405);
            response.end();
        };
        
        /**
         * A map of name to converter factory as specified by the options.
         * @api private
         */
        var customConverters = options.converters || {};
        
        var bind;
        
        (function () {
            /**
             * Bind the provided route to the descriptor specified.
             *
             * @param {String} routeName The name of the route. Should be a JavaScript identifier. Optional.
             * @param {String} route The URL for the route.
             * @param {Object} descriptor A map of method to callback
             * @param {String} routePrefix Internally used, provides a prefix for the current route.
             *
             * @throws Error the routeName is already specified
             * @throws Error the route is already specified
             * @throws Error the route does not start with "/"
             * @throws Error an unknown route converter was specified
             *
             * @api public
             * 
             * @example routes.bind("/", {
             *     get: function(request, response) {
             *         response.end("GET /");
             *     },
             *     post: function(request, response) {
             *         response.end("POST /");
             *     }
             * });
             * @example routes.bind("item", "/{name}", {
             *     get: function(request, response, params) {
             *         response.end("GET /" + params.name);
             *     }
             * });
             * @example routes.bind("item", "/{id:int}", {
             *     get: function(request, response, params) {
             *         // params.id is a Number, not a String
             *         response.end("GET /" + params.id);
             *     }
             * });
             */
            bind = function (routeName, route, descriptor, routePrefix) {
                if (arguments.length === 2) {
                    descriptor = route;
                    route = parseOptionalRoutes(routeName);
                    routeName = guessRouteName(route[0]);
                } else {
                    route = parseOptionalRoutes(route);
                }
                descriptor = sanitizeDescriptor(descriptor);
                
                if (urlGenerators[routeName]) {
                    throw new Error("Already defined route named '" + route + "'");
                }
                
                var staticRouteUrlGenerator = null;
                var dynamicRouteUrlGenerator = null;
                
                forEachOrSingular(route, function (route, routeNum) {
                    route = (routePrefix || "") + route;
                    validatePath(route);
                    
                    var parts = route.split(ROUTE_REGEX);
                    if (parts.length === 1) {
                        // no dynamic parts
                        
                        var lowerRoute = route.toLowerCase();
                        
                        if (staticRoutes[lowerRoute]) {
                            throw new Error("Already defined route at " + route);
                        }
                        
                        staticRoutes[lowerRoute] = {
                            route: route,
                            descriptor: descriptor
                        };
                        if (staticRouteUrlGenerator === null) {
                            staticRouteUrlGenerator = function () {
                                return route;
                            };
                        }
                    } else {
                        // at least one dynamic part to the route
                        
                        var prefix = parts[0].toLowerCase();
                        var dynamicRoute = null;
                        for (var i = 0, len = dynamicRoutes.length; i < len; i += 1) {
                            if (dynamicRoutes[i].prefix === prefix) {
                                dynamicRoute = dynamicRoutes[i];
                                break;
                            }
                        }
                        if (dynamicRoute === null) {
                            dynamicRoutes.push(dynamicRoute = {
                                prefix: prefix,
                                routes: [],
                            });
                            
                            // sort the routes so that the most specific prefix is first
                            dynamicRoutes.sort(function (a, b) {
                                var aPrefix = a.prefix;
                                var bPrefix = b.prefix;
                                return cmp(bPrefix.length, aPrefix.length) || cmp(aPrefix, bPrefix);
                            });
                        }
                        
                        var argumentNames = [];
                        var converters = [];
                        var pattern = "^(" + regexpEscape(prefix) + ")";
                        var weights = [];
                        var literals = [];
                        literals.push(parts[0]);
                        weights.push(parts[0].length);
                        for (i = 1, len = parts.length; i < len; i += 4) {
                            argumentNames.push(parts[i]);
                            
                            var converterName = parts[i + 1] || "default";
                            var converterFactory = customConverters[converterName] || escort.converters[converterName];
                            if (!converterFactory) {
                                throw new Error("Unknown converter '" + converterName + "'");
                            }
                            
                            // represents the arguments in the converter text
                            var args = calculateConverterArgs(parts[i + 2]);
                            
                            var converter = converterFactory.apply(Object.create(converterFactory.prototype), args);
                            converters.push(converter);
                            weights.push(converter.weight || 100);
                            
                            var regex = converter.regex;
                            if (!regex) {
                                throw new Error("Converter '" + converterName + "' does not specify an appropriate regex.");
                            }
                            
                            pattern += "(";
                            pattern += regex;
                            pattern += ")(";
                            pattern += regexpEscape(parts[i + 3]);
                            pattern += ")";
                            literals.push(parts[i + 3]);
                            weights.push(parts[i + 3].length);
                        }
                        pattern += "$";
                        
                        var routes = dynamicRoute.routes;
                        for (i = 0, len = routes.length; i < len; i += 1) {
                            if (routes[i].pattern === pattern) {
                                throw new Error("Already defined route matching " + pattern);
                            }
                        }
                        routes.push({
                            pattern: pattern,
                            regex: new RegExp(pattern, "i"),
                            literals: literals,
                            argumentNames: argumentNames,
                            converters: converters.map(function (converter) {
                                return converter.fromUrl.bind(converter);
                            }),
                            descriptor: descriptor,
                            weights: weights
                        });
                        
                        // sort the routes (namespaced by the prefix) by their weight, so that more specific routes are tried to be matched first.
                        routes.sort(function (a, b) {
                            var aWeights = a.weights,
                                bWeights = b.weights;
                            var result;
                            for (var i = 0, len = Math.min(aWeights.length, bWeights.length); i < len; i += 1) {
                                result = cmp(bWeights[i], aWeights[i]);
                                if (result) {
                                    return result;
                                }
                            }
                            return cmp(bWeights.length, aWeights.length);
                        });
                        
                        if (!dynamicRouteUrlGenerator) {
                            // create the url generation function
                            dynamicRouteUrlGenerator = generateUrlFunction(parts, converters.map(function (converter) {
                                return converter.toUrl.bind(converter);
                            }));
                        }
                    }
                });
                
                if (staticRouteUrlGenerator && dynamicRouteUrlGenerator) {
                    // two routes were provided, one static and one dynamic.
                    // if arguments are provided, assume it's dynamic, otherwise assume it's static.
                    urlGenerators[routeName] = function () {
                        if (arguments.length === 0) {
                            return staticRouteUrlGenerator();
                        } else {
                            return dynamicRouteUrlGenerator.apply(this, Array.prototype.slice.call(arguments, 0));
                        }
                    };
                } else {
                    urlGenerators[routeName] = staticRouteUrlGenerator || dynamicRouteUrlGenerator;
                }
            };
        }());
        
        return (function () {
            /**
             * A map of URL to data containing the descriptor and params for the URL.
             * @api private
             */
            var dynamicRouteCache = null;
            /**
             * A map of URL to URL for improper to proper URLs.
             * @api private
             */
            var dynamicRedirectCache = null;
            /**
             * The amount of time until dynamicRouteCache is to be cleared.
             * @api private
             */
            var dynamicRouteCacheTime = 0;
            
            /**
             * An empty, frozen object which will act as the params object for static URLs.
             * @api private
             */
            var emptyParams = freeze({});
            
            /**
             * The connect middleware
             */
            var router = function (request, response, next) {
                if (!next) {
                    next = makeDefaultNext(request, response);
                }
                try {
                    var url = request.url;
                    var questionIndex = url.indexOf("?");
                    var querystring = "";
                    if (questionIndex !== -1) {
                        // if there is a querystring, we'll just chop that part off
                        // it's still preserved in request.url, and should be handled
                        // by other middleware.
                        querystring = url.substring(questionIndex);
                        url = url.substring(0, questionIndex);
                    }
                    
                    var endsInSlash = url.length > 1 && url[url.length - 1] === "/";
                    if (endsInSlash) {
                        url = trimEndingSlashes(url);
                    }
                    
                    var lowerMethod = request.method.toLowerCase();

                    var params;
                    var callback;
                    var descriptor;
                    
                    var lowerUrl = url.toLowerCase();
                    var staticRoute = staticRoutes[lowerUrl];
                    if (staticRoute) {
                        if (staticRoute.route !== url) {
                            movedPermanently(response, staticRoute.route + querystring);
                            return;
                        }
                        
                        descriptor = staticRoute.descriptor;
                        
                        // we found a static route
                        callback = descriptor[lowerMethod];
                        
                        if (!callback) {
                            // the URL exists, but does not have the provided method defined for it
                            methodNotAllowedHandler(request, response, next);
                            return;
                        }

                        params = emptyParams;
                    } else {
                        var now = +new Date();
                        if (dynamicRouteCacheTime < now) {
                            // time to reset the dynamic cache cache
                            dynamicRouteCache = {};
                            dynamicRedirectCache = {};
                            dynamicRouteCacheTime = now + DYNAMIC_ROUTE_CACHE_CLEAR_TIME;
                        }
                        
                        var cachedResult = dynamicRedirectCache[url];
                        if (cachedResult) {
                            movedPermanently(response, cachedResult + querystring);
                            return;
                        } else {
                            cachedResult = dynamicRouteCache[url];
                            if (cachedResult) {
                                descriptor = cachedResult.descriptor;
                                callback = descriptor[lowerMethod];
                                if (!callback) {
                                    // the URL exists, but does not have the provided method defined for it
                                    methodNotAllowedHandler(request, response, next);
                                    return;
                                }
                                params = cachedResult.params;
                            } else {
                                searchDynamicRoutes:
                                for (var i = 0, len = dynamicRoutes.length; i < len; i += 1) {
                                    var dynamicRoute = dynamicRoutes[i];
                                    var prefix = dynamicRoute.prefix;
                                
                                    if (prefix !== "/" && !startsWith(lowerUrl, prefix)) {
                                        continue;
                                    }
                                
                                    var routes = dynamicRoute.routes;
                                    searchWithinPrefix:
                                    for (var j = 0, lenJ = routes.length; j < lenJ; j += 1) {
                                        var route = routes[j];
                                        var match = route.regex.exec(url);
                                        if (!match) {
                                            continue;
                                        }
                                    
                                        descriptor = route.descriptor;
                                        callback = descriptor[lowerMethod];
                                        if (!callback) {
                                            // the URL exists, but does not have the provided method defined for it
                                            methodNotAllowedHandler(request, response, next);
                                            return;
                                        }
                                    
                                        var literals = route.literals;
                                        var properUrl = literals[0];
                                        var argumentNames = route.argumentNames;
                                        var converters = route.converters;
                                        params = {};
                                        for (var k = 0, lenK = argumentNames.length; k < lenK; k += 1) {
                                            var unconvertedValue = match[k * 2 + 2];
                                            var convertedValue;
                                            try {
                                                convertedValue = converters[k](unconvertedValue);
                                            } catch (ex) {
                                                if (ex instanceof escort.ValidationError) {
                                                    // if the converter explicitly throws a ValidationError, the route doesn't match.
                                                    // thus, we need to keep searching for the correct route.
                                                    callback = undefined;
                                                    continue searchWithinPrefix;
                                                } else if (ex instanceof escort.CasingError) {
                                                    unconvertedValue = ex.expectedCasing;
                                                    convertedValue = converters[k](unconvertedValue); // guaranteed not to error
                                                } else {
                                                    throw ex;
                                                }
                                            }
                                            properUrl += unconvertedValue;
                                            properUrl += literals[k + 1];
                                            params[argumentNames[k]] = convertedValue;
                                        }
                                        // params needs to be frozen since it will be potentially used in later requests through the dynamic route caching system
                                        freeze(params);
                                        dynamicRouteCache[properUrl] = {
                                            descriptor: descriptor,
                                            params: params
                                        };
                                        if (url !== properUrl) {
                                            dynamicRedirectCache[url] = properUrl;
                                            movedPermanently(response, properUrl + querystring);
                                            return;
                                        }
                                        // we're done, so we need to break out of the outer for loop
                                        break searchDynamicRoutes;
                                    }
                                }
                            }
                        }
                    }
                    
                    if (!callback) {
                        // route was unable to be located
                        if (notFoundHandler) {
                            notFoundHandler(request, response, next);
                        } else {
                            next();
                        }
                        return;
                    }
                    
                    if (endsInSlash) {
                        movedPermanently(response, url + querystring);
                        return;
                    }
                    
                    // set params on request as well as pass it into the callback.
                    request.params = params;
                    // the descriptor is passed in as "this" so that the user can do this.post(request, response) from their get callback.
                    callback.call(descriptor, request, response, params, !notFoundHandler ? next : function () {
                        notFoundHandler(request, response, next);
                    });
                } catch (err) {
                    next(err);
                }
            };
            router.toString = function () {
                return "Escort router";
            };
            router.bind = bind;
            router.url = urlGenerators;
            router.notFound = function (handler) {
                if (!handler) {
                    throw new Error("Callback function is expected");
                }
                notFoundHandler = handler;
            };
            router.methodNotAllowed = function (handler) {
                if (!handler) {
                    throw new Error("Callback function is expected");
                }
                methodNotAllowedHandler = handler;
            };
            router.submount = makeSubmountFunction(bind, "");
            attachHttpMethods(router);
            if (fn) {
                fn(router);
            }
        
            return router;
        }());
    };
    escort.prototype = {};
    attachHttpMethods(escort.prototype);
    
    (function () {
        var converters = escort.converters = {};
        
        /**
         * ValidationError is thrown when converting from a URL to specify that
         * the route does not match, and thus cannot be converted into a Javascript-
         * friendly object.
         */
        var ValidationError = function () {};
        ValidationError.prototype = Object.create(Error.prototype);
        escort.ValidationError = ValidationError;
        
        /**
         * CasingError is thrown when converting from a URL to specify that the route
         * matches except that the case of the value should be different from what is
         * specified.
         */
        var CasingError = function (expectedCasing) {
            this.expectedCasing = expectedCasing;
        };
        CasingError.prototype = Object.create(Error.prototype);
        escort.CasingError = CasingError;
        
        /**
         * BaseConverter is the base of all the internal converters provided.
         * When specifying one's own converters, it is not necessary to inherit from this.
         */
        var BaseConverter = function () {
            return {};
        };
        BaseConverter.prototype = {
            weight: 100,
            regex: "[^/]+",
            fromUrl: function (value) {
                return value;
            },
            toUrl: function (value) {
                return encodeURIComponent(value);
            }
        };
        escort.BaseConverter = BaseConverter;
        
        /**
         * A converter that accepts any string except those including slashes (/).
         * This is the default converter if not overridden.
         *
         * @example routes.get("/users/{name}", function(req, res, params) { })
         * @example routes.get("/users/{name:string}", function(req, res, params) { })
         * @example routes.get("/users/{name:string({minLength: 3, maxLength: 8})}", function(req, res, params) { })
         *
         * @param {Object} args An options Object that can contain "minLength" and "maxLength"
         */
        var StringConverter = function (args) {
            if (!args) {
                args = {};
            }
        
            var minLength = args.minLength || 1;
            var maxLength = args.maxLength || null;
        
            var regex = "[^/]";
            if (minLength === 1 && !maxLength) {
                regex += "+";
            } else {
                regex += "{";
                regex += minLength;
                if (maxLength !== minLength) {
                    regex += ",";
                    if (maxLength) {
                        regex += maxLength;
                    }
                }
                regex += "}";
            }
        
            return spawn(StringConverter.prototype, {
                regex: regex
            });
        };
        StringConverter.prototype = Object.create(BaseConverter.prototype);
        escort.converters.string = escort.converters.default = escort.StringConverter = StringConverter;
        
        /**
         * A converter that accepts any string, even those including slashes (/).
         * This can be handy for wiki or forum systems or any which have resources that have arbitrary depth.
         *
         * @example routes.get("/wiki/{pageName:path}", function(req, res, params) { })
         */
        var PathConverter = function () {
            return spawn(PathConverter.prototype, {
                regex: "[^/]+(?:/[^/]+)*",
            });
        };
        PathConverter.prototype = Object.create(spawn(BaseConverter.prototype, {
            weight: 50
        }));
        escort.converters.path = escort.PathConverter = PathConverter;
        
        /**
         * Pad a value by prepending zeroes until it reaches a specified length.
         *
         * @param {String} value the current string or number.
         * @param {Number} length the size wanted for the value.
         * @return {String} a string of at least the provided length.
         * @api private
         *
         * @example zeroPad(50, 4) == "0050"
         * @example zeroPad("123", 4) == "0123"
         */
        var zeroPad = function (value, length) {
            value = String(value);
            while (value.length < length) {
                value = "0" + value;
            }
            return value;
        };
        
        /**
         * A converter that accepts a numeric string.
         * This does not support negative values.
         *
         * @example routes.get("/users/{id:int}", function(req, res, params) { })
         * @example routes.get("/archive/{year:int({fixedDigits: 4})}", function(req, res, params) { })
         * @example routes.get("/users/{id:int({min: 1})}", function(req, res) { })
         *
         * @param {Object} args An options Object that can contain "min", "max", and "fixedDigits"
         */
        var IntegerConverter = function (args) {
            if (!args) {
                args = {};
            }
            
            var fixedDigits = args.fixedDigits;
            var min = args.min;
            var max = args.max;
            if (min === undefined) {
                min = null;
            }
            if (max === undefined) {
                max = null;
            }
            
            return spawn(IntegerConverter.prototype, {
                regex: "\\d+",
                weight: 150,
                fromUrl: function (value) {
                    if (fixedDigits && value.length !== fixedDigits) {
                        throw new ValidationError();
                    }
                
                    var result = parseInt(value, 10);
                    if (isNaN(result) || result >= Infinity || result <= -Infinity) {
                        throw new ValidationError();
                    }
                    
                    if (min !== null && result < min) {
                        throw new ValidationError();
                    }
                
                    if (max !== null && result > max) {
                        throw new ValidationError();
                    }
                
                    return result;
                },
                toUrl: function (value) {
                    var part = (Math.floor(value) || 0).toString();
                    if (fixedDigits) {
                        return zeroPad(part, fixedDigits);
                    } else {
                        return part;
                    }
                }
            });
        };
        IntegerConverter.prototype = Object.create(BaseConverter.prototype);
        escort.converters.int = escort.IntegerConverter = IntegerConverter;
        
        /**
         * A converter that matches one of the items provided.
         *
         * @example routes.get("/pages/{pageName:any('about', 'help', 'contact')}", function(req, res, params) { })
         */
        var AnyConverter = function () {
            var args = Array.prototype.slice.call(arguments, 0);
            if (args.length < 1) {
                throw new Error("Must specify at least one argument to AnyConverter");
            }
            
            var values = {};
            for (var i = 0, len = args.length; i < len; i += 1) {
                var arg = args[i];
                values[arg.toLowerCase()] = arg;
            }
            
            return spawn(AnyConverter.prototype, {
                _values: values,
                regex: "(?:" + args.map(regexpEscape).join("|") + ")",
                weight: 200
            });
        };
        AnyConverter.prototype = Object.create(BaseConverter.prototype);
        AnyConverter.prototype.fromUrl = function (value) {
            var result = this._values[value.toLowerCase()];
            if (result !== value) {
                throw new CasingError(result);
            }
            return result;
        };
        escort.converters.any = escort.AnyConverter = AnyConverter;
    }());
    
    exports = module.exports = escort.escort = escort;
}());

(function () {
    "use strict";
    /**
     * Calculate the arguments in converter text.
     * This is segregated due to use of eval.
     *
     * @param {String} args A string version of the arguments to the converter.
     * @return {Array} an array which represents the arguments of the converter.
     * @api private
     */
    calculateConverterArgs = function (args) {
        if (args) {
            return eval("[" + args + "]");
        } else {
            return [];
        }
    };
    
    /**
     * Dynamically create a url-generation function.
     * This is segregated due to use of new Function.
     *
     * @param {Array} parts The split result of a route over the ROUTE_REGEX.
     * @param {Array} converters An array of toUrl functions which represent conversion functions.
     * @return {Function} A function which will generate a URL.
     * @api private
     *
     * @example generateUrlFunction(["/prefix/", "name", "string", null, ""])({name: "hey"}) === "/prefix/hey"
     */
    generateUrlFunction = function (parts, converters) {
        var fun = "";
        fun += "return (function generate(params) {\n";
        fun += "    if (arguments.length === 1) {\n";
        fun += "        switch (typeof params) {\n";
        fun += "            case 'object':\n";
        fun += "                return ";
        fun += JSON.stringify(parts[0]);
        for (var i = 1, len = parts.length; i < len; i += 4) {
            fun += "+converters[";
            fun += (i - 1) / 4;
            fun += "](params[";
            fun += JSON.stringify(parts[i]);
            fun += "])";
            if (parts[i + 3]) {
                fun += "+";
                fun += JSON.stringify(parts[i + 3]);
            }
        }
        fun += ";\n";
        fun += "        }\n";
        fun += "    }\n";
        fun += "    return generate({";
        
        for (i = 1, len = parts.length; i < len; i += 4) {
            if (i > 1) {
                fun += ", ";
            }
            fun += JSON.stringify(parts[i]);
            fun += ":arguments[";
            fun += (i - 1) / 4;
            fun += "]";
        }
        
        fun += "});\n";
        fun += "});\n";
        return new Function("converters", fun)(converters);
    };
}());
