"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { createReadStream, createWriteStream, mkdir, watch } = require("fs")
const { createInterface:createReadlineInterface } = require("readline")
const { dirname, resolve:resolvePath, join:joinPath, isAbsolute:isAbsolutePath,  } = require("path")
const errors = require("./errors")
const { nextTick } = process
const { typeOf } = require("ippankiban/lib/type")

const { Node } = require("ippankiban/lib/Node")

module.exports.IniParser = klass(Node, statics => {
    const cwd = resolvePath(process.cwd(), dirname(process.mainModule.filename))
    const parsers = new WeakMap

    const getPath = (file, root) => {
        if ( isAbsolutePath(file) )
          return file
        return resolvePath(root, file)
    }

    const nl_comment_at_0 = char => char == "#" || char == ";"

    const transform_operators = new Map()
    transform_operators.set("boolean", {
        operator: "boolean!"
      , handler: str => !!str.slice(8)
    })
    transform_operators.set("float", {
        operator: "float!"
      , handler: str => parseFloat(str.slice(6))
    })
    transform_operators.set("integer", {
        operator: "integer!"
      , handler: str => parseInt(str.slice(8), 10)
    })

    const transform = str => {
        const [operation, { handler }] = (([...transform_operators].filter(([name, { operator }]) => str.indexOf(operator) == 0 )).shift()) || [null, {}]

        return handler ? handler(str) : str
    }

    return {
        constructor: function({ filepath, file, files, root, from }={}){
            Reflect.apply(Node, this, [])
            parsers.set(this, new Map)

            files = files || file || filepath
            root = root || from

            parsers.get(this).set("root", typeOf(root) == "string"
                                          ? isAbsolutePath(root) ? root : resolvePath(cwd, root)
                                          : cwd)
            parsers.get(this).set("files_path", )
            parsers.get(this).set("files_path",
                new Set(typeOf(files) == "array" ? files.map(file => getPath(file, this.root)).filter(v => !!v)
              : typeof(files) == "string" ? [getPath(files, this.root)]
              : void function(){ this.dispatchEvent("error", errors.MISSING_PATH) }.call(this)))

        }
      , files: { enumerable: true,
            get: function(){ return parsers.get(this).get("files_path") }
        }
      , root: { enumerable: true,
            get: function(){ return parsers.get(this).get("root") }
        }
      , parse: { enumerable: true,
            value: function(cb){
                cb = typeOf(cb) == "function" ? cb : Function.prototype

                return Promise.all([...this.files].map(file => new Promise(resolve => {
                    const input = createReadStream( file )
                    const lines = createReadlineInterface({ input })
                    const variables = new Map
                    const pairs = new Map

                    const online = line => {
                        line = line.trim()

                        if ( nl_comment_at_0(line[0]) || !line.length )
                          return
                        else if ( line[0] == "$" ) {
                            const idx = line.indexOf("=")

                            variables.set(line.slice(1, idx).trim(), line.slice(idx+1).trim())
                        }
                        else {
                            const idx = line.indexOf("=")
                            const key = line.slice(0, idx).trim()
                            let value = line.slice(idx+1).trim()

                            if ( value[0] == "[" && value[value.length-1] == "]")
                                value = value.slice(1, -1)
                                             .split(",")
                                             .map(v => transform(v.trim()))
                            else
                              value = transform(value)

                            pairs.set(key, value)
                        }
                    }

                    const onend = () => {
                        input.removeListener("error", onerror)
                        lines.removeListener("error", onerror)
                        lines.removeListener("line", online)
                        lines.removeListener("close", onend)

                        pairs.forEach((value, key) => {
                            variables.forEach((replace, match) => {
                                const regExp = new RegExp(`\\$${match}`, "g")

                                if ( !regExp.exec(value) )
                                  return

                                if ( typeOf(value) == "string" )
                                  value = value.replace(new RegExp(`\\$${match}`, "g"), replace)
                                else if ( typeOf(value) == "array" )
                                  value = value.map(v => v.replace(new RegExp(`\\$${match}`, "g"), replace))
                                pairs.set(key, value)
                            })

                            process.env[key.toUpperCase()] = value
                        })

                        variables.clear()
                        resolve(pairs)
                    }

                    const onerror = e => {
                        if ( e && e.code == "ENOENT" )
                          onend()
                        else {
                          throw e
                        }
                    }

                    input.addListener("error", onerror)
                    lines.addListener("error", onerror)
                    lines.addListener("line", online)
                    lines.addListener("close", onend)
                })))
                .then(([...pairs]) => {
                    const data = {}

                    pairs.forEach(pair => {
                        pair.forEach((value, key) => data[key] = value)
                        pair.clear()
                    })

                    return { error:null, data }
                })
                .catch(e => { return { error: e, data: null } })
                .then(({ error, data }) => {
                    if ( !!error ) {
                        cb(error, null)
                        throw error
                    }

                    cb(null, data)
                    return data
                })
            }
        }
    }
})
