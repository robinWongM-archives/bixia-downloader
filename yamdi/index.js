const got = require('got')

const child_process = require('child_process')

const yamdi = child_process.spawn('./yamdi.exe', ['-i', '-', '-o', '-', '-t', 'test-temp.flv'], [
    0, 'pipe', 'pipe'
])

got.stream('http://bvc.live-play.acgvideo.com/live-bvc/460157/live_82483195_7580994.flv?wsSecret=c2c189d8279eb27488c02de2df99ec22&wsTime=1534593989', {
    headers: {
        'Referer': 'https://live.bilibili.com/'
    }
})
.pipe(yamdi.stdin)

//yamdi.stdout.pipe(process.stdout)