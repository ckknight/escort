/*!
 * Escort client
 * Copyright(c) 2011 Cameron Kenneth Knight
 * MIT Licensed
 */

 /*jshint evil: true*/

(function (exports, undefined) {
    "use strict";
    
    var has = Object.prototype.hasOwnProperty;
    var slice = Array.prototype.slice;
    
    /**
     * Generate a function that returns a static URL.
     * 
     * @param {String} the static path
     * @return {Function} A function which returns the path passed in.
     * @api private
     *
     * @example generateStaticUrlFunction("/forums")() === "/forums";
     */
    var generateStaticUrlFunction = function (path) {
        return function () {
            return path;
        };
    };
    
    /**
     * Dynamically create a url-generation function.
     *
     * @param {Object} route A descriptor for the route in question
     * @param {Object} converters A map of converter name to converter factory.
     * @return {Function} A function which will generate a URL.
     * @api private
     *
     * @example generateUrlFunction({ literals: ["/prefix"], params: [ { name: "name", type: "string" } ] })({name: "hey"}) === "/prefix/hey"
     */
    var generateDynamicUrlFunction = function (route, converters) {
        var literals = route.literals;
        var params = route.params;
        
        var conv = [];
        
        var fun = "";
        fun += "var generate = function (params) {\n";
        fun += "    if (arguments.length === 1 && typeof params === 'object' && params.constructor !== String) {\n";
        fun += "        return ";
        fun += JSON.stringify(literals[0]);
        for (var i = 0, len = params.length; i < len; i += 1) {
            fun += "+converters[";
            fun += i;
            fun += "](params[";
            fun += JSON.stringify(params[i].name);
            fun += "])";
            if (literals[i + 1]) {
                fun += "+";
                fun += JSON.stringify(literals[i + 1]);
            }
            
            var paramType = params[i].type;
            if (!has.call(converters, paramType)) {
                throw new Error("Unknown converter: " + paramType);
            }
            
            var converter = converters[paramType];
            if (!converter) {
                throw new Error("Misconfigured converter: " + paramType);
            }
            
            conv.push(converter(params[i]));
        }
        fun += ";\n";
        fun += "    }\n";
        fun += "    return generate({";
        
        for (i = 0, len = params.length; i < len; i += 1) {
            if (i > 0) {
                fun += ", ";
            }
            fun += JSON.stringify(params[i].name);
            fun += ":arguments[";
            fun += i;
            fun += "]";
        }
        
        fun += "});\n";
        fun += "};\n";
        fun += "return generate;\n";
        return new Function("converters", fun)(conv);
    };
    
    /**
     * Generate a URL function based on the provided routes.
     *
     * @param {Array} routes An array of route descriptors
     * @param {Object} converters A map of type to converter factory.
     * @return {Function} A function that will generate a URL, or null if routes is blank.
     * @api private
     */
    var generateUrlFunction = function (routes, converters) {
        var staticRoute, dynamicRoute;
        // we traverse backwards because the beginning ones take precedence and thus can override.
        for (var i = routes.length - 1; i >= 0; i -= 1) {
            var route = routes[i];
            
            if (route.path) {
                staticRoute = route.path;
            } else {
                dynamicRoute = route;
            }
        }
        
        if (dynamicRoute) {
            dynamicRoute = generateDynamicUrlFunction(dynamicRoute, converters);
        }
        
        if (staticRoute) {
            staticRoute = generateStaticUrlFunction(staticRoute);
            if (dynamicRoute) {
                // this can occur if the url is like "/posts" and "/posts/page/{page}"
                return function () {
                    if (arguments.length === 0) {
                        return staticRoute();
                    } else {
                        return dynamicRoute.apply(this, slice.call(arguments, 0));
                    }
                };
            } else {
                return staticRoute;
            }
        } else {
            if (dynamicRoute) {
                return dynamicRoute;
            } else {
                return null;
            }
        }
    };

    /**
     * A map of default converters.
     * This consists of "string", "path", "int", and "any".
     *
     * @api private
     */
    var defaultConverters = (function () {
        var defaultConverters = {};

        defaultConverters.string = function (param) {
            return encodeURIComponent;
        };
        defaultConverters.any = defaultConverters.string;

        var pathConverter = function (value) {
            var segments = String(value).split("/");
            for (var i = segments.length - 1; i >= 0; i -= 1) {
                segments[i] = encodeURIComponent(segments[i]);
            }
            return segments.join("/");
        };
        defaultConverters.path = function (param) {
            return pathConverter;
        };

        defaultConverters.int = function (param) {
            var fixedDigits = param.fixedDigits;
            if (fixedDigits) {
                return function (value) {
                    var result = (Math.floor(value) || 0).toString();
                    
                    var numMissing = fixedDigits - result.length;
                    var prefix = "";
                    while (numMissing > 0) {
                        prefix += "0";
                        numMissing -= 1;
                    }
                    return prefix + result;
                };
            } else {
                return function (value) {
                    return (Math.floor(value) || 0).toString();
                };
            }
        };

        return defaultConverters;
    }());
    
    /**
     * Generate a map of route name to URL generation function.
     *
     * @param {Object} data The serialized route data from Escort.
     * @param {Object} options An options object. Can contain "converters", which can be used to override or add custom converters.
     * @return {Object} A map of route name to URL generation function.
     */
    var generateUrlObject = exports.generateUrlObject = function (data, options) {
        if (!options) {
            options = {};
        }
        
        var url = {};
        var converters = options.converters || {};
        for (var key in defaultConverters) {
            if (has.call(defaultConverters, key) && !has.call(converters, key)) {
                converters[key] = defaultConverters[key];
            }
        }
        
        for (key in data) {
            if (has.call(data, key)) {
                var func = generateUrlFunction(data[key], converters);
                if (func) {
                    url[key] = func;
                }
            }
        }
        
        return url;
    };
}(exports || (this.escortClient = {})));
