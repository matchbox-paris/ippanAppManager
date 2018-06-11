"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { basename, dirname, isAbsolute:isAbsoluePath, join:joinPath, relative:relativePath, resolve:resolvePath } = require("path")
const { type:typeOf } = require("ippankiban/lib/type")
const { nextTick } = process
const { Event } = require("ippankiban/lib/Event")
const { EventTarget } = require("ippankiban/lib/EventTarget")
const { ReadyStateFul } = require("ippankiban/lib/ReadyStateFul")
const { realpath } = require("fs")
const { Serializer:{ stringify:serialize } } = require("ippankiban/lib/Serializer")
const webpack = require("webpack")
const CommonsChunkPlugin = require("webpack/lib/optimize/CommonsChunkPlugin")
const UglifyJsPlugin = require("webpack/lib/optimize/UglifyJsPlugin")

const env = require("./env")
const { CONFIG={} } = env
const { NODE_ENV, ROOT, TMP, DEBUG, VERBOSE } = function(){
    return {
        NODE_ENV: process.env.NODE_ENV || process.env.ENV || process.env.env || CONFIG.NODE_ENV || CONFIG.ENV || CONFIG.env
      , ROOT: process.env.ROOT || CONFIG.ROOT || CONFIG.ROOT_PATH || CONFIG.PATH_ROOT
      , TMP: process.env.TMP || CONFIG.TMP || CONFIG.TMP_PATH || CONFIG.PATH_TMP || CONFIG.PATH_ROOT
      , DEBUG: env.DEBUG || process.env.DEBUG || process.env.debug || CONFIG.DEBUG || CONFIG.debug
      , VERBOSE: env.VERBOSE || process.env.VERBOSE || process.env.verbose || CONFIG.VERBOSE || CONFIG.verbose
    }
}()

const errors = require("./errors")

const JsDocPlugin = require('jsdoc-webpack-plugin')
const ExtractTextPlugin = require('extract-text-webpack-plugin')


const WatchCBPlugin = klass(statics => {
    const events = new WeakMap

    return {
        constructor: function(cb){
            events.set(this, new Map)
            this.cb = cb
        }
      , apply: { enumerable: true,
            value: function(compiler){
                compiler.plugin("done", stats => {
                    const errors = stats.compilation.errors

                    if ( !!errors && !!errors.length )
                      this.cb(errors, stats)
                    else
                      this.cb(null, stats)
                })
                compiler.plugin("failed", err => this.cb(err))

                compiler.plugin("compilation", (compilation, params) => {
                    compilation.plugin("succeed-module", ({userRequest:from}) => {
                        if ( !from )
                          return

                        try {
                            //this.cb(null, from)
                        } catch(e) {
                            console.error(e)
                        }
                    })
                    compilation.plugin("failed-module", ({userRequest:from}) => {
                        if ( !from )
                          return

                        try {
                            //this.cb([new Error("failed-module")], from)
                        } catch(e) {
                            console.error(e)
                        }
                    })
                })
            }
        }
      , cb: { enumerable: true,
            get: function(){ return events.get(this).get("callback") }
          , set: function(cb){ events.get(this).set("callback", cb || Function.prototype) }
        }
    }
})

