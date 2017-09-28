"use strict"

const { App } = require("../index")
const app = new App

app.addEventListener("warn", ({detail:error}) => console.warn(error) )
app.addEventListener("error", ({detail:error}) => {
    console.error(error)
    process.exit(1)
})
