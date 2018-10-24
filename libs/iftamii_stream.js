const { Transform } = require('stream'),
      { resolve } = require('path'),
      fs = require('fs'),
      mkdirp = require('async-mkdirp')

// The name comes from Tomoki
// It means IsFlvThenAoMaybeInjectInfoStream
class IFTAMIIStream extends Transform {
    constructor(roomID, path, filename) {
        super()

        this._alreadyFLV = false
        this._roomID = roomID
        this._path = path
        this._filename = filename

        this.on('finish', () => {
            if(!this._alreadyFLV) 
                this.emit('failed')
            else
                this.emit('saved')
        })
    }

    async _transform(chunk, encoding, cb) {
        if(!this._alreadyFLV && chunk.toString('ascii', 0, 3) === 'FLV') {
            try {
                // Create Directory
                const path = resolve('../', this._path, this._roomID.toString())
                await mkdirp(path)
                // Pipe to File
                this.pipe(
                    fs.createWriteStream(
                        resolve(path, this._filename)
                    )
                )
                // Mark the Flag & emit
                this._alreadyFLV = true
                this.emit('started')
            } catch (err) {
                cb(err)
            }
        }
        cb(null, chunk)
    }
}

module.exports = IFTAMIIStream