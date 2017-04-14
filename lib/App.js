"use strict"

const argv = new Set(process.argv.slice(2))
const NODE_ENV = [...argv].filter(v => v.indexOf("--NODE_ENV=") == 0 || v.indexOf("--env=") == 0)
                          .map(v => v.split("=")[1])[0] || null

const { exec, fork, spawn, spawnSync } = require("child_process")
const { createReadStream, createWriteStream, mkdir, watch } = require("fs")
const { dirname, resolve:resolvePath, join:joinPath } = require("path")
const { createInterface:createReadlineInterface } = require("readline")
const { inherits } = require("util")
const { nextTick } = process
const { typeOf } = require("ippankiban/lib/type")
const { networkInterfaces } = require("os")

const { class:klass } = require("ippankiban/lib/class")
const { Node } = require("ippankiban/lib/Node")
const { UID:{uid} } = require("ippankiban/lib/UID")
const { UnixSocketServer } = require("ippanserver/lib/UnixSocketServer")

const cwd = resolvePath(process.cwd(), dirname(process.mainModule.filename))

module.exports.App = klass(Node, statics => {
    const apps = new WeakMap
    const TMP = "/tmp" //TODO find alternatives on alternative OS

    const nl_comment_at_0 = char => char == "#" || char == ";"

    return {
        constructor: function(){
            Node.call(this)
            apps.set(this, new Map)

            Promise.all([
                new Promise(resolve => {
                  const mandatories = new Set()

                  const input = createReadStream( resolvePath(cwd, "./.flags") )
                  const lines = createReadlineInterface({ input })

                  const online = line => {
                      line = line.trim()
                      if ( nl_comment_at_0(line[0]) || !line.length )
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
                                         .map(v => v.trim())

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
                            if ( typeOf(value) == "string" )
                              value = value.replace(new RegExp(`\\$${match}`, "g"), replace)
                            else if ( typeOf(value) == "array" )
                              value = value.map(v => v.replace(new RegExp(`\\$${match}`, "g"), replace))
                        })

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
                                         .map(v => v.trim())

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
                            if ( typeOf(value) == "string" )
                              value = value.replace(new RegExp(`\\$${match}`, "g"), replace)
                            else if ( typeOf(value) == "array" )
                              value = value.map(v => v.replace(new RegExp(`\\$${match}`, "g"), replace))
                        })

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
                apps.get(this).set("uid", uid())

                resolve()
            }))
            .then(() => new Promise(resolve => {
                const mode = 0O0775 & (~process.umask())
                const ifaces = networkInterfaces()

                process.env.NODE_ENV = process.env.NODE_ENV  || NODE_ENV || "dev"
                process.env.ROOT = cwd
                process.env.TMP = this.tmp_path
                process.env.APP_SOCKET = this.socket_path

                Object.keys(ifaces).forEach(ifname => {
                    ifaces[ifname].forEach(({address, family}) => {
                        if ( family == "IPv4" && address !== "127.0.0.1" )
                          process.env.IPV4 = address
                    })
                })


                mkdir(process.env.TMP, mode, err => {
                    if ( err ) throw err

                    process.addListener("SIGINT", () => process.exit())
                    process.addListener("SIGTERM", () => process.exit())
                    process.addListener("exit", code => {
                        console.log(`[ippanAppManager] attempting to delete ${process.env.TMP}`)
                        spawn("rm", ["-rf", process.env.TMP])
                    })

                    resolve()
                })
            }))
            .then(() => new Promise(resolve => {
                apps.get(this).set("unixSocketServer", new UnixSocketServer(this.socket_path))
                this.appendChild(this.unixSocketServer)

                this.unixSocketServer.addEventListener("listening", e => {
                    console.log(`app socket listening (${this.unixSocketServer.socket})`)
                    this.dispatchEvent("unixsocketserver")
                    resolve()
                })
            }))
            .then(() => new Promise((resolve, reject) => {
                const input = createReadStream( resolvePath(cwd, ".children") )
                const lines = createReadlineInterface({ input })

                let processing = Promise.resolve()
                const online = line => {
                    line = line.trim()
                    if ( nl_comment_at_0(line[0]) || !line.length )
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
                                console.log(`starting child pid ${cp.pid}`)
                                cp.onexit = code => {
                                    cp.kill()
                                    //exec(`kill -9 ${cp.pid}`)
                                }
                                // process.addListener("SIGINT", cp.onexit)
                                // process.addListener("SIGTERM", cp.onexit)
                                process.addListener("exit", cp.onexit)
                                resolve(cp)
                            }

                            if ( prev_cp && prev_cp.connected ) {
                                const onexit = () => {
                                    console.log(`killing child pid ${prev_cp.pid}`)
                                    prev_cp.removeListener("exit", onexit)
                                    nextTick(() => start())
                                }

                                // process.removeListener("SIGTERM", prev_cp.onexit)
                                // process.removeListener("SIGINT", prev_cp.onexit)
                                process.removeListener("exit", prev_cp.onexit)
                                prev_cp.addListener("exit", onexit)
                                prev_cp.kill()
                                //exec(`kill -9 ${prev_cp.pid}`)
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

                const onerror = e => {
                    if ( e && e.code == "ENOENT" )
                      onend()
                    else {
                      throw e
                    }
                }

                input.addListener("error", onerror)
                lines.addListener("line", online)
                lines.addListener("close", onend)
            }))
            .then(() => new Promise((resolve, reject) => {
                const input = createReadStream( resolvePath(cwd, ".children.local") )
                const lines = createReadlineInterface({ input })

                let processing = Promise.resolve()
                const online = line => {
                    line = line.trim()
                    if ( nl_comment_at_0(line[0]) || !line.length )
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
                                console.log(`starting child pid ${cp.pid}`)
                                cp.onexit = code => {
                                    cp.kill()
                                    //exec(`kill -9 ${cp.pid}`)
                                }
                                //process.addListener("SIGINT", cp.onexit)
                                //process.addListener("SIGTERM", cp.onexit)
                                process.addListener("exit", cp.onexit)
                                resolve(cp)
                            }

                            if ( prev_cp && prev_cp.connected ) {
                                const onexit = () => {
                                    console.log(`killing child pid ${prev_cp.pid}`)
                                    prev_cp.removeListener("exit", onexit)
                                    nextTick(() => start())
                                }

                                //process.removeListener("SIGINT", prev_cp.onexit)
                                //process.removeListener("SIGTERM", prev_cp.onexit)
                                process.removeListener("exit", prev_cp.onexit)
                                prev_cp.addListener("exit", onexit)
                                prev_cp.kill()
                                //exec(`kill -9 ${prev_cp.pid}`)
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

                const onerror = e => {
                    if ( e && e.code == "ENOENT" )
                      onend()
                    else {
                      throw e
                    }
                }

                input.addListener("error", onerror)
                lines.addListener("line", online)
                lines.addListener("close", onend)
            }))
            .then(() => this.dispatchEvent("ready"))
            .catch(e => {
                if ( e.warn )
                  this.dispatchEvent("warn", e)
                else
                  this.dispatchEvent("error", e)
            })
        }
      , socket_path: { enumerable: true,
            get: function(){
                return resolvePath(this.tmp_path, `./${this.uid}.sock`)
            }
        }
      , tmp_path: { enumerable: true,
            get: function(){
                return resolvePath(TMP, `./${this.uid}`)
            }
        }
      , uid: { enumerable: true,
            get: function(){
                return apps.get(this).get("uid")
            }
        }
      , unixSocketServer: { enumerable: true,
            get: function(){
                return apps.get(this).get("unixSocketServer")
            }
        }
    }
})
