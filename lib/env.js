"use strict"

const { DEBUG, VERBOSE } = process.env
const argv = new Set( process.argv.slice(2) )

module.exports.VERBOSE = argv.has("--VERBOSE") || argv.has("--verbose") || argv.has("-v") || VERBOSE
module.exports.DEBUG = argv.has("--DEBUG") || argv.has("--debug") || argv.has("-d") || DEBUG

argv.forEach(argument => {
    try {
        const config = JSON.parse(argument)
        module.exports.CONFIG = module.exports.CONFIG || {}

        for ( let k in config )
          module.exports.CONFIG[k] = config[k]
    } catch(e){}
})
