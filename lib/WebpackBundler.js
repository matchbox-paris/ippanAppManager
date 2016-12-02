"use strict"

const { NODE_ENV, ROOT, TMP } = process.env

const { class:klass } = require("ippankiban/lib/class")
const { basename, dirname, isAbsolute:isAbsoluePath, join:joinPath, relative:relativePath, resolve:resolvePath } = require("path")
const { type:typeOf } = require("ippankiban/lib/type")
const { nextTick } = process
const { Event } = require("ippankiban/lib/Event")
const { EventTarget } = require("ippankiban/lib/EventTarget")

const combineLoaders = require('webpack-combine-loaders');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const webpack = require("webpack")

module.exports.WebpackBundler = klass(EventTarget, statics => {
    const bundlers = new WeakMap
    const empty = {}

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

                      ;((dict.babel||empty).presets||[]).forEach(preset => {
                          if ( typeOf(preset) == "string" )
                            this.babel_presets.add(preset)
                      })
                      ;((dict.babel||empty).plugins||[]).forEach(plugin => {
                          if ( typeOf(plugin) == "string" )
                            this.babel_plugins.add(plugin)
                      })
                      ;((dict.css_modules||empty).plugins||[]).forEach(plugin => {
                          if ( typeOf(plugin) == "string" )
                            this.babel_presets.add(plugin)
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
                  .then(() => new Promise((resolve, reject) => {
                      webpack({
                          entry: resolvePath(ROOT, this.from)
                        , output: {
                              path: resolvePath(TMP, dirname(this.to_js))
                            , filename: basename(this.to_js)
                          }
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
                                , {
                                    test: /\.css$/
                                  , loader: ExtractTextPlugin.extract(combineLoaders([{
                                        loader: 'css-loader'
                                      , query: {
                                            modules: true
                                          , localIdentName: '[name]__[local]___[hash:base64:5]'
                                        }
                                    }]))
                                  }
                              ]
                          }
                          , plugins: [
                                new webpack.DefinePlugin({ 'process.env.NODE_ENV': `"${NODE_ENV}"` })
                              , new ExtractTextPlugin(joinPath(relativePath(dirname(this.to_js), dirname(this.to_css)), basename(this.to_css)))
                            ]
                      }, (err, stats) => {
                          if ( err || stats.hasErrors() ) {
                              if ( err )
                                return reject([err])
                              return reject(stats.compilation.errors)
                          }
                          resolve()
                      })
                  })
                  .then(() => cb(null))
                  .catch(errors => cb.apply(null, errors)))
            }
        }
      , css_modules_plugins: { enumerable: true,
            get: function(){
                if ( !bundlers.get(this).has("css_modules_plugins") )
                  bundlers.get(this).set("css_modules_plugins", new Set)

                return bundlers.get(this).get("css_modules_plugins")
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