module.exports.Webpack3Bundler =
module.exports.WebpackBundler = klass(EventTarget, ReadyStateFul, statics => {
    const bundlers = new WeakMap

    const DEFAULT_RAW = new Set(["\\.txt", "\\.svg", "\\.csv"])

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , [0b0]: { enumerable: true, value: "UNINITIALIZED"}
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , [0b1]: { enumerable: true, value: "INITIALIZING" }
      , ERROR: { enumerable: true, value: 0b10 }
      , [0b10]: { enumerable: true, value: "ERROR" }
      , BUSY: { enumerable: true, value: 0b11 }
      , [0b11]: { enumerable: true, value: "BUSY" }
      , IDLE: { enumerable: true, value: 0b100 }
      , [0b100]: { enumerable: true, value: "IDLE" }
    })


    let ippan_alias = false
    const ready = () => Promise.race(
        [
            new Promise((resolve, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
          , ...(ROOT.split("/")
            .map((node, i, tree) => new Promise((resolve, reject) => {
                  while ( tree.length - (++i) ) node = `../${node}`

                  node = resolvePath(ROOT, `../${node}/node_modules/ippankiban`)
                  realpath(node, (err, rpath) => !!rpath && resolve(rpath) )
            })))
        ])
        .then(rpath => ippan_alias = rpath)
        .catch(e => eval(DEBUG) && console.error(e))

    return {
        constructor: function( { debug=false, verbose=false, transpile = true
                               , entry, from, to_dir=TMP, to_js, to_css
                               , commonsChunk = false
                               , babel, postcss, cssloader:{configuration:cssloader_configuration}
                               , devtool, devServer, watch, watch_ignore=/node_modules/, watch_aggregateTimeout=200
                               , target = "web", resolve_modules = []
                               , jsdoc=false, jsDoc=false
                               , raw = DEFAULT_RAW, substitutes = {}, substitute
                               , minify=false
                               , alias=null, aliases={}
                               , minChunks = 2
                               , publicPath = "/"
                               } = {} ) {

            bundlers.set(this, new Map)
            bundlers.get(this).set("op", Promise.resolve())
            bundlers.get(this).set("ready", Promise.resolve()
                .then(() => new Promise(resolve => nextTick( () => {
                    ReadyStateFul.readystateChange(this, module.exports.WebpackBundler.INITIALIZING)
                    resolve()
                })))
                .then(() => ready())
                .then(() => new Promise(resolve => {
                    this.debug = !!debug
                    this.verbose = !!verbose
                    this.transpile = transpile

                    this.from = entry || from
                    if ( to_dir ) this.to_dir = to_dir
                    this.target = target

                    resolve_modules = typeOf(resolve_modules) == "string" ? [resolve_modules]
                                    : typeOf(resolve_modules) == "array" ? resolve_modules
                                    : []
                    bundlers.get(this).set("resolve_modules", resolve_modules)
                    this.to_js = to_js
                    this.to_css = to_css
                    this.commonsChunk = commonsChunk
                    this.minChunks = minChunks
                    this.publicPath = publicPath
                    this.devtool = devtool
                    if ( devServer )
                      this.devServer = devServer

                    this.watch = watch
                    bundlers.get(this).set("watch_ignore", watch_ignore)
                    bundlers.get(this).set("watch_aggregateTimeout", watch_aggregateTimeout)

                    this.jsdoc = jsdoc || jsDoc
                    this.minify = minify

                    this.raw = raw
                    this.substitutes = substitute || substitutes

                    this.alias = alias || aliases

                    void ((babel||{}).presets||[]).forEach(preset => {
                        console.warn("babel presets are now ignored")
                        if ( typeOf(preset) == "string" )
                          this.babel_presets.add(preset)
                    })

                    if ( !this.transpile ) {
                        void [...this.babel_presets].forEach(preset => {
                            if ( ["es20015", "latest"].indexOf(preset) !== -1 )
                              this.babel_presets.delete(preset)
                        })

                        this.babel_presets.add("import-export")
                    }

                    void ((babel||{}).plugins||[]).forEach(plugin => {
                        if ( typeOf(plugin) == "string" )
                          this.babel_plugins.add(plugin)
                    })

                    this.postcss = typeOf(postcss) == "boolean" && !postcss
                                 ? false
                                 : true
                    void ((postcss||{}).plugins||[]).forEach(plugin => {
                        if ( typeOf(plugin) == "string" )
                          this.postcss_plugins.add(plugin)
                    })
                    this.cssloader_configuration = cssloader_configuration||{}

                    resolve()
                }))
                .catch(error => {
                    this.dispatchEvent("error", error)
                    return { error }
                })
                .then(({ error } = {}) => new Promise((resolve, reject) => nextTick(() => {
                    ReadyStateFul.readystateChange(this, error ? module.exports.WebpackBundler.IDLE : module.exports.WebpackBundler.ERROR)

                    if ( !error )
                      resolve()
                    else
                      reject(error)
                }))))
        }
      , alias: { enumerable: true,
            get: function(){
                if ( !bundlers.get(this).has("alias") )
                  bundlers.get(this).set("alias", new Map)

                return bundlers.get(this).get("alias")
            }
          , set: function(v){
                if ( typeOf(v) != "object" )
                  return

                bundlers.get(this).set("alias", new Map)
                Object.keys(v)
                  .filter(k => typeOf(v[k]) == "string")
                  .forEach(k => bundlers.get(this).get("alias").set(k, v[k]))
            }
        }
      , babel_presets: { enumerable: true,
            get: function(){
                if ( !bundlers.get(this).has("babel_presets") )
                  bundlers.get(this).set("babel_presets", new Set)

                return bundlers.get(this).get("babel_presets")
            }
        }
      , babel_plugins: { enumerable: true,
            get: function(){
                if ( !bundlers.get(this).has("babel_plugins") )
                  bundlers.get(this).set("babel_plugins", new Set)

                return bundlers.get(this).get("babel_plugins")
            }
        }
      , bundle: { enumerable: true,
            value: function(cb){
                cb = typeOf(cb) == "function" ? cb : Function.prototype

                bundlers.get(this).set("op", Promise.all([
                    bundlers.get(this).get("ready")
                  , bundlers.get(this).get("op")
                ])
                .then(() => ReadyStateFul.readystateChange(this, module.exports.WebpackBundler.BUSY))
                .then(() => new Promise((resolve, reject) =>{
                    const config = {}
                    const substitutes = {}
                    this.substitutes.forEach((value, key) => substitutes[key] = `"${value}"` )
                    substitutes["process.env.NODE_ENV"] = `"${NODE_ENV}"`

                    config.context = this.context
                    config.entry = this.from
                    config.output = {
                        path: resolvePath(this.to_dir, dirname(this.to_js))
                      , filename: basename(this.to_js)
                      , chunkFilename: basename(this.to_js)
                      , publicPath: this.publicPath
                    }
                    config.devtool = this.devtool || this.debug ? ( NODE_ENV != "dev" ? "source-map" : "eval-source-map"  ) : ""
                    config.resolve = {}
                    config.resolve.modules = [ ...bundlers.get(this).get("resolve_modules"), resolvePath(this.context, "./node_modules") ].filter(v => !!v)
                    config.resolve.alias = {}
                    this.alias.forEach((v, k) => config.resolve.alias[k] = v)

                    if ( ippan_alias )
                      config.resolve.alias["ippankiban$"] = ippan_alias

                    config.module = {
                        rules: [
                            {
                                test: new RegExp(`${[...this.raw].join("|")}$`)
                              , use: {
                                    loader: "raw-loader"
                                }
                            }
                          , {
                                test: /\.js|\.mjs|\.es6$/
                              , exclude: /(node_modules|bower_components)/
                              , use: {
                                    loader: 'babel-loader'
                                  , options: {
                                        cacheDirectory: true
                                      , presets: [
                                            "react"
                                          , ["env", {
                                                targets: {
                                                    browsers: ["last 2 versions", "IE 11"]
                                                }
                                            }]
                                          , "stage-0" // ec39 proprosals
                                        ]
                                      , plugins: [...this.babel_plugins]
                                    }
                                }
                            }
                        ]
                    }

                    if ( this.postcss )
                      config.module.rules.push({
                              test: /\.css$/
                            , use: ExtractTextPlugin.extract({
                                  fallback: 'style-loader'
                                , use: [
                                      {
                                          loader: `css-loader`
                                        , options: this.cssloader_configuration
                                      }
                                    , {
                                          loader: 'postcss-loader'
                                        , options: {
                                              sourceMap: !!(this.debug||this.devtool)
                                            , ident: 'postcss'
                                            , plugins: () => [
                                                   ...[...this.postcss_plugins].map(v => {
                                                        if ( typeOf(v) == "string" )
                                                          return require(v)()
                                                        else
                                                          return v
                                                   })
                                                ]
                                          }
                                      }
                                  ]
                            })
                        })

                    if ( this.devServer )
                      config.devServer = devServer

                    config.plugins = []

                    if ( this.watch ) {
                        config.watch = this.watch
                        config.watchOptions = {
                            aggregateTimeout: bundlers.get(this).get("watch_aggregateTimeout")
                          , ignored: bundlers.get(this).get("watch_ignored")
                        }
                        config.plugins.push(new WatchCBPlugin(cb))
                    }

                    if ( !!this.commonsChunk )
                      config.plugins.push(new CommonsChunkPlugin({
                          name: this.commonsChunk
                        , chunks: Object.keys(this.from)
                        , filename: "[name].js"
                        , minChunks: this.minChunks
                      }))

                    config.plugins.push(new webpack.DefinePlugin(substitutes))
                    config.plugins.push(new ExtractTextPlugin(joinPath(relativePath(dirname(this.to_js), dirname(this.to_css)), basename(this.to_css)), { allchunks: true }))


                    if ( this.minify )
                      config.plugins.push(new UglifyJsPlugin({
                          sourceMap: true
                        , uglifyOptions: {
                              ecma: 8
                          }
                      }))

                    if ( this.jsdoc )
                      config.plugins.push( new JsDocPlugin({ conf: this.jsdoc }) )

                    webpack(config, (err, stats) => {
                        if ( err || stats.hasErrors() ) {
                            const errors = [err].concat(stats.compilation.errors||[])
                                                .filter(v => !!v)
                            reject({errors, stats})
                        }

                        ReadyStateFul.readystateChange(this, module.exports.WebpackBundler.IDLE)
                        resolve({ errors: [], stats })
                    })
                })))

                bundlers.get(this).get("op")
                  .then(({stats}) => !this.watch && cb([], stats))
                  .catch(({errors, stats}) => {
                      if ( !!errors && !!stats )
                        !this.watch && cb(errors||[], stats)
                      else
                        !this.watch && cb([arguments[0]].filter(v => !!v), null)
                  })

                return bundlers.get(this).get("op")
            }
        }
      // todo
      // , bundleHMR: { enumerable: true,
      //       value: function(cb){
      //           cb = typeOf(cb) == "function" ? cb : Function.prototype
      //
      //           bundlers.get(this).set("op", Promise.all([
      //               bundlers.get(this).get("ready")
      //             , bundlers.get(this).get("op")
      //           ])
      //           .then(() => new Promise(resolve => {
      //
      //               resolve()
      //           })))
      //
      //           bundlers.get(this).get("op")
      //             .then(() => cb(null))
      //             .catch(e => cb(e, null))
      //       }
      //   }
      , debug: { enumerable: true,
            get: function(){ return bundlers.get(this).get("debug") }
          , set: function(v){
                bundlers.get(this).set("debug", !!v)
            }
        }
      , commonsChunk: { enumerable: true,
            get: function(){ return bundlers.get(this).get("commonsChunk") }
          , set: function(v){
                if ( (typeOf(v) == "boolean") || typeOf(v) !== "string" ) {
                    v = !!v ? "commons" : false
                    console.warn(`Webpack3Bundler:commonsChunk - forcing value to "${v}"`)
                }

                bundlers.get(this).set("commonsChunk", v)
            }
        }
      , context: { enumerable: true,
            get: function(){ return ROOT } //TODO offer context as a config option?
          , set: function(v){}
        }
      , cssloader_configuration: { enumerable: true,
            get: function(){
                return bundlers.get(this).get("cssloader_configuration")
            }
          , set: function(v){
                if ( typeOf(v) != "object" )
                  return

                bundlers.get(this).set("cssloader_configuration", v)
                bundlers.get(this).get("cssloader_configuration").modules = true
            }
        }
      , cssloader_configuration_asString: { enumerable: true,
            get: function(){
                return serialize(bundlers.get(this).get("cssloader_configuration"))
            }
        }
      , devtool: { enumerable: true,
            get: function(){ return bundlers.get(this).get("devtool") }
          , set: function(v){
                bundlers.get(this).set("devtool", v || false)
            }
        }
      , devServer: { enumerable: true,
            get: function(){ return bundlers.get(this).get("devServer") }
          , set: function(v){
                if ( typeOf(v) == "object" )
                  bundlers.get(this).set("devServer", v)
            }
        }
      , from: { enumerable: true,
            get: function(){ return bundlers.get(this).get("from") }
          , set: function(v){
                bundlers.get(this).set("from", typeOf(v) == "string" ? { entry: isAbsoluePath(v) ? `.${v}`: v }
                                              : typeOf(v) == "object" ? function(v){
                                                    Object.keys(v).forEach(key => {
                                                        v[key] = isAbsoluePath(v[key]) ? [`.${v[key]}`] : [v[key]]
                                                    })

                                                    return v
                                                }(v)
                                              : void function(){ throw new TypeError(errors.MISSING_ENTRY)  }())
            }
        }
      , jsdoc: { enumerable: true,
            get: function(){ return bundlers.get(this).get("jsdoc") || false }
          , set: function(v){
                bundlers.get(this).set("jsdoc", typeOf(v) == "string" ? v : false)
            }
        }
      , minChunks: { enumerable: 2,
            get: function(){ return bundlers.get(this).get("minChunks") }
          , set: function(v){
                if ( typeOf(v) != "number" )
                  v = 2
                bundlers.get(this).set("minChunks", v)
            }
        }
      , minify: { enumerable: true,
            get: function(){ return bundlers.get(this).get("minify") }
          , set: function(v){
                bundlers.get(this).set("minify", !!v)
            }
        }
      , minify_opts: { enumerable: true,
            get: function(){ return bundlers.get(this).get("minify_opts") || {} }
          , set: function(v){
                if ( typeOf(v) == "object" )
                  bundlers.get(this).set("minify_opts", v)
            }
        }
      , postcss: { enumerable: true,
            get: function(){ return bundlers.get(this).get("postcss") }
          , set: function(v){ bundlers.get(this).set("postcss", !!v) }
        }
      , postcss_plugins: { enumerable: true,
            get: function(){
                if ( !bundlers.get(this).has("postcss_plugins") )
                  bundlers.get(this).set("postcss_plugins", new Set)

                return bundlers.get(this).get("postcss_plugins")
            }
        }
      , publicPath: { enumerable: true,
            get: function(){ return bundlers.get(this).get("publicPath") }
          , set: function(v){ bundlers.get(this).set("publicPath", v) }
        }
      , raw: { enumerable: true,
            get: function(){
                if ( !bundlers.get(this).has("raw") )
                  bundlers.get(this).set("raw", new Set)

                return bundlers.get(this).get("raw")
            }
          , set: function(v){
                if ( !v || !v[Symbol.iterator] )
                  throw new Error(errors.RAW_NOT_ITERABLE)

                if ( bundlers.get(this).has("raw") )
                  bundlers.get(this).get("raw").clear()

                void [...v].forEach(raw => {
                    if ( typeOf(raw) != "string" )
                      return

                    if ( raw.indexOf("\\.") != 0 ) {
                        if ( raw.indexOf("\.") == 0 )
                          raw = `\\${raw}`
                        else if ( raw[0] == "." )
                          raw = `\\${raw}`
                        else
                          raw = `\\.${raw}`
                    }

                    this.raw.add(raw)
                })

            }
        }
      , substitutes: { enumerable: true,
            get: function(){
                if ( !bundlers.get(this).has("substitutes") )
                  bundlers.get(this).set("substitutes", new Map)

                return bundlers.get(this).get("substitutes")
              }
          , set: function(v){
                if ( typeOf(v) !== "object" )
                    throw new TypeError(errors.SUBS_NOT_A_HASH)

                if ( bundlers.get(this).has("substitutes") )
                  bundlers.get(this).get("substitutes").clear()

                void Object.keys(v||{}).forEach(key => {
                    if ( typeOf(v[key]) == "string" )
                      this.substitutes.set(key, v[key])
                })
            }
        }
      , target: { enumerable: true,
            get: function(){ return bundlers.get(this).get("target") }
          , set: function(v){ bundlers.get(this).set("target", v) }
        }
      , to_dir: { enumerable: true,
            get: function(){ return bundlers.get(this).get("to_dir") || TMP }
          , set: function(v){
                bundlers.get(this).set("to_dir", typeOf(v) == "string"
                                               ? isAbsoluePath(v) ? v : (console.warn(`webpackBundler.to_dir must be an absolute path (was requested: ${v}, will use: ${TMP})`), TMP)
                                               : void function(){ throw new TypeError(errors.MISSING_PATH)  }())
            }
        }
      , to_js: { enumerable: true,
            get: function(){ return bundlers.get(this).get("to_js") }
          , set: function(v){
                bundlers.get(this).set("to_js", typeOf(v) == "string"
                                              ? (isAbsoluePath(v) ? `.${v}` : v)
                                              : void function(){ throw new TypeError("js output, path (string) expected")  }())
            }
        }
      , to_css: {
            get: function(){ return bundlers.get(this).get("to_css") }
          , set: function(v){
                bundlers.get(this).set("to_css", typeOf(v) == "string"
                                              ? (isAbsoluePath(v) ? `.${v}` : v)
                                              : void function(){ throw new TypeError("css output, path (string) expected")  }())
            }
        }
      , transpile: { enuerable: true,
            get: function(){ return bundlers.get(this).get("transpile") }
          , set: function(v){ bundlers.get(this).set("transpile", !!v)  }
        }
      , watch: { enumerable: true,
            get: function(){ return bundlers.get(this).get("watch") }
          , set: function(v){ bundlers.get(this).set("watch", !!v) }
        }
    }

})
