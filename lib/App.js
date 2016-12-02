"use strict"

const { exec, fork, spawn } = require("child_process")
const { createReadStream, createWriteStream, mkdir, watch } = require("fs")
const { dirname, resolve:resolvePath, join:joinPath } = require("path")
const { createInterface:createReadlineInterface } = require("readline")
const { inherits } = require("util")
const { nextTick } = process

const { class:klass } = require("ippankiban/lib/class")
const { EventTarget } = require("ippankiban/lib/EventTarget")
const { UID:{uid} } = require("ippankiban/lib/UID")

const cwd = resolvePath(process.cwd(), dirname(process.mainModule.filename))

module.exports.App = klass(EventTarget, statics => {

    return {
        constructor: function(){
            Promise.all([
                new Promise(resolve => {
                  const mandatories = new Set()

                  const input = createReadStream( resolvePath(cwd, "./.flags") )
                  const lines = createReadlineInterface({ input })

                  const online = line => {
                      line = line.trim()
                      if ( line[0] == "#" || !line.length )
                        return

                      const parts = line.split(/\s/)
                                        .filter(v => !!v)

                      parts.forEach(part => mandatories.add(part))
                  }

                  const onend = () => {
                      input.removeListener("error", onerror)
                      lines.removeListener("error", onerror)
                      lines.removeListener("line", online)
                      lines.removeListener("close", onend)
                      resolve(mandatories)
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
                }).then(mandatories => new Promise(resolve => {
                      const execArgv = new Set(process.execArgv)
                      let ok = true

                      mandatories.forEach(arg => {
                          if ( execArgv.has(arg) )
                            return
                          ok = false
                          execArgv.add(arg)
                      })

                      if ( ok )
                        return resolve()

                      const cp = fork(resolvePath(cwd, process.mainModule.filename), process.argv.slice(2), {execArgv: [...execArgv]})

                      process.addListener("SIGINT", () => cp.kill())
                      process.addListener("SIGTERM", () => cp.kill())
                      process.addListener("exit", () => cp.kill())
                      cp.addListener("SIGINT", () => process.exit())
                      cp.addListener("SIGTERM", () => process.exit())
                      cp.addListener("exit", () => process.exit())

                      const e = new Error("missing mandatory parameters, restarting with child process")
                      e.warn = true
                      throw e
                  }))
            ])
            .then(() => new Promise(resolve => {
                //process.setMaxListeners(10)
                process.on("SIGINT", e => process.exit())
                process.on("SIGTERM", e => process.exit())

                resolve()
            }))
            .then(() => new Promise(resolve => {
                /*
                    project environment configuration
                */
                const input = createReadStream( resolvePath(cwd, "./.env") )
                const lines = createReadlineInterface({ input })
                const variables = new Map
                const pairs = new Map

                const online = line => {
                    line = line.trim()
                    if ( line[0] == "#" || !line.length )
                      return
                    else if ( line[0] == "$" ) {
                        const idx = line.indexOf("=")
                        variables.set(line.slice(1, idx).trim(), line.slice(idx+1).trim())
                    }
                    else {
                        const idx = line.indexOf("=")
                        pairs.set(line.slice(0, idx).trim(), line.slice(idx+1).trim())
                    }
                }

                const onend = () => {
                    input.removeListener("error", onerror)
                    lines.removeListener("error", onerror)
                    lines.removeListener("line", online)
                    lines.removeListener("close", onend)

                    pairs.forEach((value, key) => {
                        variables.forEach((replace, match) => value = value.replace(new RegExp(`\\$${match}`, "g"), replace))
                        process.env[key.toUpperCase()] = value
                    })

                    variables.clear()
                    pairs.clear()
                    resolve()
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
            }))
            .then(() => new Promise(resolve => {
                /*
                    user config, can be present or not
                */
                const input = createReadStream( resolvePath(cwd, "./.local") )
                const lines = createReadlineInterface({ input })
                const variables = new Map
                const pairs = new Map

                const online = line => {
                    line = line.trim()
                    if ( line[0] == "#" || !line.length )
                      return
                    else if ( line[0] == "$" ) {
                        const idx = line.indexOf("=")
                        variables.set(line.slice(1, idx).trim(), line.slice(idx+1).trim())
                    }
                    else {
                        const idx = line.indexOf("=")
                        pairs.set(line.slice(0, idx).trim(), line.slice(idx+1).trim())
                    }
                }

                const onend = () => {
                    input.removeListener("error", onerror)
                    lines.removeListener("error", onerror)
                    lines.removeListener("line", online)
                    lines.removeListener("close", onend)

                    pairs.forEach((value, key) => {
                        variables.forEach((replace, match) => value = value.replace(new RegExp(`\\$${match}`, "g"), replace))
                        process.env[key.toUpperCase()] = value
                    })

                    variables.clear()
                    pairs.clear()

                    resolve()
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
            }))
            .then(() => new Promise(resolve => {
                const mode = 0O0775 & (~process.umask())

                process.env.NODE_ENV = process.env.NODE_ENV  || "dev"
                process.env.ROOT = cwd
                process.env.TMP = resolvePath("/tmp", `./${uid()}`)


                mkdir(process.env.TMP, mode, err => {
                    if ( err ) throw err

                    process.addListener("exit", function(path){
                        return function(){ spawn("rm", ["-rf", path])}
                    }(process.env.TMP))

                    resolve()
                })
            }))
            .then(() => new Promise((resolve, reject) => {
                const input = createReadStream( resolvePath(cwd, ".children") )
                const lines = createReadlineInterface({ input })

                let processing = Promise.resolve()
                const online = line => {
                    line = line.trim()
                    if ( line[0] == "#" || !line.length )
                      return

                    processing = processing.then(() => new Promise(resolve => {
                        const parts = line.split(/\s|\[|\]|,/gi)
                                          .filter(v => !!v)
                                          .map(v => joinPath(cwd ,v.trim()))
                        const main = parts.shift()
                        const to_watch = parts

                        let queue = Promise.resolve()
                        const start_child = prev_cp => new Promise(resolve => {
                            const start = () => {
                                const cp = fork(main, process.argv.slice(2), { env: process.env })
                                cp.onexit = code => exec(`kill -9 ${cp.pid}`)
                                process.addListener("SIGINT", cp.onexit)
                                process.addListener("SIGTERM", cp.onexit)
                                process.addListener("exit", cp.onexit)
                                resolve(cp)
                            }

                            if ( prev_cp ) {
                                const onexit = () => {
                                    prev_cp.removeListener("exit", onexit)
                                    nextTick(() => start())
                                }

                                process.removeListener("SIGINT", prev_cp.onexit)
                                process.removeListener("SIGTERM", prev_cp.onexit)
                                process.removeListener("exit", prev_cp.onexit)
                                prev_cp.addListener("exit", onexit)
                                exec(`kill -9 ${prev_cp.pid}`)
                            } else start()
                        })
                        const onchange = (change, filename) => {
                            if ( filename ) console.log(`[${main}] change detected in ${filename}`)
                            else console.log(`[${main}] change detected`)

                            queue = queue.then(start_child)
                            return queue
                        }

                        to_watch.forEach(path => {
                            const watcher = watch(path)
                            watcher.addListener("change", onchange)
                            watcher.addListener("error", e => console.error(e))
                        })
                        onchange()
                          .then(resolve)
                    }).catch(e => {
                        reject(e)
                    }))
                }

                const onend = () => {
                    lines.removeListener("line", online)
                    lines.removeListener("close", onend)
                    resolve()
                }

                lines.addListener("line", online)
                lines.addListener("close", onend)
            }))
            .catch(e => {
                if ( e.warn )
                  this.dispatchEvent("warn", e)
                else
                  this.dispatchEvent("error", e)
            })
        }
    }
})
