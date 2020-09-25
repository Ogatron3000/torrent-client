'use strict'

//const { Buffer } = require('buffer')
const crypto = require('crypto')

let id = null

// peer id to indentify my client
// can be any random bytes, but ...
// ... most clients follow this convention where AT (Alient Torrent) is the name of my client and 0001 is version number
module.exports.generateId = () => {
    if (!id) {
        id = crypto.randomBytes(20)
        Buffer.from('-AT0001-').copy(id, 0)
    }
    return id
}

// normally an id is set every time the client loads and should be the same until it’s closed