"use strict"

const { DEBUG, VERBOSE } = process.env
const argv = new Set( process.argv.slice(2) )

module.exports.VERBOSE = argv.has("--VERBOSE") || argv.has("--verbose") || argv.has("-v") || VERBOSE
module.exports.DEBUG = argv.has("--DEBUG") || argv.has("--debug") || argv.has("-d") || DEBUG
module.exports.NODE_ENV = [...argv].filter(v => v.indexOf("--NODE_ENV=") == 0 || v.indexOf("--env=") == 0)
                          .map(v => v.split("=")[1])[0] || null
                          
argv.forEach(argument => {
    try {
        const config = JSON.parse(argument)
        module.exports.CONFIG = module.exports.CONFIG || {}

        for ( let k in config )
          module.exports.CONFIG[k] = config[k]
    } catch(e){}
})
