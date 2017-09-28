const { DEBUG, VERBOSE
      , APP_SOCKET, ROOT, TMP
      , WWW, JS, EXPORT_PATH
      , JSDOC_CONF, CSS, POSTCSS_PLUGINS = "", BABEL_PRESETS="", BABEL_PLUGINS=""
      , NODE_ENV, IPV4, HTTP_PORT
      } = process.env

const substitute = require("./substitute")
const { WebpackBundler } = require("../../index")

const { basename, dirname, isAbsolute:isAbsoluePath, join:joinPath, relative:relativePath, resolve:resolvePath } = require("path")
const bundler = new WebpackBundler({
    entry: {
        1: "/client/entry1.js"
      , 2: "/client/entry2.js"
    }
  , to_js:  joinPath("./", `${JS}/[name].js`)
  , babel: {
        presets: [...BABEL_PRESETS.split(",").filter(v => !!v)]
      , plugins: [...BABEL_PLUGINS.split(" ").filter(v => !!v)]
    }
  , cssloader: {
        configuration: {
            localIdentName: NODE_ENV == "production" ? "[hash:base64:5]" : "[name]__[local]___[hash:base64:5]"
          , minimize: NODE_ENV == "production" ? true : false
        }
    }
  , postcss: {
        plugins: [...POSTCSS_PLUGINS.split(",").filter(v => !!v)]
    }
  , to_css: joinPath("./", `${CSS}/[name].css`)
  , watch: true
  , minify: true
  , resolve_modules: resolvePath(ROOT, "../node_modules")
  , substitute
  , transpile: false
})

bundler.bundle((err, stats) => {
    if ( err.length ){
        err.forEach(err => console.error(err))
    } else {
        console.log(`[${__filename}] build ok`)
    }
})
