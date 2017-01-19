"use strict"

const { NODE_ENV, ROOT, TMP, IPPAN_ALIAS, IPV4 } = process.env

const { class:klass } = require("ippankiban/lib/class")
const { basename, dirname, isAbsolute:isAbsoluePath, join:joinPath, relative:relativePath, resolve:resolvePath } = require("path")
const { type:typeOf } = require("ippankiban/lib/type")
const { nextTick } = process
const { Event } = require("ippankiban/lib/Event")
const { EventTarget } = require("ippankiban/lib/EventTarget")
const { realpath } = require("fs")

const combineLoaders = require('webpack-combine-loaders')
const webpack = require("webpack")
const BabiliPlugin = require("babili-webpack-plugin")
const JsDocPlugin = require('jsdoc-webpack-plugin')
const ExtractTextPlugin = require('extract-text-webpack-plugin')

module.exports.WebpackBundler = klass(EventTarget, statics => {
    const bundlers = new WeakMap
    const empty = {}

    let ready = Promise.resolve()

    let ippan_alias = false
    if ( IPPAN_ALIAS )
      ready = ready.then(() => new Promise((resolve, reject) => {
          realpath(resolvePath(ROOT, "./node_modules/ippankiban"), (err, path) => {
              if ( err )
                ippan_alias = false,
                console.error(err)
              else
                ippan_alias = path

              resolve()
          })
      }))

    return {
        constructor: function(...args){
            bundlers.set(this, new Map)

            bundlers.get(this).set("ready",
                Promise.resolve(typeOf(args[0]) == "object" ? args.shift() : {})
                .then(dict => new Promise(resolve => {
                    nextTick(() => {
                      this.from = dict.from

                      this.to_js = dict.to_js
                      this.to_css = dict.to_css

                      this.debug = dict.debug
                      this.devtool = dict.devtool
                      this.jsdoc = dict.jsdoc || dict.jsDoc
                      this.minify = dict.minify

                      ;((dict.babel||empty).presets||[]).forEach(preset => {
                          if ( typeOf(preset) == "string" )
                            this.babel_presets.add(preset)
                      })
                      ;((dict.babel||empty).plugins||[]).forEach(plugin => {
                          if ( typeOf(plugin) == "string" )
                            this.babel_plugins.add(plugin)
                      })
                      ;((dict.postcss||empty).plugins||[]).forEach(plugin => {
                          if ( typeOf(plugin) == "string" )
                            this.babel_presets.add(plugin)
                      })
                      ;Object.keys(dict.subsitutes||{}).forEach(key => {
                          if ( typeOf(dict.subsitutes[key]) == "string" )
                            this.subsitute.set(key, dict.subsitutes[key])
                      })

                      resolve()
                    })
                }))
                .catch(e => this.dispatchEvent("error", e)))
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

                return bundlers.get(this).get("ready")
                  .then(ready)
                  .then(() => new Promise((resolve, reject) => {
                      const subsitutes = {}
                      this.subsitute.forEach((value, key) => subsitutes[key] = `"${value}"` )
                      subsitutes["process.env.NODE_ENV"] = `"${NODE_ENV}"`

                      const plugins = [
                            new webpack.DefinePlugin(subsitutes)
                          , new ExtractTextPlugin(joinPath(relativePath(dirname(this.to_js), dirname(this.to_css)), basename(this.to_css)), { allchunks: true })
                          , new webpack.optimize.DedupePlugin()
                        ]

                      const wp_resolve = {
                          fallback: resolvePath(ROOT, "./node_modules")
                      }

                      if ( ippan_alias )
                        resolve.alias = { "ippankiban$": ippan_alias  }

                      if ( this.minify )
                        plugins.push(new BabiliPlugin({ comments: this.debug ? true : /@preserve|@license/ }))
                      if ( this.jsdoc )
                        plugins.push(new JsDocPlugin({ conf: this.jsdoc }))

                      webpack({
                          entry: resolvePath(ROOT, this.from)
                        , resolve: wp_resolve
                        , output: {
                              path: resolvePath(TMP, dirname(this.to_js))
                            , filename: basename(this.to_js)
                          }
                        , devtool: this.devtool || this.debug ? "source-map" : ""
                        , module: {
                              loaders: [
                                  {
                                      test: /\.js$/
                                    , loader: 'babel-loader'
                                    , query: {
                                          presets: [...this.babel_presets]
                                        , plugins: [...this.babel_plugins]
                                      }
                                  }
                                , { test: /\.css$/,
                                    loader: ExtractTextPlugin.extract('style-loader', 'css-loader?modules&import=true&importLoaders=1&localIdentName=[name]__[local]___[hash:base64:5]!postcss-loader')
                                  },
                              ]
                          }
                        , postcss: (webpack) => {
                               return [
                                    require("postcss-url")()
                                  , require("postcss-cssnext")()
                                  , ...[...this.postcss_plugins].map(v => require(v)())
                               ]
                            }
                          , plugins
                      }, (err, stats) => {
                          if ( err || stats.hasErrors() ) {
                              if ( err )
                                return reject([err])
                              return reject(stats.compilation.errors)
                          }
                          resolve()
                      })
                  })
                  .then(() => cb())
                  .catch((errors, ...args) => {
                      if ( typeOf(errors) != "array" )
                        errors = [errors]

                      cb.apply(null, errors)
                  }))
            }
        }
      , debug: { enumerable: true,
            get: function(){ return bundlers.get(this).get("debug") }
          , set: function(v){
                bundlers.get(this).set("debug", !!v)
            }
        }
      , devtool: { enumerable: true,
            get: function(){ return bundlers.get(this).devtool }
          , set: function(v){
                bundlers.get(this).set("devtool", v || false)
            }
        }
      , from: { enumerable: true,
            get: function(){ return bundlers.get(this).get("from") }
          , set: function(v){
                bundlers.get(this).set("from", typeof(v) == "string"
                                              ? (isAbsoluePath(v) ? `.${v}` : v)
                                              : void function(){ throw new TypeError("entry path (string) expected")  }())
            }
        }
      , jsdoc: { enumerable: true,
            get: function(){ return bundlers.get(this).get("jsdoc") || false }
          , set: function(v){
                bundlers.get(this).set("jsdoc", typeOf(v) == "string" ? v : false)
            }
        }
      , minify: { enumerable: true,
            get: function(){ return bundlers.get(this).get("minify") }
          , set: function(v){
                bundlers.get(this).set("minify", !!v)
            }
        }
      , postcss_plugins: { enumerable: true,
            get: function(){
                if ( !bundlers.get(this).has("postcss_plugins") )
                  bundlers.get(this).set("postcss_plugins", new Set)

                return bundlers.get(this).get("postcss_plugins")
            }
        }
      , subsitute: { enumerable: true,
            get: function(){
                if ( !bundlers.get(this).has("substitutes") )
                  bundlers.get(this).set("substitutes", new Map)

                return bundlers.get(this).get("substitutes")
              }
            }
      , to_js: { enumerable: true,
            get: function(){ return bundlers.get(this).get("to_js") }
          , set: function(v){
                bundlers.get(this).set("to_js", typeof(v) == "string"
                                              ? (isAbsoluePath(v) ? `.${v}` : v)
                                              : void function(){ throw new TypeError("js output, path (string) expected")  }())
            }
        }
      , to_css: {
            get: function(){ return bundlers.get(this).get("to_css") }
          , set: function(v){
                bundlers.get(this).set("to_css", typeof(v) == "string"
                                              ? (isAbsoluePath(v) ? `.${v}` : v)
                                              : void function(){ throw new TypeError("css output, path (string) expected")  }())
            }
        }
    }
})
