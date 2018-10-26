const { EventEmitter } = require('events'),
      { parse: urlParse } = require('url'),
      { basename }= require('path'),
      got = require('got')

const helper = require('./helper.js')
const IFTAMIIStream = require('./iftamii_stream.js')

class Downloader extends EventEmitter {
    constructor(roomID, path) {
        super()

        // Download History will be managed by us
        // Generally, We'll need a table `download_acitivty` to preserve download history
        // Last download stat will be cached in memory
        // Every Time _lastDownload will be {}
        // Here is only for demonstration
        this._lastDownload = {
            filename: undefined,

            startTime: undefined,
            endTime: undefined,

            // To calculate the instant speed
            previousBytes: undefined,
            receivedBytes: undefined,
            speed: undefined
        }

        // We also maintain the Stream URL
        // this._streamURL = undefined
        this.iftamiiStream = undefined
        this.isDownloading = false
        this._path = path
        this._cachedFilename = undefined

        this._stopped = true
        this._retryTimer = undefined
        this._speedInterval = undefined

        this._roomID = roomID
    }

    async start() {
        // Start means we can now begin our download
        // Until we finished the download
        // Or someone says 'WE CAN STOP NOW'
        if(this._retryTimer)
            clearTimeout(this._retryTimer)
        this._retryTimer = undefined
        this._stopped = false
        this._lastDownload = {}

        const { data: { durl } } = (await helper.oopsGot(
            '获取直播流地址时发生错误',
            'https://api.live.bilibili.com/room/v1/Room/playUrl?cid=' + this._roomID, {
                json: true
            })).body
        if (!durl)
            throw new Error('读取直播流地址时发生错误')

        // Select a random stream url, https://stackoverflow.com/a/23976260
        const playURL = durl[~~(durl.length * Math.random())].url

        // Create Custom Stream
        // it will ensure we only receive FLV Stream
        // and the ability to produce a FLV stream with metadata injected
        this._cachedFilename = basename(urlParse(playURL).pathname)
        this.iftamiiStream = new IFTAMIIStream(this._roomID, this._path, this._cachedFilename)
        this.iftamiiStream.once('started', () => {
            // Captured FLV
            this.isDownloading = true
            this._lastDownload.filename = this._cachedFilename
            //this._lastDownload.startTime = Date.now()

            this.emit('started', this._lastDownload.filename, this._lastDownload.startTime)
        })
        this.iftamiiStream.once('failed', () => {
            this.isDownloading = false
            this.emit('retrying')
            this._retryTimer = setTimeout(() => {
                this._retryTimer = undefined
                if(this._stopped) {
                    // Received STOP command
                    this.emit('stopped')
                } else {
                    this.start()
                }
            }, 200)
        })
        this.iftamiiStream.once('saved', () => {
            // DEBUG ONLY
            console.log('The Saved Event was fired!')
            // Done!
            this.isDownloading = false
            this._stopped = true
            // Clean up
            this._lastDownload.endTime = Date.now()
            clearInterval(this._speedInterval)
            this._speedInterval = undefined
            // Notify Room -> BixiaDownloader -> BixiaServer to save download statistic
            this.emit('saved', Object.assign({}, this._lastDownload))
        })

        got.stream(
            playURL,{
                headers: {
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:62.0) Gecko/20100101 Firefox/62.0',
                    'origin': 'https://live.bilibili.com',
                    'referer': 'https://live.bilibili.com/' + this._roomID
                },
                throwHttpErrors: false // We'll deal with 404 in CustomStream
            }
        )
        .on('response', res => {
            // Logger
        })
        .on('error', err => {
            // Logger
        })
        .on('downloadProgress', progress => {
            // TODO
            if(!this.isDownloading)
                return

            const ld = this._lastDownload

            if(!ld.startTime) {
                // Initialze lastDownload
                ld.startTime = Date.now()
                ld.previousBytes = 0
                ld.receivedBytes = progress.transferred

                this._speedInterval = setInterval(() => {
                    const ld = this._lastDownload

                    const { receivedBytes, previousBytes } = ld
                    ld.speed = (receivedBytes - previousBytes) / 1

                    this.emit('progress', ld)

                    ld.previousBytes = ld.receivedBytes
                }, 1000)
            } else {
                ld.receivedBytes = progress.transferred
            }

            if (progress.percent === 1) {
                console.log('The DownloadProgress Event was fired!')
            }
        })
        .pipe(this.iftamiiStream)
    }

    async stop() {
        // Stop ASAP but will not affect the downloading which is going on
        this._stopped = true
        if (this._retryTimer)
            clearTimeout(this._retryTimer)
    }

    speed() {
        if(this.isDownloading)
            return this._lastDownload.speed
        else
            return 0
    }
}

module.exports = Downloader