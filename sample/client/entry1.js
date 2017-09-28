"use strict"

import styles from "./entry1.css"
import stylesb from "./Arrow.css"
import { class as klass } from "ippankiban/lib/class"

const foo = process.env.test
window.foo = function(){ return foo }
