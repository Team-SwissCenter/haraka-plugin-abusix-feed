const assert = require('node:assert')
const crypto = require('node:crypto')
const { describe, it, beforeEach } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')
const OldAddress = require('address-rfc2821').Address // Haraka < 3.2
const NewAddress = require('@haraka/email-address').Address // Haraka >= 3.2

let plugin

beforeEach(() => {
    plugin = makePlugin('abusix-feed', { register: false })
})

// fixture config/abusix-feed.ini ships without name/key, provide them
function configure(feed) {
    const get = plugin.config.get.bind(plugin.config)
    plugin.config.get = (name, ...rest) => {
        if (name !== 'abusix-feed.ini') return get(name, ...rest)
        return { main: {}, feed: { ...feed } }
    }
}

function capture() {
    const sent = []
    plugin.sock = {
        send: (str, port, host, cb) => {
            sent.push({ lines: str.split('\n'), port: Number(port), host })
            cb()
        },
        close: () => {},
    }
    return sent
}

function connection(overrides = {}) {
    const conn = makeConnection({ withTxn: true })
    conn.local.port = 25
    conn.remote.ip = '192.0.2.10'
    conn.remote.host = 'mail.example.net'
    conn.hello.host = 'helo.example.net'
    conn.hello.verb = 'EHLO'
    conn.tls.enabled = true
    for (const [k, v] of Object.entries(overrides)) {
        const [obj, key] = k.split('.')
        conn[obj][key] = v
    }
    return conn
}

const send = (conn, sender, Address = NewAddress) =>
    new Promise((resolve) => {
        let calls = 0
        let args
        plugin.send_feed(
            (...a) => {
                calls++
                args = a
            },
            conn,
            [new Address(sender)],
        )
        setImmediate(() => resolve({ args, calls }))
    })

describe('load_config', () => {
    it('loads abusix-feed.ini from config/abusix-feed.ini', () => {
        plugin.load_config()
        assert.ok(plugin.cfg)
    })

    it('initializes enabled boolean', () => {
        plugin.load_config()
        assert.equal(plugin.cfg.main.enabled, true, plugin.cfg)
    })

    it('defaults dest to the Abusix collector', () => {
        configure({ name: 'txn1', key: 'k' })
        plugin.load_config()
        assert.equal(plugin.cfg.feed.dest, 'smtp-rttf.abusix.com:12211')
    })
})

describe('register', () => {
    it('does not open a socket without a feed name and key', () => {
        configure({})
        plugin.register()
        assert.equal(plugin.sock, undefined)
    })

    it('never logs the feed key', () => {
        configure({ name: 'txn1', key: 'SECRETKEY' })
        const logged = []
        for (const level of ['logdebug', 'loginfo', 'logwarn', 'logerror']) {
            plugin[level] = (msg) => logged.push(String(msg))
        }
        plugin.register()
        plugin.shutdown()
        assert.ok(!logged.some((l) => l.includes('SECRETKEY')), logged.join('\n'))
    })
})

describe('send_feed', () => {
    let sent

    beforeEach(() => {
        configure({ name: 'txn1', key: ' testkey ', dest: '127.0.0.1:12211' })
        plugin.load_config()
        sent = capture()
    })

    it('calls next() once, without a return code', async () => {
        const { args, calls } = await send(connection(), '<user@example.org>')
        assert.deepEqual(args, [])
        assert.equal(calls, 1)
    })

    it('sends the PPD record with a valid MD5 digest', async () => {
        await send(connection(), '<user@Example.ORG>')
        assert.equal(sent.length, 1)
        const { lines, port, host } = sent[0]
        assert.equal(host, '127.0.0.1')
        assert.equal(port, 12211)
        const [feed, epoch, ...rest] = lines
        assert.equal(feed, 'txn1')
        assert.ok(Math.abs(Number(epoch) - Date.now()) < 5000)
        assert.deepEqual(rest.slice(0, 9), [
            '25',
            '192.0.2.10',
            'mail.example.net',
            'helo.example.net',
            'Y',
            'Y',
            'N',
            'example.org',
            '',
        ])
        const body = `${lines.slice(0, 11).join('\n')}\n`
        assert.equal(lines[11], crypto.createHash('md5').update(`${body}testkey`).digest('hex'))
    })

    for (const [label, Address] of [
        ['address-rfc2821 (Haraka < 3.2)', OldAddress],
        ['@haraka/email-address (Haraka >= 3.2)', NewAddress],
    ]) {
        it(`sends the sender domain with ${label}`, async () => {
            await send(connection(), '<user@example.org>', Address)
            assert.equal(sent[0].lines[9], 'example.org')
        })

        it(`sends an empty sender for the null sender with ${label}`, async () => {
            await send(connection(), '<>', Address)
            assert.equal(sent[0].lines[9], '')
        })

        it(`sends the local part of a sender without domain with ${label}`, async () => {
            await send(connection(), '<postmaster>', Address)
            assert.equal(sent[0].lines[9], 'postmaster')
        })
    }

    for (const rdns of ['NXDOMAIN', 'DNSERROR', 'Unknown', undefined]) {
        it(`reports an unresolved client (${rdns}) as "unknown"`, async () => {
            await send(connection({ 'remote.host': rdns }), '<user@example.org>')
            assert.equal(sent[0].lines[4], 'unknown')
        })
    }

    it('reports a plain SMTP, non-TLS, authenticated session', async () => {
        const conn = connection({ 'hello.verb': 'HELO', 'tls.enabled': false })
        conn.notes.auth_user = 'someone'
        await send(conn, '<user@example.org>')
        assert.deepEqual(sent[0].lines.slice(6, 9), ['N', 'N', 'Y'])
    })

    it('sends to every destination', async () => {
        plugin.cfg.feed.dest = '192.0.2.1:1000, 192.0.2.2'
        await send(connection(), '<user@example.org>')
        assert.deepEqual(
            sent.map((s) => `${s.host}:${s.port}`),
            ['192.0.2.1:1000', '192.0.2.2:12211'],
        )
    })

    it('keeps going when the socket throws', async () => {
        plugin.sock.send = () => {
            throw new Error('ERR_SOCKET_DGRAM_NOT_RUNNING')
        }
        const { calls } = await send(connection(), '<user@example.org>')
        assert.equal(calls, 1)
    })
})

describe('shutdown', () => {
    it('closes the UDP socket', () => {
        configure({ name: 'txn1', key: 'k' })
        plugin.load_config()
        let closed = false
        plugin.sock = { close: () => (closed = true) }
        plugin.shutdown()
        assert.ok(closed)
        assert.equal(plugin.sock, undefined)
    })
})
