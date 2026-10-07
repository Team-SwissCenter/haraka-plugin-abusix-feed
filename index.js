'use strict'
// Adapted from : https://gitlab.com/abusix-public/abusix_ppd/-/blob/master/index.js

const crypto = require('node:crypto')
const dgram = require('node:dgram')

// rDNS placeholders Haraka uses when the client has no usable PTR
const UNRESOLVED = new Set(['NXDOMAIN', 'DNSERROR', 'Unknown', 'unknown'])

exports.register = function () {
    const plugin = this

    // Load main plugin config
    plugin.load_config()

    if (!plugin.cfg.feed.name || !plugin.cfg.feed.key) {
        plugin.logerror(`You need to set at least your Abusix feed name and feed key in config/abusix-feed.ini.`)
        return
    }

    plugin.logdebug(`feed.name: ${plugin.cfg.feed.name}`)
    plugin.logdebug(`feed.dest: ${plugin.cfg.feed.dest}`)

    // Create UDP socket
    plugin.sock = dgram.createSocket('udp4')
    plugin.sock.on('error', (err) => plugin.logerror(`UDP socket error: ${err.message}`))

    // Register hook
    plugin.register_hook('mail', 'send_feed')
}

exports.shutdown = function () {
    if (!this.sock) return
    try {
        this.sock.close()
    } catch {
        // already closed
    }
    delete this.sock
}

exports.load_config = function () {
    // Load plugin configuration
    const plugin = this

    plugin.cfg = plugin.config.get(
        'abusix-feed.ini',
        {
            booleans: ['+enabled'],
        },
        () => {
            plugin.load_config()
        },
    )

    // Set feed configuration
    if (!plugin.cfg.feed) {
        plugin.cfg.feed = {}
    }

    plugin.cfg.feed.dest = plugin.cfg.feed.dest || 'smtp-rttf.abusix.com:12211'
}

// What Postfix reports as the sender: its domain, the bare local part when
// there is no domain, or nothing for the null sender. Only host and user
// are read: they mean the same in address-rfc2821 (Haraka < 3.2) and
// @haraka/email-address (Haraka >= 3.2).
const sender_of = (mail_from) => mail_from?.host || mail_from?.user || ''

exports.send_feed = function (next, connection, params) {
    const cnx = connection
    const txn = connection.transaction
    const plugin = this

    // Do nothing if no transaction available
    if (!txn || !plugin.sock) return next()

    // Collect stuff we need to send
    const feed_id = plugin.cfg.feed.name
    const epoch = Date.now()
    const server_port = cnx.local.port || ''
    const helo_name = cnx.hello.host || 'unknown'
    const client_address = cnx.remote.ip || 'unknown'
    const client_name = cnx.remote.host && !UNRESOLVED.has(cnx.remote.host) ? cnx.remote.host : 'unknown'
    const sender = sender_of(params[0])
    const protocol_name = cnx.hello.verb === 'EHLO' ? 'Y' : 'N'
    const ssl_enabled = cnx.tls.enabled ? 'Y' : 'N'
    const is_auth = cnx.notes.auth_user ? 'Y' : 'N'

    // We can let haraka process next hook from here
    next()

    // Create data to send
    const data = [
        feed_id,
        epoch,
        server_port,
        client_address,
        client_name,
        helo_name,
        protocol_name,
        ssl_enabled,
        is_auth,
        sender,
        '',
    ]

    let str = `${data.join('\n')}\n`
    const digest = crypto
        .createHash('md5')
        .update(str + plugin.cfg.feed.key.trim())
        .digest('hex')
    str += digest

    plugin.logdebug(`String to send: ${str}`)

    // If multiple feed_dest are supplied, send individually to each
    for (const dest of plugin.cfg.feed.dest.split(/[;, ]+/g)) {
        const [host, port] = dest.split(':')
        if (!host) continue
        try {
            plugin.sock.send(str, port || 12211, host, (err) => {
                if (err) {
                    plugin.logerror(`UDP socket send error to ${dest}: ${err.message}`)
                } else {
                    plugin.logdebug(`Transaction data sent to: ${dest}`)
                }
            })
        } catch (err) {
            // next() already ran: a throw here would reach Haraka as a second
            // callback, and is of no use to the SMTP session anyway
            plugin.logerror(`UDP socket send error to ${dest}: ${err.message}`)
        }
    }
}
