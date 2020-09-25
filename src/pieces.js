'use strict'

const torrentParser = require('./torrent-parser')

module.exports = class {
    constructor(torrent) {
        function buildPiecesArray() {
            const nPieces = torrent.info.pieces.length / 20
            const arr = new Array(nPieces).fill(false)
            // pieces is an array of arrays filled with boolean value which tells us is block requested or not
            return arr.map((_, i) => new Array(torrentParser.blocksPerPiece(torrent, i)).fill(false))
        }

        this._requested = buildPiecesArray()
        this._received = buildPiecesArray()
    }

    addRequested(pieceBlock) {
        const blockIndex = pieceBlock.begin / torrentParser.BLOCK_LENGTH
        this._requested[pieceBlock.index][blockIndex] = true
    }

    addReceived(pieceBlock) {
        const blockIndex = pieceBlock.begin / torrentParser.BLOCK_LENGTH
        this._received[pieceBlock.index][blockIndex] = true
    }

    needed(pieceBlock) {
        if (this._requested.every(piece => piece.every(block=> block))) {
            // if we just slice _received the copy is shallow
            this._requested = this._received.map(blocks => blocks.slice())
        }
        const blockIndex = pieceBlock.begin / torrentParser.BLOCK_LENGTH
        return !this._requested[pieceBlock.index][blockIndex]
    }

    isDone() {
        return this._received.every(piece => piece.every(block => block))
    }

    printPercentDone() {
        const downloaded = this._received.reduce((totalBlocks, blocks) => {
          return blocks.filter(i => i).length + totalBlocks;
        }, 0);
    
        const total = this._received.reduce((totalBlocks, blocks) => {
          return blocks.length + totalBlocks;
        }, 0);
    
        const percent = Math.floor(downloaded / total * 100);
    
        process.stdout.write('progress: ' + percent + '%\r');
    }
}