'use strict'

const net = require('net')
const Buffer = require('buffer').Buffer
const tracker = require('./tracker')
const messages = require('./messages')
const Pieces = require('./pieces')
const Queue = require('./queue')
const fs = require('fs')

module.exports = (torrent, path) => {
    tracker.getPeers(torrent, peers => {
        // torrent.info.pieces contains 20-byte SHA-1 hash of each piece
        const pieces = new Pieces(torrent)
        // 'w' is write mode - create and write to new file
        const file = fs.openSync(path, 'w')
        peers.forEach(peer => download(peer, torrent, pieces, file))
    })
}

// tcp - we have to make connection before sending message
// the connection may fail, so we have to handle the error
function download(peer, torrent, pieces, file) {
    const socket = net.Socket()
    socket.on('error', console.log)
    // connect to each peer and 'handshake'
    socket.connect(peer.port, peer.ip, () => {
        socket.write(messages.buildHandshake(torrent))
    })

    // list of the pieces the peer has
    const queue = new Queue(torrent)
    onWholeMessage(socket, message => messageHandler(message, socket, pieces, queue, torrent, file))
}

// data we receive is not a whole message, data is broken up
// onWholeMessage functions connects pieces into a whole message
function onWholeMessage(socket, callback) {
    let savedBuffer = Buffer.alloc(0)
    // handshake is the first message we receive, so variable is set to true
    let handshake = true
    
    socket.on('data', receivedBuffer => {
        const messageLength = () => handshake ? savedBuffer.readUInt8(0) + 49 : savedBuffer.readUInt32BE(0) + 4
        savedBuffer = Buffer.concat([savedBuffer, receivedBuffer])
    
        // 4 is the minimum message length && if message fits in savedBuffer
        while (savedBuffer.length >= 4 && savedBuffer.length >= messageLength()) {
            // pass message to callback
            callback(savedBuffer.slice(0, messageLength()))
            // clear savedBuffer
            savedBuffer = savedBuffer.slice(messageLength())
            // handshake can only be first message
            handshake = false   
        }
    })
}

const messageHandler = (message, socket, pieces, queue, torrent, file) => {
    // if we get a handshake response, send interested message
    if (message.length === message.readUInt8(0) + 49 && message.toString('utf8', 1) === 'BitTorrent protocol') {
        socket.write(messages.buildInterested())
    } else {
        const parsedMessage = messages.parse(message);

        if (parsedMessage.id === 0) chokeHandler(socket)
        if (parsedMessage.id === 1) unchokeHandler(socket, pieces, queue)
        if (parsedMessage.id === 4) haveHandler(socket, pieces, queue, parsedMessage.payload)
        if (parsedMessage.id === 5) bitfieldHandler(socket, pieces, queue, parsedMessage.payload)
        if (parsedMessage.id === 7) pieceHandler(socket, pieces, queue, torrent, file, parsedMessage.payload)
  }
}

function chokeHandler(socket) {
    socket.end()
}

function unchokeHandler(socket, pieces, queue) {
    queue.choked = false
    requestPiece(socket, pieces, queue)
}

function haveHandler(socket, pieces, queue, payload) {
    const pieceIndex = payload.readUInt32BE(0)
    // we check if queue is empty
    const queueEmpty = queue.length() === 0
    // add piece (blocks) to the queue
    queue.queue(pieceIndex)
    // if it's the first piece added (queue was empty before it was added) we request another piece
    if (queueEmpty) requestPiece(socket, pieces, queue)
    // if queue length is 1, request piece - WHY, what if it's not 1? - same reason as above, just before we only had piece indexes and not blocks, so we could do quque.length === 1
}

// repeatedly dividing by 2 and taking the remainder will convert a base-10 number to a binary number, giving you the digits of the binary number from least to most signifiant bit (right to left)
// https://www.khanacademy.org/math
function bitfieldHandler(socket, pieces, queue, payload) {
    const queueEmpty = queue.length() === 0
    payload.forEach((byte, i) => {
        for (let j = 0; j < 8; j++) {
            if (byte % 2) queue.queue(i * 8 + 7 - j)
            byte = Math.floor(byte / 2)
        }
    })
    if (queueEmpty) requestPiece(socket, pieces, queue)
}

function pieceHandler(socket, pieces, queue, torrent, file, pieceResponse) {
    pieces.printPercentDone()
    // pieceResponse differs from pieceIndex because it contains actual data instead of the length
    // but index and begin are the same so we can pass it to addReceived
    pieces.addReceived(pieceResponse)

    // .begin only tells us offset withing the piece, so we multiply piece index with piece length to get absolute offset
    const offset = pieceResponse.index * torrent.info['piece length'] + pieceResponse.begin
    fs.write(file, pieceResponse.block, 0, pieceResponse.block.length, offset, () => {})

    if (pieces.isDone()) {
        socket.end()
        console.log('DONE!')
        try { fs.closeSync(file) } catch(e) {} // ? ? ?
    } else {
        requestPiece(socket, pieces, queue)
    }
}

function requestPiece(socket, pieces, queue) {
    if (queue.choked) return null

    while (queue.length()) {
        const pieceBlock = queue.deque()
        if (pieces.needed(pieceBlock)) {
            socket.write(messages.buildRequest(pieceBlock))
            pieces.addRequested(pieceBlock)
            break
        }
    }
}